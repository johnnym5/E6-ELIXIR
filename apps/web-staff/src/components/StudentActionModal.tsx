import React, { useState } from 'react';
import {
  X as XIcon,
  Settings2,
  Trash2,
  CheckCircle2,
  TrendingUp,
  Clock,
  ArrowRightLeft,
  Save,
  Loader2,
  AlertTriangle,
  Users
} from 'lucide-react';
import {
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { purgeUserClientSide } from '../utils/governanceService';

interface StudentActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  onSuccess: () => void;
}

export const StudentActionModal: React.FC<StudentActionModalProps> = ({
  isOpen,
  onClose,
  student,
  onSuccess
}) => {
  const [mode, setMode] = useState<'edit' | 'delete'>('edit');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: student?.name || '',
    balanceGbp: student?.balanceGbp || 0,
    targetGbp: student?.targetGbp || 0,
    consecutiveDays: student?.consecutiveDays || 0,
    totalTargetDays: 28,
    visaRoute: student?.visaRoute || '',
    counselor: student?.counselor || 'Unassigned'
  });

  if (!isOpen || !student) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const targetUid = student.userId || student.id;
    try {
      const updates: any = {
        userName: formData.name,
        targetGBP: formData.targetGbp,
        currentBalanceGBP: formData.balanceGbp,
        visaRoute: formData.visaRoute,
        counselor: formData.counselor,
        updatedAt: serverTimestamp()
      };

      // Calculate new start date if days changed
      const newStart = new Date();
      newStart.setDate(newStart.getDate() - formData.consecutiveDays + 1);
      updates.startDate = newStart.toISOString().split('T')[0];

      const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', targetUid));
      const evalSnap = await getDocs(evalQ);

      if (!evalSnap.empty) {
        await updateDoc(doc(db, 'pof_evaluations', evalSnap.docs[0].id), updates);
      } else {
        await setDoc(doc(db, 'pof_evaluations', targetUid), {
          ...updates,
          userId: targetUid,
          userEmail: student.email || '',
          createdAt: serverTimestamp()
        });
      }

      onSuccess();
      onClose();
    } catch (e: any) {
      console.error('Update error:', e);
      toast.error('Failed to update student: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to PERMANENTLY purge ${student.name}? This will erase all documents, bank records, and Auth credentials. This action CANNOT be undone.`)) return;

    setIsSubmitting(true);
    const t = toast.loading(`Executing cascading hard purge for ${student.name}...`);
    try {
      const uid = student.userId || student.id;

      // ─── DIRECT CLIENT-SIDE PURGE (BaaS Mode) ───
      const result = await purgeUserClientSide(uid);

      if (result.success) {
        toast.success(result.message, { id: t });
        onSuccess();
        onClose();
      } else {
        throw new Error(result.message);
      }
    } catch (e: any) {
      console.error('Purge error:', e);
      toast.error(`Purge failed: ${e.message}`, { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="glass-card w-full max-w-lg animate-in zoom-in-95 duration-300 flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
          <div>
            <h3 className="text-2xl font-black text-white">Student Actions</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{student.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <XIcon className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex items-center space-x-2 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => setMode('edit')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'edit' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Settings2 className="w-3.5 h-3.5" /> Edit Parameters
            </button>
            <button
              onClick={() => setMode('delete')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'delete' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Profile
            </button>
          </div>

          {mode === 'edit' ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Student Identity</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full input-rounded px-4 py-3 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Available Balance (£)</label>
                  <input
                    type="number"
                    value={formData.balanceGbp}
                    onChange={(e) => setFormData({...formData, balanceGbp: parseFloat(e.target.value)})}
                    className="w-full input-rounded px-4 py-3 text-xs text-emerald-400 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Required Target (£)</label>
                  <input
                    type="number"
                    value={formData.targetGbp}
                    onChange={(e) => setFormData({...formData, targetGbp: parseFloat(e.target.value)})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Completed Days</label>
                  <input
                    type="number"
                    value={formData.consecutiveDays}
                    onChange={(e) => setFormData({...formData, consecutiveDays: parseInt(e.target.value)})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-amber-500 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Days</label>
                  <input
                    type="number"
                    value={formData.totalTargetDays}
                    onChange={(e) => setFormData({...formData, totalTargetDays: parseInt(e.target.value)})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Assigned Counselor</label>
                  <select
                    value={formData.counselor}
                    onChange={(e) => setFormData({...formData, counselor: e.target.value})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Julian Morgan">Julian Morgan</option>
                    <option value="Sarah Connor">Sarah Connor</option>
                    <option value="Unassigned">Unassigned</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Days Left</label>
                  <div className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-4 py-3 text-xs text-slate-500 font-bold">
                    {Math.max(formData.totalTargetDays - formData.consecutiveDays, 0)} Days
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/10"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Parameters</span>
              </button>
            </form>
          ) : (
            <div className="space-y-6 py-4">
              <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[2rem] flex items-center gap-4">
                <AlertTriangle className="w-10 h-10 text-rose-500" />
                <div>
                  <h4 className="text-sm font-black text-white">Permanent Deletion</h4>
                  <p className="text-xs text-slate-500 mt-1">This will erase all compliance records and linked ledger history for this student.</p>
                </div>
              </div>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-3 px-6 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-rose-500/10"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Confirm Erase Profile</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
