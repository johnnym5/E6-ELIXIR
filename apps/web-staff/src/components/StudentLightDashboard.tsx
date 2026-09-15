import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
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
  Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { TopUpRequestModal } from './TopUpRequestModal';
import { UssdFallbackModal } from './UssdFallbackModal';
import { BankStatementView } from './BankStatementView';
import { StudentProfileModal } from './StudentProfileModal';
import { StudentDocumentUploadWizard } from './StudentDocumentUploadWizard';
import { ApprovedTopUpCard } from './ApprovedTopUpCard';
import { useUserBalance } from '../hooks/useUserBalance';
import { useAccountProcessor, LinkedBankAccount, AccountType } from '../hooks/useAccountProcessor';
import { useAndroidBridge } from '../hooks/useAndroidBridge';
import { GlassModal } from './ui/GlassModal';
import { toast } from 'sonner';

import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';

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

export const StudentLightDashboard: React.FC<{
  name: string;
  userId?: string;
  evaluationId?: string;
  isStaff?: boolean;
  onStaffAction?: (tab?: string) => void;
}> = ({ name, userId: propUserId, evaluationId: propEvalId, isStaff, onStaffAction }) => {
  const { currentUser, appUser, role } = useAuth();
  const { theme } = useTheme();

  const activeUserId = propUserId || currentUser?.uid;
  const activeEvalId = propEvalId;

  const { balance: liveBalance, accounts: liveAccounts, evaluation: liveEvaluation, loading: balanceLoading } = useUserBalance(activeUserId);

  const { isNativeAndroid, triggerSmsSync } = useAndroidBridge({
    onSuccess: (balance, mask) => {
      toast.success(`Balance synced: ₦${balance.toLocaleString()} for Acct ${mask}`);
      setSyncingId(null);
    },
    onFailure: (mask, reason) => {
      toast.error(`Sync failed for ${mask}: ${reason}`);
      setSyncingId(null);
    }
  });

  // State
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const { accounts, totals } = useAccountProcessor({
    liveAccounts,
    appUser,
    liveBalance,
    activeUserId,
    selectedAccountIds
  });

  const [evaluation, setEvaluation] = useState<any>(null);

  useEffect(() => {
    if (liveEvaluation) setEvaluation(liveEvaluation);
  }, [liveEvaluation]);

  // Sync selected accounts
  useEffect(() => {
    if (liveAccounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(liveAccounts.map(a => a.id));
    }
  }, [liveAccounts, selectedAccountIds]);

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

  const [loading, setLoading] = useState(true);
  const [activeMetricCard, setActiveMetricCard] = useState(0);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isExpiredModalOpen, setIsExpiredModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isUssdModalOpen, setIsUssdModalOpen] = useState(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [isDocumentWizardOpen, setIsDocumentWizardOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedUnlinkAccount, setSelectedUnlinkAccount] = useState<LinkedBankAccount | null>(null);
  const [unlinkReason, setUnlinkReason] = useState('');
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [statementAccount, setStatementOpenAccount] = useState<LinkedBankAccount | null>(null);
  const [isSavingAndSyncing, setIsSavingAndSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [prepopulatedTopUpAmount, setPrepopulatedTopUpAmount] = useState<number | undefined>();

  const [accountNumberInput, setAccountNumberInput] = useState('');
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>('SAVINGS');
  const [realAmountInput, setRealAmountInput] = useState('');

  const isDark = theme === 'dark';

  const filteredNigerianBanks = useMemo(() => {
    if (!bankSearchQuery) return [];
    return NIGERIAN_BANKS.filter(b => b.toLowerCase().includes(bankSearchQuery.toLowerCase()));
  }, [bankSearchQuery]);

  // Handlers
  const handleSyncAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    setSyncingId(id);

    if (acc.isSystemTopUp) {
      await new Promise(r => setTimeout(r, 1000));
      toast.success('System liquidity verified.');
      setSyncingId(null);
      return;
    }

    if (acc.bankName.includes('UBA') || acc.bankName.includes('United Bank')) {
       const triggered = triggerSmsSync(acc.accountNumberMasked.slice(-4), acc.bankName);
       if (!triggered) {
         toast.error("SMS Sync is only available in the Basechan Funder Android App.");
         setSyncingId(null);
       }
       return;
    }

    try {
      await new Promise(r => setTimeout(r, 1500));
      await updateDoc(doc(db, 'financial_accounts', id), { lastSyncedAt: serverTimestamp(), status: 'VERIFIED' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleAdminUnlink = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    if (window.confirm('Accept and unlink this account immediately?')) {
      try {
        await deleteDoc(doc(db, 'financial_accounts', accountId));

        // Add Notification
        await addDoc(collection(db, 'notifications'), {
          userId: activeUserId,
          studentName: name,
          title: 'Account Force-Unlinked',
          body: `Bank account (${acc.bankName}) was removed by an Administrator.`,
          type: 'ALERT',
          createdAt: serverTimestamp(),
          isRead: false
        });

        toast.success('Account unlinked.');
      } catch (err: any) {
        toast.error('Failed to unlink: ' + err.message);
      }
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
    if (!activeUserId || !selectedBank || !accountNumberInput) return;
    setIsSavingAndSyncing(true);
    try {
      const balance = parseFloat(realAmountInput) || 0;
      const mask = `•••• ${accountNumberInput.slice(-4)}`;
      const docRef = await addDoc(collection(db, 'financial_accounts'), {
        userId: activeUserId,
        userEmail: isStaff ? liveEvaluation?.userEmail || '' : currentUser?.email,
        bankName: selectedBank,
        accountName: name,
        accountNumberMasked: mask,
        accountType: selectedAccountType,
        balanceNgn: Math.round(balance),
        balanceGbp: Math.round((balance / LIVE_FX_RATE) * 100) / 100,
        connectionMethod: 'MANUAL_DEPOSIT',
        status: 'VERIFIED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Add Notification
      await addDoc(collection(db, 'notifications'), {
        userId: activeUserId,
        studentName: name,
        title: 'New Bank Source Linked',
        body: `${isStaff ? 'Admin' : 'Student'} linked a new ${selectedBank} account (${mask}).`,
        type: 'INFO',
        createdAt: serverTimestamp(),
        isRead: false
      });

      setIsConnectModalOpen(false);
    } finally {
      setIsSavingAndSyncing(false);
    }
  };

  const handleCancelConnect = () => {
    setIsConnectModalOpen(false);
    setSelectedBank('');
    setBankSearchQuery('');
    setAccountNumberInput('');
  };

  const handleRetrySync = () => {
    if (!accountNumberInput) return;
    setIsSavingAndSyncing(true);
    setSyncError(null);
    const triggered = triggerSmsSync(accountNumberInput.slice(-4), selectedBank);
    if (!triggered) {
      toast.error("SMS Sync is only available in the Android App.");
      setIsSavingAndSyncing(false);
    }
  };

  const handleContinueManual = async () => {
    if (!accountNumberInput || !activeUserId) return;
    setIsSavingAndSyncing(true);
    setSyncError(null);
    try {
      const mask = `•••• ${accountNumberInput.slice(-4)}`;
      await addDoc(collection(db, 'financial_accounts'), {
        userId: activeUserId,
        userEmail: isStaff ? liveEvaluation?.userEmail || '' : currentUser?.email,
        bankName: selectedBank,
        accountName: name,
        accountNumberMasked: mask,
        accountType: selectedAccountType,
        balanceNgn: 0,
        balanceGbp: 0,
        connectionMethod: 'MANUAL_DEPOSIT',
        status: 'VERIFIED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Account registered. Please proceed to USSD/SMS fallback.');
      setIsConnectModalOpen(false);
    } catch (err: any) {
      toast.error('Failed to link account: ' + err.message);
    } finally {
      setIsSavingAndSyncing(false);
    }
  };

  const handleAdditionalTopUp = () => {
    const deficitGbp = targetGBP - totals.gbp;
    if (deficitGbp > 0) setPrepopulatedTopUpAmount(Math.round(deficitGbp * LIVE_FX_RATE));
    setIsTopUpModalOpen(true);
  };

  if (balanceLoading && accounts.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#0a0f1e]' : 'bg-slate-50'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-amber-500' : 'text-blue-600'}`} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-all duration-500 relative bg-app text-main ${
      expiryInfo.isExpired ? 'grayscale opacity-40 pointer-events-none' : ''
    }`}>

      {/* Expiry Warning Banner */}
      {expiryInfo.isNearExpiry && !expiryInfo.isExpired && (
        <div className={`mb-8 p-6 rounded-[2rem] border animate-in slide-in-from-top-4 duration-700 flex flex-col md:flex-row items-center justify-between gap-6 ${
          isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h4 className={`text-sm font-black uppercase tracking-tight ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>POF EVALUATION EXPIRES SOON</h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Evaluation period ends in <span className="text-amber-500">{expiryInfo.daysLeft} days</span>
              </p>
            </div>
          </div>
          <button onClick={() => setIsTopUpModalOpen(true)} className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all">
            Request Extension
          </button>
        </div>
      )}

      {/* Hero Metric Card Section */}
      <section className="mb-6 md:mb-12 relative group px-1 sm:px-4">
        <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] min-h-[280px] md:min-h-[340px] flex items-stretch">

          {/* CARD 1: Total Liquid Converted Balance */}
          <div className={`w-full flex-shrink-0 transition-all duration-700 transform ${activeMetricCard === 0 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
            <div className="h-full glass-card p-4 sm:p-6 md:p-14 text-white relative flex flex-col justify-between overflow-hidden !bg-zinc-900/90 !border-zinc-800 shadow-none">
              <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

              <div className="relative z-10 space-y-4 md:space-y-8">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-blue-400 text-[10px] md:text-xs font-black uppercase tracking-[0.25em] mb-1 md:mb-3 opacity-80 truncate">{name}</p>
                    <h2 className="text-3xl xs:text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter text-depth-header leading-none break-all">
                      £{totals.gbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                    <div className="flex justify-between text-[7px] xs:text-[8px] md:text-[9px] font-mono text-slate-400 mt-2 md:mt-4 border-t border-slate-200 dark:border-zinc-800 pt-2 uppercase tracking-tighter">
                       <span>CURRENT: £{Math.round(totals.gbp).toLocaleString()}</span>
                       <span>TARGET: {targetGBP > 0 ? `£${targetGBP.toLocaleString()}` : '£0 (NOT SET)'}</span>
                    </div>
                    <div className="mt-2 md:mt-4 flex items-center gap-2 md:gap-3">
                       <p className="text-slate-400 text-base md:text-xl font-bold uppercase tracking-tight text-depth-header">{currency.symbol}{totals.ngn.toLocaleString()}</p>
                       <span className="px-1.5 py-0.5 rounded dark:bg-zinc-800/50 text-[6px] md:text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 dark:border-zinc-800"> {currency.code}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6 pt-4 md:pt-6 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-6">
                    <div className="flex items-center space-x-2 md:space-x-2.5 text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.2em] text-slate-500">
                      <CreditCard className="w-3 h-3 md:w-4 md:h-4 text-slate-600" />
                      <span>LINKED: <span className="text-white ml-1">{selectedAccountIds.length} / {accounts.length}</span></span>
                    </div>
                    <div className="hidden sm:block w-px h-4 bg-white/10" />
                    <div className="flex items-center space-x-2 md:space-x-2.5 text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.2em] text-slate-500">
                      <Building2 className="w-3 h-3 md:w-4 md:h-4 text-emerald-500/60" />
                      <span className="truncate max-w-[100px] xs:max-w-none">Bank: <span className="text-emerald-400 ml-1">
                        {selectedAccountIds.length === 0
                          ? 'NONE'
                          : selectedAccountIds.length === 1
                            ? accounts.find(a => a.id === selectedAccountIds[0])?.bankName
                            : `MULTI (+${selectedAccountIds.length - 1})`}
                      </span></span>
                    </div>
                  </div>

                  <button
                    onClick={() => isStaff && onStaffAction ? onStaffAction() : setIsTopUpModalOpen(true)}
                    disabled={!isStaff && (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')}
                    className={`flex items-center gap-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                      !isStaff && (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')
                        ? 'text-amber-500 opacity-80 cursor-not-allowed'
                        : 'text-blue-400 hover:text-blue-300'
                    }`}
                  >
                    <span>
                      {isStaff
                        ? 'UPDATE TOP-UP'
                        : (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING' ? 'TOP-UP REQUEST PENDING' : 'REQUEST TOP UP')}
                    </span>
                    {!(appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING') && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: Statutory Holding & Expiration Timer */}
          <div className={`w-full flex-shrink-0 transition-all duration-700 transform ${activeMetricCard === 1 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
            <div className="h-full glass-card p-10 md:p-14 text-white relative flex flex-col justify-between overflow-hidden !bg-zinc-900/90 !border-zinc-800 shadow-none">
              <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[150%] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

              <div className="relative z-10 space-y-8">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-amber-400 text-xs font-black uppercase tracking-[0.25em] opacity-80">Holding & Expiration</p>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-wider text-depth-gold ${
                        targetGBP > 0
                          ? isTargetMet ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {targetGBP > 0 ? (isTargetMet ? 'Compliant' : `${progressPercent}% Of Target`) : 'No Target Set'}
                      </span>
                    </div>

                    <div className="flex items-baseline space-x-3">
                      {evaluation?.startDate ? (
                        expiryInfo.isExpired ? (
                          <h3 className="text-4xl md:text-5xl font-black tracking-tight text-rose-500 uppercase text-depth-header">Window Expired</h3>
                        ) : (
                          <>
                            <h3 className="text-6xl md:text-7xl font-black tracking-tight text-white text-depth-header">{expiryInfo.daysLeft}</h3>
                            <span className="text-2xl font-bold text-slate-400 uppercase">Days</span>
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest ml-4">REMAINING</span>
                          </>
                        )
                      ) : (
                        <div className="flex items-baseline space-x-3 opacity-60">
                          <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-500 uppercase text-depth-header">NO WINDOW SET</h3>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-8">
                      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            targetGBP > 0
                              ? isTargetMet ? 'bg-emerald-400' : 'bg-gradient-to-r from-amber-400 to-blue-500'
                              : 'bg-slate-700'
                          }`}
                          style={{ width: targetGBP > 0 ? `${progressPercent}%` : '0%' }}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-mono text-slate-500 mt-3 uppercase tracking-widest">
                        <span>Current: £{Math.round(totals.gbp).toLocaleString()}</span>
                        <span>Target: {targetGBP > 0 ? `£${targetGBP.toLocaleString()}` : '£0 (Not Set)'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between">
                   <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      {evaluation?.startDate ? (
                        <>
                          STATUTORY COMPLIANCE WINDOW: <span className="text-white ml-2">{new Date(evaluation.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span> - <span className="text-white">{new Date(evaluation.expirationDate || new Date(new Date(evaluation.startDate).getTime() + 28 * 24 * 60 * 60 * 1000)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </>
                      ) : (
                        <span className="text-rose-500 animate-pulse">Waiting for Admin to initialize evaluation window</span>
                      )}
                   </p>
                   {isStaff && (
                     <button
                       onClick={() => onStaffAction?.('days')}
                       className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
                     >
                       <span>SETUP EVALUATION</span>
                       <Settings className="w-3.5 h-3.5" />
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
            className={`p-2 rounded-full border transition-all hover:scale-110 active:scale-95 ${activeMetricCard === 0 ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-3">
            {[0, 1].map(i => (
              <div key={i} className={`h-2 rounded-full transition-all duration-500 ${activeMetricCard === i ? 'bg-blue-500 w-8' : 'bg-slate-800 w-2'}`} />
            ))}
          </div>

          <button
            onClick={() => setActiveMetricCard(1)}
            className={`p-2 rounded-full border transition-all hover:scale-110 active:scale-95 ${activeMetricCard === 1 ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Compliance Checklist */}
      <section className="mb-8 md:mb-12 px-1 sm:px-4">
        <div className="px-1 md:px-2 mb-3 md:mb-8">
          <h3 className="text-base md:text-xl uppercase font-extrabold text-slate-900 dark:text-white tracking-tight">Compliance Documents</h3>
          <p className="text-[9px] md:text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mt-0.5">Required files for proof of funds verification</p>
        </div>

        <div className="p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-5 transition-all bg-white border-slate-200 shadow-md dark:bg-zinc-900/90 dark:border-zinc-800 shadow-none hover:border-blue-500/30">
           <div className="flex items-start gap-3 md:gap-6 w-full sm:w-auto">
              <div className={`w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center border shadow-sm shrink-0 ${
                appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300'
              }`}>
                 {appUser?.mandateStatus === 'MANDATE_APPROVED' ? <CheckCircle2 className="w-5 h-5 md:w-8 md:h-8" /> : <ShieldCheck className="w-5 h-5 md:w-8 md:h-8" />}
              </div>
              <div className="min-w-0">
                 <h4 className="text-sm md:text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                   {appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'Compliance Verification Cleared' :
                    appUser?.mandateStatus === 'MANDATE_SUBMITTED_AWAITING_APPROVAL' ? 'Package Awaiting Verification' :
                    'Awaiting Compliance Verification'}
                 </h4>
                 <p className="text-[9px] md:text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mt-1.5 leading-relaxed">
                   {appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'Your regulatory account mandate has been fully verified and approved.' :
                    appUser?.mandateStatus === 'MANDATE_SUBMITTED_AWAITING_APPROVAL' ? 'Your document package has been received and is under professional review.' :
                    'Submit your international passport and supporting financial documents for review.'}
                 </p>
              </div>
           </div>
           <button
             onClick={() => setIsDocumentWizardOpen(true)}
             className={`w-full sm:w-auto px-5 md:px-8 py-3 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all shadow-lg ${
               appUser?.mandateStatus === 'MANDATE_APPROVED'
                 ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                 : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-500'
             }`}
           >
             {appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'View Submissions' : 'Manage Submissions'}
           </button>
        </div>
      </section>

      {/* Bank Accounts Ledger */}
      <section className="space-y-4 md:space-y-8 px-1 sm:px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 px-1">
          <div className="min-w-0">
            <h3 className="text-base md:text-xl uppercase font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">Bank Accounts Ledger</h3>
            <p className="text-[9px] md:text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mt-1">Select accounts to include in total asset calculation</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
             <button
               onClick={() => setSelectedAccountIds(accounts.map(a => a.id))}
               aria-label="Select all bank accounts"
               className="flex-1 lg:flex-none flex items-center justify-center space-x-2 text-[7px] md:text-[9px] font-black uppercase tracking-widest transition-all px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
             >
               <CheckSquare className="w-3 h-3" />
               <span>Select All</span>
             </button>
             <button
               onClick={() => setSelectedAccountIds([])}
               aria-label="Clear selected bank accounts"
               className="flex-1 lg:flex-none flex items-center justify-center space-x-2 text-[7px] md:text-[9px] font-black uppercase tracking-widest transition-all px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500"
             >
               <Square className="w-3 h-3" />
               <span>Clear</span>
             </button>
             <button
               onClick={() => setIsConnectModalOpen(true)}
               aria-label="Link new bank account source"
               className="w-full lg:w-auto flex items-center justify-center space-x-2 text-[9px] font-black uppercase tracking-widest transition-all px-5 py-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 active:scale-95"
             >
               <Plus className="w-3.5 h-3.5" />
               <span>Connect Source</span>
             </button>
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
                  className={`glass-subcard p-8 flex flex-col transition-all group shadow-sm hover:-translate-y-1 cursor-pointer relative ${
                    isDark
                      ? isTopUp
                        ? isSelected
                          ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'bg-slate-900/70 border-amber-500/30 hover:border-amber-500/50'
                        : isSelected
                          ? 'border-blue-600/60 bg-blue-600/10 shadow-lg shadow-blue-500/10'
                          : 'bg-slate-900/70 border-white/10'
                      : isTopUp
                        ? isSelected
                          ? 'border-amber-500 bg-amber-50/90 shadow-lg shadow-amber-500/20'
                          : 'bg-white/90 border-amber-300 shadow-md shadow-amber-100/50 hover:border-amber-400'
                        : isSelected
                          ? 'border-blue-600 bg-blue-50/70 shadow-lg shadow-blue-500/10'
                          : 'bg-white/85 border-slate-200 shadow-md shadow-slate-200/50'
                  }`}
                >
                  {/* Checkbox Overlay */}
                  <div className={`absolute top-4 right-4 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? isTopUp
                        ? 'bg-amber-500 border-amber-500 scale-110'
                        : 'bg-blue-600 border-blue-600 scale-110'
                      : 'border-slate-300'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>

                  <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center space-x-5">
                      <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all ${
                        isTopUp
                          ? isDark
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                            : 'bg-amber-100 border-amber-200 text-amber-700 shadow-sm'
                          : isDark
                            ? 'bg-slate-800 border-white/5 text-slate-500'
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                        {isTopUp ? <Zap className="w-7 h-7 fill-amber-400/20" /> : <Building2 className="w-7 h-7" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black tracking-tight uppercase text-slate-900 dark:text-white">
                            {acc.accountName || acc.bankName}
                          </h4>
                          {isTopUp && (
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                              isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              <Zap className="w-2.5 h-2.5" /> Top-Up Added
                            </span>
                          )}
                          {acc.id === 'parallex_dedicated' && <span className="text-[10px] font-black text-accent-gold dark:text-amber-500 uppercase tracking-tighter">(Mandate)</span>}
                          {acc.isDedicatedParallex && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 text-[7px] font-black uppercase tracking-tighter flex items-center gap-0.5">
                              <Building2 className="w-2.5 h-2.5" />
                              Dedicated POF Account
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${
                            isTopUp
                              ? (isDark ? 'text-amber-400/90' : 'text-amber-800')
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            {acc.accountNumberMasked} • {isTopUp ? 'SPONSORED FACILITY' : acc.accountType}
                          </p>
                          <span className="px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-tighter flex items-center gap-0.5 bg-sky-100 text-sky-900 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800">
                            <Lock className="w-2" />
                            Read-Only
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right pr-6">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${
                        isTopUp
                          ? (isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300')
                          : acc.verificationStatus === 'MANDATE_PENDING_REVIEW'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : acc.status === 'VERIFIED'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        {isTopUp ? 'Facility Active' : (acc.verificationStatus === 'MANDATE_PENDING_REVIEW' ? 'Mandate Pending Review' : acc.status)}
                      </span>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mt-1.5">Last Sync: {acc.lastSyncedAt}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pb-8 border-b border-white/5">
                    {isTopUp ? (
                      <div className={`col-span-2 mb-4 p-3.5 rounded-2xl border ${
                        isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/70 border-amber-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <ShieldCheck className="w-4 h-4 text-amber-400" />
                            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                              Institutional Proof-of-Funds Facility
                            </span>
                          </div>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                            isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-200 text-amber-900'
                          }`}>
                            Verified Disbursed
                          </span>
                        </div>
                        <p className={`text-[9px] mt-1.5 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          Approved capital disbursed and active in ledger to cover UK/International visa proof-of-funds requirement.
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
                        isTopUp ? (isDark ? 'text-amber-400/90' : 'text-amber-800') : 'text-slate-500'
                      }`}>
                        {isTopUp ? 'Top-Up Added' : 'Actual Account Balance'}
                      </p>
                      <p className={`text-xl font-black font-mono ${
                        isTopUp ? 'text-amber-400' : (isDark ? 'text-white' : 'text-slate-900')
                      }`}>
                        {currency.symbol}{acc.balanceNgn.toLocaleString()}
                      </p>
                    </div>
                    <div className="border-l border-white/5 pl-4">
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                        isTopUp ? (isDark ? 'text-amber-400/90' : 'text-amber-800') : 'text-slate-500'
                      }`}>
                        GBP Value
                      </p>
                      <p className={`text-xl font-black ${
                        isTopUp ? 'text-amber-400' : 'text-blue-600'
                      }`}>
                        £{acc.balanceGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSyncAccount(acc.id); }}
                          disabled={syncingId === acc.id}
                          title={isTopUp ? 'Sync Facility' : 'Sync Balance'}
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${isDark ? 'bg-slate-800 border-white/5 text-slate-500 hover:text-amber-500' : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-blue-600'} disabled:opacity-50`}
                        >
                          <RefreshCw className={`w-4 h-4 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                        </button>

                        {!isTopUp && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleClearAccountBalance(acc.id); }}
                              title="Clear Balance"
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${isDark ? 'bg-slate-800 border-white/5 text-slate-500 hover:text-rose-400' : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-blue-600'}`}
                            >
                              <XIcon className="w-4 h-4" />
                            </button>

                            <button
                              onClick={(e) => { e.stopPropagation(); setIsUssdModalOpen(true); }}
                              title="USSD Codes"
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${isDark ? 'bg-slate-800 border-white/5 text-slate-500 hover:text-blue-400' : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-blue-600'}`}
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
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${isDark ? 'bg-slate-800 border-white/5 text-slate-500 hover:text-cyan-400' : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-cyan-600'}`}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
                      {!acc.isVerified && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium block mt-3">Account not verified</span>
                      )}
                    </div>

                    {isTopUp ? (
                      isStaff && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAdminUnlink(acc.id); }}
                          title="Revoke Top-Up"
                          className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
                            isDark ? 'bg-slate-800 border-white/5 text-slate-400 hover:text-rose-500' : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-rose-600'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isStaff) {
                            handleAdminUnlink(acc.id);
                          } else {
                            if (acc.unlinkStatus === 'UNLINK_REQUESTED') return;
                            setSelectedUnlinkAccount(acc);
                            setIsUnlinkModalOpen(true);
                          }
                        }}
                        disabled={!isStaff && acc.unlinkStatus === 'UNLINK_REQUESTED'}
                        title={isStaff && acc.unlinkStatus === 'UNLINK_REQUESTED'
                          ? 'Approve Unlink'
                          : acc.unlinkStatus === 'UNLINK_REQUESTED'
                            ? 'Unlink Pending'
                            : isStaff
                              ? 'Force Unlink'
                              : 'Request Unlink'}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg border border-white/5 bg-slate-800 transition-all ${
                          !isStaff && acc.unlinkStatus === 'UNLINK_REQUESTED'
                            ? 'text-slate-600 cursor-not-allowed'
                            : 'text-slate-500 hover:text-rose-400'
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
      <GlassModal
        isOpen={isConnectModalOpen}
        onClose={handleCancelConnect}
        title="Connect your Bank Account"
        maxWidth="max-w-lg"
      >
        {/* Read-Only Guarantee Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-blue-600/5 border border-blue-500/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Read-Only Guarantee</p>
            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
              Basechanfunder only scans financial SMS alerts to verify continuous POF holding. We have <span className="text-white font-bold">ZERO permission</span> to debit, transfer, or move money from your account.
            </p>
          </div>
        </div>

        <div>
          {syncError ? (
            <div className="space-y-6 text-center py-4 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-black uppercase text-white">Bank Not Found</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  We couldn't find a matching SMS alert. What would you like to do?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleRetrySync}
                  className="py-4 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20"
                >
                  Try Again
                </button>
                <button
                  onClick={() => { setSyncError(null); setSelectedBank(''); setBankSearchQuery(''); }}
                  className="py-4 rounded-2xl bg-slate-800 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                >
                  Change Bank
                </button>
                <button
                  onClick={handleCancelConnect}
                  className="py-4 rounded-2xl bg-slate-800 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinueManual}
                  className="py-4 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnectBank} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Bank</label>
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
                      className={`w-full border rounded-2xl pl-12 pr-4 py-4 text-xs font-bold focus:outline-none transition-all ${
                        isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
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
                            className={`w-full text-left px-6 py-4 text-xs font-black uppercase transition-all hover:bg-blue-600 hover:text-white ${
                              selectedBank === bank ? 'bg-blue-600 text-white' : isDark ? 'text-slate-300' : 'text-slate-700'
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
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Number</label>
                    <input
                      required
                      maxLength={10}
                      placeholder="10-digit Number"
                      value={accountNumberInput}
                      onChange={e => setAccountNumberInput(e.target.value.replace(/\D/g, ''))}
                      className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:outline-none transition-all ${
                        isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                      }`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Type</label>
                    <select
                      value={selectedAccountType}
                      onChange={e => setSelectedAccountType(e.target.value as AccountType)}
                      className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:outline-none transition-all ${
                        isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                      }`}
                    >
                      <option value="SAVINGS">SAVINGS</option>
                      <option value="CURRENT">CURRENT</option>
                      <option value="DOMICILIARY">DOMICILIARY</option>
                    </select>
                  </div>
                </div>

                {isStaff && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Initial Balance (₦)</label>
                    <input
                      type="number"
                      placeholder="Initial Balance (₦)"
                      value={realAmountInput}
                      onChange={e => setRealAmountInput(e.target.value)}
                      className={`w-full border rounded-2xl px-5 py-4 text-xs font-bold focus:outline-none transition-all ${
                        isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                      }`}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!selectedBank || accountNumberInput.length < 10 || (isStaff && !realAmountInput) || isSavingAndSyncing}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 depth-btn-gold"
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
          )}
        </div>
      </GlassModal>

      {!isStaff && (
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

      <BankStatementView
        isOpen={isStatementOpen}
        onClose={() => {
          setIsStatementOpen(false);
          setStatementOpenAccount(null);
        }}
        account={statementAccount}
      />

      {/* Unlink Request Modal */}
      <GlassModal
        isOpen={isUnlinkModalOpen}
        onClose={() => setIsUnlinkModalOpen(false)}
        title="Request Account Unlink"
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-[10px] font-bold text-rose-300 uppercase tracking-widest leading-relaxed">
              Unlinking an account will immediately stop the continuous 28-day holding verification. This may reset your compliance progress.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reason for unlinking</label>
            <textarea
              value={unlinkReason}
              onChange={e => setUnlinkReason(e.target.value)}
              placeholder="e.g. Account closed, Switching banks..."
              className="w-full h-32 bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-medium text-white focus:outline-none focus:border-rose-500 transition-all resize-none"
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
      </GlassModal>

      <GlassModal
        isOpen={isExpiredModalOpen}
        onClose={() => setIsExpiredModalOpen(false)}
        title="Account Expired"
        maxWidth="max-w-md"
      >
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
            <Lock className="w-10 h-10" />
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Evaluation Period Concluded</p>
          <div className={`p-6 rounded-2xl border italic text-xs font-medium leading-relaxed ${isDark ? 'bg-slate-950 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
            "{evaluation?.timerCustomMessage || 'Your evaluation period has ended. Please contact your counselor to extend access.'}"
          </div>
          <button onClick={() => setIsExpiredModalOpen(false)} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Understood</button>
        </div>
      </GlassModal>

      {/* Profile FAB - Student Side */}
      {!isStaff && role === 'STUDENT' && (
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsProfileModalOpen(true)}
          className="fixed bottom-6 right-6 z-[150] w-14 h-14 md:w-16 md:h-16 rounded-full bg-slate-900/90 backdrop-blur-xl border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)] flex items-center justify-center text-amber-500 hover:border-amber-500 transition-all group"
        >
          {appUser?.photoURL ? (
            <img src={appUser.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <User className="w-6 h-6 md:w-7 h-7" />
          )}
          <div className="absolute inset-0 rounded-full border border-amber-500/0 group-hover:border-amber-500/50 animate-ping duration-1000" />
        </motion.button>
      )}

      <StudentProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onRequestTopUp={() => setIsTopUpModalOpen(true)}
        userProfile={appUser}
        consolidatedBalance={accounts.reduce((sum, acc) => sum + acc.balanceNgn, 0)}
        holdingProgress={evaluation?.consecutiveDays ? Math.min(Math.round((evaluation.consecutiveDays / 28) * 100), 100) : 0}
      />

    </div>
  );
};

export default StudentLightDashboard;
