import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdropVariants, drawerVariants } from '../utils/motionPresets';
import {
  X as XIcon, User, Globe, CreditCard, Save, Loader2, TrendingUp, Sliders, Activity,
  Clock, History, ShieldAlert, ChevronRight, Zap, FileText, Trash2, Edit3, ShieldCheck,
  Layers, Settings, X, CheckCircle2
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
import { resolveCountryCurrency } from '../utils/currencyResolver';

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
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [pofEvaluation, setPofEvaluation] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

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
    manualReason: '',
    balanceSubMode: 'deposit' as 'deposit' | 'deduct',
    expirationDate: '',
    isTimerActive: false,
    timerCustomMessage: ''
  });

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
          timerCustomMessage: evalData.timerCustomMessage || ''
        }));
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

    if (activeTab === 'activity') {
      setLoadingLogs(true);
      const q = query(collection(db, 'audit_logs'), where('studentId', '==', uid), orderBy('createdAt', 'desc'), limit(30));
      return onSnapshot(q, (snap) => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoadingLogs(false);
      });
    }
  }, [isOpen, student, activeTab]);

  const handleSaveField = async (field: string, value: any) => {
    const uid = student.userId || student.id;
    setIsSaving(true);
    try {
      const updates: any = { [field]: value, updatedAt: serverTimestamp() };
      if (field === 'targetCountry' && !student.targetCurrency) {
        updates.targetCurrency = resolveCountryCurrency(value);
      }
      await updateDoc(doc(db, 'users', uid), updates);
      toast.success(`${field.toUpperCase()} updated`);
      setEditingField(null);
    } catch (e: any) {
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

  if (!isOpen || !student) return null;

  // Task 2: Data Resolution
  const origin = student.currentCountry || student.originCountry || 'Nigeria';
  const destination = student.targetCountry || 'Canada';
  const currency = student.targetCurrency || resolveCountryCurrency(destination);

  const renderInlineEdit = (field: string, label: string, currentVal: string) => {
    const isEditing = editingField === field;
    return (
      <div className="space-y-1 py-2">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{label}</span>
        <div className="flex items-center justify-between group">
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1 animate-in fade-in slide-in-from-left-2 duration-300">
              <input
                autoFocus
                className="flex-1 bg-slate-950/60 border border-amber-500/50 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none"
                defaultValue={currentVal}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveField(field, editValue || currentVal)}
              />
              <button onClick={() => handleSaveField(field, editValue || currentVal)} className="p-2 bg-emerald-600 text-white rounded-lg"><Save className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingField(null)} className="p-2 bg-slate-800 text-slate-400 rounded-lg"><XIcon className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-white uppercase">{currentVal || 'N/A'}</p>
              <button onClick={() => { setEditValue(currentVal); setEditingField(field); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-amber-500 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
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
                    activeTab === tab.id ? 'bg-amber-500 text-slate-950 shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-slate-200 dark:border-zinc-800'
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
                      {renderInlineEdit('displayName', 'Display Name', student.displayName || student.name)}
                      {renderInlineEdit('email', 'Email Address', student.email)}
                      {renderInlineEdit('phoneNumber', 'Phone Number', student.phoneNumber)}
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
                  <div className="space-y-4">
                    <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-amber-500"><TrendingUp className="w-4 h-4" /></div><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Balance Adjustments</h4></div>
                    <div className="bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[2rem] p-6 space-y-4">
                      <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-200 dark:border-zinc-800">
                        {['deposit', 'deduct'].map(m => (
                          <button key={m} onClick={() => setEditForm({...editForm, balanceSubMode: m as any})} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${editForm.balanceSubMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-500'}`}>{m}</button>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Amount (₦)</label>
                        <input type="number" value={editForm.manualAmount} onChange={e => setEditForm({...editForm, manualAmount: parseFloat(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold text-white" />
                      </div>
                      <textarea placeholder="Audit reason..." value={editForm.manualReason} onChange={e => setEditForm({...editForm, manualReason: e.target.value})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs text-white h-24 resize-none" />
                      <button onClick={handleCommitManualAdjustment} disabled={isSaving || !editForm.manualReason.trim()} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg flex items-center justify-center gap-2">{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Commit Adjustment</button>
                    </div>
                  </div>
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
