import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdropVariants, drawerVariants } from '../utils/motionPresets';
import {
  X as XIcon, User, Globe, CreditCard, Save, Loader2, TrendingUp, Sliders, Activity,
  Clock, History, ShieldAlert, ChevronRight, Zap, FileText, Trash2, Edit3, ShieldCheck,
  Layers, Settings, X, CheckCircle2, Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  doc, updateDoc, collection, query, where, orderBy,
  limit, onSnapshot, serverTimestamp, getDocs, setDoc, addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { LIVE_FX_RATE } from '../constants';
import { resolveCountryCurrency, getCurrencyCode } from '../utils/currencyResolver';
import { convertCurrency } from '../utils/exchangeRateEngine';

interface AdminStudentProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  onUpdate?: () => void;
  initialTab?: 'profile' | 'activity' | 'documents' | 'governance';
  highlightEventId?: string | null;
}

interface RequirementItem {
  id: string;
  label: string;
  type: 'TEXT' | 'IMAGE' | 'DOC' | 'PDF';
  description: string;
  isRequired: boolean;
  stage?: number;
  templateUrl?: string;
}

export const AdminStudentProfileDrawer: React.FC<AdminStudentProfileDrawerProps> = ({
  isOpen,
  onClose,
  student,
  onUpdate,
  initialTab = 'profile',
}) => {
  const { theme } = useTheme();
  const { appUser } = useAuth();
  const isDark = theme === 'dark';
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'activity' | 'documents' | 'governance'>(initialTab);
  const [govSubTab, setGovSubTab] = useState<'config' | 'history'>('config');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [pofEvaluation, setPofEvaluation] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [liveStudent, setLiveStudent] = useState<any>(null);

  // Conversion Engine States
  const [inputAmount, setInputAmount] = useState<number>(0);
  const [inputCurrency, setInputCurrency] = useState<string>('NGN');
  const [isEditingStudentCurrency, setIsEditingStudentCurrency] = useState(false);
  const [adminOverriddenTargetCurrency, setAdminOverriddenTargetCurrency] = useState<string>('');

  // Derived student preference
  const studentTargetCurrency = useMemo(() => {
    return adminOverriddenTargetCurrency || liveStudent?.targetCurrency || getCurrencyCode(liveStudent?.destinationCountry) || 'GBP';
  }, [adminOverriddenTargetCurrency, liveStudent]);

  const studentTargetCountry = liveStudent?.destinationCountry || 'United Kingdom';

  // Derived auto-converted targets
  const calculatedNgnTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, 'NGN');
  }, [inputAmount, inputCurrency]);

  const calculatedStudentTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, studentTargetCurrency);
  }, [inputAmount, inputCurrency, studentTargetCurrency]);

  const calculatedGbpTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, 'GBP');
  }, [inputAmount, inputCurrency]);

  // Task 3: Inline Editing States
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const [editForm, setEditForm] = useState({
    phoneNumber: student?.phoneNumber || '',
    sponsorRelationship: student?.sponsorRelationship || '',
    isVerified: student?.isVerified || false,
    topUpFeePercentage: student?.topUpPricingConfig?.topUpFeePercentage || 2.5,
    flatProcessingFeeNgn: student?.topUpPricingConfig?.flatProcessingFeeNgn || 5000,
    maxAllowedTopUpNgn: student?.topUpPricingConfig?.maxAllowedTopUpNgn || 15000000,
    userName: student?.name || '',
    targetGBP: 0,
    consecutiveDays: 0,
    totalTargetDays: 28,
    manualAmount: 0,
    manualDays: 0,
    manualReason: '',
    balanceSubMode: 'deposit' as 'deposit' | 'deduct',
    daysSubMode: 'add' as 'add' | 'set',
    manualAdjustmentMode: 'balance' as 'balance' | 'days',
    expirationDate: '',
    isTimerActive: false,
    timerCustomMessage: '',
    // New Governance Layout States
    timerStart: '',
    localCurrency: 'NGN'
  });

  const calculatedEndDate = useMemo(() => {
    if (!editForm.timerStart) return null;
    const start = new Date(editForm.timerStart);
    const duration = parseInt(editForm.totalTargetDays.toString()) || 28;
    const end = new Date(start.getTime() + (duration * 24 * 60 * 60 * 1000));
    return end.toISOString().split('T')[0];
  }, [editForm.timerStart, editForm.totalTargetDays]);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Sync with student prop and pof_evaluations
  useEffect(() => {
    if (!isOpen || !student) return;
    const uid = student.userId || student.id;

    // Listen to user doc for up-to-date fields
    const unsubUser = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveStudent({ id: uid, ...data });
        setEditForm(prev => ({
          ...prev,
          phoneNumber: data.phoneNumber || '',
          sponsorRelationship: data.sponsorRelationship || '',
          isVerified: data.isApproved || data.isVerified || false,
          topUpFeePercentage: data.topUpPricingConfig?.topUpFeePercentage || 2.5,
          flatProcessingFeeNgn: data.topUpPricingConfig?.flatProcessingFeeNgn || 5000,
          maxAllowedTopUpNgn: data.topUpPricingConfig?.maxAllowedTopUpNgn || 15000000,
          userName: data.displayName || data.name || ''
        }));
      }
    });

    // Listen to pof_evaluations
    const q = query(collection(db, 'pof_evaluations'), where('userId', '==', uid));
    const unsubEval = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const evalData = snap.docs[0].data();
        setPofEvaluation({ id: snap.docs[0].id, ...evalData });
        const start = evalData.startDate ? new Date(evalData.startDate).getTime() : null;
        const days = start ? Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), 28) : 0;
        setEditForm(prev => ({
          ...prev,
          targetGBP: evalData.targetGBP || 0,
          consecutiveDays: days,
          expirationDate: evalData.expirationDate || '',
          isTimerActive: evalData.isTimerActive || false,
          timerCustomMessage: evalData.timerCustomMessage || '',
          timerStart: evalData.startDate || '',
          totalTargetDays: evalData.durationDays || 28,
          localCurrency: evalData.localCurrency || 'NGN'
        }));
        setInputAmount(Number(evalData.targetAmountNgn) || 0);
        if (evalData.inputCurrencyUsed) setInputCurrency(evalData.inputCurrencyUsed);
        if (evalData.targetCurrency) setAdminOverriddenTargetCurrency(evalData.targetCurrency);
      }
    });

    return () => { unsubUser(); unsubEval(); };
  }, [isOpen, student]);

  // Fetch Submissions & Logs
  useEffect(() => {
    if (!isOpen || !student) return;
    const uid = student.userId || student.id;

    if (activeTab === 'documents') {
      const q = query(collection(db, 'users', uid, 'submitted_documents'));
      return onSnapshot(q, (snap) => setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }

    if (activeTab === 'governance') {
      const q = query(collection(db, 'liquidity_requests'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }

    if (activeTab === 'activity') {
      setLoadingLogs(true);
      const q = query(collection(db, 'audit_logs'), where('studentId', '==', uid), orderBy('createdAt', 'desc'), limit(30));
      return onSnapshot(q, (snap) => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingLogs(false);
      });
    }
  }, [isOpen, student, activeTab]);

  const handleSaveGovernance = async () => {
    setIsSaving(true);
    const uid = student.userId || student.id;
    try {
        const start = editForm.timerStart || new Date().toISOString().split('T')[0];
        const duration = parseInt(editForm.targetDays) || 28;
        const end = new Date(new Date(start).getTime() + (duration * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

        const updates: any = {
            targetGBP: calculatedGbpTarget,
            targetAmountNgn: calculatedNgnTarget,
            targetAmountForeign: calculatedStudentTarget,
            targetCurrency: studentTargetCurrency,
            inputCurrencyUsed: inputCurrency,
            startDate: start,
            expirationDate: end,
            durationDays: duration,
            localCurrency: editForm.localCurrency || 'NGN',
            updatedAt: serverTimestamp()
        };

        // 1. Update user profile for global sync
        await updateDoc(doc(db, 'users', uid), {
            targetAmountNgn: updates.targetAmountNgn,
            targetAmountForeign: updates.targetAmountForeign,
            targetCurrency: updates.targetCurrency,
            inputCurrencyUsed: updates.inputCurrencyUsed,
            targetGBP: updates.targetGBP,
            updatedAt: serverTimestamp()
        });

        // 2. Update evaluation record
        if (pofEvaluation) {
            await updateDoc(doc(db, 'pof_evaluations', pofEvaluation.id), updates);
        } else {
            await setDoc(doc(db, 'pof_evaluations', uid), {
                ...updates,
                userId: uid,
                userName: liveStudent?.displayName || student.name || 'Student',
                userEmail: liveStudent?.email || student.email || '',
                createdAt: serverTimestamp()
            }, { merge: true });
        }

        await addDoc(collection(db, 'audit_logs'), {
            actor: appUser?.displayName || 'Admin',
            action: 'GOVERNANCE_CONFIG_UPDATE',
            detail: `Updated POF targets: ${studentTargetCurrency} ${calculatedStudentTarget.toLocaleString()} (₦${calculatedNgnTarget.toLocaleString()})`,
            studentId: uid,
            createdAt: serverTimestamp()
        });

        toast.success('Governance configuration applied');
        if (onUpdate) onUpdate();
    } catch (e: any) {
        toast.error('Failed to save configuration: ' + e.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleSaveField = async (field: string, value: any) => {
    const uid = student.userId || student.id;
    if (!uid) {
      toast.error("User ID not found");
      return;
    }
    setIsSaving(true);
    try {
      const updates: any = { [field]: value, updatedAt: serverTimestamp() };
      if (field === 'targetCountry' && !student.targetCurrency) {
        updates.targetCurrency = resolveCountryCurrency(value);
      }
      // Also update name in pof_evaluations if name is changed
      if ((field === 'displayName' || field === 'name') && pofEvaluation) {
        await updateDoc(doc(db, 'pof_evaluations', pofEvaluation.id), {
          userName: value,
          updatedAt: serverTimestamp()
        });
      }
      // If email is changed, maybe update evaluation doc too?
      if (field === 'email' && pofEvaluation) {
        await updateDoc(doc(db, 'pof_evaluations', pofEvaluation.id), {
          userEmail: value,
          updatedAt: serverTimestamp()
        });
      }

      await updateDoc(doc(db, 'users', uid), updates);
      toast.success(`${field.toUpperCase()} updated`);
      setEditingField(null);
    } catch (e: any) {
      console.error(`Error updating field ${field}:`, e);
      toast.error('Update failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTopUpSettings = async () => {
    const uid = student.userId || student.id;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        topUpPricingConfig: {
          topUpFeePercentage: Number(editForm.topUpFeePercentage),
          flatProcessingFeeNgn: Number(editForm.flatProcessingFeeNgn),
          maxAllowedTopUpNgn: Number(editForm.maxAllowedTopUpNgn),
          updatedAt: new Date()
        },
        updatedAt: serverTimestamp()
      });
      toast.success('Pricing updated');
    } catch (e) {
      toast.error('Failed to update pricing');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommitManualAdjustment = async () => {
    if (!editForm.manualReason.trim()) return toast.error('Audit reason required');
    const uid = student.userId || student.id;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'financial_accounts'), {
        userId: uid,
        userEmail: student.email,
        bankName: 'Manual Governance Adjustment',
        accountMask: '••••MANL',
        balanceNGN: editForm.balanceSubMode === 'deposit' ? editForm.manualAmount : -editForm.manualAmount,
        balanceGBP: (editForm.balanceSubMode === 'deposit' ? editForm.manualAmount : -editForm.manualAmount) / LIVE_FX_RATE,
        provider: 'MANUAL_OVERRIDE',
        status: 'ACTIVE',
        createdAt: serverTimestamp()
      });
      await addDoc(collection(db, 'audit_logs'), {
        actor: appUser?.displayName || 'Admin',
        action: 'MANUAL_BALANCE_ADJUSTMENT',
        detail: `${editForm.balanceSubMode.toUpperCase()} of ₦${editForm.manualAmount.toLocaleString()} for ${editForm.manualReason}`,
        studentId: uid,
        createdAt: serverTimestamp()
      });
      toast.success('Ledger adjusted');
      setEditForm(prev => ({ ...prev, manualAmount: 0, manualReason: '' }));
    } catch (e: any) {
      toast.error('Adjustment failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommitTimer = async () => {
    setIsSaving(true);
    const targetUid = student.userId || student.id;
    try {
      const updates = {
        expirationDate: editForm.isTimerActive ? editForm.expirationDate : null,
        timerCustomMessage: editForm.timerCustomMessage || null,
        isTimerActive: editForm.isTimerActive,
        updatedAt: serverTimestamp()
      };
      if (pofEvaluation) {
        await updateDoc(doc(db, 'pof_evaluations', pofEvaluation.id), updates);
      } else {
        await setDoc(doc(db, 'pof_evaluations', targetUid), {
          ...updates,
          userId: targetUid,
          userName: student.name,
          userEmail: student.email || '',
          createdAt: serverTimestamp()
        });
      }
      toast.success('Timer updated');
    } catch (e: any) {
      toast.error('Timer update failed: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !student) return null;

  // Task 2: Data Resolution
  const activeStudent = liveStudent || student;
  const origin = activeStudent.currentCountry || activeStudent.originCountry || 'Nigeria';
  const destination = activeStudent.targetCountry || 'Canada';
  const currency = activeStudent.targetCurrency || resolveCountryCurrency(destination);

  const renderInlineEdit = (field: string, label: string, currentVal: string) => {
    const isEditing = editingField === field;
    const displayVal = currentVal || '';

    return (
      <div className="space-y-1 py-2">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{label}</span>
        <div className="flex items-center justify-between group">
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
              <input
                autoFocus
                className="flex-1 bg-slate-950/60 border border-amber-500/50 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveField(field, editValue)}
              />
              <button onClick={() => handleSaveField(field, editValue)} className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"><Save className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingField(null)} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors"><XIcon className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-white uppercase">{displayVal || 'N/A'}</p>
              <button
                onClick={() => {
                  setEditValue(displayVal);
                  setEditingField(field);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-amber-500 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={modalBackdropVariants} initial="initial" animate="animate" exit="exit"
          className="fixed inset-0 z-[600] flex justify-end bg-slate-950/40 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            variants={drawerVariants} initial="initial" animate="animate" exit="exit"
            className="fixed right-0 top-0 bottom-0 h-screen w-full max-w-[420px] bg-zinc-900/90 backdrop-blur-[75px] border-l border-zinc-800 z-50 flex flex-col overflow-hidden rounded-l-3xl shadow-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 z-20 backdrop-blur-xl bg-slate-900/40">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-white">Governance Review</h3>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Config: {student.name}</p>
              </div>
              <button onClick={onClose} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all"><XIcon className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="flex px-6 pt-6 gap-2 flex-wrap shrink-0">
              {[
                { id: 'profile', label: 'Profile', icon: User },
                { id: 'governance', label: 'Governance', icon: Settings },
                { id: 'documents', label: 'Docs', icon: FileText },
                { id: 'activity', label: 'Logs', icon: History }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
              {activeTab === 'profile' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-amber-500"><User className="w-4 h-4" /></div><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personal Identity</h4></div>
                    <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-1">
                      {renderInlineEdit('displayName', 'Display Name', activeStudent.displayName || activeStudent.name)}
                      {renderInlineEdit('email', 'Email Address', activeStudent.email)}
                      {renderInlineEdit('phoneNumber', 'Phone Number', activeStudent.phoneNumber)}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-500"><Globe className="w-4 h-4" /></div><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Route & Target</h4></div>
                    <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-1">
                      {renderInlineEdit('currentCountry', 'Origin', origin)}
                      {renderInlineEdit('targetCountry', 'Destination', destination)}
                      {renderInlineEdit('targetCurrency', 'Currency', currency)}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-purple-500"><Sliders className="w-4 h-4" /></div><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Top-Up Pricing</h4></div>
                    <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-6">
                       <div className="flex justify-between items-center"><label className="text-[9px] font-black text-slate-400 uppercase">Service Fee</label><span className="text-sm font-black text-amber-500">{editForm.topUpFeePercentage}%</span></div>
                       <input type="range" min="0.5" max="15" step="0.1" value={editForm.topUpFeePercentage} onChange={e => setEditForm(prev => ({...prev, topUpFeePercentage: parseFloat(e.target.value)}))} className="w-full accent-amber-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer" />
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Flat Fee (₦)</label><input type="number" value={editForm.flatProcessingFeeNgn} onChange={e => setEditForm(prev => ({...prev, flatProcessingFeeNgn: parseInt(e.target.value)}))} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs text-white" /></div>
                          <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Limit (₦)</label><input type="number" value={editForm.maxAllowedTopUpNgn} onChange={e => setEditForm(prev => ({...prev, maxAllowedTopUpNgn: parseInt(e.target.value)}))} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs text-white" /></div>
                       </div>
                       <button onClick={handleSaveTopUpSettings} disabled={isSaving} className="w-full py-3 bg-white text-slate-950 rounded-xl text-[10px] font-black uppercase shadow-lg flex items-center justify-center gap-2">{isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Pricing</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'governance' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Governance Sub-Tab Switcher */}
                  <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => setGovSubTab('config')}
                      className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        govSubTab === 'config' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Window & Pricing Config
                    </button>
                    <button
                      onClick={() => setGovSubTab('history')}
                      className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        govSubTab === 'history' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Request Ledger & History
                    </button>
                  </div>

                  {govSubTab === 'config' ? (
                    <div className="space-y-8">
                      {/* Evaluation Window Parameters Header */}
                      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-2">
                        <Target className="w-4 h-4 text-indigo-500" />
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Evaluation Window Parameters</h4>
                      </div>

                      {/* POF Target Amount & Currency Card */}
                      <div className="rounded-[2rem] bg-white/5 p-6 border border-slate-200 dark:border-zinc-800 space-y-6">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-white uppercase tracking-wider">
                            POF Target Amount & Currency
                          </label>
                          {/* Student Choice Indicator Badge */}
                          <div className="flex items-center gap-2">
                            {isEditingStudentCurrency ? (
                              <div className="flex items-center gap-1 bg-indigo-950 border border-indigo-800 rounded-full pl-3 pr-1 py-1 shadow-sm">
                                <span className="text-[9px] font-black text-indigo-300 uppercase mr-1">Override:</span>
                                <select
                                  value={adminOverriddenTargetCurrency}
                                  onChange={(e) => setAdminOverriddenTargetCurrency(e.target.value)}
                                  className="bg-transparent text-[9px] font-bold text-indigo-300 border-none focus:ring-0 p-0 cursor-pointer"
                                >
                                  <option value="GBP">GBP (£)</option>
                                  <option value="CAD">CAD (C$)</option>
                                  <option value="USD">USD ($)</option>
                                  <option value="EUR">EUR (€)</option>
                                  <option value="AUD">AUD (A$)</option>
                                </select>
                                <button onClick={() => setIsEditingStudentCurrency(false)} className="p-1 hover:bg-indigo-900 rounded-full ml-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /></button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm">
                                Student Target: {studentTargetCurrency} ({studentTargetCountry})
                                <button onClick={() => setIsEditingStudentCurrency(true)} className="ml-1 p-1 hover:bg-white/5 rounded-full transition-all text-indigo-300"><Edit3 className="w-3 h-3" /></button>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Input Amount */}
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase block tracking-widest ml-1">Admin Entered Value</span>
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                value={inputAmount || ''}
                                onChange={(e) => setInputAmount(parseFloat(e.target.value) || 0)}
                                placeholder="e.g. 26000000"
                                className="w-full rounded-xl bg-slate-950 border border-slate-200 dark:border-zinc-800 py-3 pl-4 pr-24 text-sm font-bold text-white focus:border-indigo-500 transition-all focus:outline-none"
                              />
                              <select
                                value={inputCurrency}
                                onChange={(e) => setInputCurrency(e.target.value)}
                                className="absolute right-2 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] font-black text-slate-300 border-none focus:ring-0 cursor-pointer"
                              >
                                <option value="NGN">NGN (₦)</option>
                                <option value="CAD">CAD (C$)</option>
                                <option value="GBP">GBP (£)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                              </select>
                            </div>
                          </div>

                          {/* Live Preview Card */}
                          <div className="flex flex-col justify-center rounded-2xl bg-white/5 p-4 border border-slate-200 dark:border-zinc-800 shadow-inner">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Converted Requirement ({studentTargetCurrency})</span>
                            <p className="text-xl font-black text-indigo-400 font-mono">
                              {studentTargetCurrency} {calculatedStudentTarget.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                            <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">Equiv. NGN: ₦{calculatedNgnTarget.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Days Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Days</label>
                          <input
                            type="number"
                            value={editForm.totalTargetDays}
                            onChange={e => setEditForm({ ...editForm, totalTargetDays: parseInt(e.target.value) || 0 })}
                            className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-5 py-3.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Extension Days Allowed</label>
                          <input
                            type="number"
                            value={editForm.extensionDays}
                            onChange={e => setEditForm({ ...editForm, extensionDays: parseInt(e.target.value) || 0 })}
                            className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-5 py-3.5 text-sm font-bold text-blue-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Date & Local Currency Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Window Start Date</label>
                          <input
                            type="date"
                            value={editForm.timerStart}
                            onChange={e => setEditForm({ ...editForm, timerStart: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-5 py-3.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Local Currency</label>
                          <select
                            value={editForm.localCurrency}
                            onChange={e => setEditForm({ ...editForm, localCurrency: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-5 py-3.5 text-xs font-black text-white focus:border-amber-500 focus:outline-none"
                          >
                            {MAJOR_CURRENCIES.map(curr => (
                              <option key={curr.code} value={curr.code}>{curr.code} - {curr.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* End Date Summary Card */}
                      <div className="p-5 rounded-[2rem] bg-white/5 border border-slate-200 dark:border-zinc-800 flex items-center justify-between shadow-inner">
                         <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Calculated Maturity Date</p>
                            <p className="text-sm font-black text-indigo-400 uppercase mt-1">
                              {calculatedEndDate ? new Date(calculatedEndDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Pending Configuration'}
                            </p>
                         </div>
                         <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[8px] font-black uppercase tracking-tighter">
                            Statutory Maturity
                         </div>
                      </div>

                      {/* Manual Ledger Adjustment & Expiry Timer as Supplementary Sections */}
                      <div className="pt-4 space-y-8">
                         <div className="flex items-center gap-3 border-b border-white/5 pb-2">
                            <TrendingUp className="w-4 h-4 text-blue-500" />
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Secondary Ledger Overrides</h4>
                         </div>

                         <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-6">
                            <div className="flex p-1 bg-slate-950 rounded-xl border border-white/5">
                              {['balance', 'days'].map(m => (
                                <button key={m} onClick={() => setEditForm({...editForm, manualAdjustmentMode: m as any})} className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all ${editForm.manualAdjustmentMode === m ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{m}</button>
                              ))}
                            </div>

                            {editForm.manualAdjustmentMode === 'balance' ? (
                              <div className="space-y-4">
                                <div className="flex p-1 bg-slate-950 rounded-xl border border-white/5">
                                  {['deposit', 'deduct'].map(m => (
                                    <button key={m} onClick={() => setEditForm({...editForm, balanceSubMode: m as any})} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${editForm.balanceSubMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-600'}`}>{m}</button>
                                  ))}
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Override Amount (₦)</label>
                                  <input type="number" value={editForm.manualAmount} onChange={e => setEditForm({...editForm, manualAmount: parseFloat(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-lg font-black text-white focus:outline-none focus:border-blue-500" />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex p-1 bg-slate-950 rounded-xl border border-white/5">
                                  {['add', 'set'].map(m => (
                                    <button key={m} onClick={() => setEditForm({...editForm, daysSubMode: m as any})} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase transition-all ${editForm.daysSubMode === m ? 'bg-cyan-600 text-white' : 'text-slate-600'}`}>{m}</button>
                                  ))}
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">{editForm.daysSubMode === 'add' ? 'Days to Add' : 'Override Count'}</label>
                                  <input type="number" value={editForm.manualDays} onChange={e => setEditForm({...editForm, manualDays: parseInt(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-lg font-black text-white focus:outline-none focus:border-cyan-500" />
                                </div>
                              </div>
                            )}

                            <textarea placeholder="Reason for override..." value={editForm.manualReason} onChange={e => setEditForm({...editForm, manualReason: e.target.value})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-white h-20 resize-none focus:outline-none focus:border-indigo-500" />
                            <button onClick={handleCommitManualAdjustment} disabled={isSaving || !editForm.manualReason.trim()} className="w-full py-4 bg-gradient-to-tr from-blue-600 to-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                               {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Commit Adjustment
                            </button>
                         </div>

                         <div className="flex items-center gap-3 border-b border-white/5 pb-2">
                            <Clock className="w-4 h-4 text-rose-500" />
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Dashboard Access & Timer</h4>
                         </div>

                         <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/50 border border-white/5">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">Access Lockdown Timer</p>
                                <p className="text-[8px] font-bold text-slate-500 uppercase">Auto-lock dashboard after date</p>
                              </div>
                              <button
                                onClick={() => setEditForm({ ...editForm, isTimerActive: !editForm.isTimerActive })}
                                className={`w-12 h-7 rounded-full relative transition-all duration-300 ${editForm.isTimerActive ? 'bg-amber-500' : 'bg-slate-800'}`}
                              >
                                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${editForm.isTimerActive ? 'left-6' : 'left-1'}`} />
                              </button>
                            </div>

                            {editForm.isTimerActive && (
                              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Expiry Date</label>
                                  <input type="date" value={editForm.expirationDate} onChange={e => setEditForm({ ...editForm, expirationDate: e.target.value })} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500" />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1 flex items-center gap-1.5"><FileText className="w-3 h-3" /> Lockout Alert Message</label>
                                  <textarea rows={2} value={editForm.timerCustomMessage} onChange={e => setEditForm({ ...editForm, timerCustomMessage: e.target.value })} placeholder="Reason for lockdown..." className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-300 focus:outline-none focus:border-amber-500 transition-all resize-none" />
                                </div>
                              </div>
                            )}

                            <button onClick={handleCommitTimer} disabled={isSaving || (editForm.isTimerActive && !editForm.expirationDate)} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/10 hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50">
                               {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Access Control'}
                            </button>
                         </div>
                      </div>

                      {/* Primary Save Configuration Button */}
                      <button
                        onClick={handleSaveGovernance}
                        disabled={isSaving}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                      >
                         {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                         Apply Master Configuration
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                       <div className="flex items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-2">
                          <History className="w-4 h-4 text-indigo-500" />
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Liquidity Request Ledger</h4>
                       </div>

                       {requests.length === 0 ? (
                          <div className="py-16 text-center bg-white/5 rounded-[2rem] border-2 border-dashed border-white/5 opacity-40">
                             <CheckCheck className="w-8 h-8 text-emerald-500/40 mx-auto mb-3" />
                             <p className="text-[10px] font-black uppercase tracking-widest">No pending or historical requests</p>
                          </div>
                       ) : (
                          <div className="space-y-3">
                             {requests.map(req => (
                                <div key={req.id} className="p-5 rounded-2xl bg-white/5 border border-slate-200 dark:border-zinc-800 flex items-center justify-between group transition-all hover:border-indigo-500/30">
                                   <div className="flex items-center gap-4">
                                      <div className={`p-2.5 rounded-xl ${req.type === 'TOP_UP' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}><Zap className="w-4 h-4" /></div>
                                      <div>
                                         <p className="text-xs font-black text-white uppercase tracking-tight">{req.type.replace('_', ' ')}</p>
                                         <p className="text-[10px] font-mono text-slate-500 mt-0.5">{new Date(req.createdAt?.seconds * 1000).toLocaleDateString()} &bull; {req.paymentReference || 'NO REF'}</p>
                                      </div>
                                   </div>
                                   <div className="text-right">
                                      <p className="text-sm font-black text-white font-mono">£{req.amountGBP?.toLocaleString() || req.amount?.toLocaleString() || '0'}</p>
                                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border mt-1.5 inline-block ${
                                         req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                         req.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                         'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                      }`}>{req.status}</span>
                                   </div>
                                </div>
                             ))}
                          </div>
                       )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4" /> Checklist Compliance</h4>
                  <div className="space-y-3">
                    {submissions.map(sub => (
                      <div key={sub.id} className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/5 flex items-center justify-between group">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{sub.requirementLabel}</p>
                          <p className={`text-[8px] font-black uppercase mt-1 ${sub.status === 'APPROVED' ? 'text-emerald-500' : 'text-amber-500'}`}>{sub.status}</p>
                        </div>
                        <button onClick={() => window.open(sub.fileUrl, '_blank')} className="p-2 text-slate-400 hover:text-white transition-all"><ExternalLink className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {submissions.length === 0 && <div className="py-12 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-[2rem] opacity-30 text-[10px] font-black uppercase tracking-widest">No documents found</div>}
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                   {loadingLogs ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div> : auditLogs.map(log => (
                     <div key={log.id} className="p-4 rounded-2xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-2">
                        <div className="flex justify-between items-center"><span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">{log.action?.replace(/_/g, ' ')}</span><span className="text-[8px] font-mono text-slate-600">{new Date(log.createdAt?.seconds * 1000).toLocaleDateString()}</span></div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-medium">{log.detail || log.message}</p>
                        <p className="text-[8px] text-slate-500 uppercase font-black">Actor: {log.actor || 'System'}</p>
                     </div>
                   ))}
                   {auditLogs.length === 0 && !loadingLogs && <div className="py-12 text-center opacity-30 text-[10px] font-black uppercase tracking-widest">Empty Audit Stream</div>}
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-200 dark:border-zinc-800 bg-slate-950/40 shrink-0 flex justify-end">
              <button onClick={onClose} className="px-8 py-3 rounded-xl bg-white/5 border border-slate-200 dark:border-zinc-800 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all">Close Viewer</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: any = {
    CLEARED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    AT_RISK: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  };
  return <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[status] || styles.PENDING}`}>{status || 'PENDING'}</span>;
};
