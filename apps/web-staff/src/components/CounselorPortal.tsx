import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  ArrowUpRight,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  MoreVertical,
  Activity,
  Loader2,
  Zap,
  Calendar
} from 'lucide-react';
import { DashboardSkeleton } from './ui/LoadingStates';

// --- Types ---

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface SystemRequest {
  id: string;
  studentId: string;
  name: string;
  email: string;
  type: 'TOP_UP' | 'EXTENSION';
  amount?: number;
  daysRequested?: number;
  status: RequestStatus;
  reason: string;
  createdAt: any;
}

// --- Sub-Components ---

const CountdownTimer: React.FC<{ expiry: any }> = ({ expiry }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => {
      const expiryMillis = expiry?.seconds ? expiry.seconds * 1000 : Date.now() + 86400000;
      const diff = expiryMillis - Date.now();
      if (diff <= 0) {
        setTimeLeft('EXPIRED');
        clearInterval(timer);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  const isCritical = timeLeft.includes('0h') || timeLeft === 'EXPIRED';

  return (
    <div className={`flex items-center space-x-2 font-mono text-[10px] font-black ${isCritical ? 'text-rose-400' : 'text-amber-400'}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>{timeLeft}</span>
    </div>
  );
};

// --- Main Component ---

export const CounselorPortal: React.FC = () => {
  const [requests, setRequests] = useState<SystemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Listen to real liquidity_requests
    const q = query(
      collection(db, 'liquidity_requests'),
      where('status', '==', 'PENDING'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          studentId: d.userId,
          name: d.userName || 'Student',
          email: d.userEmail || '',
          type: d.type || 'TOP_UP',
          amount: d.amountGBP,
          daysRequested: d.daysRequested,
          status: d.status,
          reason: d.reason || '',
          createdAt: d.createdAt
        } as SystemRequest;
      });
      setRequests(data);
      setLoading(false);
    });

    return unsub;
  }, []);

  const filtered = useMemo(() =>
    requests.filter(r =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase())
    ), [requests, searchTerm]);

  const handleAction = async (request: SystemRequest, action: 'APPROVED' | 'REJECTED') => {
    try {
      // 1. Update request status
      await updateDoc(doc(db, 'liquidity_requests', request.id), {
        status: action,
        updatedAt: serverTimestamp()
      });

      if (action === 'APPROVED') {
        // 2. Apply the adjustment to the student's evaluation
        const evalQ = query(
          collection(db, 'pof_evaluations'),
          where('userId', '==', request.studentId)
        );
        const evalSnap = await getDocs(evalQ);

        if (!evalSnap.empty) {
          const evalDoc = evalSnap.docs[0];
          const evalData = evalDoc.data();
          const evalRef = doc(db, 'pof_evaluations', evalDoc.id);

          const updates: any = {
            updatedAt: serverTimestamp()
          };

          if (request.type === 'TOP_UP') {
            // Keep existing status, resolveUserStatus will handle visibility
          } else if (request.type === 'EXTENSION') {
            // Add days by shifting start date back
            const currentStart = new Date(evalData.startDate || Date.now());
            currentStart.setDate(currentStart.getDate() - (request.daysRequested || 0));
            updates.startDate = currentStart.toISOString().split('T')[0];
          }

          await updateDoc(evalRef, updates);
        }
      }
    } catch (e) {
      console.error('Action error:', e);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-[#DFE2EF] p-8 font-sans selection:bg-[#F5B651]/20">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
          <div className="flex-1">
            <div className="flex items-center space-x-2 md:space-x-3 mb-1 md:mb-2">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)] shrink-0">
                <Users className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase truncate">Counselor Workflow</h1>
            </div>
            <p className="text-[9px] md:text-xs text-slate-500 font-medium uppercase tracking-widest ml-1">Board Review: Approving Liquidity & Time Extensions</p>
          </div>

          <div className="flex items-center space-x-2 md:space-x-3">
             <div className="glass-card p-2.5 md:p-4 flex items-center space-x-3 md:space-x-4 w-full sm:w-auto">
                <div className="text-right flex-1 sm:flex-none">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-tighter">Pending Action</p>
                  <p className="text-base md:text-lg font-black text-amber-500">{requests.length}</p>
                </div>
                <div className="w-px h-6 md:h-8 bg-white/5" />
                <div className="text-right flex-1 sm:flex-none">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-tighter">System Health</p>
                  <p className="text-base md:text-lg font-black text-emerald-400">NOMINAL</p>
                </div>
             </div>
          </div>
        </header>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search incoming request stream..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full input-rounded pl-12 pr-6 py-4 text-xs font-medium"
            />
          </div>
        </div>

        {/* Requests Queue Table */}
        <div className="glass-card shadow-2xl transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950/40 text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-zinc-800">
                  <th className="px-4 md:px-8 py-3 md:py-5">Student Identity</th>
                  <th className="px-4 md:px-8 py-3 md:py-5">Parameters</th>
                  <th className="hidden sm:table-cell px-8 py-5">Time Since Request</th>
                  <th className="hidden md:table-cell px-8 py-5">Justification</th>
                  <th className="px-4 md:px-8 py-3 md:py-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 font-sans">
                {filtered.map((req) => (
                  <tr key={req.id} className="hover:bg-white/5 transition-all group">
                    <td className="px-4 md:px-8 py-4 md:py-6">
                      <div className="flex items-center space-x-3 md:space-x-4">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 border border-slate-200 dark:border-zinc-800 flex items-center justify-center font-black text-[10px] md:text-xs text-[#F5B651] shrink-0">
                          {req.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs md:text-sm font-bold text-white leading-tight uppercase tracking-tight truncate">{req.name}</p>
                          <p className="text-[8px] md:text-[10px] font-mono text-slate-500 uppercase tracking-tighter">{req.studentId.substring(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 md:px-8 py-4 md:py-6">
                      <div className="flex items-center gap-2 md:gap-3">
                         <div className={`p-1.5 md:p-2 rounded-lg border shrink-0 ${
                           req.type === 'TOP_UP' ? 'bg-blue-500/10 border-slate-200 dark:border-zinc-800 text-blue-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                         }`}>
                           {req.type === 'TOP_UP' ? <Zap className="w-3 md:w-3.5 h-3 md:h-3.5" /> : <Calendar className="w-3 md:w-3.5 h-3 md:h-3.5" />}
                         </div>
                         <div className="min-w-0">
                            <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white truncate">{req.type}</p>
                            <p className="text-[10px] md:text-xs font-bold text-slate-400 truncate">
                              {req.type === 'TOP_UP' ? `£${req.amount?.toLocaleString()}` : `+${req.daysRequested} Days`}
                            </p>
                         </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-8 py-6">
                       <span className="text-[9px] md:text-[10px] font-mono text-slate-500 uppercase">
                         {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleTimeString() : 'Now'}
                       </span>
                    </td>
                    <td className="hidden md:table-cell px-8 py-6">
                      <p className="text-[10px] text-slate-400 italic max-w-[200px] truncate" title={req.reason}>
                        "{req.reason || 'No justification provided.'}"
                      </p>
                    </td>
                    <td className="px-4 md:px-8 py-4 md:py-6 text-right">
                      <div className="flex items-center justify-end space-x-1.5 md:space-x-2">
                        <button
                          onClick={() => handleAction(req, 'REJECTED')}
                          className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all shadow-lg"
                        >
                          <XCircle className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </button>
                        <button
                          onClick={() => handleAction(req, 'APPROVED')}
                          className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all shadow-lg"
                        >
                          <CheckCircle2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-20 text-center opacity-30">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Board Clear: No Pending Requests</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CounselorPortal;
