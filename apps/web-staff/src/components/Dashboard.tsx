import React, { useState, useMemo, useEffect } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Zap,
  Search,
  SearchX,
  RefreshCw,
  UserPlus,
  ChevronRight,
  ChevronDown,
  Activity,
  BarChart3,
  X as XIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Loader2,
  Settings,
  Trash2,
  Save,
  Sparkles,
  MoreVertical,
  Eye,
  ArrowUpRight,
  CheckCheck,
  History
} from 'lucide-react';
import { DashboardSkeleton } from './ui/LoadingStates';
import { AddStudentModal } from './AddStudentModal';
import { AdminStudentProfileDrawer } from './AdminStudentProfileDrawer';
import { useTheme } from '../context/ThemeContext';
import { useNotificationModal } from '../context/NotificationContext';
import { StudentTableFilters, FilterCriteria } from './StudentTableFilters';
import { toast } from 'sonner';

import { resolveUserStatus, ComplianceStatus } from '../services/userStatusService';
import { LIVE_FX_RATE } from '../constants';
import { purgeUserClientSide } from '../utils/governanceService';
import { executeSoftReset } from '../utils/softResetService';
import { motion, AnimatePresence } from 'framer-motion';

interface Student {
  id: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  accountNumbers: string[];
  parallexAccountNumbers: string[];
  status: ComplianceStatus;
  isApproved: boolean;
  consecutiveDays: number;
  balanceGbp: number;
  targetGbp: number;
  anomalyRatio: number;
  lastUpdate: string;
  createdAt: string; // ISO string
  isNew: boolean;
  expirationDate: string | null;
  timerCustomMessage: string | null;
  isTimerActive: boolean;
  assignedCounselorId?: string;
  counselorName?: string;
  destinationCountry?: string;
  ingestionChannels: string[];
  pendingRequest?: {
    id: string;
    type: 'TOP_UP' | 'EXTENSION';
    amountGBP?: number;
    daysRequested?: number;
    reason?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: any;
  };
}

// --- Sub-Components ---

const StatCard: React.FC<{ label: string; value: number | string; icon: any; color: string; description?: string; onClick?: () => void; isActive?: boolean }> = ({
  label, value, icon: Icon, color, description, onClick, isActive
}) => {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 md:p-5 glass-card relative group transition-all ${
        theme === 'dark'
          ? `${isActive ? 'border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/5' : 'hover:border-slate-200 dark:hover:border-zinc-800'}`
          : `bg-white border-slate-200 shadow-sm ${isActive ? 'border-amber-500 ring-2 ring-amber-500/10' : 'hover:border-slate-300'}`
      }`}
    >
      <div className={`absolute top-0 right-0 p-3 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity ${color}`}>
        <Icon className="w-12 h-12 md:w-16 md:h-16" />
      </div>
      <div className={`p-1.5 md:p-2 rounded-lg border w-fit mb-2 md:mb-3 ${color} ${
        theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-200'
      }`}>
        <Icon className="w-4 h-4 md:w-5 h-5" />
      </div>
      <p className={`text-xl md:text-2xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>{value}</p>
      <p className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-0.5 md:mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>{label}</p>
      {description && (
        <p className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter mt-1 opacity-60 group-hover:opacity-100 transition-opacity truncate">{description}</p>
      )}
    </button>
  );
};

const StatusBadge: React.FC<{ status: ComplianceStatus; isNew?: boolean }> = ({ status, isNew }) => {
  const { theme } = useTheme();
  const styles: Record<string, string> = {
    CLEARED: theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200',
    NEEDS_TOPUP: theme === 'dark' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-200',
    NEAR_MATURITY: theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200',
    AT_RISK: theme === 'dark' ? 'bg-rose-500/10 text-rose-400 border-zinc-800' : 'bg-rose-50 text-rose-600 border-rose-200',
    PENDING: theme === 'dark' ? 'bg-slate-500/10 text-slate-400 border-zinc-800' : 'bg-slate-50 text-slate-500 border-slate-200',
    NEW: theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200',
    PENDING_ONBOARDING: theme === 'dark' ? 'bg-zinc-800 text-slate-500 border-zinc-700' : 'bg-slate-100 text-slate-400 border-slate-200',
    AWAITING_VERIFICATION: theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200',
    UNAUTHENTICATED: theme === 'dark' ? 'bg-rose-600/20 text-rose-500 border-rose-600/30 shadow-lg shadow-rose-900/10' : 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm',
    TOPUP_PENDING: theme === 'dark' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-200',
  };

  const labels: Record<string, string> = {
    PENDING_ONBOARDING: 'INCOMPLETE ONBOARDING',
    AWAITING_VERIFICATION: 'PENDING VERIFICATION',
    UNAUTHENTICATED: 'IDENTIFICATION FAILED',
    TOPUP_PENDING: 'TOP-UP PENDING',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-tighter whitespace-nowrap shadow-sm ${styles[status] || styles.PENDING}`}>
        {labels[status] || status.replace('_', ' ')}
      </span>
      {isNew && (
        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 uppercase tracking-widest animate-pulse">
          New
        </span>
      )}
    </div>
  );
};

interface StaffDashboardProps {
  onInspect?: (id: string) => void;
  onMessageStudent?: (id: string) => void;
  onViewProfile?: (student: any, tab?: 'profile' | 'activity' | 'documents' | 'governance') => void;
}

const HistoryLogModal: React.FC<{ isOpen: boolean; onClose: () => void; student: Student | null }> = ({ isOpen, onClose, student }) => {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !student) return;
    setLoading(true);
    // Fetch logs for this student (either by evaluation ID or userId)
    const q = query(
      collection(db, 'audit_logs'),
      where('studentId', 'in', [student.id, student.userId]),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Audit log error:", err);
      setLoading(false);
    });

    return unsub;
  }, [isOpen, student]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-2xl max-h-[80vh] glass-card flex flex-col animate-in zoom-in-95 duration-300 shadow-2xl overflow-hidden">
        <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-slate-950/20 border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-500" />
            <h3 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Audit Trail: {student?.name}</h3>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-all ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}>
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {loading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center opacity-30">
              <Activity className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs font-black uppercase tracking-widest">No history recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className={`p-4 rounded-2xl border transition-all ${
                  theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-slate-50 border-slate-200 shadow-sm'
                }`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      log.action?.includes('APPROV') ? 'text-emerald-500' :
                      log.action?.includes('FLAG') || log.action?.includes('REJECT') ? 'text-rose-500' : 'text-blue-500'
                    }`}>
                      {log.action?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      {log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleString() : 'Recent'}
                    </span>
                  </div>
                  <p className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{log.detail}</p>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mt-2">Actor: {log.actor || 'System'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onInspect, onMessageStudent, onViewProfile }) => {
  const { appUser, role } = useAuth();
  const { theme } = useTheme();
  const { showNotification } = useNotificationModal();
  const [students, setStudents] = useState<Student[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Filter State
  const INITIAL_FILTERS: FilterCriteria = {
    searchTerm: '',
    statuses: [],
    assignedCounselorIds: [], // Changed from assignedCounselorId: 'ALL'
    financialState: 'ALL',
    timerStatus: 'ALL',
    destinationCountry: 'ALL',
    ingestionChannel: 'ALL'
  };
  const [advancedFilters, setAdvancedFilters] = useState<FilterCriteria>(INITIAL_FILTERS);

  // Keep legacy filter for backward compatibility if needed, but we'll prioritize advancedFilters
  const [filter, setFilter] = useState<ComplianceStatus | 'ALL' | 'REQUESTS' | 'UNAPPROVED' | 'INCOMPLETE'>('ALL');
  const [requestTypeFilter, setRequestTypeFilter] = useState<'ALL' | 'FINANCE' | 'DAYS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Modal & Drawer State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMetricsExpanded, setIsMetricsExpanded] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Request Handling State
  const [modifyingRequest, setModifyingRequest] = useState<boolean>(false);
  const [modValue, setModValue] = useState<string>('');

  const isAdmin = role === 'ADMIN_GOVERNANCE';

  // 1. Subscribe to all evaluations
  useEffect(() => {
    const q = query(collection(db, 'pof_evaluations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const currentTime = Date.now();
      const data = snap.docs.map(docSnap => {
        const d = docSnap.data();

        // 24-hour expiration logic
        const createdMillis = d.createdAt?.seconds ? d.createdAt.seconds * 1000 : currentTime;
        const elapsedHours = (currentTime - createdMillis) / (1000 * 60 * 60);
        const isNew = elapsedHours <= 24;

        // Compute consecutive days from start date
        const start = d.startDate ? new Date(d.startDate).getTime() : null;
        const days = start ? Math.min(Math.max(Math.floor((Date.now() - start) / (86400000)) + 1, 1), 28) : 0;

        // Determine status if not explicitly set
        let status = (d.status || 'PENDING') as any;
        if (status === 'VALIDATED') status = 'CLEARED';

        // Force status back to PENDING if target is missing, to prevent accidental clearance
        if (status === 'CLEARED' && (d.targetGBP || 0) <= 0) {
          status = 'PENDING';
        }

        // "Almost Done" logic: users with less than 7 days left to reach 28
        if (days >= 22 && days < 28 && status !== 'CLEARED') status = 'NEAR_MATURITY';

        if (d.anomalyRatio > 2.5) status = 'AT_RISK';

        return {
          id: docSnap.id,
          userId: d.userId, // Storing the actual user UID
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
          isTimerActive: d.isTimerActive || false
        } as any;
      });
      setStudents(data);
    });
    return unsub;
  }, []);

  // 1b. Subscribe to all users (Filter out those who haven't started setup to avoid polluting the roster)
  useEffect(() => {
    // Fetch all users and filter archived ones in JS to avoid Firestore missing-field omission
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // 2. Subscribe to liquidity requests
  useEffect(() => {
    const q = query(collection(db, 'liquidity_requests'), where('status', '==', 'PENDING'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 3. Subscribe to all financial accounts
  useEffect(() => {
    const q = query(collection(db, 'financial_accounts'));
    const unsub = onSnapshot(q, (snap) => {
      const accs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(accs);
    });
    return unsub;
  }, []);

  // 4. Merge data
  const liveStudents = useMemo(() => {
    const LIVE_FX = LIVE_FX_RATE;

    // Start with existing student evaluations
    const merged: Student[] = students.filter(s => {
      const userProfile = allUsers.find(u => u.uid === s.userId || u.email === s.email);
      // Skip deleted or archived users
      if (userProfile?.hardDeleted || userProfile?.isArchived === true) return false;
      return true;
    }).map(s => {
      const studentAccs = accounts.filter(a => a.userId === s.userId || a.userEmail === s.email);

      // Sum all bank accounts (handle both balanceGbp and balanceGBP casing)
      const accountsTotalGbp = studentAccs.reduce((sum, curr) =>
        sum + (Number(curr.balanceGbp) || Number(curr.balanceGBP) || 0), 0
      );

      // Add manual balance override from evaluation doc
      const manualTotalGbp = ((s as any).currentBalanceNgn || 0) / LIVE_FX;

      const totalGbp = accountsTotalGbp + manualTotalGbp;

      const studentRequest = requests.find(r => r.userId === s.userId || r.userEmail === s.email);

      // Sync details from users collection if available
      const userProfile = allUsers.find(u => u.uid === s.userId || u.email === s.email);
      const isApproved = userProfile ? (userProfile.isApproved === true && userProfile.hardDeleted !== true) : s.isApproved;
      const name = userProfile?.displayName || userProfile?.username || s.name;
      const email = userProfile?.email || s.email;

      // New data fields for filtering
      const phoneNumber = userProfile?.phoneNumber || '';
      const accountNumbers = studentAccs.map(a => a.accountNumberMasked || '').filter(Boolean);
      const onboarding = userProfile?.onboardingProfile;
      const parallexAccountNumbers = [onboarding?.parallexAccountNumber].filter(Boolean);
      const destinationCountry = onboarding?.destinationCountry || '';

      const ingestionChannels: string[] = [];
      if (studentAccs.some(a => a.connectionMethod !== 'MANUAL_DEPOSIT')) ingestionChannels.push('AUTOMATED');
      if (manualTotalGbp > 0 || studentAccs.some(a => a.connectionMethod === 'MANUAL_DEPOSIT')) ingestionChannels.push('MANUAL');
      if (studentAccs.length === 0 && manualTotalGbp === 0) ingestionChannels.push('UNVERIFIED');

      // Adjust status based on approval and onboarding
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

      return {
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
    });

    // Add users who are NOT in pof_evaluations yet
    allUsers.forEach(u => {
      const uid = u.id || u.uid;

      // Skip archived or deleted users
      if (u.isArchived === true || u.hardDeleted === true) return;

      const isAlreadyIn = merged.some(s => s.userId === uid || s.email === u.email);
      const isStudentRole = u.role === 'STUDENT' || (!u.email?.endsWith('@basechaninternational.com') && !u.email?.endsWith('.basechaninternational@gmail.com'));

      if (!isAlreadyIn && isStudentRole) {
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

        merged.push({
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
        });
      }
    });

    return merged;
  }, [students, accounts, requests, allUsers]);

  const stats = useMemo(() => ({
    total: liveStudents.filter(s => s.isApproved || s.status === 'TOPUP_PENDING').length,
    cleared: liveStudents.filter(s => s.status === 'CLEARED' && s.isApproved).length,
    topUpRequired: liveStudents.filter(s =>
      s.status === 'TOPUP_PENDING' ||
      (s as any).topUpStatus === 'REQUEST_PENDING' ||
      (s as any).hasPendingTopUp === true ||
      !!s.pendingRequest ||
      s.status === 'NEEDS_TOPUP'
    ).length,
    nearMaturity: liveStudents.filter(s => s.status === 'NEAR_MATURITY' && s.isApproved).length,
    atRisk: liveStudents.filter(s => s.status === 'AT_RISK' && s.isApproved).length,
    unapproved: liveStudents.filter(s => (s.status === 'AWAITING_VERIFICATION' || s.status === 'UNAUTHENTICATED') && s.status !== 'TOPUP_PENDING').length,
    pendingOnboarding: liveStudents.filter(s => s.status === 'PENDING_ONBOARDING' && s.status !== 'TOPUP_PENDING' && !(s as any).hasPendingTopUp).length,
    newUsers: liveStudents.filter(s => s.isNew).length
  }), [liveStudents]);

  const filteredStudents = useMemo(() => {
    const normalize = (val: string) => val.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const queryStr = normalize(advancedFilters.searchTerm);

    return liveStudents.filter(s => {
      // 0. Quick Category Filtering (Stat Cards)
      if (filter === 'ALL') {
        if (s.status === 'PENDING_ONBOARDING' && s.status !== 'TOPUP_PENDING' && !(s as any).hasPendingTopUp) return false;
        if (!s.isApproved && s.status !== 'TOPUP_PENDING' && !(s as any).hasPendingTopUp) return false;
      }
      if (filter === 'CLEARED' && (s.status !== 'CLEARED' || !s.isApproved)) return false;
      if (filter === 'REQUESTS' || filter === 'TOPUP_PENDING') {
        const isTopUp = s.status === 'TOPUP_PENDING' || (s as any).topUpStatus === 'REQUEST_PENDING' || (s as any).hasPendingTopUp === true || !!s.pendingRequest || s.status === 'NEEDS_TOPUP';
        if (!isTopUp) return false;
      }
      if (filter === 'NEAR_MATURITY' && (s.status !== 'NEAR_MATURITY' || !s.isApproved)) return false;
      if (filter === 'UNAPPROVED' && s.status !== 'AWAITING_VERIFICATION' && s.status !== 'UNAUTHENTICATED') return false;
      if (filter === 'INCOMPLETE' && s.status !== 'PENDING_ONBOARDING') return false;

      // 1. Text Search Matching (Multi-field)
      if (queryStr) {
        const fieldsToMatch = [
          s.name,
          s.email,
          s.userId,
          s.phoneNumber || '',
          ...(s.accountNumbers || []),
          ...(s.parallexAccountNumbers || [])
        ];
        const isMatch = fieldsToMatch.some(f => normalize(f).includes(queryStr));
        if (!isMatch) return false;
      }

      // 2. Status Filter (Multi-select)
      if (advancedFilters.statuses.length > 0) {
        if (!advancedFilters.statuses.includes(s.status)) {
          if (advancedFilters.statuses.includes('TOPUP_PENDING') && (s.status === 'TOPUP_PENDING' || (s as any).topUpStatus === 'REQUEST_PENDING' || (s as any).hasPendingTopUp)) {
            // match
          } else {
            return false;
          }
        }
      }

      // 3. Counselor Assignment (Multi-select)
      if (advancedFilters.assignedCounselorIds.length > 0) {
        let isMatch = false;

        for (const targetId of advancedFilters.assignedCounselorIds) {
          if (targetId === 'UNASSIGNED') {
            if (s.counselorName === 'Unassigned') {
              isMatch = true;
              break;
            }
          } else {
            // Check by UID or Name
            if (s.assignedCounselorId === targetId || s.counselorName === targetId) {
              isMatch = true;
              break;
            }
            // Try lookup from allUsers if student record has a name that matches counselor displayName
            const counselor = allUsers.find(u => u.uid === targetId);
            if (counselor && s.counselorName === counselor.displayName) {
              isMatch = true;
              break;
            }
          }
        }

        if (!isMatch) return false;
      }

      // 4. Financial State
      if (advancedFilters.financialState !== 'ALL') {
        const isDeficit = s.balanceGbp < s.targetGbp;
        const isBreached = (s as any).isCapitalBreached || s.status === 'AT_RISK_CAPITAL_BREACH' || s.status === 'AT_RISK';
        const hasPendingFee = !!s.pendingRequest; // Assuming requests represent top-ups needing verification

        if (advancedFilters.financialState === 'DEFICIT' && !isDeficit) return false;
        if (advancedFilters.financialState === 'FULLY_CLEARED' && isDeficit) return false;
        if (advancedFilters.financialState === 'CAPITAL_BREACHED' && !isBreached) return false;
        if (advancedFilters.financialState === 'PENDING_TOPUP_FEE' && !hasPendingFee) return false;
      }

      // 5. Timer Status
      if (advancedFilters.timerStatus !== 'ALL') {
        const remaining = s.expirationDate ? Math.ceil((new Date(s.expirationDate).getTime() - Date.now()) / 86400000) : null;
        const isActive = s.isTimerActive && s.consecutiveDays > 0;

        if (advancedFilters.timerStatus === 'ACTIVE_COUNTDOWN' && !isActive) return false;
        if (advancedFilters.timerStatus === 'NEAR_EXPIRATION' && (remaining === null || remaining > 7 || remaining < 0)) return false;
        if (advancedFilters.timerStatus === 'EXPIRED' && (remaining !== null && remaining >= 0)) return false;
        if (advancedFilters.timerStatus === 'PAUSED' && s.isTimerActive) return false;
      }

      // 6. Destination
      if (advancedFilters.destinationCountry !== 'ALL') {
        if (s.destinationCountry !== advancedFilters.destinationCountry) return false;
      }

      // 7. Ingestion Channel
      if (advancedFilters.ingestionChannel !== 'ALL') {
        if (!s.ingestionChannels.includes(advancedFilters.ingestionChannel)) return false;
      }

      return true;
    });
  }, [liveStudents, advancedFilters, allUsers, filter]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [advancedFilters, filter, requestTypeFilter, searchTerm]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  const totalPages = Math.ceil(filteredStudents.length / pageSize);

  const handleApproveAccess = async (student: Student) => {
    const targetUid = student.userId || student.id;
    if (!targetUid) return;

    setIsSubmitting(true);
    try {
      await setDoc(doc(db, 'users', targetUid), {
        isApproved: true,
        setupCompleted: true,
        onboardingComplete: true,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'audit_logs'), {
        actor: appUser?.displayName || 'Admin',
        action: 'USER_APPROVED',
        detail: `Approved student access for ${student.name}`,
        studentId: targetUid,
        createdAt: serverTimestamp()
      });

      toast.success(`Access approved for ${student.name}`);
      setSelectedStudent(null);
    } catch (e: any) {
      toast.error(`Operation failed: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearCompliance = async (student: Student) => {
    const targetUid = student.userId || student.id;
    if (!targetUid) return;

    setIsSubmitting(true);
    try {
      const evalRef = collection(db, 'pof_evaluations');
      const q = query(evalRef, where('userId', '==', targetUid));
      const snap = await getDocs(q);

      if (!snap.empty) {
        await updateDoc(doc(db, 'pof_evaluations', snap.docs[0].id), {
          status: 'CLEARED',
          isApproved: true,
          consecutiveDays: 28, // Force maturity for manual clearance
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'pof_evaluations'), {
          userId: targetUid,
          name: student.name,
          email: student.email,
          status: 'CLEARED',
          isApproved: true,
          balanceGbp: student.balanceGbp || 0,
          targetGbp: student.targetGbp || 0,
          anomalyRatio: 0,
          consecutiveDays: 28,
          verifiedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }

      await setDoc(doc(db, 'users', targetUid), {
        status: 'CLEARED',
        isApproved: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'audit_logs'), {
        actor: appUser?.displayName || 'Admin',
        action: 'COMPLIANCE_CLEARED',
        detail: `Manually cleared compliance for ${student.name}`,
        studentId: targetUid,
        createdAt: serverTimestamp()
      });

      toast.success(`Compliance manually cleared for ${student.name}`);
      setSelectedStudent(null);
    } catch (e: any) {
      toast.error(`Clearance failed: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessRequest = async (student: Student, action: 'APPROVE' | 'REJECT', valOverride?: number) => {
    if (!student.pendingRequest) return;
    setIsSubmitting(true);
    try {
      const reqId = student.pendingRequest.id;
      const type = student.pendingRequest.type;
      const finalVal = valOverride !== undefined ? valOverride : (type === 'TOP_UP' ? student.pendingRequest.amountGBP : student.pendingRequest.daysRequested) || 0;

      if (action === 'APPROVE') {
        if (type === 'TOP_UP') {
          // Add a "System Top-Up" account to credit the student
          await addDoc(collection(db, 'financial_accounts'), {
            userId: student.userId,
            userEmail: student.email,
            bankName: 'System Liquidity Top-Up',
            accountName: student.name,
            accountNumberMasked: '•••• SYST',
            accountType: 'SAVINGS',
            balanceNgn: Math.round(finalVal * LIVE_FX_RATE), // Convert GBP to NGN for storage
            balanceGBP: finalVal,
            connectionMethod: 'MANUAL_DEPOSIT',
            status: 'VERIFIED',
            lastSyncedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        } else {
          // Days extension: Push start date back to credit days
          const pofSnap = await getDocs(query(collection(db, 'pof_evaluations'), where('userId', '==', student.userId)));
          if (!pofSnap.empty) {
            const d = pofSnap.docs[0].data();
            const currentStart = d.startDate ? new Date(d.startDate) : new Date();
            currentStart.setDate(currentStart.getDate() - finalVal);
            await updateDoc(doc(db, 'pof_evaluations', pofSnap.docs[0].id), {
              startDate: currentStart.toISOString().split('T')[0],
              updatedAt: serverTimestamp()
            });
          }
        }

        await updateDoc(doc(db, 'liquidity_requests', reqId), {
          status: 'APPROVED',
          processedAmount: type === 'TOP_UP' ? finalVal : 0,
          processedDays: type === 'EXTENSION' ? finalVal : 0,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'audit_logs'), {
          actor: appUser?.displayName || 'Admin',
          action: `REQUEST_${type}_APPROVED`,
          detail: `Approved ${type} request for ${student.name}. Value: ${finalVal}`,
          studentId: student.userId,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'liquidity_requests', reqId), {
          status: 'REJECTED',
          updatedAt: serverTimestamp()
        });
      }

      setModifyingRequest(false);
      setSelectedStudent(null);
    } catch (e) {
      console.error('Process request error:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedStudent) return;

    showNotification({
      title: "Hard Purge Student Data?",
      message: `Are you sure you want to PERMANENTLY wipe ALL records for ${selectedStudent.name}? This includes documents, bank ledger, and authentication access. This action is IRREVERSIBLE and will truly remove the user from the system.`,
      type: "CONFIRM",
      confirmText: "Permanent Purge",
      cancelText: "Cancel",
      onConfirm: async () => {
        setIsSubmitting(true);
        const t = toast.loading(`Executing system-wide wipe for ${selectedStudent.name}...`);
        try {
          const uid = selectedStudent.userId || selectedStudent.id;

          // ─── DIRECT CLIENT-SIDE PURGE (BaaS Mode) ───
          const result = await purgeUserClientSide(uid);

          if (result.success) {
            toast.success(result.message, { id: t });
            setSelectedStudent(null);
          } else {
            throw new Error(result.message);
          }
        } catch (err: any) {
          toast.error('Purge failed: ' + err.message, { id: t });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  const handleSoftReset = async () => {
    if (!selectedStudent) return;
    const uid = selectedStudent.userId || selectedStudent.id;

    if (!window.confirm(`SOFT RESET: This will completely wipe all database records and files for ${selectedStudent.name}, but their LOGIN account will remain active. They can log back in to start fresh. Proceed?`)) return;

    setIsSubmitting(true);
    const t = toast.loading(`Resetting environment for ${selectedStudent.name}...`);
    try {
      await executeSoftReset(uid);
      toast.success('User environment reset. Student can now log in to start fresh.', { id: t });
      setSelectedStudent(null);
    } catch (err: any) {
      toast.error('Reset failed: ' + err.message, { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  const counselors = useMemo(() =>
    allUsers.filter(u => u.role === 'COUNSELOR').map(u => ({ uid: u.uid || u.id, displayName: u.displayName || u.username || 'Counselor' }))
  , [allUsers]);

  const statConfigs = [
    { label: "Total Students", value: stats.total, icon: Users, color: "text-slate-600 dark:text-slate-300", description: "Authorized student profiles", filterId: 'ALL' },
    { label: "Cleared", value: stats.cleared, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", description: "Full POF maturity reached", filterId: 'CLEARED' },
    { label: "Top Up Required", value: stats.topUpRequired, icon: Zap, color: "text-amber-600 dark:text-amber-400", description: "Funding needed or pending", filterId: 'TOPUP_PENDING' },
    { label: "Almost Done", value: stats.nearMaturity, icon: Clock, color: "text-cyan-600 dark:text-cyan-400", description: "Near 28-day maturity", filterId: 'NEAR_MATURITY' },
    { label: "Auth Failed", value: stats.unapproved, icon: ShieldAlert, color: "text-rose-600 dark:text-rose-500", description: "Verification failed or pending", filterId: 'UNAPPROVED' },
    ...(stats.pendingOnboarding > 0 ? [{ label: "Incomplete", value: stats.pendingOnboarding, icon: Loader2, color: "text-slate-600 dark:text-slate-400", description: "Awaiting setup completion", filterId: 'INCOMPLETE' }] : []),
  ];

  const handleResetAllFilters = () => {
    setAdvancedFilters(INITIAL_FILTERS);
    setSearchTerm('');
    setFilter('ALL');
    setRequestTypeFilter('ALL');
  };

  const handleStatCardClick = (filterId: string) => {
    setFilter(filterId as any);
    if (filterId === 'TOPUP_PENDING') {
      setAdvancedFilters(prev => ({ ...prev, statuses: ['TOPUP_PENDING'] }));
    } else {
      setAdvancedFilters(prev => ({ ...prev, statuses: [] }));
    }
    if (filterId === 'REQUESTS') setRequestTypeFilter('ALL');
    setIsMetricsExpanded(false);
  };

  const activeStat = statConfigs.find(c => c.filterId === filter) || statConfigs[0];

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 font-sans text-main">

      {/* 1. Statistics (Responsive Hybrid Grid/Accordion) */}
      <div className="space-y-3">
        {/* Mobile Accordion Toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setIsMetricsExpanded(!isMetricsExpanded)}
            className="w-full glass-card p-4 flex items-center justify-between border border-slate-200 dark:border-zinc-800 bg-slate-900/80 backdrop-blur-md shadow-xl transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-xl bg-slate-950 border border-slate-200 dark:border-zinc-800 ${activeStat.color}`}>
                <activeStat.icon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{activeStat.label}</p>
                <p className="text-xl font-black text-main dark:text-white leading-none mt-1">{activeStat.value}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 border border-slate-200 dark:border-zinc-800 text-blue-400">
               <BarChart3 className="w-3.5 h-3.5" />
               <span className="text-[9px] font-black uppercase tracking-widest">
                 {isMetricsExpanded ? 'Collapse' : 'Expand'} ({statConfigs.length})
               </span>
               <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMetricsExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          <AnimatePresence>
            {isMetricsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-2 pt-3">
                  {statConfigs.map((s) => (
                    <StatCard
                      key={s.filterId}
                      label={s.label}
                      value={s.value}
                      icon={s.icon}
                      color={s.color}
                      description={s.description}
                      onClick={() => handleStatCardClick(s.filterId)}
                      isActive={filter === s.filterId}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop Grid View */}
        <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {statConfigs.map((s) => (
            <StatCard
              key={s.filterId}
              label={s.label}
              value={s.value}
              icon={s.icon}
              color={s.color}
              description={s.description}
              onClick={() => handleStatCardClick(s.filterId)}
              isActive={filter === s.filterId}
            />
          ))}
        </div>
      </div>

      {/* 2. Multi-Criteria Search Engine */}
      <div className="space-y-4 md:space-y-6">
        <div className="flex justify-between items-center">
           <h2 className="text-xl uppercase font-extrabold text-slate-900 dark:text-white tracking-tight">Student Governance Roster</h2>
           <button
             onClick={() => setIsAddUserOpen(true)}
             className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg depth-btn-gold ${
               theme === 'dark' ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20' : 'bg-blue-600 text-white hover:bg-blue-700'
             }`}
           >
             <UserPlus className="w-3.5 h-3.5" />
             <span>Add New Student</span>
           </button>
        </div>

        <StudentTableFilters
          filters={advancedFilters}
          onFilterChange={setAdvancedFilters}
          counselors={counselors}
          onReset={handleResetAllFilters}
          isDark={theme === 'dark'}
        />

        {/* 3. Student Table */}
        <div className="glass-card shadow-2xl transition-colors duration-500 !bg-surface-glass !border-surface-glass-border">
          <div className="overflow-x-auto">
            {filteredStudents.length === 0 ? (
              <div className="p-20 text-center flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-24 h-24 rounded-[2.5rem] bg-slate-950/40 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-500 shadow-2xl">
                  <SearchX className="w-12 h-12" />
                </div>
                <div className="space-y-2 max-w-sm mx-auto">
                   <p className="text-sm font-black text-main dark:text-white uppercase tracking-tight">No match found</p>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                     No students match your current search or filter criteria. Try expanding your parameters or resetting the filters.
                   </p>
                </div>
                <button
                  onClick={handleResetAllFilters}
                  className="flex items-center gap-2 px-8 py-3.5 bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-amber-500"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset All Filters
                </button>
              </div>
            ) : (
              <table className="w-full text-left font-sans">
                <thead>
                  <tr className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest border-b transition-colors ${
                    theme === 'dark' ? 'bg-slate-950/40 text-slate-500 border-slate-200 dark:border-zinc-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <th className="px-4 md:px-8 py-3 md:py-5 text-slate-900 dark:text-slate-500 font-extrabold">Student Name</th>
                    <th className="px-4 md:px-8 py-3 md:py-5 text-slate-900 dark:text-slate-500 font-extrabold">Status</th>
                    <th className="hidden sm:table-cell px-4 md:px-8 py-3 md:py-5 text-slate-900 dark:text-slate-500 font-extrabold">Request</th>
                    <th className="px-4 md:px-8 py-3 md:py-5 text-right text-slate-900 dark:text-slate-500 font-extrabold">View</th>
                  </tr>
                </thead>
                <tbody className={`divide-y transition-colors ${theme === 'dark' ? 'divide-white/5' : 'divide-slate-100'}`}>
                  {paginatedStudents.map((student) => (
                    <tr
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                      className={`transition-all group cursor-pointer ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <div className="flex items-center space-x-3 md:space-x-4">
                          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border flex items-center justify-center font-black text-[10px] md:text-xs transition-colors ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-200 dark:border-zinc-800 text-amber-500' : 'bg-slate-100 border-slate-200 text-amber-600'
                          }`}>
                            {student.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                               <p className={`text-xs md:text-sm font-bold leading-tight transition-colors truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{student.name}</p>
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   if (onInspect) onInspect(student.userId || student.id);
                                 }}
                                 className="p-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white transition-all"
                                 title="View Full Dashboard"
                               >
                                 <ArrowUpRight className="w-3 h-3" />
                               </button>
                            </div>
                            {!student.isApproved && (
                               <span className="inline-block px-1.5 py-0.5 rounded bg-rose-500 text-white text-[7px] font-black uppercase tracking-tighter mt-1 animate-pulse">Waiting Approval</span>
                            )}
                            <p className="text-[8px] md:text-[10px] font-mono text-slate-500 mt-0.5 truncate max-w-[120px] md:max-w-[150px] uppercase">{student.email || 'NO EMAIL'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6">
                        <StatusBadge status={student.status} isNew={student.isNew} />
                      </td>
                      <td className="hidden sm:table-cell px-4 md:px-8 py-4 md:py-6">
                        <div className="space-y-1">
                          {student.pendingRequest ? (
                            <div className="flex items-center space-x-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                               <span className="text-[9px] md:text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                 {student.pendingRequest.type === 'TOP_UP' ? 'Finance Top Up' : 'Days Extension'}
                               </span>
                            </div>
                          ) : student.status === 'NEEDS_TOPUP' ? (
                            <div className="flex items-center space-x-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                               <span className="text-[9px] md:text-[10px] font-black text-rose-500 uppercase tracking-widest">
                                 System Flag: Low Funds
                               </span>
                            </div>
                          ) : (
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-60">No Request</span>
                          )}
                          <p className={`text-[9px] md:text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>
                             £{student.balanceGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })} / £{student.targetGbp.toLocaleString()}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 md:py-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudent(student);
                          }}
                          className={`p-1.5 md:p-2 rounded-lg md:rounded-xl border transition-all ${
                            theme === 'dark'
                              ? 'bg-slate-800 border-white/5 text-slate-400 hover:bg-amber-50'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-amber-500 hover:text-white'
                          }`}
                        >
                          <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 4. Pagination Controls */}
        {filteredStudents.length > 0 && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-2 py-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Showing <span className="text-amber-500">{(currentPage - 1) * pageSize + 1}</span> to <span className="text-amber-500">{Math.min(currentPage * pageSize, filteredStudents.length)}</span> of <span className="text-amber-500">{filteredStudents.length}</span> students
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-2 rounded-xl border transition-all ${
                  currentPage === 1
                    ? 'opacity-30 cursor-not-allowed border-slate-200 dark:border-zinc-800 text-slate-600'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-400 hover:bg-white/5 hover:text-white active:scale-95'
                }`}
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Logic to show a window of pages around current page
                  let pageNum = i + 1;
                  if (totalPages > 5) {
                    if (currentPage > 3) {
                      pageNum = currentPage - 3 + i + 1;
                      if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                    }
                  }

                  if (pageNum <= 0 || pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-9 h-9 rounded-xl border text-[10px] font-black transition-all ${
                        currentPage === pageNum
                          ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                          : 'border-white/5 text-slate-500 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-xl border transition-all ${
                  currentPage === totalPages
                    ? 'opacity-30 cursor-not-allowed border-slate-200 dark:border-zinc-800 text-slate-600'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-400 hover:bg-white/5 hover:text-white active:scale-95'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedStudent && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setSelectedStudent(null)}>
          <aside
            className="fixed right-0 top-0 bottom-0 h-screen w-full max-w-[420px] glass-card rounded-r-none border-y-0 border-r-0 border-l border-white/15 z-50 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-500 ease-out transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <div className={`sticky top-0 p-6 border-b backdrop-blur-xl z-20 flex justify-between items-center transition-colors ${
              theme === 'dark' ? 'bg-slate-950/20 border-slate-200 dark:border-zinc-800' : 'bg-white/40 border-slate-100'
            }`}>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Student Info</h3>
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Reviewing Compliance Profile</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} className={`p-2.5 rounded-xl transition-all ${
                theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
              }`}>
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-8 flex-1">
              <div
                onClick={() => {
                  if (onInspect) onInspect(selectedStudent.userId || selectedStudent.id);
                  setSelectedStudent(null);
                }}
                className={`border p-6 rounded-[2.5rem] flex items-center space-x-6 cursor-pointer group/card transition-all ${
                  theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 hover:border-amber-500/30' : 'bg-slate-50 border-slate-200 shadow-sm hover:shadow-md'
                }`}
              >
                <div className={`w-20 h-20 rounded-full border flex items-center justify-center font-black text-2xl transition-colors ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-200 dark:border-zinc-800 text-amber-500' : 'bg-white border-slate-200 text-amber-600'
                }`}>
                  {selectedStudent.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h4 className={`text-xl font-black leading-none transition-all group-hover/card:text-amber-500 ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>
                    {selectedStudent.name}
                  </h4>
                  <p className="text-xs font-mono text-slate-500 mt-2 uppercase">{selectedStudent.email}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <StatusBadge status={selectedStudent.status} isNew={selectedStudent.isNew} />
                    {!selectedStudent.isApproved && selectedStudent.status !== 'PENDING_ONBOARDING' && (
                      <span className="px-2 py-1 rounded bg-rose-500 text-white text-[8px] font-black uppercase">Identity Unverified</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className={`p-5 rounded-3xl border ${theme === 'dark' ? 'bg-slate-950/40 border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Consolidated Total Balance</p>
                  <p className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>£{selectedStudent.balanceGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Compliance Actions</h5>

                {/* Pending Request Handling */}
                {selectedStudent.pendingRequest && (
                  <div className={`p-6 rounded-[2rem] border-2 border-dashed space-y-4 ${theme === 'dark' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-500/20'}`}>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <Zap className="w-4 h-4 text-amber-500" />
                         <span className="text-xs font-black uppercase text-amber-500 tracking-tight">Pending {selectedStudent.pendingRequest.type.replace('_', ' ')}</span>
                       </div>
                       <span className="text-[9px] font-mono text-slate-500">{new Date(selectedStudent.pendingRequest.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/5 dark:bg-slate-950/20 border border-slate-200 dark:border-zinc-800 space-y-2">
                      <p className="text-xs font-bold text-main dark:text-white">
                        Requested: {selectedStudent.pendingRequest.type === 'TOP_UP' ? `£${selectedStudent.pendingRequest.amountGBP}` : `${selectedStudent.pendingRequest.daysRequested} Days`}
                      </p>
                      {selectedStudent.pendingRequest.reason && (
                        <p className="text-[10px] text-slate-500 italic leading-relaxed">"{selectedStudent.pendingRequest.reason}"</p>
                      )}
                    </div>

                    {modifyingRequest ? (
                      <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                         <input
                           type="number"
                           placeholder={`New ${selectedStudent.pendingRequest.type === 'TOP_UP' ? 'Amount (£)' : 'Days'}`}
                           value={modValue}
                           onChange={e => setModValue(e.target.value)}
                           className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                         />
                         <div className="flex gap-2">
                           <button onClick={() => handleProcessRequest(selectedStudent, 'APPROVE', parseFloat(modValue))} className="flex-1 py-3 bg-amber-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Confirm & Approve</button>
                           <button onClick={() => setModifyingRequest(false)} className="px-4 py-3 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase transition-all">Cancel</button>
                         </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleProcessRequest(selectedStudent, 'APPROVE')}
                          disabled={isSubmitting}
                          className="col-span-2 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Quick Approve
                        </button>
                        <button
                          onClick={() => {
                            setModValue(selectedStudent.pendingRequest?.type === 'TOP_UP' ? String(selectedStudent.pendingRequest.amountGBP) : String(selectedStudent.pendingRequest.daysRequested));
                            setModifyingRequest(true);
                          }}
                          className="py-3 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all"
                        >
                          Modify Amount
                        </button>
                        <button
                          onClick={() => handleProcessRequest(selectedStudent, 'REJECT')}
                          className="py-3 bg-rose-600/10 border border-rose-500/20 text-rose-400 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all"
                        >
                          Reject Request
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!selectedStudent.isApproved && (
                  <button
                    onClick={async () => {
                      handleApproveAccess(selectedStudent);
                    }}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-between p-6 bg-gradient-to-tr from-emerald-400 to-emerald-600 rounded-3xl text-slate-950 font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <span>Processing...</span> : <span>Approve User Access</span>}
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                )}

                {selectedStudent.status !== 'CLEARED' && selectedStudent.isApproved && (
                  <button
                    onClick={() => handleClearCompliance(selectedStudent)}
                    className="w-full flex items-center justify-between p-6 bg-gradient-to-tr from-amber-400 to-amber-600 rounded-3xl text-slate-950 font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all"
                  >
                    <span>Clear Compliance</span>
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={() => {
                    if (onViewProfile) onViewProfile(selectedStudent);
                  }}
                  className={`w-full flex items-center justify-between p-6 border rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <span>View Full Profile</span>
                  <Eye className="w-5 h-5 text-amber-500" />
                </button>

                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className={`w-full flex items-center justify-between p-6 border rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <span>View history</span>
                  <Activity className="w-5 h-5 text-cyan-500" />
                </button>

                <button
                  onClick={() => {
                    if (onMessageStudent && selectedStudent) onMessageStudent(selectedStudent.userId);
                    setSelectedStudent(null);
                  }}
                  className={`w-full flex items-center justify-between p-6 border rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  <span>Message Student</span>
                  <FileText className="w-5 h-5 text-emerald-500" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <AddStudentModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        onSuccess={() => {}}
      />

      <HistoryLogModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        student={selectedStudent}
      />
    </div>
  );
};
