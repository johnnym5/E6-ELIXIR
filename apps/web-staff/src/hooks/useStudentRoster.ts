import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveUserStatus, ComplianceStatus } from '../services/userStatusService';
import { FilterCriteria } from '../components/StudentTableFilters';
import { LIVE_FX_RATE } from '../constants';

export interface Student {
  id: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  accountNumbers?: string[];
  parallexAccountNumbers?: string[];
  status: ComplianceStatus;
  topUpStatus?: string;
  hasPendingTopUp?: boolean;
  setupCompleted?: boolean;
  isApproved: boolean;
  consecutiveDays: number;
  balanceGbp: number;
  targetGbp: number;
  currentBalanceNgn?: number;
  anomalyRatio: number;
  lastUpdate: string;
  createdAt: string;
  isNew?: boolean;
  expirationDate?: string | null;
  timerCustomMessage?: string | null;
  isTimerActive?: boolean;
  ingestionChannels: string[];
  destinationCountry: string;
  counselorName?: string;
  assignedCounselorId?: string;
  pendingRequest?: any;
}

export const INITIAL_ROSTER_FILTERS: FilterCriteria = {
  searchTerm: '',
  statuses: [],
  assignedCounselorIds: [],
  financialState: 'ALL',
  timerStatus: 'ALL',
  destinationCountry: 'ALL',
  ingestionChannel: 'ALL'
};

export function useStudentRoster() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [advancedFilters, setAdvancedFilters] = useState<FilterCriteria>(INITIAL_ROSTER_FILTERS);
  const [filter, setFilter] = useState<ComplianceStatus | 'ALL' | 'REQUESTS' | 'UNAPPROVED' | 'INCOMPLETE' | 'TOPUP_PENDING'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [requestTypeFilter, setRequestTypeFilter] = useState<'ALL' | 'FINANCE' | 'DAYS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Subscribe to evaluations
  useEffect(() => {
    const q = query(collection(db, 'pof_evaluations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const currentTime = Date.now();
      const data = snap.docs.map(docSnap => {
        const d = docSnap.data();
        const createdMillis = d.createdAt?.seconds ? d.createdAt.seconds * 1000 : currentTime;
        const elapsedHours = (currentTime - createdMillis) / (1000 * 60 * 60);
        const isNew = elapsedHours <= 24;

        const start = d.startDate ? new Date(d.startDate).getTime() : null;
        const days = start ? Math.min(Math.max(Math.floor((Date.now() - start) / (86400000)) + 1, 1), 28) : 0;

        let status = (d.status || 'PENDING') as any;
        if (status === 'VALIDATED') status = 'CLEARED';

        // Defensive: Do not allow CLEARED status if target amount is not set
        if (status === 'CLEARED' && (d.targetGBP || 0) <= 0) {
          status = 'PENDING';
        }

        if (days >= 22 && days < 28 && status !== 'CLEARED') status = 'NEAR_MATURITY';
        if (d.anomalyRatio > 2.5) status = 'AT_RISK';

        return {
          id: docSnap.id,
          userId: d.userId,
          name: d.userName || 'Unknown Student',
          email: d.userEmail || '',
          status,
          isApproved: d.isApproved !== undefined ? d.isApproved : false,
          consecutiveDays: days,
          balanceGbp: 0,
          currentBalanceNgn: d.currentBalanceNgn || 0,
          targetGbp: d.targetGBP || 0,
          anomalyRatio: d.anomalyRatio || 0,
          lastUpdate: d.updatedAt?.seconds ? new Date(d.updatedAt.seconds * 1000).toLocaleTimeString() : 'Just now',
          createdAt: new Date(createdMillis).toISOString(),
          isNew,
          expirationDate: d.expirationDate || null,
          timerCustomMessage: d.timerCustomMessage || null,
          isTimerActive: d.isTimerActive || false,
          topUpPricingConfig: d.topUpPricingConfig
        };
      });
      setEvaluations(data);
    });
    return unsub;
  }, []);

  // 2. Subscribe to all users
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // 3. Subscribe to liquidity requests
  useEffect(() => {
    const q = query(collection(db, 'liquidity_requests'), where('status', '==', 'PENDING'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 4. Subscribe to accounts
  useEffect(() => {
    const q = query(collection(db, 'financial_accounts'));
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Merge Data
  const liveStudents = useMemo(() => {
    const LIVE_FX = LIVE_FX_RATE;

    // Use a Map for O(1) deduplication. Key = normalized email or userId.
    const studentsMap = new Map<string, Student>();

    // 1. Process evaluations first (they hold compliance progress)
    // Sort to prefer those with actual progress/targets if duplicates exist
    const sortedEvals = [...evaluations].sort((a, b) => (b.targetGbp || 0) - (a.targetGbp || 0));

    sortedEvals.forEach(s => {
      const emailKey = s.email?.toLowerCase().trim();
      const idKey = s.userId;

      // Filter out hard deleted or archived users by checking against allUsers
      const userProfile = allUsers.find(u => u.uid === s.userId || (emailKey && u.email?.toLowerCase() === emailKey));
      if (userProfile?.hardDeleted || userProfile?.isArchived === true) return;

      const studentAccs = accounts.filter(a => a.userId === s.userId || (emailKey && a.userEmail?.toLowerCase() === emailKey));
      const accountsTotalGbp = studentAccs.reduce((sum, curr) =>
        sum + (Number(curr.balanceGbp) || Number(curr.balanceGBP) || 0), 0
      );
      const manualTotalGbp = ((s as any).currentBalanceNgn || 0) / LIVE_FX;
      const totalGbp = accountsTotalGbp + manualTotalGbp;
      const studentRequest = requests.find(r => r.userId === s.userId || (emailKey && r.userEmail?.toLowerCase() === emailKey));

      const isApproved = userProfile ? (userProfile.isApproved === true && userProfile.hardDeleted !== true) : s.isApproved;
      const name = s.name === 'Unknown Student' && userProfile ? (userProfile.displayName || userProfile.username || s.name) : s.name;
      const email = userProfile?.email || s.email;

      const phoneNumber = userProfile?.phoneNumber || '';
      const accountNumbers = studentAccs.map(a => a.accountNumberMasked || '').filter(Boolean);
      const onboarding = userProfile?.onboardingProfile;
      const parallexAccountNumbers = [onboarding?.parallexAccountNumber].filter(Boolean);
      const destinationCountry = onboarding?.destinationCountry || '';

      const ingestionChannels: string[] = [];
      if (studentAccs.some(a => a.connectionMethod !== 'MANUAL_DEPOSIT')) ingestionChannels.push('AUTOMATED');
      if (manualTotalGbp > 0 || studentAccs.some(a => a.connectionMethod === 'MANUAL_DEPOSIT')) ingestionChannels.push('MANUAL');
      if (studentAccs.length === 0 && manualTotalGbp === 0) ingestionChannels.push('UNVERIFIED');

      const isTopUpPending = userProfile?.status === 'TOPUP_PENDING' || userProfile?.topUpStatus === 'REQUEST_PENDING' || userProfile?.hasPendingTopUp === true;
      const onboardingComplete = !!userProfile?.onboardingComplete || !!userProfile?.setupCompleted || isTopUpPending;
      
      const finalStatus = isTopUpPending ? 'TOPUP_PENDING' : resolveUserStatus({
        isApproved,
        onboardingComplete,
        status: s.status,
        anomalyRatio: s.anomalyRatio,
        consecutiveDays: s.consecutiveDays || 0,
        targetGbp: s.targetGbp,
        verificationFailed: userProfile?.verificationFailed
      });

      const studentObj: Student = {
        ...s,
        name,
        email,
        isApproved,
        status: finalStatus,
        topUpStatus: userProfile?.topUpStatus,
        hasPendingTopUp: userProfile?.hasPendingTopUp || isTopUpPending,
        setupCompleted: userProfile?.setupCompleted,
        balanceGbp: totalGbp,
        pendingRequest: studentRequest,
        phoneNumber,
        accountNumbers,
        parallexAccountNumbers,
        destinationCountry,
        ingestionChannels,
        counselorName: s.counselorName || 'Unassigned'
      };

      // Set in map using email as primary key, fallback to userId
      if (emailKey) studentsMap.set(emailKey, studentObj);
      else if (idKey) studentsMap.set(idKey, studentObj);
    });

    // 2. Add users not in evaluations yet
    allUsers.forEach(u => {
      const uid = u.id || u.uid;
      const emailKey = u.email?.toLowerCase().trim();

      // Skip archived, deleted or non-students
      if (u.isArchived === true || u.hardDeleted === true) return;

      const userRole = u.role || 'STUDENT';
      const isStaffRole = ['ADMIN_GOVERNANCE', 'COUNSELOR', 'STAFF_AUDITOR', 'ADMIN'].includes(userRole);
      const isCompanyEmail = u.email?.endsWith('@basechaninternational.com') || u.email?.endsWith('.basechaninternational@gmail.com');
      const isStudentRole = !isStaffRole && (userRole === 'STUDENT' || !isCompanyEmail);

      if (!isStudentRole) return;

      // Only add if NOT already in the map (from evaluations)
      if ((emailKey && studentsMap.has(emailKey)) || (uid && studentsMap.has(uid))) return;

      const isTopUpPending = u.status === 'TOPUP_PENDING' || u.topUpStatus === 'REQUEST_PENDING' || u.hasPendingTopUp === true;
      const isApproved = u.isApproved === true && u.hardDeleted !== true;
      const onboardingComplete = !!u.onboardingComplete || !!u.setupCompleted || isTopUpPending;

      const status = isTopUpPending ? 'TOPUP_PENDING' : resolveUserStatus({
        isApproved,
        onboardingComplete,
        verificationFailed: u.verificationFailed,
        status: u.status,
        targetGbp: u.onboardingProfile?.targetGbp || 0
      });

      const studentObj: Student = {
        id: uid,
        userId: uid,
        name: u.displayName || u.username || 'New User',
        email: u.email || '',
        phoneNumber: u.phoneNumber || '',
        accountNumbers: [],
        parallexAccountNumbers: [u.onboardingProfile?.parallexAccountNumber].filter(Boolean),
        status,
        topUpStatus: u.topUpStatus,
        hasPendingTopUp: u.hasPendingTopUp || isTopUpPending,
        setupCompleted: u.setupCompleted,
        isApproved,
        consecutiveDays: 0,
        balanceGbp: 0,
        targetGbp: 0,
        anomalyRatio: 0,
        lastUpdate: isTopUpPending ? 'Top-Up Requested' : 'Awaiting Setup',
        createdAt: u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toISOString() : new Date().toISOString(),
        isNew: true,
        expirationDate: null,
        timerCustomMessage: null,
        isTimerActive: false,
        ingestionChannels: ['UNVERIFIED'],
        destinationCountry: u.onboardingProfile?.destinationCountry || ''
      };

      if (emailKey) studentsMap.set(emailKey, studentObj);
      else if (uid) studentsMap.set(uid, studentObj);
    });

    return Array.from(studentsMap.values());
  }, [evaluations, accounts, requests, allUsers]);

  // Metric Stats
  const stats = useMemo(() => ({
    total: liveStudents.filter(s => s.isApproved || s.status === 'TOPUP_PENDING').length,
    cleared: liveStudents.filter(s => s.status === 'CLEARED' && s.isApproved).length,
    topUpRequired: liveStudents.filter(s =>
      s.status === 'TOPUP_PENDING' ||
      s.topUpStatus === 'REQUEST_PENDING' ||
      s.hasPendingTopUp === true ||
      !!s.pendingRequest ||
      s.status === 'NEEDS_TOPUP'
    ).length,
    nearMaturity: liveStudents.filter(s => s.status === 'NEAR_MATURITY' && s.isApproved).length,
    atRisk: liveStudents.filter(s => s.status === 'AT_RISK' && s.isApproved).length,
    unapproved: liveStudents.filter(s => (s.status === 'AWAITING_VERIFICATION' || s.status === 'UNAUTHENTICATED') && s.status !== 'TOPUP_PENDING').length,
    pendingOnboarding: liveStudents.filter(s => s.status === 'PENDING_ONBOARDING' && s.status !== 'TOPUP_PENDING').length,
    newUsers: liveStudents.filter(s => s.isNew).length
  }), [liveStudents]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    const normalize = (val: string) => val.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const activeSearch = normalize(advancedFilters.searchTerm || searchTerm);

    return liveStudents.filter(s => {
      // Direct statusFilter override (from metric card clicks)
      if (statusFilter === 'TOPUP_PENDING') {
        const isTopUp = s.status === 'TOPUP_PENDING' || s.topUpStatus === 'REQUEST_PENDING' || s.hasPendingTopUp === true || !!s.pendingRequest || s.status === 'NEEDS_TOPUP';
        if (!isTopUp) return false;
      } else if (filter === 'TOPUP_PENDING' || filter === 'REQUESTS') {
        const isTopUp = s.status === 'TOPUP_PENDING' || s.topUpStatus === 'REQUEST_PENDING' || s.hasPendingTopUp === true || !!s.pendingRequest || s.status === 'NEEDS_TOPUP';
        if (!isTopUp) return false;
      } else if (filter === 'ALL') {
        // Under ALL STATUSES, include TOPUP_PENDING students along with approved students
        if (s.status === 'PENDING_ONBOARDING' && s.status !== 'TOPUP_PENDING' && !s.hasPendingTopUp) return false;
        if (!s.isApproved && s.status !== 'TOPUP_PENDING' && !s.hasPendingTopUp) return false;
      } else if (filter === 'CLEARED' && (s.status !== 'CLEARED' || !s.isApproved)) {
        return false;
      } else if (filter === 'NEAR_MATURITY' && (s.status !== 'NEAR_MATURITY' || !s.isApproved)) {
        return false;
      } else if (filter === 'UNAPPROVED' && s.status !== 'AWAITING_VERIFICATION' && s.status !== 'UNAUTHENTICATED') {
        return false;
      } else if (filter === 'INCOMPLETE' && s.status !== 'PENDING_ONBOARDING') {
        return false;
      }

      // Text Search
      if (activeSearch) {
        const fieldsToMatch = [
          s.name,
          s.email,
          s.userId,
          s.phoneNumber || '',
          ...(s.accountNumbers || []),
          ...(s.parallexAccountNumbers || [])
        ];
        const isMatch = fieldsToMatch.some(f => normalize(f).includes(activeSearch));
        if (!isMatch) return false;
      }

      // Advanced Status Filter (Multi-select)
      if (advancedFilters.statuses.length > 0) {
        if (!advancedFilters.statuses.includes(s.status)) {
          // If TOPUP_PENDING is in statuses, match secondary flags too
          if (advancedFilters.statuses.includes('TOPUP_PENDING') && (s.topUpStatus === 'REQUEST_PENDING' || s.hasPendingTopUp)) {
            // match!
          } else {
            return false;
          }
        }
      }

      // Counselor Filter
      if (advancedFilters.assignedCounselorIds.length > 0) {
        let isMatch = false;
        for (const targetId of advancedFilters.assignedCounselorIds) {
          if (targetId === 'UNASSIGNED' && s.counselorName === 'Unassigned') {
            isMatch = true;
            break;
          }
          if (s.assignedCounselorId === targetId || s.counselorName === targetId) {
            isMatch = true;
            break;
          }
          const counselor = allUsers.find(u => u.uid === targetId);
          if (counselor && s.counselorName === counselor.displayName) {
            isMatch = true;
            break;
          }
        }
        if (!isMatch) return false;
      }

      // Financial State
      if (advancedFilters.financialState !== 'ALL') {
        const isDeficit = s.balanceGbp < s.targetGbp;
        const isBreached = (s as any).isCapitalBreached || s.status === 'AT_RISK_CAPITAL_BREACH' || s.status === 'AT_RISK';
        const hasPendingFee = !!s.pendingRequest || s.status === 'TOPUP_PENDING';

        if (advancedFilters.financialState === 'DEFICIT' && !isDeficit) return false;
        if (advancedFilters.financialState === 'FULLY_CLEARED' && isDeficit) return false;
        if (advancedFilters.financialState === 'CAPITAL_BREACHED' && !isBreached) return false;
        if (advancedFilters.financialState === 'PENDING_TOPUP_FEE' && !hasPendingFee) return false;
      }

      // Timer Status
      if (advancedFilters.timerStatus !== 'ALL') {
        const remaining = s.expirationDate ? Math.ceil((new Date(s.expirationDate).getTime() - Date.now()) / 86400000) : null;
        const isActive = s.isTimerActive && s.consecutiveDays > 0;

        if (advancedFilters.timerStatus === 'ACTIVE_COUNTDOWN' && !isActive) return false;
        if (advancedFilters.timerStatus === 'NEAR_EXPIRATION' && (remaining === null || remaining > 7 || remaining < 0)) return false;
        if (advancedFilters.timerStatus === 'EXPIRED' && (remaining !== null && remaining >= 0)) return false;
        if (advancedFilters.timerStatus === 'PAUSED' && s.isTimerActive) return false;
      }

      // Destination
      if (advancedFilters.destinationCountry !== 'ALL') {
        if (s.destinationCountry !== advancedFilters.destinationCountry) return false;
      }

      // Ingestion Channel
      if (advancedFilters.ingestionChannel !== 'ALL') {
        if (!s.ingestionChannels.includes(advancedFilters.ingestionChannel)) return false;
      }

      return true;
    });
  }, [liveStudents, advancedFilters, filter, statusFilter, searchTerm, allUsers]);

  // Full Reset
  const resetAllFilters = () => {
    setAdvancedFilters(INITIAL_ROSTER_FILTERS);
    setFilter('ALL');
    setStatusFilter('ALL');
    setSearchTerm('');
    setRequestTypeFilter('ALL');
  };

  return {
    evaluations,
    allUsers,
    accounts,
    requests,
    liveStudents,
    filteredStudents,
    stats,
    loading,
    advancedFilters,
    setAdvancedFilters,
    filter,
    setFilter,
    statusFilter,
    setStatusFilter,
    requestTypeFilter,
    setRequestTypeFilter,
    searchTerm,
    setSearchTerm,
    resetAllFilters
  };
}
