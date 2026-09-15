import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Plus,
  Building2,
  TrendingUp,
  ShieldCheck,
  Activity,
  Loader2,
  RefreshCw,
  Trash2,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X as XIcon,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Globe,
  Lock,
  Zap,
  Clock,
  CheckSquare,
  Square,
  ArrowRight,
  Settings,
  Phone,
  ShieldAlert,
  FileText,
  User,
  Upload,
  Rocket,
  Shield,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { TopUpRequestModal } from './TopUpRequestModal';
import { UssdFallbackModal } from './UssdFallbackModal';
import { BankStatementView } from './BankStatementView';
import { StudentProfileModal } from './StudentProfileModal';
import { StudentDocumentUploadWizard } from './StudentDocumentUploadWizard';
import { AdminStudentProfileDrawer } from './AdminStudentProfileDrawer';
import { ApprovedTopUpCard } from './ApprovedTopUpCard';
import { StudentDashboardSkeleton } from './ui/LoadingStates';
import { useStudentDashboardData } from '../hooks/useStudentDashboardData';
import { toast } from 'sonner';
import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';
import { recalculateUserBalance } from '../utils/balanceRecalculator';
import { DebitProtectionService } from '../services/debitProtectionService';
import { getCurrencySymbol } from '../utils/currencyResolver';

// --- Types ---

type AccountType = 'SAVINGS' | 'CURRENT' | 'DOMICILIARY';
type ConnectionMethod = 'MONO_OPEN_BANKING' | 'OKRA_AGGREGATOR' | 'MANUAL_DEPOSIT';
type AccountStatus = 'VERIFIED' | 'SYNCING' | 'NEEDS_REAUTH';
type UnlinkStatus = 'ACTIVE' | 'UNLINK_REQUESTED' | 'UNLINK_APPROVED' | 'UNLINK_REJECTED';

interface LinkedBankAccount {
  id: string;
  bankName: string;
  accountName?: string;
  accountNumber?: string;
  accountNumberMasked: string;
  accountType: AccountType;
  balanceNgn: number;
  balanceGbp: number;
  orgTopUpCapitalNgn: number;
  isCapitalBreached: boolean;
  isVerified: boolean;
  isDedicatedParallex?: boolean;
  lastTransactionAt?: string;
  connectionMethod: ConnectionMethod;
  lastSyncedAt: string;
  connectedAt: string;
  status: AccountStatus;
  unlinkStatus: UnlinkStatus;
  isSystemTopUp: boolean;
  unlinkReason?: string;
  verificationStatus?: string;
}

const NIGERIAN_BANKS = [
  "Access Bank", "Zenith Bank", "Guaranty Trust Bank (GTB)", "United Bank for Africa (UBA)",
  "First Bank of Nigeria", "Fidelity Bank", "First City Monument Bank (FCMB)", "Stanbic IBTC Bank",
  "Sterling Bank", "Wema Bank", "Union Bank", "Polaris Bank", "Keystone Bank", "Ecobank Nigeria",
  "Standard Chartered Bank", "Providus Bank", "Premium Trust Bank", "Signature Bank", "SunTrust Bank",
  "Titan Trust Bank", "Optimus Bank", "Parallex Bank", "Citibank Nigeria", "Globus Bank",
  "Moniepoint MFB", "Kuda MFB", "Opay (Blue Ridge MFB)", "PalmPay", "LAPO MFB", "FairMoney MFB"
];

export interface StudentDashboardViewProps {
  studentId: string;
  viewMode: 'STUDENT' | 'ADMIN';
  studentName?: string;
  onAdminAction?: (tab?: string) => void;
  onExit?: () => void;
}

export const StudentDashboardView: React.FC<StudentDashboardViewProps> = ({
  studentId,
  viewMode,
  studentName: propStudentName,
  onAdminAction,
  onExit
}) => {
  const { currentUser, appUser, role } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isAdmin = viewMode === 'ADMIN';

  // Shared Data Pipeline
  const {
    balance: liveBalance,
    accounts: liveAccounts,
    evaluation: liveEvaluation,
    userProfile,
    pendingTopUpRequest,
    loading: dataLoading
  } = useStudentDashboardData(studentId);

  // Derived student name & mandate status
  const effectiveStudentName =
    propStudentName ||
    userProfile?.displayName ||
    (viewMode === 'STUDENT' ? appUser?.displayName : 'Student') ||
    'Student';

  const effectiveMandateStatus =
    userProfile?.mandateStatus ||
    (viewMode === 'STUDENT' ? appUser?.mandateStatus : 'NOT_STARTED') ||
    'NOT_STARTED';

  // State
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const hasInitializedSelection = React.useRef(false);

  useEffect(() => {
    if (liveEvaluation) setEvaluation(liveEvaluation);
  }, [liveEvaluation]);

  useEffect(() => {
    if (liveAccounts.length > 0 && !hasInitializedSelection.current) {
      setSelectedAccountIds(liveAccounts.map(a => a.id));
      hasInitializedSelection.current = true;
    }
  }, [liveAccounts]);

  // Use liveAccounts as primary data source, splitting personal balance and top-up into two separate cards
  const accounts = useMemo(() => {
    const list: LinkedBankAccount[] = [];

    // Check if a dedicated top-up card already exists in liveAccounts
    const hasDedicatedTopUp = liveAccounts.some(
      a => a.id.startsWith('TOPUP_') || a.accountType === 'SPONSORED' || a.connectionMethod === 'TOP_UP'
    );

    // Also check if user profile has top-up data
    const profileApprovedTopUp = Number(userProfile?.raw?.approvedCapitalNgn || userProfile?.raw?.topUpAmountNgn || 0);
    const consolidatedNgn = Number(liveBalance.consolidatedBalanceNgn || userProfile?.raw?.consolidatedBalanceNgn || 0);

    for (const item of liveAccounts) {
      const isTopUpDoc = item.id.startsWith('TOPUP_') || item.accountType === 'SPONSORED' || item.connectionMethod === 'TOP_UP';
      const rawBalNgn = Number(item.accountBalanceNgn ?? item.balanceNgn ?? item.balanceNGN ?? 0);
      const topUpCapitalNgn = Number(item.orgTopUpCapitalNgn || 0);

      if (!hasDedicatedTopUp && topUpCapitalNgn > 0 && !isTopUpDoc) {
        // CASE 1: Top-up was merged into personal account -> Split into 2 cards!
        // Card 1: Actual Bank Account Balance
        const actualBal = Math.max(rawBalNgn - topUpCapitalNgn, 0);
        list.push({
          id: item.id,
          bankName: item.bankName || 'United Bank for Africa (UBA)',
          accountName: item.accountName || item.bankName || 'Primary Checking / Savings',
          accountNumberMasked: item.accountNumberMasked || item.accountMask || '•••• 9543',
          accountType: item.accountType || item.type || 'SAVINGS',
          balanceNgn: actualBal,
          balanceGbp: Math.round((actualBal / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: 0,
          isCapitalBreached: false,
          isVerified: item.isVerified ?? true,
          isDedicatedParallex: item.isDedicatedParallex || item.bankName?.includes('Parallex'),
          lastTransactionAt: item.lastTransactionAt || (item.lastSyncedAt?.seconds ? new Date(item.lastSyncedAt.seconds * 1000).toISOString() : null),
          isSystemTopUp: false,
          unlinkStatus: item.unlinkStatus || 'ACTIVE',
          connectionMethod: item.connectionMethod || item.provider || 'MANUAL_DEPOSIT',
          lastSyncedAt: item.lastSyncedAt?.seconds
            ? new Date(item.lastSyncedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          status: item.status || 'VERIFIED'
        });

        // Card 2: Top-Up Added
        list.push({
          id: `TOPUP_${item.id}`,
          bankName: 'Organization Top-Up Capital',
          accountName: 'Basechan Sponsored Capital',
          accountNumberMasked: '•••• TOPUP',
          accountType: 'SPONSORED' as any,
          balanceNgn: topUpCapitalNgn,
          balanceGbp: Math.round((topUpCapitalNgn / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: topUpCapitalNgn,
          isCapitalBreached: false,
          isVerified: true,
          isDedicatedParallex: false,
          lastTransactionAt: item.lastTransactionAt || new Date().toISOString(),
          isSystemTopUp: false,
          unlinkStatus: 'ACTIVE',
          connectionMethod: 'TOP_UP' as any,
          lastSyncedAt: 'Just now',
          status: 'VERIFIED',
          isSelectable: true
        });
      } else {
        // Normal personal card or dedicated top-up card
        const isThisTopUp = isTopUpDoc;
        const balGbp = item.balanceGbp || item.balanceGBP || Math.round((rawBalNgn / LIVE_FX_RATE) * 100) / 100;
        const status = item.status || 'VERIFIED';
        const isSelectable = isThisTopUp ? (status !== 'PENDING') : true;

        list.push({
          id: item.id,
          bankName: isThisTopUp ? (item.bankName || 'Organization Top-Up Capital') : (item.bankName || 'Unknown Bank'),
          accountName: item.accountName || item.bankName || (isThisTopUp ? 'Basechan Sponsored Capital' : 'Primary Account'),
          accountNumberMasked: item.accountNumberMasked || item.accountMask || (isThisTopUp ? '•••• TOPUP' : '•••• ****'),
          accountType: isThisTopUp ? 'SPONSORED' as any : (item.accountType || item.type || 'SAVINGS'),
          balanceNgn: rawBalNgn,
          balanceGbp: balGbp,
          orgTopUpCapitalNgn: isThisTopUp ? rawBalNgn : 0,
          isCapitalBreached: false,
          isVerified: item.isVerified ?? true,
          isDedicatedParallex: item.isDedicatedParallex || item.bankName?.includes('Parallex'),
          lastTransactionAt: item.lastTransactionAt || (item.lastSyncedAt?.seconds ? new Date(item.lastSyncedAt.seconds * 1000).toISOString() : null),
          isSystemTopUp: false,
          unlinkStatus: item.unlinkStatus || 'ACTIVE',
          connectionMethod: item.connectionMethod || item.provider || (isThisTopUp ? 'TOP_UP' as any : 'MANUAL_DEPOSIT'),
          lastSyncedAt: item.lastSyncedAt?.seconds
            ? new Date(item.lastSyncedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          status: status,
          isSelectable
        });
      }
    }

    // CASE 2: If no dedicated top-up card exists in list yet, but consolidated balance exceeds total personal balance (or approved top-up exists)
    const currentTopUpExists = list.some(a => a.accountType === 'SPONSORED' || a.id.startsWith('TOPUP_') || a.connectionMethod === 'TOP_UP');
    if (!currentTopUpExists) {
      const totalPersonalNgn = list.reduce((sum, a) => sum + (Number(a.balanceNgn) || 0), 0);

      let topUpAmount = 0;
      let topUpStatus: AccountStatus = 'VERIFIED';
      let isSelectable = true;

      if (pendingTopUpRequest) {
        topUpAmount = Number(pendingTopUpRequest.topUpAmountNgn);
        topUpStatus = 'PENDING';
        isSelectable = false;
      } else if (profileApprovedTopUp > 0) {
        topUpAmount = profileApprovedTopUp;
      } else if (consolidatedNgn > totalPersonalNgn) {
        topUpAmount = consolidatedNgn - totalPersonalNgn;
      }

      if (topUpAmount > 0) {
        list.push({
          id: `TOPUP_${studentId}`,
          bankName: 'Organization Top-Up Capital',
          accountName: 'Basechan Sponsored Capital',
          accountNumberMasked: '•••• TOPUP',
          accountType: 'SPONSORED' as any,
          balanceNgn: topUpAmount,
          balanceGbp: Math.round((topUpAmount / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: topUpAmount,
          isCapitalBreached: false,
          isVerified: topUpStatus === 'VERIFIED',
          isDedicatedParallex: false,
          lastTransactionAt: new Date().toISOString(),
          isSystemTopUp: false,
          unlinkStatus: 'ACTIVE',
          connectionMethod: 'TOP_UP' as any,
          lastSyncedAt: 'Just now',
          status: topUpStatus,
          isSelectable
        });
      }
    }

    return list;
  }, [liveAccounts, userProfile, liveBalance, studentId]);

  // High-level totals
  const totals = useMemo(() => {
    // 1. Calculate sum of selected accounts
    const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));
    const accountsNgn = selectedAccounts.reduce((sum, acc) => sum + (Number(acc.balanceNgn) || 0), 0);

    // 2. Logic: If user has explicitly selected accounts, use that sum.
    // If NO accounts are selected, show £0/₦0 (User choice to hide everything).
    // If NO accounts are LINKED yet, show the root document balance as a placeholder.
    let ngn = 0;
    if (selectedAccountIds.length > 0) {
      ngn = accountsNgn;
    } else if (accounts.length === 0) {
      ngn = liveBalance.consolidatedBalanceNgn || 0;
    }

    const gbp = ngn > 0 ? (ngn / LIVE_FX_RATE) : (accounts.length === 0 ? (liveBalance.gbpEquivalent || 0) : 0);
    return { ngn, gbp, accountsNgn, evaluationNgn: 0 };
  }, [accounts, selectedAccountIds, liveBalance]);

  const targetGBP = evaluation?.targetGBP || 0;
  const localCurrencyCode = evaluation?.localCurrency || 'NGN';
  const currency = (typeof MAJOR_CURRENCIES !== 'undefined' ? MAJOR_CURRENCIES.find(c => c.code === localCurrencyCode) : null) || { code: 'NGN', symbol: '₦' };

  const isTargetMet = targetGBP > 0 && totals.gbp >= targetGBP;
  const progressPercent = targetGBP > 0 ? Math.min(Math.round((totals.gbp / targetGBP) * 100), 100) : 0;

  const expiryInfo = useMemo(() => {
    if (!evaluation?.isTimerActive || !evaluation?.expirationDate) return { isExpired: false, isNearExpiry: false, daysLeft: 0 };
    const now = new Date();
    const expiry = new Date(evaluation.expirationDate);
    expiry.setHours(23, 59, 59, 999);
    const diffTime = expiry.getTime() - now.getTime();
    const daysLeft = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 0);
    return { isExpired: diffTime <= 0, isNearExpiry: daysLeft >= 0 && daysLeft <= 7, daysLeft };
  }, [evaluation]);

  // UI States & Modals
  const [activeMetricCard, setActiveMetricCard] = useState(0);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isExpiredModalOpen, setIsExpiredModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isUssdModalOpen, setIsUssdModalOpen] = useState(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [isDocumentWizardOpen, setIsDocumentWizardOpen] = useState(false);
  const [isAdminReviewDrawerOpen, setIsAdminReviewDrawerOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedUnlinkAccount, setSelectedUnlinkAccount] = useState<LinkedBankAccount | null>(null);
  const [unlinkReason, setUnlinkReason] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statementAccount, setStatementOpenAccount] = useState<LinkedBankAccount | null>(null);
  const [isSavingAndSyncing, setIsSavingAndSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [prepopulatedTopUpAmount, setPrepopulatedTopUpAmount] = useState<number | undefined>();

  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>('SAVINGS');
  const [realAmountInput, setRealAmountInput] = useState('');

  const filteredNigerianBanks = useMemo(() => {
    if (!bankSearchQuery) return [];
    return NIGERIAN_BANKS.filter(b => b.toLowerCase().includes(bankSearchQuery.toLowerCase()));
  }, [bankSearchQuery]);

  // Native SMS Bridge Callbacks
  useEffect(() => {
    (window as any).onSmsSyncFailed = async (mask: string, reason: string) => {
      console.warn(`SMS Sync Failed for mask: ${mask}. Reason: ${reason}`);
      const msg = reason === 'PERMISSION_DENIED'
        ? 'SMS access permission was denied.'
        : `No matching UBA alerts found for account ending in ${mask}.`;
      toast.error(msg);
      setSyncingId(null);
    };

    (window as any).onSmsBalanceUpdate = async (balance: number, mask: string, timestamp: number) => {
      console.log(`Native SMS Update: ₦${balance} for Acct ${mask}`);
      if (!currentUser?.uid) return;

      // 1. Authoritative Split Logic:
      // Raw Balance (e.g. ₦103k) = Personal Equity (₦3k) + Approved Top-Up (₦100k)
      const approvedCapital = Number(userProfile?.raw?.approvedCapitalNgn || userProfile?.raw?.topUpAmountNgn || 0);
      const personalBal = Math.max(0, balance - approvedCapital);
      const topUpBal = approvedCapital;

      const batch = writeBatch(db);

      // a. Update the specific personal account document
      const matchedAcc = liveAccounts.find(acc => acc.accountNumberMasked?.endsWith(mask));
      if (matchedAcc) {
        const accRef = doc(db, 'financial_accounts', matchedAcc.id);
        batch.set(accRef, {
          accountBalanceNgn: personalBal,
          balanceNgn: personalBal,
          balanceGbp: personalBal / LIVE_FX_RATE,
          lastSyncedAt: serverTimestamp(),
          status: 'VERIFIED',
          isVerified: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // b. Update Root User document for reactive total consolidation
      const userRef = doc(db, 'users', studentId || currentUser.uid);
      const totalEquity = personalBal + topUpBal;
      batch.set(userRef, {
        totalEquityNgn: totalEquity,
        consolidatedBalanceNgn: totalEquity,
        personalEquityNgn: personalBal,
        gbpEquivalent: totalEquity / LIVE_FX_RATE,
        isSyncing: false,
        lastSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();

      toast.success(`Balance Synced: ₦${personalBal.toLocaleString()} personal${topUpBal > 0 ? ` + ₦${topUpBal.toLocaleString()} top-up` : ''}`);
      setSyncingId(null);
    };

    return () => {
      (window as any).onSmsBalanceUpdate = null;
      (window as any).onSmsSyncFailed = null;
    };
  }, [currentUser, liveAccounts, userProfile, studentId]);

  // Debit Protection Monitor
  useEffect(() => {
    if (!studentId || accounts.length === 0) return;

    accounts.forEach(acc => {
      if (acc.id.startsWith('TOPUP_')) return;
      if (acc.connectionMethod === 'TOP_UP') return;

      DebitProtectionService.monitorAccount(studentId, acc.id, acc.balanceNgn, effectiveStudentName);
    });

    return () => DebitProtectionService.cleanup(studentId);
  }, [studentId, accounts, effectiveStudentName]);

  // Student drawer data for Admin review modal
  const studentDrawerPayload = useMemo(() => {
    return {
      id: studentId,
      userId: studentId,
      displayName: effectiveStudentName,
      userName: effectiveStudentName,
      email: userProfile?.email || evaluation?.userEmail || '',
      targetGBP: targetGBP,
      currentBalanceNgn: totals.ngn,
      mandateStatus: effectiveMandateStatus,
      consecutiveDays: evaluation?.consecutiveDays || 0,
      hasCustomRequirements: evaluation?.hasCustomRequirements || false,
      customDocumentRequirements: evaluation?.customDocumentRequirements || [],
      ...userProfile?.raw,
      ...evaluation,
    };
  }, [studentId, effectiveStudentName, userProfile, evaluation, targetGBP, totals.ngn, effectiveMandateStatus]);

  // Handlers
  const handleSyncAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    setSyncingId(id);

    if (acc.isSystemTopUp) {
      await new Promise(r => setTimeout(r, 1000));
      toast.success('System liquidity pulse verified.');
      setSyncingId(null);
      return;
    }

    if (acc.bankName.includes('UBA') || acc.bankName.includes('United Bank')) {
      if ((window as any).AndroidBridge) {
        console.log(`Triggering Native SMS Sync for mask: ${acc.accountNumberMasked.slice(-4)}, Bank: ${acc.bankName}`);
        (window as any).AndroidBridge.triggerSmsSync(acc.accountNumberMasked.slice(-4), acc.bankName);

        // Safety timeout to clear the sync state if no callback comes from native
        setTimeout(() => {
          setSyncingId(prev => {
            if (prev === id) {
              console.warn('Native SMS sync timed out.');
              toast.error('Sync timed out. No matching alerts found in SMS inbox.');
              return null;
            }
            return prev;
          });
        }, 15000);
        return;
      } else {
        toast.error("SMS Sync is only available in the Basechan Funder Android App.");
        setSyncingId(null);
        return;
      }
    }

    try {
      await new Promise(r => setTimeout(r, 1200));
      await updateDoc(doc(db, 'financial_accounts', id), {
        lastSyncedAt: serverTimestamp(),
        status: 'VERIFIED'
      });
      toast.success(`${acc.bankName} balance synchronized.`);
    } catch (err: any) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncingId(null);
    }
  };

  // Admin bulk re-sync
  const handleAdminBulkResync = async () => {
    setIsBulkSyncing(true);
    try {
      for (const acc of accounts) {
        await updateDoc(doc(db, 'financial_accounts', acc.id), {
          lastSyncedAt: serverTimestamp(),
          status: 'VERIFIED'
        });
      }
      toast.success('All linked bank accounts re-synced successfully.');
    } catch (err: any) {
      toast.error('Failed to re-sync bank ledger: ' + err.message);
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const handleAdminUnlink = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    if (window.confirm('Accept and unlink this account immediately? This will recalculate the total balance.')) {
      try {
        await deleteDoc(doc(db, 'financial_accounts', accountId));

        await addDoc(collection(db, 'notifications'), {
          userId: studentId,
          studentName: effectiveStudentName,
          title: 'Account Force-Unlinked',
          body: `Bank account (${acc.bankName}) was removed by an Administrator.`,
          type: 'ALERT',
          createdAt: serverTimestamp(),
          isRead: false
        });

        // Trigger balance recalculation after deletion
        await recalculateUserBalance(studentId);

        toast.success('Account unlinked and total balance updated.');
      } catch (err: any) {
        toast.error('Failed to unlink: ' + err.message);
      }
    }
  };

  const handleClearAccountBalance = async (accountId: string) => {
    if (!window.confirm('Reset this account balance to zero? This will update the total consolidated balance.')) return;

    setSyncingId(accountId);
    try {
      await updateDoc(doc(db, 'financial_accounts', accountId), {
        balanceNgn: 0,
        balanceGbp: 0,
        accountBalanceNgn: 0,
        lastSyncedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Trigger balance recalculation
      await recalculateUserBalance(studentId);

      toast.success('Account balance cleared.');
    } catch (err: any) {
      toast.error('Clear failed: ' + err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleRequestUnlink = async () => {
    if (!selectedUnlinkAccount || !unlinkReason.trim()) return;
    await updateDoc(doc(db, 'financial_accounts', selectedUnlinkAccount.id), {
      unlinkStatus: 'UNLINK_REQUESTED',
      unlinkReason: unlinkReason.trim(),
      updatedAt: serverTimestamp()
    });
    setIsUnlinkModalOpen(false);
    setSelectedUnlinkAccount(null);
    setUnlinkReason('');
    toast.success('Unlink request submitted.');
  };

  const handleConnectBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !selectedBank || !accountNumberInput) return;
    setIsSavingAndSyncing(true);
    try {
      const balance = parseFloat(realAmountInput) || 0;
      const mask = `•••• ${accountNumberInput.slice(-4)}`;
      await addDoc(collection(db, 'financial_accounts'), {
        userId: studentId,
        userEmail: isAdmin ? evaluation?.userEmail || '' : currentUser?.email,
        bankName: selectedBank,
        accountName: effectiveStudentName,
        accountNumberMasked: mask,
        accountType: selectedAccountType,
        balanceNgn: Math.round(balance),
        balanceGbp: Math.round((balance / LIVE_FX_RATE) * 100) / 100,
        connectionMethod: 'MANUAL_DEPOSIT',
        status: 'VERIFIED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'notifications'), {
        userId: studentId,
        studentName: effectiveStudentName,
        title: 'New Bank Source Linked',
        body: `${isAdmin ? 'Admin' : 'Student'} linked a new ${selectedBank} account (${mask}).`,
        type: 'INFO',
        createdAt: serverTimestamp(),
        isRead: false
      });

      setIsConnectModalOpen(false);
      setSelectedBank('');
      setBankSearchQuery('');
      setAccountNumberInput('');
      setRealAmountInput('');
      toast.success('Bank account connected successfully.');
    } catch (err: any) {
      toast.error('Error adding account: ' + err.message);
    } finally {
      setIsSavingAndSyncing(false);
    }
  };

  const handleCancelConnect = () => {
    setIsConnectModalOpen(false);
    setSelectedBank('');
    setBankSearchQuery('');
    setAccountNumberInput('');
    setRealAmountInput('');
    setSyncError(null);
  };

  const handleAdditionalTopUp = () => {
    const deficitGbp = targetGBP - totals.gbp;
    if (deficitGbp > 0) setPrepopulatedTopUpAmount(Math.round(deficitGbp * LIVE_FX_RATE));
    if (isAdmin && onAdminAction) {
      onAdminAction('pricing');
    } else {
      setIsTopUpModalOpen(true);
    }
  };

  if (dataLoading && accounts.length === 0) {
    return <StudentDashboardSkeleton />;
  }

  return (
    <div className={`w-full min-h-screen space-y-8 font-sans transition-colors duration-500 relative ${
      isDark ? 'text-white' : 'text-slate-900'
    } ${
      expiryInfo.isExpired ? 'grayscale opacity-40 pointer-events-none' : ''
    }`}>

      {/* Expiry Warning Banner */}
      {expiryInfo.isNearExpiry && !expiryInfo.isExpired && (
        <div className={`p-6 rounded-[2rem] border animate-in slide-in-from-top-4 duration-700 flex flex-col md:flex-row items-center justify-between gap-6 ${
          isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h4 className={`text-sm font-black uppercase tracking-tight ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
                POF EVALUATION EXPIRES SOON
              </h4>
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                Evaluation period ends in <span className="text-amber-500 font-black">{expiryInfo.daysLeft} days</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => isAdmin ? onAdminAction?.('days') : setIsTopUpModalOpen(true)}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all"
          >
            {isAdmin ? 'Adjust Window' : 'Request Extension'}
          </button>
        </div>
      )}

      {/* Hero Metric Card Section */}
      <section className="relative group">
        <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] min-h-[280px] md:min-h-[340px] flex items-stretch">

          {/* CARD 1: Total Liquid Converted Balance */}
          <div className={`w-full flex-shrink-0 transition-all duration-700 transform ${activeMetricCard === 0 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
            <div className={`h-full glass-card p-6 md:p-12 relative flex flex-col justify-between overflow-hidden shadow-2xl transition-all duration-500 ${
              isDark
                ? '!bg-slate-900/90 !border-white/10 text-white'
                : '!bg-white/85 !border-slate-200/80 text-slate-900 shadow-slate-200/60'
            }`}>
              <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] md:text-xs font-black uppercase tracking-[0.25em] mb-2 opacity-90 truncate ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                      {effectiveStudentName}
                    </p>
                    <h2 className={`text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-none break-all ${isDark ? 'text-white text-depth-header' : 'text-main'}`}>
                      {getCurrencySymbol(appUser?.targetCountry)}{totals.gbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                    <div className={`flex justify-between text-[8px] md:text-[10px] font-mono mt-4 border-t pt-2 uppercase tracking-tight ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-muted'}`}>
                       <span>CURRENT: {getCurrencySymbol(appUser?.targetCountry)}{Math.round(totals.gbp).toLocaleString()}</span>
                       <span>TARGET: {targetGBP > 0 ? `${getCurrencySymbol(appUser?.targetCountry)}${targetGBP.toLocaleString()}` : `${getCurrencySymbol(appUser?.targetCountry)}0 (NOT SET)`}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 md:gap-3">
                       <p className={`text-lg md:text-xl font-bold uppercase tracking-tight ${isDark ? 'text-slate-400 text-depth-header' : 'text-muted'}`}>
                         {currency.symbol}{totals.ngn.toLocaleString()}
                       </p>
                       <span className={`px-2 py-0.5 rounded text-[8px] md:text-[10px] font-black uppercase tracking-widest border ${
                         isDark ? 'bg-white/5 text-slate-400 border-white/5' : 'bg-slate-100 text-muted border-slate-200'
                       }`}>
                         {currency.code}
                       </span>
                    </div>
                  </div>
                </div>

                <div className={`flex flex-wrap items-center justify-between gap-4 pt-4 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-6">
                    <div className={`flex items-center space-x-2 text-[9px] md:text-[11px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-muted'}`}>
                      <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                      <span>LINKED: <span className={`ml-1 ${isDark ? 'text-white' : 'text-main font-extrabold'}`}>{selectedAccountIds.length} / {accounts.length}</span></span>
                    </div>
                    <div className={`hidden sm:block w-px h-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                    <div className={`flex items-center space-x-2 text-[9px] md:text-[11px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-muted'}`}>
                      <Building2 className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <span className="truncate max-w-[140px] sm:max-w-none">Bank: <span className={`ml-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600 font-extrabold'}`}>
                        {selectedAccountIds.length === 0
                          ? 'NONE'
                          : selectedAccountIds.length === 1
                            ? accounts.find(a => a.id === selectedAccountIds[0])?.bankName
                            : `MULTI (+${selectedAccountIds.length - 1})`}
                      </span></span>
                    </div>
                  </div>

                  {/* Primary Top-Up CTA: Dynamic copy */}
                  <button
                    onClick={() => {
                      if (isAdmin) {
                        onAdminAction ? onAdminAction('pricing') : toast.info('Admin override ready');
                      } else {
                        setIsTopUpModalOpen(true);
                      }
                    }}
                    disabled={!isAdmin && (!!pendingTopUpRequest || appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')}
                    className={`flex items-center gap-2 text-[9px] md:text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer px-4 py-2 rounded-xl border ${
                      !isAdmin && (pendingTopUpRequest || appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')
                        ? (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 opacity-80 cursor-not-allowed' : 'bg-amber-50 border-amber-200 text-amber-600 cursor-not-allowed')
                        : isDark
                          ? 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'
                          : 'text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border-blue-200'
                    }`}
                  >
                    {isAdmin ? <Settings className="w-3.5 h-3.5" /> : ((pendingTopUpRequest || appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING') ? <Clock className="w-3.5 h-3.5" /> : null)}
                    <span>
                      {isAdmin
                        ? 'CONFIGURE CAPITAL / TOP-UP'
                        : ((pendingTopUpRequest || appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING') ? 'TOP-UP REQUEST PENDING' : 'REQUEST TOP UP')}
                    </span>
                    {!(pendingTopUpRequest || appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING') && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: Statutory Holding & Expiration Timer */}
          <div className={`w-full flex-shrink-0 transition-all duration-700 transform ${activeMetricCard === 1 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
            <div className={`h-full glass-card p-6 md:p-12 relative flex flex-col justify-between overflow-hidden shadow-2xl transition-all duration-500 ${
              isDark
                ? '!bg-slate-900/90 !border-white/10 text-white'
                : '!bg-white/85 !border-slate-200/80 text-slate-900 shadow-slate-200/60'
            }`}>
              <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-4">
                      <p className={`text-xs font-black uppercase tracking-[0.25em] opacity-90 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>Proof of Funds Timeline</p>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider ${
                        targetGBP > 0
                          ? isTargetMet
                            ? (isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                            : (isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
                          : (isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200')
                      }`}>
                        {targetGBP > 0 ? (isTargetMet ? 'Target Met' : `${progressPercent}% Of Target`) : 'No Target Set'}
                      </span>
                    </div>

                    <div className="flex items-baseline space-x-3">
                      {evaluation?.startDate ? (
                        expiryInfo.isExpired ? (
                          <h3 className="text-3xl md:text-5xl font-black tracking-tight text-rose-500 uppercase">Window Expired</h3>
                        ) : (
                          <>
                            <h3 className={`text-5xl md:text-7xl font-black tracking-tight ${isDark ? 'text-white' : 'text-main'}`}>{expiryInfo.daysLeft}</h3>
                            <span className={`text-2xl font-bold uppercase ${isDark ? 'text-slate-400' : 'text-muted'}`}>Days</span>
                            <span className={`text-xs font-black uppercase tracking-widest ml-4 ${isDark ? 'text-slate-500' : 'text-subtle'}`}>REMAINING</span>
                          </>
                        )
                      ) : (
                        <div className="flex items-baseline space-x-3 opacity-60">
                          <h3 className={`text-3xl md:text-5xl font-black tracking-tight uppercase ${isDark ? 'text-slate-500' : 'text-subtle'}`}>NO WINDOW SET</h3>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-6">
                      <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            targetGBP > 0
                              ? isTargetMet ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-blue-600'
                              : (isDark ? 'bg-slate-700' : 'bg-slate-300')
                          }`}
                          style={{ width: targetGBP > 0 ? `${progressPercent}%` : '0%' }}
                        />
                      </div>
                      <div className={`flex justify-between text-xs font-mono mt-3 uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-muted'}`}>
                        <span>Current: {getCurrencySymbol(appUser?.targetCountry)}{Math.round(totals.gbp).toLocaleString()}</span>
                        <span>Target: {targetGBP > 0 ? `${getCurrencySymbol(appUser?.targetCountry)}${targetGBP.toLocaleString()}` : `${getCurrencySymbol(appUser?.targetCountry)}0 (Not Set)`}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`pt-4 border-t flex flex-wrap items-center justify-between gap-4 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                   <p className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-muted'}`}>
                      {evaluation?.startDate ? (
                        <>
                          STATUTORY COMPLIANCE WINDOW: <span className={`ml-2 ${isDark ? 'text-white' : 'text-main font-extrabold'}`}>{new Date(evaluation.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span> - <span className={isDark ? 'text-white' : 'text-main font-extrabold'}>{new Date(evaluation.expirationDate || new Date(new Date(evaluation.startDate).getTime() + 28 * 24 * 60 * 60 * 1000)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </>
                      ) : (
                        <span className="text-rose-500 animate-pulse">Waiting for Admin to initialize evaluation window</span>
                      )}
                   </p>
                   {isAdmin && (
                     <button
                       onClick={() => onAdminAction?.('days')}
                       className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer px-3 py-1.5 rounded-xl border ${
                         isDark
                           ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20'
                           : 'text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
                       }`}
                     >
                       <Settings className="w-3.5 h-3.5" />
                       <span>SETUP EVALUATION</span>
                     </button>
                   )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card Navigation Controls */}
        <div className="flex justify-center items-center mt-6 gap-8">
          <button
            onClick={() => setActiveMetricCard(0)}
            className={`p-2 rounded-full border transition-all hover:scale-110 active:scale-95 ${
              activeMetricCard === 0
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                : isDark
                  ? 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-900'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-3">
            {[0, 1].map(i => (
              <div key={i} className={`h-2 rounded-full transition-all duration-500 ${
                activeMetricCard === i
                  ? 'bg-blue-500 w-8'
                  : isDark ? 'bg-slate-800 w-2' : 'bg-slate-300 w-2'
              }`} />
            ))}
          </div>

          <button
            onClick={() => setActiveMetricCard(1)}
            className={`p-2 rounded-full border transition-all hover:scale-110 active:scale-95 ${
              activeMetricCard === 1
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                : isDark
                  ? 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-900'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Compliance Section: Dynamic copy & role-gated modals */}
      <section className="space-y-4">
        <div className="px-1">
          <h3 className={`text-lg md:text-xl uppercase font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-main'}`}>
            {isAdmin ? 'COMPLIANCE DOCUMENTS & VERIFICATION' : 'VERIFICATION & UPGRADES'}
          </h3>
          <p className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-slate-400' : 'text-muted'}`}>
            {isAdmin ? 'Review student identity uploads & mandate package' : 'Verify your documents to unlock full features'}
          </p>
        </div>

        <div className={`p-6 md:p-8 rounded-[2rem] border backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-6 transition-all shadow-sm ${
          isDark
            ? 'bg-zinc-900/80 border-zinc-800 shadow-none'
            : 'bg-white/85 border-slate-200 shadow-slate-200/50'
        }`}>
           <div className="flex items-start gap-4 md:gap-6 w-full sm:w-auto">
              <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 ${
                effectiveMandateStatus === 'MANDATE_APPROVED'
                  ? isDark ? 'bg-emerald-900/30 text-emerald-400 border-zinc-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isDark ? 'bg-zinc-950/60 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                 {effectiveMandateStatus === 'MANDATE_APPROVED' ? (
                   <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />
                 ) : (
                   <ShieldCheck className="w-6 h-6 md:w-8 md:h-8" />
                 )}
              </div>
              <div className="min-w-0">
                 <h4 className={`text-base md:text-lg font-black uppercase tracking-tight leading-tight ${isDark ? 'text-white' : 'text-main'}`}>
                   {effectiveMandateStatus === 'MANDATE_APPROVED'
                     ? 'Compliance Verification Cleared'
                     : effectiveMandateStatus === 'MANDATE_SUBMITTED_AWAITING_APPROVAL'
                       ? 'Package Awaiting Verification'
                       : 'Upgrade Account'}
                 </h4>
                 <p className={`text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1.5 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-muted'}`}>
                   {effectiveMandateStatus === 'MANDATE_APPROVED'
                     ? 'Regulatory account mandate has been fully verified and approved.'
                     : effectiveMandateStatus === 'MANDATE_SUBMITTED_AWAITING_APPROVAL'
                       ? 'Document package has been received and is under professional review.'
                       : 'Submit your international passport and supporting financial documents for review.'}
                 </p>
              </div>
           </div>

           {/* Role-gated action button */}
           <button
             onClick={() => {
               if (isAdmin) {
                 setIsAdminReviewDrawerOpen(true);
               } else {
                 setIsDocumentWizardOpen(true);
               }
             }}
             className={`w-full sm:w-auto px-6 md:px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
               effectiveMandateStatus === 'MANDATE_APPROVED'
                 ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                 : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
             }`}
           >
             {isAdmin ? (
               <>
                 <Search className="w-3.5 h-3.5" />
                 <span>INSPECT & VERIFY SUBMISSIONS</span>
               </>
             ) : (
               <span>MANAGE SUBMISSIONS</span>
             )}
           </button>
        </div>
      </section>

      {/* Bank Accounts Ledger: Dynamic Micro-Copy */}
      <section className="space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 px-1">
          <div className="min-w-0">
            <h3 className={`text-lg md:text-xl uppercase font-extrabold tracking-tight leading-tight ${isDark ? 'text-white' : 'text-main'}`}>
              {isAdmin ? 'LINKED BANK ACCOUNTS (AUDIT TRAIL)' : 'LINKED BANK ACCOUNTS'}
            </h3>
            <p className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest mt-1 ${isDark ? 'text-slate-400' : 'text-muted'}`}>
              Select accounts to include in total asset calculation
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
             <button
               onClick={() => setSelectedAccountIds(accounts.map(a => a.id))}
               aria-label="Select all bank accounts"
               className={`flex-1 lg:flex-none flex items-center justify-center space-x-2 text-[9px] font-black uppercase tracking-widest transition-all px-3 py-2 rounded-xl border ${
                 isDark
                   ? 'border-white/10 hover:bg-white/5 text-slate-400 hover:text-white'
                   : 'border-slate-200 hover:bg-slate-100 text-muted hover:text-main'
               }`}
             >
               <CheckSquare className="w-3.5 h-3.5" />
               <span>Select All</span>
             </button>
             <button
               onClick={() => setSelectedAccountIds([])}
               aria-label="Clear selected bank accounts"
               className={`flex-1 lg:flex-none flex items-center justify-center space-x-2 text-[9px] font-black uppercase tracking-widest transition-all px-3 py-2 rounded-xl border ${
                 isDark
                   ? 'border-white/10 hover:bg-white/5 text-slate-400 hover:text-white'
                   : 'border-slate-200 hover:bg-slate-100 text-muted hover:text-main'
               }`}
             >
               <Square className="w-3.5 h-3.5" />
               <span>Clear</span>
             </button>

             {/* Dynamic Action Trigger */}
             {isAdmin ? (
               <button
                 onClick={handleAdminBulkResync}
                 disabled={isBulkSyncing}
                 className="w-full lg:w-auto flex items-center justify-center space-x-2 text-[9px] font-black uppercase tracking-widest transition-all px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 active:scale-95 disabled:opacity-50"
               >
                 <RefreshCw className={`w-3.5 h-3.5 ${isBulkSyncing ? 'animate-spin' : ''}`} />
                 <span>RE-SYNC BANK LEDGER</span>
               </button>
             ) : (
               <button
                 onClick={() => setIsConnectModalOpen(true)}
                 aria-label="Link new bank account source"
                 className="w-full lg:w-auto flex items-center justify-center space-x-2 text-[9px] font-black uppercase tracking-widest transition-all px-5 py-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 active:scale-95"
               >
                 <Plus className="w-3.5 h-3.5" />
                 <span>CONNECT BANK</span>
               </button>
             )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Linked Bank & Top-Up Accounts Grid (2 Distinct Cards Side-by-Side) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {accounts.map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id);
              const isTopUp = acc.accountType === 'SPONSORED' || acc.id.startsWith('TOPUP_') || acc.connectionMethod === 'TOP_UP';

              return (
                <div
                  key={acc.id}
                  onClick={() => {
                    setSelectedAccountIds(prev =>
                      prev.includes(acc.id) ? prev.filter(id => id !== acc.id) : [...prev, acc.id]
                    );
                  }}
                  className={`glass-subcard p-6 md:p-8 flex flex-col justify-between transition-all group shadow-sm hover:-translate-y-1 cursor-pointer relative ${
                    isDark
                      ? isTopUp
                        ? isSelected
                          ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'bg-slate-900/70 border-amber-500/30 hover:border-amber-500/50'
                        : isSelected
                          ? 'border-blue-600/60 bg-blue-600/10 shadow-lg shadow-blue-500/10'
                          : 'bg-zinc-900/90 border-zinc-800 shadow-none'
                      : isTopUp
                        ? isSelected
                          ? 'border-amber-500 bg-amber-50/90 shadow-lg shadow-amber-500/20'
                          : 'bg-white/90 border-amber-300 shadow-md shadow-amber-100/50 hover:border-amber-400'
                        : isSelected
                          ? 'border-blue-600 bg-blue-50/70 shadow-lg shadow-blue-500/10'
                          : 'bg-white/85 border-slate-200 shadow-md shadow-slate-200/50'
                  } ${acc.status === 'PENDING' ? 'opacity-60 grayscale' : ''}`}
                >
                  {/* Checkbox Overlay */}
                  {acc.isSelectable && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds(prev =>
                          prev.includes(acc.id) ? prev.filter(id => id !== acc.id) : [...prev, acc.id]
                        );
                      }}
                      className={`absolute top-4 right-4 w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all z-20 cursor-pointer ${
                        isSelected
                          ? isTopUp
                            ? 'bg-amber-500 border-amber-500 scale-110 shadow-lg shadow-amber-500/20'
                            : 'bg-blue-600 border-blue-600 scale-110 shadow-lg shadow-blue-500/10'
                          : isDark ? 'border-slate-600 bg-slate-900/50' : 'border-slate-300 bg-white/50'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className={`w-8 h-8 ${isTopUp ? 'text-slate-950' : 'text-white'}`} />}
                    </div>
                  )}

                  <div>
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
                          isTopUp
                            ? isDark
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                              : 'bg-amber-100 border-amber-200 text-amber-700 shadow-sm'
                            : isDark
                              ? 'bg-slate-800 border-white/5 text-slate-400'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          {isTopUp ? <Zap className="w-6 h-6 fill-amber-400/20" /> : <Building2 className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={`text-base font-black tracking-tight uppercase ${isDark ? 'text-white' : 'text-main'}`}>
                              {acc.accountName || acc.bankName}
                            </h4>
                            {isTopUp && (
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                                isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}>
                                <Zap className="w-2.5 h-2.5" /> Top-Up Added
                              </span>
                            )}
                            {acc.id === 'parallex_dedicated' && (
                              <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter">(Mandate)</span>
                            )}
                            {acc.isDedicatedParallex && (
                              <span className={`px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-tighter flex items-center gap-0.5 ${
                                isDark ? 'bg-amber-900/30 text-amber-400 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                <Building2 className="w-2.5 h-2.5" />
                                Dedicated POF Account
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${
                              isTopUp
                                ? (isDark ? 'text-amber-400/90' : 'text-amber-800')
                                : (isDark ? 'text-slate-400' : 'text-slate-600')
                            }`}>
                              {acc.accountNumberMasked} • {isTopUp ? 'SPONSORED FACILITY' : acc.accountType}
                            </p>
                            <span className={`px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-tighter flex items-center gap-0.5 border ${
                              isDark ? 'bg-sky-950/60 text-sky-300 border-sky-800' : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}>
                              <Lock className="w-2 h-2" />
                              Read-Only
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right pr-8">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${
                          isTopUp
                            ? acc.status === 'PENDING'
                              ? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                              : (isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300')
                            : acc.verificationStatus === 'MANDATE_PENDING_REVIEW'
                              ? (isDark ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200')
                              : acc.status === 'VERIFIED'
                                ? (isDark ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                                : (isDark ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200')
                        }`}>
                          {isTopUp ? (acc.status === 'PENDING' ? 'Pending Verification' : 'Facility Active') : (acc.verificationStatus === 'MANDATE_PENDING_REVIEW' ? 'Mandate Pending' : acc.status)}
                        </span>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mt-1.5">Last Sync: {acc.lastSyncedAt}</p>
                      </div>
                    </div>

                    <div className={`grid grid-cols-2 gap-4 pb-6 border-b border-slate-200 dark:border-zinc-800`}>
                      {isTopUp ? (
                        <div className={`col-span-2 mb-4 p-3.5 rounded-2xl border ${
                          isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/70 border-amber-200'
                        } ${acc.status === 'PENDING' ? 'border-dashed' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {acc.status === 'PENDING' ? <Clock className="w-4 h-4 text-slate-500" /> : <ShieldCheck className="w-4 h-4 text-amber-400" />}
                              <span className={`text-[10px] font-black uppercase tracking-wider ${acc.status === 'PENDING' ? 'text-slate-500' : (isDark ? 'text-amber-300' : 'text-amber-900')}`}>
                                {acc.status === 'PENDING' ? 'Top-Up Request Under Review' : 'Institutional Proof-of-Funds Facility'}
                              </span>
                            </div>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                              acc.status === 'PENDING'
                                ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                : (isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-200 text-amber-900')
                            }`}>
                              {acc.status === 'PENDING' ? 'PENDING' : 'Verified Disbursed'}
                            </span>
                          </div>
                          <p className={`text-[9px] mt-1.5 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {acc.status === 'PENDING'
                              ? 'Your sponsorship claim has been submitted and is currently being audited by the governance desk.'
                              : 'Approved capital disbursed and active in ledger to cover UK/International visa proof-of-funds requirement.'}
                          </p>
                        </div>
                      ) : (
                        <div className={`col-span-2 mb-4 p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                MY PERSONAL ACCOUNT
                              </span>
                            </div>
                            <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${
                              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                            }`}>
                              Active Feed
                            </span>
                          </div>
                          <p className={`text-[9px] mt-1.5 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Personal equity verified via automated bank alerts and statement reconciliation.
                          </p>
                        </div>
                      )}

                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                          isTopUp ? (isDark ? 'text-amber-400/90' : 'text-amber-800') : (isDark ? 'text-slate-400' : 'text-muted')
                        }`}>
                          {isTopUp ? 'Top-Up Added' : 'Actual Account Balance'}
                        </p>
                        <p className={`text-xl font-black font-mono ${
                          isTopUp ? 'text-amber-400' : (isDark ? 'text-white' : 'text-main')
                        }`}>
                          {currency.symbol}{acc.balanceNgn.toLocaleString()}
                        </p>
                      </div>
                      <div className={`border-l pl-4 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                          isTopUp ? (isDark ? 'text-amber-400/90' : 'text-amber-800') : (isDark ? 'text-slate-400' : 'text-muted')
                        }`}>
                          GBP Value
                        </p>
                        <p className={`text-xl font-black ${
                          isTopUp ? 'text-amber-400' : (isDark ? 'text-blue-400' : 'text-accent-blue')
                        }`}>
                          {getCurrencySymbol(appUser?.targetCountry)}{acc.balanceGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSyncAccount(acc.id); }}
                          disabled={syncingId === acc.id}
                          title={isTopUp ? 'Sync Facility' : 'Sync Balance'}
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all disabled:opacity-50 ${
                            isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-amber-400' : 'bg-slate-100 border-slate-200 text-muted hover:text-amber-600'
                          }`}
                        >
                          <RefreshCw className={`w-4 h-4 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                        </button>

                        {!isTopUp && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClearAccountBalance(acc.id); }}
                              title="Clear Balance"
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                                isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-rose-400' : 'bg-slate-100 border-slate-200 text-muted hover:text-rose-600'
                              }`}
                            >
                              <XIcon className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => { e.stopPropagation(); setIsUssdModalOpen(true); }}
                              title="USSD Codes"
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                                isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-blue-400' : 'bg-slate-100 border-slate-200 text-muted hover:text-blue-600'
                              }`}
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatementOpenAccount(acc);
                            setIsStatementOpen(true);
                          }}
                          title="View Statement"
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                            isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-cyan-400' : 'bg-slate-100 border-slate-200 text-muted hover:text-cyan-600'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                      {!acc.isVerified && (
                        <span className="text-[10px] text-zinc-500 font-medium block mt-2">Account not verified</span>
                      )}
                    </div>

                    {isTopUp ? (
                      isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAdminUnlink(acc.id); }}
                          title="Revoke Top-Up"
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                            isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-rose-500' : 'bg-slate-100 border-slate-200 text-muted hover:text-rose-600'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isAdmin) {
                            handleAdminUnlink(acc.id);
                          } else {
                            if (acc.unlinkStatus === 'UNLINK_REQUESTED') return;
                            setSelectedUnlinkAccount(acc);
                            setIsUnlinkModalOpen(true);
                          }
                        }}
                        disabled={!isAdmin && acc.unlinkStatus === 'UNLINK_REQUESTED'}
                        title={isAdmin && acc.unlinkStatus === 'UNLINK_REQUESTED'
                          ? 'Approve Unlink'
                          : acc.unlinkStatus === 'UNLINK_REQUESTED'
                            ? 'Unlink Pending'
                            : isAdmin
                              ? 'Force Unlink'
                              : 'Request Unlink'}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                          !isAdmin && acc.unlinkStatus === 'UNLINK_REQUESTED'
                            ? 'text-slate-400 cursor-not-allowed opacity-50'
                            : isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-rose-500' : 'bg-slate-100 border-slate-200 text-muted hover:text-rose-600'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Connect Modal */}
      {isConnectModalOpen && (
        <div className={`fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300 ${
          isDark ? 'bg-slate-950/80' : 'bg-slate-900/50'
        }`} onClick={handleCancelConnect}>
          <div className={`w-full max-w-lg glass-card overflow-hidden shadow-2xl ${
            isDark ? '!bg-slate-900 !border-white/10 text-white' : '!bg-white !border-slate-200 text-slate-900'
          }`} onClick={e => e.stopPropagation()}>
            <div className={`p-8 border-b flex justify-between items-center ${
              isDark ? 'border-white/5 bg-slate-950/20' : 'border-slate-100 bg-slate-50'
            }`}>
              <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Connect your bank account</h3>
              <button onClick={handleCancelConnect} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                <XIcon className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <form onSubmit={handleConnectBank} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2 relative">
                    <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Select Bank</label>
                    <div className="relative">
                      <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        required
                        placeholder="Type to search bank..."
                        value={bankSearchQuery || selectedBank}
                        onFocus={() => setIsBankDropdownOpen(true)}
                        onChange={(e) => {
                          setBankSearchQuery(e.target.value);
                          setSelectedBank('');
                          setIsBankDropdownOpen(true);
                        }}
                        className={`w-full border rounded-2xl pl-12 pr-4 py-4 text-xs font-bold focus:border-blue-500 focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                      {isBankDropdownOpen && bankSearchQuery && filteredNigerianBanks.length > 0 && (
                        <div className={`absolute z-[100] w-full mt-2 max-h-60 overflow-y-auto border rounded-2xl shadow-2xl no-scrollbar ${
                          isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'
                        }`}>
                          {filteredNigerianBanks.map(bank => (
                            <button
                              key={bank}
                              type="button"
                              onClick={() => {
                                setSelectedBank(bank);
                                setBankSearchQuery(bank);
                                setIsBankDropdownOpen(false);
                              }}
                              className={`w-full text-left px-6 py-4 text-xs font-black uppercase transition-all ${
                                selectedBank === bank
                                  ? 'bg-blue-600 text-white'
                                  : isDark
                                    ? 'text-slate-300 hover:bg-blue-600 hover:text-white'
                                    : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {bank}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Account Number</label>
                      <input
                        required
                        maxLength={10}
                        placeholder="10-digit Number"
                        value={accountNumberInput}
                        onChange={e => setAccountNumberInput(e.target.value.replace(/\D/g, ''))}
                        className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:border-blue-500 focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Account Type</label>
                      <select
                        value={selectedAccountType}
                        onChange={e => setSelectedAccountType(e.target.value as AccountType)}
                        className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:border-indigo-600 focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        <option value="SAVINGS">SAVINGS</option>
                        <option value="CURRENT">CURRENT</option>
                        <option value="DOMICILIARY">DOMICILIARY</option>
                      </select>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="space-y-2">
                      <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Initial Balance (₦)</label>
                      <input
                        type="number"
                        placeholder="Initial Balance (₦)"
                        value={realAmountInput}
                        onChange={e => setRealAmountInput(e.target.value)}
                        className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:border-indigo-600 focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedBank || accountNumberInput.length < 10 || (isAdmin && !realAmountInput) || isSavingAndSyncing}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingAndSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Save & Sync Ledger</span>
                        <RefreshCw className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Student Modals */}
      {!isAdmin && (
        <TopUpRequestModal
          isOpen={isTopUpModalOpen}
          onClose={() => setIsTopUpModalOpen(false)}
          onSuccess={() => {}}
          initialAmount={prepopulatedTopUpAmount}
        />
      )}

      <UssdFallbackModal
        isOpen={isUssdModalOpen}
        onClose={() => setIsUssdModalOpen(false)}
        onSuccess={() => {}}
        linkedBanks={accounts.map(a => a.bankName)}
      />

      <StudentDocumentUploadWizard
        isOpen={isDocumentWizardOpen}
        onClose={() => setIsDocumentWizardOpen(false)}
      />

      {/* Admin Review Drawer Modal with APPROVE / REJECT WITH NOTES */}
      <AdminStudentProfileDrawer
        isOpen={isAdminReviewDrawerOpen}
        onClose={() => setIsAdminReviewDrawerOpen(false)}
        student={studentDrawerPayload}
        initialTab="documents"
      />

      <BankStatementView
        isOpen={isStatementOpen}
        onClose={() => {
          setIsStatementOpen(false);
          setStatementOpenAccount(null);
        }}
        account={statementAccount}
      />

      {/* Unlink Request Modal */}
      {isUnlinkModalOpen && (
        <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300 ${
          isDark ? 'bg-slate-950/80' : 'bg-slate-900/50'
        }`}>
          <div className={`w-full max-w-md rounded-[2.5rem] border overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 ${
            isDark ? 'bg-[#0D111A] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
             <div className={`p-8 border-b flex justify-between items-center ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Request Account Unlink</h3>
                <button onClick={() => setIsUnlinkModalOpen(false)} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}>
                  <XIcon className="w-5 h-5 text-slate-500" />
                </button>
             </div>
             <div className="p-8 space-y-6">
                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                   <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                      Unlinking an account will immediately stop the continuous 28-day holding verification. This may reset your compliance progress.
                   </p>
                </div>
                <div className="space-y-2">
                   <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>Reason for unlinking</label>
                   <textarea
                     value={unlinkReason}
                     onChange={e => setUnlinkReason(e.target.value)}
                     placeholder="e.g. Account closed, Switching banks..."
                     className={`w-full h-32 border rounded-2xl px-5 py-4 text-xs font-medium focus:outline-none focus:border-rose-500 transition-all resize-none ${
                       isDark ? 'bg-slate-950 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                     }`}
                   />
                </div>
                <button
                  onClick={handleRequestUnlink}
                  disabled={!unlinkReason.trim()}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-rose-500/20 active:scale-95 transition-all"
                >
                  Submit Unlink Request
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Expired Modal */}
      {isExpiredModalOpen && (
        <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300 ${
          isDark ? 'bg-slate-950/60' : 'bg-slate-900/50'
        }`}>
          <div className={`w-full max-w-md rounded-[2.5rem] border overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 ${
            isDark ? 'bg-[#0D111A] border-white/10' : 'bg-white border-slate-200'
          }`}>
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
                <Lock className="w-10 h-10" />
              </div>
              <h3 className={`text-2xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Account Expired</h3>
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Evaluation Period Concluded</p>
              <div className={`p-6 rounded-2xl border italic text-xs font-medium leading-relaxed ${
                isDark ? 'bg-slate-950 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                "{evaluation?.timerCustomMessage || 'Your evaluation period has ended. Please contact your counselor to extend access.'}"
              </div>
              <button onClick={() => setIsExpiredModalOpen(false)} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Understood</button>
            </div>
          </div>
        </div>

      )}

      <StudentProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onRequestTopUp={() => setIsTopUpModalOpen(true)}
        onUpdate={() => {}}
        userProfile={userProfile || appUser}
        consolidatedBalance={accounts.reduce((sum, acc) => sum + acc.balanceNgn, 0)}
        holdingProgress={evaluation?.consecutiveDays ? Math.min(Math.round((evaluation.consecutiveDays / 28) * 100), 100) : 0}
      />

    </div>
  );
};

export default StudentDashboardView;
