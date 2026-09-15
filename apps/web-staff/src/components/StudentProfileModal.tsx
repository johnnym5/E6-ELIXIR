import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, Globe, Briefcase, CreditCard, PieChart, ShieldCheck,
  Mail, Phone, Edit3, Clock, Save, Trash2, RefreshCw, Sliders, Settings, Loader2, X, ChevronRight, Zap, History, Activity, Calendar, User
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, setDoc, query, collection, where, getDocs, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { executeSoftReset } from '../utils/softResetService';
import { purgeUserClientSide } from '../utils/governanceService';
import { getCurrencySymbol, resolveCountryCurrency } from '../utils/currencyResolver';

interface StudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditProfile?: () => void;
  onRequestTopUp?: () => void;
  userProfile: any;
  consolidatedBalance?: number;
  holdingProgress?: number;
  onUpdate?: () => void;
}

const EvaluationCountdown: React.FC<{ startDate: string; totalDays: number }> = ({ startDate, totalDays }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const start = new Date(startDate).getTime();
      const end = start + totalDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Completed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    const timer = setInterval(calculateTime, 1000);
    calculateTime();
    return () => clearInterval(timer);
  }, [startDate, totalDays]);

  return <span>{timeLeft}</span>;
};

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  isOpen,
  onClose,
  onEditProfile,
  onRequestTopUp,
  userProfile: initialUserProfile,
  consolidatedBalance = 0,
  holdingProgress = 0,
  onUpdate
}) => {
  const { theme } = useTheme();
  const { role } = useAuth();
  const isDark = theme === 'dark';
  const isAdmin = role === 'ADMIN_GOVERNANCE';

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'TOPUP_CONFIG' | 'REQUESTS_HISTORY'>('OVERVIEW');
  const [userProfile, setUserProfile] = useState(initialUserProfile);
  const [requests, setRequests] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingSubData, setLoadingSubData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Task 3: Inline Editing States
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Form State for Parameters
  const [paramForm, setParamForm] = useState({
    targetAmountGbp: 0,
    targetDays: 28,
    extensionDays: 0,
    approvedTopUpNgn: 0,
    topUpFeePercentage: 2.5,
    flatProcessingFeeNgn: 5000,
    maxAllowedTopUpNgn: 15000000
  });

  // 1. Sync User Profile (Real-time)
  useEffect(() => {
    if (!isOpen || !initialUserProfile?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', initialUserProfile.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile({ ...initialUserProfile, ...data });
        setParamForm({
          targetAmountGbp: data.targetAmountGbp || 0,
          targetDays: data.targetDays || 28,
          extensionDays: data.extensionDays || 0,
          approvedTopUpNgn: data.approvedTopUpNgn || 0,
          topUpFeePercentage: data.topUpPricingConfig?.topUpFeePercentage || 2.5,
          flatProcessingFeeNgn: data.topUpPricingConfig?.flatProcessingFeeNgn || 5000,
          maxAllowedTopUpNgn: data.topUpPricingConfig?.maxAllowedTopUpNgn || 15000000
        });
      }
    });
    return unsub;
  }, [isOpen, initialUserProfile?.uid]);

  // 2. Fetch Requests & Logs
  useEffect(() => {
    if (!isOpen || !userProfile?.uid || activeTab !== 'REQUESTS_HISTORY') return;
    setLoadingSubData(true);
    const uid = userProfile.uid;

    const reqQ = query(collection(db, 'liquidity_requests'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(10));
    const logQ = query(collection(db, 'audit_logs'), where('studentId', '==', uid), orderBy('createdAt', 'desc'), limit(20));

    const unsubReq = onSnapshot(reqQ, (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLog = onSnapshot(logQ, (snap) => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingSubData(false);
    });

    return () => { unsubReq(); unsubLog(); };
  }, [isOpen, userProfile?.uid, activeTab]);

  const handleSaveField = async (field: string, value: string) => {
    if (!userProfile?.uid) return;
    setIsSubmitting(true);
    try {
      const updates: any = { [field]: value, updatedAt: serverTimestamp() };
      if (field === 'targetCountry' && !userProfile.targetCurrency) {
        updates.targetCurrency = resolveCountryCurrency(value);
      }
      await updateDoc(doc(db, 'users', userProfile.uid), updates);
      toast.success(`${field.toUpperCase()} updated`);
      setEditingField(null);
    } catch (e: any) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveParams = async () => {
    if (!userProfile?.uid) return;
    setIsSubmitting(true);
    try {
      const userUpdates = {
        targetAmountGbp: paramForm.targetAmountGbp,
        targetDays: paramForm.targetDays,
        extensionDays: paramForm.extensionDays,
        approvedTopUpNgn: paramForm.approvedTopUpNgn,
        topUpPricingConfig: {
          topUpFeePercentage: paramForm.topUpFeePercentage,
          flatProcessingFeeNgn: paramForm.flatProcessingFeeNgn,
          maxAllowedTopUpNgn: paramForm.maxAllowedTopUpNgn,
          updatedAt: new Date()
        },
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, 'users', userProfile.uid), userUpdates);

      const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', userProfile.uid));
      const evalSnap = await getDocs(evalQ);
      if (!evalSnap.empty) {
        await updateDoc(doc(db, 'pof_evaluations', evalSnap.docs[0].id), {
          targetGBP: paramForm.targetAmountGbp,
          durationDays: paramForm.targetDays,
          extensionDays: paramForm.extensionDays,
          updatedAt: serverTimestamp()
        });
      }
      toast.success('Governance parameters updated');
    } catch (e: any) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSoftReset = async () => {
    if (!userProfile?.uid || !window.confirm('Reset compliance data for this student?')) return;
    setIsSubmitting(true);
    try {
      await executeSoftReset(userProfile.uid);
      toast.success('Account reset');
      onClose();
    } catch (e: any) {
      toast.error('Reset failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDelete = async () => {
    if (!userProfile?.uid || !window.confirm('PERMANENTLY PURGE this user?')) return;
    setIsSubmitting(true);
    try {
      const res = await purgeUserClientSide(userProfile.uid);
      if (res.success) { toast.success('User purged'); onClose(); }
      else toast.error(res.message);
    } catch (e: any) { toast.error('Purge failed'); } finally { setIsSubmitting(false); }
  };

  if (!isOpen || !userProfile) return null;

  // Task 2: Data Resolution
  const origin = userProfile.currentCountry || userProfile.originCountry || 'Nigeria';
  const destination = userProfile.targetCountry || 'Canada';
  const currency = userProfile.targetCurrency || resolveCountryCurrency(destination);
  const evaluationDays = userProfile.targetDays || 28;

  const renderInlineEdit = (field: string, label: string, currentVal: string) => {
    const isEditing = editingField === field;
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-zinc-800 transition-all hover:bg-slate-50/50 dark:hover:bg-white/[0.02] px-2 rounded-lg">
        <div className="flex-1">
          <span className="text-[10px] font-black text-slate-400 uppercase block tracking-widest">{label}</span>
          {isEditing ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                className="flex-1 bg-white dark:bg-zinc-950 border border-indigo-500 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none shadow-lg"
                defaultValue={currentVal}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveField(field, editValue || currentVal)}
              />
              <button onClick={() => handleSaveField(field, editValue || currentVal)} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md"><Save className="w-4 h-4" /></button>
              <button onClick={() => setEditingField(null)} className="p-2 bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-300 transition-all"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <span className="text-sm font-bold text-slate-800 dark:text-zinc-100 mt-1 block">
              {currentVal || <span className="text-amber-500 font-normal italic">Not Specified</span>}
            </span>
          )}
        </div>
        {isAdmin && !isEditing && (
          <button onClick={() => { setEditValue(currentVal); setEditingField(field); }} className="p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-xl transition-all" title={`Edit ${label}`}>
            <Edit3 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-md" onClick={onClose}>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-[2.5rem] border shadow-2xl relative ${isDark ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-white border-slate-200'} backdrop-blur-[75px] overflow-hidden`}
        >
          {/* Header */}
          <div className="p-8 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-500/30 shadow-xl shrink-0">
                {userProfile.photoURL ? <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800 flex items-center justify-center text-2xl font-black text-amber-500">{userProfile.displayName?.[0] || 'S'}</div>}
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase text-white">{userProfile.displayName}</h2>
                <div className="flex items-center gap-3 mt-1 text-slate-400">
                  <StatusBadge status={userProfile.status} />
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="text-[10px] font-mono uppercase tracking-tighter">{userProfile.uid?.substring(0, 8)}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all shadow-lg"><XIcon className="w-6 h-6" /></button>
          </div>

          <div className="flex px-8 bg-slate-950/20 border-b border-slate-200 dark:border-zinc-800 shrink-0 overflow-x-auto no-scrollbar">
            {[
              { id: 'OVERVIEW', label: 'Profile Overview', icon: User },
              ...(isAdmin ? [{ id: 'TOPUP_CONFIG', label: 'Top-Up & Governance', icon: Sliders }] : []),
              { id: 'REQUESTS_HISTORY', label: 'History & Requests', icon: History }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all relative shrink-0 ${activeTab === tab.id ? 'text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {activeTab === tab.id && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full" />}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
            {activeTab === 'OVERVIEW' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500 mb-4 flex items-center gap-2"><Globe className="w-4 h-4" /> Identity & Route</h4>
                  {renderInlineEdit('displayName', 'Full Name', userProfile.displayName)}
                  {renderInlineEdit('email', 'Email Address', userProfile.email)}
                  {renderInlineEdit('phoneNumber', 'Phone Number', userProfile.phoneNumber)}
                  {renderInlineEdit('currentCountry', 'Origin Country', origin)}
                  {renderInlineEdit('targetCountry', 'Destination', destination)}
                  {renderInlineEdit('targetCurrency', 'Assessed Currency', currency)}
                </div>

                <div className="space-y-6">
                  <div className={`p-6 rounded-[2rem] border ${isDark ? 'bg-white/5 border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><PieChart className="w-4 h-4" /> Compliance Status</h4>
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Consolidated Ledger</p>
                          <p className="text-3xl font-black text-white">₦{consolidatedBalance.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Target Maturity</p>
                          <p className="text-xl font-bold text-amber-500">{evaluationDays} Days</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase"><span className="text-slate-400">Current Progress</span><span className="text-white">{holdingProgress}%</span></div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${holdingProgress}%` }} className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500" /></div>
                      </div>
                    </div>
                  </div>

                  <div className={`p-6 rounded-[2rem] border ${isDark ? 'bg-white/5 border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Bank Connectivity</h4>
                    <div className="space-y-4">
                      {renderInlineEdit('linkedBankName', 'Primary Provider', userProfile.linkedBankName || userProfile.bankProvider)}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification Engine</span>
                        <div className="flex items-center gap-2">{userProfile.isVerified ? <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> System Verified</span> : <span className="text-[8px] font-black uppercase text-rose-500">Unverified</span>}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'TOPUP_CONFIG' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2"><Sliders className="w-4 h-4" /> Top-Up Parameters</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Target POF Amount ({currency})</label>
                        <input type="number" value={paramForm.targetAmountGbp} onChange={e => setParamForm({...paramForm, targetAmountGbp: parseFloat(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-bold text-white focus:border-amber-500 focus:outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Statutory Window</label>
                          <input type="number" value={paramForm.targetDays} onChange={e => setParamForm({...paramForm, targetDays: parseInt(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-bold text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Active Extensions</label>
                          <input type="number" value={paramForm.extensionDays} onChange={e => setParamForm({...paramForm, extensionDays: parseInt(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-bold text-blue-400" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Approved Facility (₦)</label>
                        <input type="number" value={paramForm.approvedTopUpNgn} onChange={e => setParamForm({...paramForm, approvedTopUpNgn: parseFloat(e.target.value)})} className="w-full bg-slate-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-bold text-emerald-400" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2"><Settings className="w-4 h-4" /> Pricing & Escrow</h4>
                    <div className="space-y-6 p-6 rounded-[2rem] bg-white/5 border border-slate-200 dark:border-zinc-800">
                      <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase">Service Fee (%)</label><span className="text-sm font-black text-amber-500">{paramForm.topUpFeePercentage}%</span></div>
                      <input type="range" min="0.5" max="15" step="0.1" value={paramForm.topUpFeePercentage} onChange={e => setParamForm({...paramForm, topUpFeePercentage: parseFloat(e.target.value)})} className="w-full accent-amber-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer" />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Admin Flat Fee</label>
                          <input type="number" value={paramForm.flatProcessingFeeNgn} onChange={e => setParamForm({...paramForm, flatProcessingFeeNgn: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Max Allocation</label>
                          <input type="number" value={paramForm.maxAllowedTopUpNgn} onChange={e => setParamForm({...paramForm, maxAllowedTopUpNgn: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs text-white" />
                        </div>
                      </div>
                      <button onClick={handleSaveParams} disabled={isSubmitting} className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Governance Settings</button>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-4 pt-4">
                    <button onClick={handleSoftReset} className="flex-1 py-4 rounded-2xl border border-amber-500/30 text-amber-500 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/10 transition-all flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Soft Reset Data</button>
                    <button onClick={handleHardDelete} className="flex-1 py-4 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Purge User Account</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'REQUESTS_HISTORY' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2"><Zap className="w-4 h-4" /> Liquidity Request Stream</h4>
                  {loadingSubData ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div> : requests.length === 0 ? <div className="py-12 text-center bg-white/5 border border-dashed border-white/10 rounded-[2rem] opacity-40 text-[10px] font-bold uppercase tracking-widest">No active liquidity claims</div> : (
                    <div className="space-y-3">
                      {requests.map(req => (
                        <div key={req.id} className="p-4 rounded-2xl bg-white/5 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${req.type === 'TOP_UP' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}><Zap className="w-4 h-4" /></div>
                            <div>
                              <p className="text-xs font-bold text-white uppercase">{req.type.replace('_', ' ')}</p>
                              <p className="text-[10px] font-mono text-slate-500">{new Date(req.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-white">£{req.amountGBP?.toLocaleString() || req.amount?.toLocaleString()}</p>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : req.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>{req.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-500 flex items-center gap-2"><Activity className="w-4 h-4" /> Internal Audit Log</h4>
                  <div className="space-y-3">
                    {auditLogs.map(log => (
                      <div key={log.id} className="p-4 rounded-2xl bg-slate-950/40 border border-slate-200 dark:border-zinc-800">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{log.action?.replace(/_/g, ' ')}</span>
                          <span className="text-[8px] font-mono text-slate-600">{new Date(log.createdAt?.seconds * 1000).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-medium">{log.detail || log.message}</p>
                        <p className="text-[8px] text-slate-500 uppercase mt-2 font-black">Actor: {log.actor || 'System'}</p>
                      </div>
                    ))}
                    {auditLogs.length === 0 && !loadingSubData && <div className="py-12 text-center opacity-30 text-[10px] font-black uppercase tracking-widest">Clean Audit Slate</div>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-8 bg-slate-950/40 border-t border-slate-200 dark:border-zinc-800 flex justify-end gap-3 shrink-0">
             {!isAdmin && (
               <button
                 onClick={() => { onRequestTopUp?.(); onClose(); }}
                 className="px-8 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 active:scale-95"
               >
                 Request Top Up
               </button>
             )}
             <button onClick={onClose} className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-white transition-all">Close Viewer</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: any = {
    CLEARED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    AT_RISK: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    WAITING_APPROVAL: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };
  return <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[status] || styles.PENDING}`}>{status?.replace(/_/g, ' ') || 'PENDING'}</span>;
};
