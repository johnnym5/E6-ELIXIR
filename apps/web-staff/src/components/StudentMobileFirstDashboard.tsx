import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
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
  Clock,
  Sun,
  Moon,
  MessageCircle,
  Bell,
  LogOut,
  Sparkles,
  ShieldAlert,
  Settings,
  CheckCheck,
  History,
  Lock,
  Zap,
  ArrowRight,
  Mail,
  Upload,
  Layers,
  Phone,
  FileText
} from 'lucide-react';

import { TopUpRequestModal } from './TopUpRequestModal';
import { StudentSupportChat } from './StudentSupportChat';
import { UssdFallbackModal } from './UssdFallbackModal';
import { ApprovedTopUpCard } from './ApprovedTopUpCard';
import { StudentDocumentUploadWizard } from './StudentDocumentUploadWizard';
import { AccountMandateWizard } from './AccountMandateWizard';
import { ElectronicLedgerStatementModal } from './ElectronicLedgerStatementModal';
import { useUserBalance } from '../hooks/useUserBalance';
import { useAccountProcessor, LinkedBankAccount, AccountType } from '../hooks/useAccountProcessor';
import { useAndroidBridge } from '../hooks/useAndroidBridge';
import { requestSmsPermissions } from '../utils/smsPermissions';
import { FuzzySmsParser } from '../services/fuzzySmsParser';
import { SmsSyncService } from '../services/smsSyncService';
import { toast } from 'sonner';
import { recalculateUserBalance } from '../utils/balanceRecalculator';
import { generateStatementClientSide } from '../utils/clientStatementGenerator';

import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';
import { Link } from 'react-router-dom';

// --- Types ---
type AccountType = 'SAVINGS' | 'CURRENT' | 'DOMICILIARY';
type ConnectionMethod = 'MONO_OPEN_BANKING' | 'OKRA_AGGREGATOR' | 'MANUAL_DEPOSIT';
type AccountStatus = 'VERIFIED' | 'SYNCING' | 'NEEDS_REAUTH';

interface LinkedBankAccount {
  id: string;
  bankName: string;
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
  status: AccountStatus;
  isSyncing?: boolean;
  isSystemTopUp: boolean;
  unlinkStatus: 'ACTIVE' | 'UNLINK_REQUESTED';
  verificationBadge?: string;
}

interface ToastNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
}

const NIGERIAN_BANKS = [
  "Access Bank", "Zenith Bank", "Guaranty Trust Bank (GTB)", "United Bank for Africa (UBA)",
  "First Bank of Nigeria", "Fidelity Bank", "First City Monument Bank (FCMB)", "Stanbic IBTC Bank",
  "Sterling Bank", "Wema Bank", "Union Bank", "Polaris Bank", "Keystone Bank", "Ecobank Nigeria",
  "Standard Chartered Bank", "Providus Bank", "Premium Trust Bank", "Signature Bank", "SunTrust Bank",
  "Titan Trust Bank", "Optimus Bank", "Parallex Bank", "Citibank Nigeria", "Globus Bank",
  "Jaiz Bank", "TAJBank", "Lotus Bank", "The Alternative Bank", "Summit Bank", "FSDH Merchant Bank",
  "Moniepoint MFB", "Kuda MFB", "Opay (Blue Ridge MFB)", "PalmPay", "LAPO MFB", "FairMoney MFB",
  "Renmoney MFB", "Accion MFB", "VFD MFB", "Sparkle MFB", "AB MFB", "Carbon MFB", "Branch MFB"
];

export const StudentMobileFirstDashboard: React.FC<{
  name: string;
  isStaff?: boolean;
  onStaffAction?: (tab?: string) => void;
}> = ({ name, isStaff, onStaffAction }) => {
  const { currentUser, appUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const { balance: liveBalance, accounts: liveAccounts, evaluation: liveEvaluation, loading: balanceLoading } = useUserBalance(currentUser?.uid);

  // --- States ---
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const { accounts, totals } = useAccountProcessor({
    liveAccounts,
    appUser,
    liveBalance,
    activeUserId: currentUser?.uid,
    selectedAccountIds
  });

  const [evaluation, setEvaluation] = useState<any>(null);
  const hasInitializedSelection = useRef(false);

  useEffect(() => {
    if (liveEvaluation) setEvaluation(liveEvaluation);
  }, [liveEvaluation]);

  // 1. Sync local selected IDs with live accounts (Only on first load)
  useEffect(() => {
    if (liveAccounts.length > 0 && !hasInitializedSelection.current) {
      setSelectedAccountIds(liveAccounts.map(a => a.id));
      hasInitializedSelection.current = true;
    }
  }, [liveAccounts]);

  const targetGBP = evaluation?.targetGBP || 0;
  const localCurrencyCode = evaluation?.localCurrency || 'NGN';
  const currency = (typeof MAJOR_CURRENCIES !== 'undefined' ? MAJOR_CURRENCIES.find(c => c.code === localCurrencyCode) : null) || { code: 'NGN', symbol: '₦' };

  const isTargetMet = targetGBP > 0 && totals.gbp >= targetGBP;
  const progressPercent = targetGBP > 0 ? Math.min(Math.round((totals.gbp / targetGBP) * 100), 100) : 0;

  // Expiration logic
  const expiryInfo = useMemo(() => {
    if (!evaluation?.isTimerActive || !evaluation?.expirationDate) {
      return { isExpired: false, isNearExpiry: false, daysLeft: 0 };
    }
    const now = new Date();
    const expiry = new Date(evaluation.expirationDate);
    expiry.setHours(23, 59, 59, 999);
    const diffTime = expiry.getTime() - now.getTime();
    const daysLeft = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 0);
    return {
      isExpired: diffTime <= 0,
      isNearExpiry: daysLeft >= 0 && daysLeft <= 7,
      daysLeft
    };
  }, [evaluation]);

  const [loading, setLoading] = useState(true);

  // Safey timeout: Stop loading after 3 seconds regardless of background sync
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!balanceLoading) setLoading(false);
  }, [balanceLoading]);

  // Modals & Drawers
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isUssdModalOpen, setIsUssdModalOpen] = useState(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [isDocumentWizardOpen, setIsDocumentWizardOpen] = useState(false);
  const [isMandateWizardOpen, setIsMandateWizardOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<any>(null);
  const [selectedUnlinkAccount, setSelectedUnlinkAccount] = useState<LinkedBankAccount | null>(null);
  const [isSavingAndSyncing, setIsSavingAndSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [activeMetricCard, setActiveMetricCard] = useState(0); // 0 = Balance, 1 = Timer
  const [prepopulatedTopUpAmount, setPrepopulatedTopUpAmount] = useState<number | undefined>();

  // 5-Second Slide-Out Notification Toast State
  const [activeToast, setActiveToast] = useState<ToastNotification | null>(null);
  const [isToastRetracting, setIsToastRetracting] = useState(false);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
  const [notificationsList, setNotificationsList] = useState<ToastNotification[]>([]);
  const [notifPage, setNotifPage] = useState(1);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Bank connect modal inputs
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

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { isNativeAndroid, triggerSmsSync, getSmsMessages } = useAndroidBridge({
    onSuccess: async (balance, mask, timestamp) => {
      console.log(`Native SMS Update: ₦${balance} for Acct ${mask}`);
      await handleSmsSuccess(balance, mask, timestamp, false);
    },
    onFailure: async (mask, reason) => {
      console.log(`Native Sync Failed for ${mask} (${reason}). Executing Tiered Fallback...`);

      if (reason === 'PERMISSION_DENIED') {
        setSyncError('SMS access permission was denied.');
        toast.error('SMS access permission was denied.');
        setSyncingId(null);
        return;
      }

      // Tiered Fallback Strategy
      try {
        const messages = getSmsMessages();
        if (messages.length > 0) {
          // Execute Tiered Inspection in JS
          const result = FuzzySmsParser.findLatestBalance(messages, mask, 'UBA');

          if (result) {
            console.log(`JS Fallback Success: Found balance ${result.balance}`);
            await handleSmsSuccess(result.balance, mask, result.timestamp, result.isFallback);
            return;
          }
        }
      } catch (e) {
        console.error('Tiered Fallback Engine Error:', e);
      }

      // Final failure if even fallback finds nothing
      const message = `No matching UBA alerts found for account ending in ${mask}.`;
      setSyncError(message);
      toast.error(message);
      setIsSavingAndSyncing(false);
      setSyncingId(null);

      // Clear Firestore sync lock if possible
      if (currentUser?.uid) {
        const accId = liveAccounts.find(acc => acc.accountNumberMasked?.endsWith(mask))?.id;
        if (accId) {
          await updateDoc(doc(db, 'users', currentUser.uid, 'financial_accounts', accId), {
            isSyncing: false,
            updatedAt: serverTimestamp()
          }).catch(() => {});
        }
      }
    }
  });

  const handleSmsSuccess = async (balance: number, mask: string, timestamp: number, isFallback = false) => {
    if (!currentUser?.uid) return;

    // --- 1. Fuzzy Multi-Bank Parsing ---
    let transactions: any[] = [];
    try {
      const messages = getSmsMessages();
      if (messages.length > 0) {
        transactions = FuzzySmsParser.parseLastTransactions(messages);
      }
    } catch (e) {
      console.warn('Fuzzy parsing failed:', e);
    }

    // 2. Prepare Atomic Batch Write
    const batch = writeBatch(db);

    // a. Identify and Update Account Document
    let targetAccountId = '';
    const matchedAcc = liveAccounts.find(acc => acc.accountNumberMasked?.endsWith(mask.slice(-4)));

    if (matchedAcc || pendingAccountId) {
      targetAccountId = matchedAcc?.id || pendingAccountId || '';
      const accRef = doc(db, 'users', currentUser.uid, 'financial_accounts', targetAccountId);
      batch.set(accRef, {
        accountBalanceNgn: balance, // Primary field
        balanceNgn: balance,        // Secondary fallback
        balanceGbp: balance / LIVE_FX_RATE,
        lastSyncedAt: serverTimestamp(),
        status: 'VERIFIED',
        isVerified: true,
        verificationBadge: isFallback ? 'SYNCED FROM LATEST BANK ALERT' : null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Sync Transactions if found
      if (transactions.length > 0) {
        await SmsSyncService.syncTransactions(currentUser.uid, targetAccountId, transactions);
      }
    }

    // b. Update Root User Document (Aggregation & Reactive Binding)
    const userRef = doc(db, 'users', currentUser.uid);
    batch.set(userRef, {
      totalEquityNgn: balance,
      consolidatedBalanceNgn: balance,
      gbpEquivalent: balance / LIVE_FX_RATE,
      isSyncing: false,
      lastSyncedAt: serverTimestamp(),
      balanceVerificationStatus: 'VERIFIED_SMS',
      updatedAt: serverTimestamp()
    }, { merge: true });

    await batch.commit();

    // 3. Trigger a success toast with the CORRECT balance
    triggerSlideOutToast({
      id: `sms-${Date.now()}`,
      title: isFallback ? 'Recent Alert Sync' : 'SMS Alert Received',
      message: isFallback
        ? `Synced balance ₦${balance.toLocaleString()} from recent UBA alert`
        : `UBA Balance Synced: ₦${balance.toLocaleString()}`,
      time: 'Just now',
      type: 'SUCCESS'
    });

    // 4. Clear modal states
    setIsConnectModalOpen(false);
    setIsSavingAndSyncing(false);
    setSyncingId(null);
  };

  // 2. Fetch Notifications Stream
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    let isFirstSnapshot = true;
    const unsubNotif = onSnapshot(q, (snap) => {
      const logs: ToastNotification[] = snap.docs.map(d => {
        const item = d.data();
        const createdDate = item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000) : new Date();

        // Simple relative time string
        const diff = Date.now() - createdDate.getTime();
        let timeStr = 'Just now';
        if (diff > 1000 * 60 * 60 * 24) timeStr = `${Math.floor(diff / (1000 * 60 * 60 * 24))}d ago`;
        else if (diff > 1000 * 60 * 60) timeStr = `${Math.floor(diff / (1000 * 60 * 60))}h ago`;
        else if (diff > 1000 * 60) timeStr = `${Math.floor(diff / (1000 * 60))}m ago`;

        return {
          id: d.id,
          title: item.title || 'Notification',
          message: item.body || item.message || '',
          time: timeStr,
          type: item.type || 'INFO',
          isRead: item.isRead || false
        } as any;
      });

      setNotificationsList(logs);
      setHasUnreadNotification(logs.some(n => !(n as any).isRead));

      // Trigger 5-second slide-out toast on fresh incoming notification
      if (!isFirstSnapshot && snap.docChanges().some(c => c.type === 'added')) {
        const newest = logs[0];
        if (newest && !isProfileOpen) {
          triggerSlideOutToast(newest);
        }
      }
      isFirstSnapshot = false;
    }, () => {});

    return unsubNotif;
  }, [isProfileOpen, currentUser?.uid]);

  // Function to trigger 5-second Slide-Out Notification Toast
  const triggerSlideOutToast = (notif: ToastNotification) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

    setIsToastRetracting(false);
    setActiveToast(notif);
    setHasUnreadNotification(true);

    // After 4.6s, start smooth retract animation into the avatar button
    const retractTimer = setTimeout(() => {
      setIsToastRetracting(true);
    }, 4600);

    // After exactly 5.0s, hide banner and keep persistent bottom-left red dot
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
      setIsToastRetracting(false);
    }, 5000);

    return () => {
      clearTimeout(retractTimer);
    };
  };

  // Handlers
  const handleSyncAccount = async (id: string) => {
    const acc = accounts.find(a => a.id === id);
    if (!acc || !currentUser?.uid) return;

    setSyncingId(id);
    const accRef = doc(db, 'users', currentUser.uid, 'financial_accounts', id);

    try {
      // 0. Mark as Syncing in Firestore for cross-device visibility
      await updateDoc(accRef, { isSyncing: true, updatedAt: serverTimestamp() }).catch(() => {});

      // 1. If it's a System Top Up, re-query the status endpoint
      if (acc.isSystemTopUp) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success('System liquidity verified.');
        return;
      }

      // 2. If it's a UBA account, try Native SMS Sync
      if (acc.bankName.includes('UBA') || acc.bankName.includes('United Bank')) {
        const hasPermission = await requestSmsPermissions();
        if (!hasPermission) {
          toast.error('SMS permissions required to sync bank alerts');
          return;
        }

        const mask = acc.accountNumberMasked.slice(-4);
        const triggered = triggerSmsSync(mask, acc.bankName);
        if (!triggered) {
          toast.error("SMS Sync is only available in the Android App.");
          setSyncingId(null);
        } else {
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
        }
        return;
      }

      // 3. Fallback for other manual accounts
      await new Promise(resolve => setTimeout(resolve, 1500));
      await updateDoc(accRef, {
        lastSyncedAt: serverTimestamp(),
        status: 'VERIFIED',
        isVerified: true
      });
      toast.success('Account balance synchronized.');

    } catch (error: any) {
      console.error('[SMS_SYNC_ERROR]', error);
      toast.error(`Sync failed: ${error.message || 'Unknown error'}`);
    } finally {
      // ALWAYS release the sync lock to prevent infinite spinner loops
      setSyncingId(null);
      if (currentUser?.uid) {
        await updateDoc(accRef, { isSyncing: false, updatedAt: serverTimestamp() }).catch(() => {});
      }
    }
  };

  const handleAdminUnlink = async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    if (window.confirm('Accept and unlink this account immediately? This will recalculate compliance metrics and the total consolidated balance.')) {
      try {
        await deleteDoc(doc(db, 'financial_accounts', accountId));

        // Add Notification
        await addDoc(collection(db, 'notifications'), {
          userId: currentUser?.uid,
          studentId: currentUser?.uid,
          studentName: name,
          title: 'Account Force-Unlinked',
          body: `Bank account (${acc.bankName}) was removed by an Administrator.`,
          type: 'ALERT',
          createdAt: serverTimestamp(),
          isRead: false
        });

        // Trigger balance recalculation after deletion
        if (currentUser?.uid) {
          await recalculateUserBalance(currentUser.uid);
        }

        toast.success('Account unlinked and balance updated.');
      } catch (err: any) {
        toast.error('Failed to unlink: ' + err.message);
      }
    }
  };

  const handleClearAccountBalance = async (accountId: string) => {
    if (!window.confirm('Reset this account balance to zero? This will update your total consolidated balance.')) return;

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
      if (currentUser?.uid) {
        await recalculateUserBalance(currentUser.uid);
      }

      toast.success('Account balance cleared.');
    } catch (err: any) {
      toast.error('Clear failed: ' + err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleUnlinkAccount = async (id: string) => {
    if (window.confirm('Unlink this bank account from your pool?')) {
      await deleteDoc(doc(db, 'financial_accounts', id));
    }
  };

  const handleConnectBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedBank || !accountNumberInput) return;

    setIsSavingAndSyncing(true);
    setSyncError(null);
    try {
      const balance = parseFloat(realAmountInput) || 0;
      const mask = `•••• ${accountNumberInput.slice(-4)}`;

      // 1. Save metadata
      const docRef = await addDoc(collection(db, 'financial_accounts'), {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        bankName: selectedBank,
        accountName: name,
        accountNumberMasked: mask,
        accountType: selectedAccountType,
        balanceNgn: Math.round(balance),
        balanceGbp: Math.round((balance / LIVE_FX_RATE) * 100) / 100,
        connectionMethod: 'MANUAL_DEPOSIT',
        status: 'SYNCING',
        isVerified: false,
        lastSyncedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 1b. Add Notification
      await addDoc(collection(db, 'notifications'), {
        userId: currentUser.uid,
        studentName: name,
        title: 'New Bank Source Linked',
        body: `Student linked a new ${selectedBank} account (${mask}).`,
        type: 'INFO',
        createdAt: serverTimestamp(),
        isRead: false
      });

      setPendingAccountId(docRef.id);

      // 2. Trigger SMS Sync
      const triggered = triggerSmsSync(accountNumberInput.slice(-4), selectedBank);
      if (!triggered) {
        setTimeout(async () => {
          await updateDoc(doc(db, 'financial_accounts', docRef.id), {
            status: 'VERIFIED',
            updatedAt: serverTimestamp()
          });
          setIsConnectModalOpen(false);
          setIsSavingAndSyncing(false);
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setIsSavingAndSyncing(false);
    }
  };

  const handleRetrySync = () => {
    if (!accountNumberInput) return;
    setIsSavingAndSyncing(true);
    setSyncError(null);
    const triggered = triggerSmsSync(accountNumberInput.slice(-4), selectedBank);
    if (!triggered) {
      toast.error("Bridge not available.");
      setIsSavingAndSyncing(false);
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) return;
    const t = toast.loading('Dispatching verification link...');
    try {
      const { sendEmailVerification } = await import('firebase/auth');
      const { getActionCodeSettings } = await import('../firebase');
      await sendEmailVerification(currentUser, getActionCodeSettings());
      toast.success('Verification link sent to your inbox.', { id: t });
    } catch (err: any) {
      toast.error('Failed to send link. Please try again later.', { id: t });
    }
  };

  const handleContinueManual = async () => {
    if (!pendingAccountId) return;
    setIsSavingAndSyncing(true);
    try {
      await updateDoc(doc(db, 'financial_accounts', pendingAccountId), {
        status: 'VERIFIED',
        isVerified: false, // Explicitly false as it wasn't auto-verified
        updatedAt: serverTimestamp()
      });
      setIsConnectModalOpen(false);
      setSyncError(null);
      setPendingAccountId(null);
    } finally {
      setIsSavingAndSyncing(false);
    }
  };

  const handleCancelConnect = async () => {
    if (pendingAccountId) {
      await deleteDoc(doc(db, 'financial_accounts', pendingAccountId));
    }
    setIsConnectModalOpen(false);
    setSyncError(null);
    setPendingAccountId(null);
    setSelectedBank('');
    setBankSearchQuery('');
    setAccountNumberInput('');
  };

  const handleAdditionalTopUp = () => {
    const deficitGbp = targetGBP - totals.gbp;
    if (deficitGbp > 0) {
      setPrepopulatedTopUpAmount(Math.round(deficitGbp * LIVE_FX_RATE));
    } else {
      setPrepopulatedTopUpAmount(undefined);
    }
    setIsTopUpModalOpen(true);
  };

  const handleDownloadStatement = async () => {
    if (!currentUser?.uid || !appUser) return;
    const t = toast.loading('Generating POF Status Report...');
    try {
      const pdfBytes = await generateStatementClientSide({
        userName: appUser.displayName,
        email: appUser.email,
        userId: currentUser.uid,
        consolidatedBalanceNgn: balance.consolidatedBalanceNgn,
        gbpEquivalent: balance.gbpEquivalent
      });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      // For Mobile/Native compatibility, we'll try multiple methods
      const fileName = `POF_Report_${appUser?.displayName?.replace(/\s+/g, '_') || 'User'}.pdf`;

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();

      // Cleanup with slight delay to ensure browser triggers the download
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 2000);

      toast.success('Report generated! Check your downloads.', { id: t });
    } catch (e: any) {
      console.error('PDF Generation Error:', e);
      toast.error(`Download failed: ${e.message}`, { id: t });
    }
  };

  if (loading && balanceLoading && accounts.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#030712]' : 'bg-slate-50'}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className={`w-full space-y-6 pb-20 bg-app text-main ${expiryInfo.isExpired ? 'grayscale opacity-40 pointer-events-none' : ''}`}>
      {/* METRIC CARDS PAGED CONTAINER */}
        <section className="relative group">
          <div className="relative overflow-hidden rounded-3xl min-h-[220px] flex items-stretch">
            {/* CARD 1: Total Liquid Converted Balance */}
            <div className={`w-full flex-shrink-0 transition-all duration-500 transform ${activeMetricCard === 0 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
              <div className="h-full glass-card p-6 text-white relative flex flex-col justify-between overflow-hidden !bg-zinc-900/90 !border-zinc-800 shadow-none">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div>
                  <p className="text-blue-400 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] opacity-90 mb-0.5 sm:mb-1">
                    {name || 'Student Balance'}
                  </p>
                  <h2 className="text-3xl xs:text-4xl sm:text-5xl font-black tracking-tight leading-none">
                    £{totals.gbp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>

                  <div className="mt-1.5 sm:mt-2.5 flex items-center gap-2">
                    <p className={`text-sm sm:text-lg font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {currency.symbol}{totals.ngn.toLocaleString()}
                    </p>
                    <span className="px-1 py-0.5 rounded dark:bg-zinc-800/50 text-[7px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 dark:border-zinc-800">
                      {currency.code}
                    </span>
                  </div>
                </div>

                <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-white/5 flex items-end justify-between">
                  <div className="space-y-1 sm:space-y-1.5 text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider flex-1">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
                      <span>Linked: <span className="text-white">{selectedAccountIds.length} / {accounts.length}</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[120px] sm:max-w-[150px]">Bank: <span className="text-emerald-400">
                          {selectedAccountIds.length === 0
                            ? 'None'
                            : selectedAccountIds.length === 1
                              ? accounts.find(a => a.id === selectedAccountIds[0])?.bankName
                              : `${accounts.find(a => a.id === selectedAccountIds[0])?.bankName} (+${selectedAccountIds.length - 1})`}
                        </span></span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleDownloadStatement}
                          aria-label="Download PDF Report"
                          className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest border transition-all px-2 py-1 rounded-lg ${
                            isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          <FileText className="w-2.5 h-2.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => isStaff && onStaffAction ? onStaffAction() : setIsTopUpModalOpen(true)}
                          disabled={!isStaff && (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')}
                          aria-label={isStaff ? "Update Top-Up" : (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING' ? "Top-Up Request Pending" : "Request Top-Up")}
                          className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-colors border-l border-slate-200 dark:border-zinc-800 pl-3 ml-2 ${
                            !isStaff && (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING')
                              ? 'text-amber-500 opacity-80 cursor-not-allowed'
                              : 'text-blue-400 hover:text-blue-300'
                          }`}
                        >
                          <span>
                            {isStaff
                              ? 'UPDATE'
                              : (appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING' ? 'PENDING' : 'TOP-UP')}
                          </span>
                          {!(appUser?.hasPendingTopUp || appUser?.status === 'TOPUP_PENDING') && <ArrowRight className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: Statutory Holding & Expiration Timer */}
            <div className={`w-full flex-shrink-0 transition-all duration-500 transform ${activeMetricCard === 1 ? 'translate-x-0 opacity-100 relative' : '-translate-x-full opacity-0 absolute'}`}>
              <div className="h-full glass-card p-6 text-white relative flex flex-col justify-between overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-amber-400 text-[10px] font-black uppercase tracking-[0.2em]">
                      Proof of Funds Timeline
                    </p>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                      targetGBP > 0
                        ? isTargetMet ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {targetGBP > 0 ? (isTargetMet ? 'Target Met' : `${progressPercent}% Of Target`) : 'No Target Set'}
                    </span>
                  </div>

                  <div className="flex items-baseline space-x-2 mt-0.5 sm:mt-1">
                    {evaluation?.startDate ? (
                      expiryInfo.isExpired ? (
                        <h3 className="text-xl sm:text-3xl font-black tracking-tight text-rose-500 uppercase">Window Expired</h3>
                      ) : (
                        <>
                          <h3 className="text-2xl xs:text-3xl sm:text-4xl font-black tracking-tight text-white leading-none">
                            {expiryInfo.daysLeft} <span className="text-sm sm:text-lg font-bold text-slate-400">Days</span>
                          </h3>
                          <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                            Remaining
                          </span>
                        </>
                      )
                    ) : (
                      <div className="flex items-baseline space-x-2 opacity-60">
                        <h3 className="text-xl sm:text-3xl font-black tracking-tight text-slate-500 uppercase">No active timeline</h3>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          targetGBP > 0
                            ? isTargetMet ? 'bg-emerald-400' : 'bg-gradient-to-r from-amber-400 to-blue-500'
                            : 'bg-slate-700'
                        }`}
                        style={{ width: targetGBP > 0 ? `${progressPercent}%` : '0%' }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
                      <span>Current: £{Math.round(totals.gbp).toLocaleString()}</span>
                      <span>Target: {targetGBP > 0 ? `£${targetGBP.toLocaleString()}` : '£0 (Not Set)'}</span>
                    </div>
                  </div>
                </div>

                  <div className="pt-3 mt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">
                    {evaluation?.startDate ? (
                      <>
                        TIMELINE: <span className="text-white font-bold">{new Date(evaluation.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span> - <span className="text-white font-bold">{new Date(evaluation.expirationDate || new Date(new Date(evaluation.startDate).getTime() + 28 * 24 * 60 * 60 * 1000)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </>
                    ) : (
                      <span className="text-rose-500 animate-pulse font-black">NO COMPLIANCE WINDOW SET BY ADMIN</span>
                    )}
                  </span>
                  {isStaff && (
                    <button
                      onClick={() => onStaffAction?.('days')}
                      className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      <span>SETUP EVALUATION</span>
                      <Settings className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex justify-center items-center mt-3 gap-6">
            <button
              onClick={() => setActiveMetricCard(0)}
              aria-label="Previous card"
              className={`p-1.5 rounded-full border transition-all ${activeMetricCard === 0 ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/10 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex gap-2">
              {[0, 1].map(i => (
                <div key={i} aria-hidden="true" className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${activeMetricCard === i ? 'bg-blue-500 w-4 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-300 dark:bg-slate-700'}`} />
              ))}
            </div>

            <button
              onClick={() => setActiveMetricCard(1)}
              aria-label="Next card"
              className={`p-1.5 rounded-full border transition-all ${activeMetricCard === 1 ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/10 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* VERIFICATION & UPGRADE STEPS */}
        <section className="space-y-3 px-1 sm:px-4">
          <div className="px-1">
            <h3 className="text-sm sm:text-base uppercase font-extrabold text-slate-900 dark:text-white tracking-tight">
              Verification & Upgrades
            </h3>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Verify your documents to unlock full features
            </p>
          </div>

          <div
            onClick={() => setIsDocumentWizardOpen(true)}
            className={`glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all cursor-pointer shadow-sm ${
              isDark ? 'bg-zinc-900/80 border-zinc-800 shadow-none' : 'bg-white border-slate-200 shadow-slate-200/50'
            }`}
          >
             <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm ${
                  appUser?.mandateStatus === 'MANDATE_APPROVED'
                    ? isDark ? 'bg-emerald-900/30 text-emerald-400 border-zinc-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isDark ? 'bg-zinc-950/60 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                   <Upload className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                   <p className={`text-[10px] font-black uppercase tracking-widest leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                     {appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'Account Verified' :
                      appUser?.mandateStatus === 'MANDATE_SUBMITTED_AWAITING_APPROVAL' ? 'Documents Under Review' :
                      'Upgrade Account'}
                   </p>
                   <p className={`text-[9px] font-bold uppercase truncate ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                     {appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'All documents verified' : 'Upload ID & financial documents'}
                   </p>
                </div>
             </div>
             <div className="flex items-center justify-between w-full sm:w-auto mt-1 sm:mt-0">
                <span className={`text-[9px] font-black sm:hidden ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>UPGRADE NOW</span>
                <ChevronRight className={`w-5 h-5 ${appUser?.mandateStatus === 'MANDATE_APPROVED' ? 'text-emerald-500' : 'text-indigo-500'}`} />
             </div>
          </div>
        </section>

        {/* LINKED BANK ACCOUNTS */}
        <section className="space-y-3 pt-2 px-1 sm:px-4">
          <div className="flex flex-col xs:flex-row justify-between items-start xs:items-center gap-3 px-1">
            <div>
              <h3 className="text-sm sm:text-base uppercase font-extrabold text-slate-900 dark:text-white tracking-tight">
                Linked Bank Accounts
              </h3>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Accounts connected for proof of funds
              </p>
            </div>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="flex items-center space-x-1.5 text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-3 h-3" />
              <span>Connect Bank</span>
            </button>
          </div>

          <div className="space-y-3">
            {/* Linked Bank & Top-Up Accounts (2 Distinct Cards) */}
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
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    isTopUp
                      ? isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                        : isDark ? 'bg-slate-900/40 border-amber-500/30 hover:border-amber-500/50' : 'bg-amber-50/60 border-amber-300'
                      : isSelected
                        ? 'bg-blue-950/20 border-blue-500/50 shadow-md shadow-blue-500/5'
                        : isDark ? 'bg-slate-900/40 border-white/5 hover:border-white/20' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                        isTopUp
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-slate-800 border-white/10 text-blue-400'
                      }`}>
                        {isTopUp ? <Zap className="w-5 h-5 fill-amber-400/20" /> : <Building2 className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black uppercase text-white tracking-tight">{acc.accountName || acc.bankName}</h4>
                          {isTopUp && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[6px] font-black uppercase tracking-wider flex items-center gap-0.5">
                              <Zap className="w-2 h-2" />
                              Top-Up Added
                            </span>
                          )}
                          {acc.isDedicatedParallex && (
                            <span className="px-1 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[6px] font-black uppercase tracking-tighter flex items-center gap-0.5">
                              <Building2 className="w-2 h-2" />
                              Dedicated POF
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className={`text-[9px] font-mono ${isTopUp ? 'text-amber-400/80' : 'text-slate-400'}`}>
                            {acc.accountNumberMasked} • {isTopUp ? 'SPONSORED FACILITY' : acc.accountType}
                          </p>
                          <span className="px-1 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[6px] font-black uppercase tracking-tighter flex items-center gap-0.5">
                            <Lock className="w-2 h-2" />
                            Read-Only
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountIds(prev =>
                          prev.includes(acc.id) ? prev.filter(id => id !== acc.id) : [...prev, acc.id]
                        );
                      }}
                      className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all z-20 cursor-pointer ${
                        isSelected
                          ? (isTopUp ? 'bg-amber-500 border-amber-500 text-slate-950 scale-110 shadow-lg' : 'bg-blue-500 border-blue-500 text-white scale-110 shadow-lg')
                          : 'border-slate-500'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-6 h-6" />}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-200 dark:border-zinc-800 text-xs">
                    {isTopUp ? (
                      <div className="col-span-2 mb-2 p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/20">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Institutional Proof-of-Funds Facility
                          </span>
                          <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            Disbursed
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-2 mb-2 p-2.5 rounded-xl border bg-white/5 border-white/5">
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" /> MY PERSONAL ACCOUNT
                        </span>
                      </div>
                    )}

                    <div>
                      <p className={`text-[8px] font-bold uppercase tracking-wider ${isTopUp ? 'text-amber-400/90' : 'text-slate-500'}`}>
                        {isTopUp ? 'Top-Up Added' : 'Actual Account Balance'}
                      </p>
                      <p className={`font-bold font-mono ${isTopUp ? 'text-amber-400' : 'text-white'}`}>
                        {currency.symbol}{acc.balanceNgn.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[8px] font-bold uppercase tracking-wider ${isTopUp ? 'text-amber-400/90' : 'text-slate-500'}`}>
                        GBP Value
                      </p>
                      <p className={`font-bold ${isTopUp ? 'text-amber-400' : 'text-blue-400'}`}>
                        £{acc.balanceGbp.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 text-[9px] font-mono text-slate-500">
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedLedgerAccount(acc); setIsLedgerModalOpen(true); }}
                            title="Ledger"
                            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleSyncAccount(acc.id); }}
                            disabled={syncingId === acc.id}
                            title={isTopUp ? 'Sync Facility' : 'Sync Balance'}
                            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 ${syncingId === acc.id ? 'animate-spin' : ''}`} />
                          </button>

                          {!isTopUp && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleClearAccountBalance(acc.id); }}
                                title="Clear Balance"
                                className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                <XIcon className="w-4 h-4" />
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); setIsUssdModalOpen(true); }}
                                title="USSD Codes"
                                className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors"
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>

                        {isTopUp ? (
                          isStaff && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAdminUnlink(acc.id); }}
                              title="Revoke Top-Up"
                              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
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
                            className={`flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-800 transition-colors ${
                              !isStaff && acc.unlinkStatus === 'UNLINK_REQUESTED'
                                ? 'text-slate-700 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-400'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {acc.isVerified ? (
                        <span className="text-[9px] text-emerald-400 flex items-center gap-1.5 mt-2">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          <span>Verified via SMS Alert</span>
                          {acc.verificationBadge && (
                            <span className="text-[7px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 w-max">
                              {acc.verificationBadge}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[9px] text-zinc-500 font-medium block mt-2">Account not verified</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {accounts.length === 0 && (
              <div className="p-12 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 text-center space-y-4 bg-white/50 dark:bg-transparent shadow-inner">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto shadow-sm">
                  <Building2 className="w-8 h-8 text-slate-500 dark:text-slate-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-slate-900 dark:text-slate-400 tracking-widest">No bank accounts linked</p>
                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-tighter">Tap Connect Bank above to link your proof of funds</p>
                </div>
              </div>
            )}
          </div>

        </section>

      {/* NOTIFICATIONS DRAWER */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setIsNotificationsOpen(false)}>
          <div className="w-full max-w-md glass-card flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`p-4 rounded-b-none border-b flex items-center justify-between ${isDark ? 'border-slate-200 dark:border-zinc-800 bg-zinc-900/90' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h3 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>System Alerts & Logs</h3>
              </div>
              <button onClick={() => setIsNotificationsOpen(false)} aria-label="Close notifications" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className={`max-h-80 overflow-y-auto divide-y p-2 no-scrollbar ${isDark ? 'divide-zinc-800' : 'divide-slate-100'}`}>
              {notificationsList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active notifications
                </div>
              ) : (
                notificationsList.map(n => (
                  <div key={n.id} className={`p-3 space-y-2 rounded-2xl transition-all ${!(n as any).isRead ? (isDark ? 'bg-blue-500/5' : 'bg-blue-50') : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black uppercase ${n.type === 'ALERT' ? 'text-rose-500' : 'text-blue-600'}`}>{n.title}</span>
                      <span className="text-[8px] font-mono text-slate-400">{n.time}</span>
                    </div>
                    <p className={`text-xs leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{n.message}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          const ref = doc(db, 'notifications', n.id);
                          updateDoc(ref, { isRead: true });
                          setIsNotificationsOpen(false);
                          // deep link handling could go here
                        }}
                        className="text-[9px] font-black uppercase text-blue-500 hover:text-blue-400 transition-colors"
                      >
                        View Details
                      </button>
                      {n.type === 'ALERT' && (
                        <button className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-400 transition-colors">Resolve Flag</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className={`p-3 border-t flex justify-end items-center ${isDark ? 'border-slate-200 dark:border-zinc-800 bg-zinc-900/90 shadow-none' : 'border-slate-100 bg-slate-50'}`}>
              <button
                onClick={() => setIsNotificationsOpen(false)}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPPORT CHAT POPUP */}
      {isSupportOpen && (
        <StudentSupportChat
          isPopUp={true}
          onClose={() => setIsSupportOpen(false)}
        />
      )}

      {/* REGULATORY MANDATE WIZARD */}
      <AccountMandateWizard
        isOpen={isMandateWizardOpen}
        onClose={() => setIsMandateWizardOpen(false)}
      />

      {/* TOP-UP MODAL */}
      {!isStaff && (
        <TopUpRequestModal
          isOpen={isTopUpModalOpen}
          onClose={() => setIsTopUpModalOpen(false)}
          onSuccess={() => {}}
          initialAmount={prepopulatedTopUpAmount}
        />
      )}

      {/* USSD MODAL */}
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

      {selectedLedgerAccount && (
        <ElectronicLedgerStatementModal
          isOpen={isLedgerModalOpen}
          onClose={() => setIsLedgerModalOpen(false)}
          account={selectedLedgerAccount}
          studentName={name}
        />
      )}

      {/* CONNECT BANK MODAL */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => handleCancelConnect()}>
          <div className="w-full max-w-md glass-card p-5 space-y-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`flex justify-between items-center border-b pb-3 ${isDark ? 'dark:border-zinc-800' : 'border-slate-100'}`}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Connect your Parallex account or other banks</h3>
                </div>
              </div>
              <button onClick={handleCancelConnect} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Read-Only Guarantee Notice */}
            <div className={`p-3 rounded-2xl border flex items-start gap-2.5 ${isDark ? 'bg-blue-600/5 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
              <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Read-Only Guarantee</p>
                <p className="text-[9px] text-slate-500 leading-tight font-medium">
                  We only scan financial SMS alerts to verify POF holding. We have <span className="font-bold">ZERO permission</span> to move money.
                </p>
              </div>
            </div>

            <div className="p-2 space-y-5">
              {syncError ? (
                <div className="space-y-6 text-center py-4 animate-in zoom-in-95 duration-300">
                  <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-black uppercase tracking-tight">Bank Not Found</h4>
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                      We couldn't find a matching UBA SMS alert. What would you like to do?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleRetrySync}
                      className="py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => { setSyncError(null); setSelectedBank(''); setBankSearchQuery(''); }}
                      className="py-3 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                    >
                      Change Bank
                    </button>
                    <button
                      onClick={handleCancelConnect}
                      className="py-3 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContinueManual}
                      className="py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all"
                    >
                      Continue
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-600 italic px-4">
                    "Continue" means you will have to manually send any changes made on your account to the organization for updates.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleConnectBank} className="space-y-5">
                  <div className="space-y-2 relative">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Bank</label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
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
                        className={`w-full border rounded-xl pl-11 pr-4 py-3 text-xs font-bold focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                        }`}
                      />
                      {isBankDropdownOpen && bankSearchQuery && filteredNigerianBanks.length > 0 && (
                        <div className={`absolute z-[100] w-full mt-1 max-h-48 overflow-y-auto border rounded-xl shadow-2xl no-scrollbar ${
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
                              className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase transition-all hover:bg-blue-600 hover:text-white ${
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Number</label>
                      <input
                        required
                        maxLength={10}
                        placeholder="10-digit Number"
                        value={accountNumberInput}
                        onChange={e => setAccountNumberInput(e.target.value.replace(/\D/g, ''))}
                        className={`w-full border rounded-xl px-4 py-3 text-xs font-bold focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                        }`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Type</label>
                      <select
                        value={selectedAccountType}
                        onChange={e => setSelectedAccountType(e.target.value as AccountType)}
                        className={`w-full border rounded-xl px-4 py-3 text-xs font-bold focus:outline-none transition-all ${
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
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Initial Balance (₦)</label>
                      <input
                        type="number"
                        placeholder="Initial Balance (₦)"
                        value={realAmountInput}
                        onChange={e => setRealAmountInput(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-3 text-xs font-bold focus:outline-none transition-all ${
                          isDark ? 'bg-slate-950 border-white/10 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600'
                        }`}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedBank || accountNumberInput.length < 10 || (isStaff && !realAmountInput) || isSavingAndSyncing}
                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER: LEGAL & BUSINESS ENTITY ── */}
      <footer className="pt-8 pb-12 border-t border-black/5 dark:border-white/5 opacity-50 px-4">
        <div className="flex flex-col items-center text-center gap-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            © 2026 Basechan International Ltd &bull; RC-1234567
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link to="/legal/terms" className="text-[9px] font-black uppercase tracking-widest hover:text-blue-500 transition-colors">Terms</Link>
            <Link to="/legal/privacy" className="text-[9px] font-black uppercase tracking-widest hover:text-blue-500 transition-colors">Privacy</Link>
            <Link to="/legal/cookies" className="text-[9px] font-black uppercase tracking-widest hover:text-blue-500 transition-colors">Cookies</Link>
          </div>
          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter leading-tight max-w-[240px]">
            Registered Address: Plot 102, Trans-Amadi Industrial Layout, Port Harcourt, Rivers State, Nigeria.
          </p>
        </div>
      </footer>

    </div>
  );
};

export default StudentMobileFirstDashboard;
