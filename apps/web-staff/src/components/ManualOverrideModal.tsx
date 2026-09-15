import React, { useState, useMemo } from 'react';
import {
  X as XIcon,
  ArrowRightLeft,
  Plus,
  Minus,
  Clock,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Save,
  Loader2,
  Calendar
} from 'lucide-react';
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { LIVE_FX_RATE } from '../constants';

interface ManualOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  performedBy: string;
}

export const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  isOpen,
  onClose,
  student,
  performedBy
}) => {
  const [activeMode, setActiveTab] = useState<'balance' | 'days'>('balance');
  const [balanceSubMode, setBalanceSubMode] = useState<'deposit' | 'deduct'>('deposit');
  const [daysSubMode, setDaysSubMode] = useState<'add' | 'set'>('add');

  const [amount, setAmount] = useState<number>(0);
  const [days, setDays] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Previews
  const projectedBalanceGbp = useMemo(() => {
    if (activeMode !== 'balance') return student?.balanceGbp || 0;
    const rate = LIVE_FX_RATE; // GBP/NGN rate
    const deltaGbp = amount / rate;
    return balanceSubMode === 'deposit'
      ? (student?.balanceGbp || 0) + deltaGbp
      : (student?.balanceGbp || 0) - deltaGbp;
  }, [student, amount, balanceSubMode, activeMode]);

  const projectedDays = useMemo(() => {
    if (activeMode !== 'days') return student?.consecutiveDays || 0;
    return daysSubMode === 'add'
      ? (student?.consecutiveDays || 0) + days
      : days;
  }, [student, days, daysSubMode, activeMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      const rate = LIVE_FX_RATE;

      // 1. Log Adjustment Audit Record
      await addDoc(collection(db, 'manual_adjustments'), {
        studentId: student.id,
        studentEmail: student.email,
        performedBy,
        type: activeMode === 'balance' ? `BALANCE_${balanceSubMode.toUpperCase()}` : `DAYS_${daysSubMode.toUpperCase()}`,
        amountNgn: activeMode === 'balance' ? amount : 0,
        daysDelta: activeMode === 'days' ? (daysSubMode === 'add' ? days : days - student.consecutiveDays) : 0,
        reason,
        createdAt: serverTimestamp()
      });

      // 2. If Balance Override, create a virtual transaction to reflect in UI
      if (activeMode === 'balance' && amount > 0) {
        await addDoc(collection(db, 'financial_accounts'), {
          userId: student.id,
          userEmail: student.email,
          bankName: 'Manual Adjustment (Offline)',
          accountMask: '••••MANL',
          currency: 'NGN',
          rawBalance: balanceSubMode === 'deposit' ? amount : -amount,
          balanceNGN: balanceSubMode === 'deposit' ? amount : -amount,
          balanceGBP: balanceSubMode === 'deposit' ? amount / rate : -(amount / rate),
          provider: 'MANUAL_OVERRIDE',
          status: 'ACTIVE',
          createdAt: serverTimestamp()
        });
      }

      // 3. Update Student Master Record (for days or timestamps)
      const targetUid = student.userId || student.id;
      const updates: any = {
        updatedAt: serverTimestamp()
      };

      if (activeMode === 'days') {
        const newStart = new Date();
        newStart.setDate(newStart.getDate() - projectedDays + 1);
        updates.startDate = newStart.toISOString().split('T')[0];
      }

      const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', targetUid));
      const evalSnap = await getDocs(evalQ);

      if (!evalSnap.empty) {
        await updateDoc(doc(db, 'pof_evaluations', evalSnap.docs[0].id), updates);
      } else {
        await setDoc(doc(db, 'pof_evaluations', targetUid), {
          ...updates,
          userId: targetUid,
          userName: student.name,
          userEmail: student.email || '',
          createdAt: serverTimestamp()
        });
      }

      onClose();
    } catch (e) {
      console.error('Override error:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="glass-card w-full max-w-xl animate-in zoom-in-95 duration-300 flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-white">Manual Override</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manual Ledger Adjustment for {student.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <XIcon className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-8 pt-6">
          <div className="flex items-center space-x-2 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('balance')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMode === 'balance' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Balance Adjustment
            </button>
            <button
              onClick={() => setActiveTab('days')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMode === 'days' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Calendar className="w-3.5 h-3.5" /> Holding Days
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">

          {activeMode === 'balance' ? (
            <div className="space-y-6">
              <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setBalanceSubMode('deposit')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${balanceSubMode === 'deposit' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-600'}`}
                >
                  <Plus className="w-3 h-3" /> Deposit (+₦)
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceSubMode('deduct')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${balanceSubMode === 'deduct' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-slate-600'}`}
                >
                  <Minus className="w-3 h-3" /> Deduct (-₦)
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Adjustment Amount (NGN)</label>
                <input
                  type="number"
                  placeholder="Enter amount in Naira"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full input-rounded px-6 py-4 text-xl font-black"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setDaysSubMode('add')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${daysSubMode === 'add' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'text-slate-600'}`}
                >
                  <Plus className="w-3 h-3" /> Add Days
                </button>
                <button
                  type="button"
                  onClick={() => setDaysSubMode('set')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${daysSubMode === 'set' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-slate-600'}`}
                >
                  <Clock className="w-3 h-3" /> Set Directly
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{daysSubMode === 'add' ? 'Days to Add' : 'Target Day Count'}</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  value={days || ''}
                  onChange={(e) => setDays(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-xl font-black text-white focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* Audit Reason */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mandatory Audit Reason</label>
            <textarea
              required
              rows={3}
              placeholder="Provide context for this manual override..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-xs font-medium text-slate-300 focus:outline-none focus:border-amber-500 transition-all resize-none"
            />
          </div>

          {/* Projection Preview */}
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-3xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest">Live Projection</p>
                <p className="text-xs font-bold text-slate-200">
                  {activeMode === 'balance'
                    ? `Projected Balance: £${projectedBalanceGbp.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `Projected Counter: ${projectedDays} / 28 Days`
                  }
                </p>
              </div>
            </div>
            {reason.trim() ? (
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Ready to Commit</span>
            ) : (
              <span className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Reason Required</span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !reason.trim()}
            className="w-full flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/10 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Commit Manual Adjustment</span>
          </button>

        </form>
      </div>
    </div>
  );
};
