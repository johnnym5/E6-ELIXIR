import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  UserPlus,
  Search,
  Filter,
  ChevronRight,
  Activity,
  X as XIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  MoreVertical,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { AddStudentModal } from './AddStudentModal';
import { TableSkeletonLoader } from './ui/LoadingStates';
import { StudentActionModal } from './StudentActionModal';
import { AdvancedFilterModal } from './AdvancedFilterModal';
import { useTheme } from '../context/ThemeContext';

import { resolveUserStatus, ComplianceStatus } from '../services/userStatusService';

interface Student {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: ComplianceStatus;
  consecutiveDays: number;
  balanceGbp: number;
  targetGbp: number;
  visaRoute: string;
  lastUpdate: string;
  onboardingComplete?: boolean;
  isApproved?: boolean;
}

const StatusBadge: React.FC<{ status: ComplianceStatus }> = ({ status }) => {
  const { theme } = useTheme();
  const styles: Record<string, string> = {
    CLEARED: theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200',
    NEEDS_TOPUP: theme === 'dark' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-200',
    NEAR_MATURITY: theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200',
    AT_RISK: theme === 'dark' ? 'bg-rose-500/10 text-rose-400 border-zinc-800' : 'bg-rose-50 text-rose-600 border-rose-200',
    PENDING: theme === 'dark' ? 'bg-slate-500/10 text-slate-400 border-zinc-800' : 'bg-slate-50 text-slate-500 border-slate-200',
    PENDING_ONBOARDING: theme === 'dark' ? 'bg-zinc-800 text-slate-500 border-zinc-700' : 'bg-slate-100 text-slate-400 border-slate-200',
    AWAITING_VERIFICATION: theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-zinc-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200',
    UNAUTHENTICATED: theme === 'dark' ? 'bg-rose-600/20 text-rose-500 border-rose-600/30 shadow-lg shadow-rose-900/10' : 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm',
  };

  const labels: Record<string, string> = {
    PENDING_ONBOARDING: 'INCOMPLETE ONBOARDING',
    AWAITING_VERIFICATION: 'PENDING VERIFICATION',
    UNAUTHENTICATED: 'IDENTIFICATION FAILED',
  };

  return (
    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-tighter shadow-sm ${styles[status] || styles.PENDING}`}>
      {labels[status] || status.replace('_', ' ')}
    </span>
  );
};

interface StaffQueueProps {
  onInspect?: (id: string) => void;
}

export const StaffQueue: React.FC<StaffQueueProps> = ({ onInspect }) => {
  const { theme } = useTheme();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Action Modal State
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [filters, setFilters] = useState({
    visaRoute: '',
    status: '',
    isNew: false,
    counselor: '',
    minBalance: '',
    maxBalance: '',
    minDays: '',
    maxDays: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'pof_evaluations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(docSnap => {
        const d = docSnap.data();
        const start = d.startDate ? new Date(d.startDate).getTime() : Date.now();
        const days = Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), 28);

        const status = resolveUserStatus({
          isApproved: d.isApproved ?? false,
          onboardingComplete: true, // If they are in pof_evaluations, onboarding is usually complete
          status: d.status || 'PENDING',
          consecutiveDays: days,
          targetGbp: d.targetGBP || 0,
          verificationFailed: d.verificationFailed
        });

        return {
          id: docSnap.id,
          userId: d.userId,
          name: d.userName || 'Unknown Student',
          email: d.userEmail || '',
          status,
          consecutiveDays: days,
          balanceGbp: d.currentBalanceGBP || 0,
          targetGbp: d.targetGBP || 0,
          visaRoute: d.visaRoute || 'Student Visa',
          lastUpdate: d.updatedAt?.seconds ? new Date(d.updatedAt.seconds * 1000).toLocaleTimeString() : 'Just now',
        } as Student;
      });
      setStudents(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           s.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRoute = !filters.visaRoute || s.visaRoute.includes(filters.visaRoute.split(' ')[0]);
      const matchesStatus = !filters.status || s.status === filters.status;
      const matchesNew = !filters.isNew || s.consecutiveDays <= 1;

      return matchesSearch && matchesRoute && matchesStatus && matchesNew;
    });
  }, [students, searchTerm, filters]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header with Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Student List</h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 uppercase">Unified Compliance Ledger</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-3 px-6 py-4 bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Student</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by name, email, or system ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full border rounded-2xl pl-12 pr-6 py-4 text-xs font-medium focus:outline-none focus:border-amber-500/50 transition-all backdrop-blur-md ${
              theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none text-white' : 'bg-white border-slate-200 text-slate-950'
            }`}
          />
        </div>
        <button
          onClick={() => setIsFilterModalOpen(true)}
          className={`px-6 py-4 border rounded-2xl flex items-center space-x-3 text-xs font-bold transition-all backdrop-blur-md ${
            Object.values(filters).some(v => !!v)
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-500'
              : theme === 'dark' ? 'bg-slate-900/40 border-white/10 text-slate-400 hover:text-slate-200' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Advanced Search</span>
        </button>
      </div>

      <div className={`border rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl relative transition-colors duration-500 ${
        theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        {loading ? (
          <div className="p-20 flex justify-center">
            <TableSkeletonLoader rows={8} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={`text-[10px] font-black uppercase tracking-widest border-b transition-colors ${
                  theme === 'dark' ? 'bg-slate-950/40 text-slate-500 border-slate-200 dark:border-zinc-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  <th className="px-8 py-6">Student Identity</th>
                  <th className="px-8 py-6">Visa Route</th>
                  <th className="px-8 py-6">Compliance Status</th>
                  <th className="px-8 py-6">Holding Maturity</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y transition-colors ${theme === 'dark' ? 'divide-zinc-800' : 'divide-slate-100'}`}>
                {filtered.map((student) => (
                  <tr
                    key={student.id}
                    onClick={() => {
                      setSelectedStudent(student);
                      setIsActionModalOpen(true);
                    }}
                    className={`transition-all group cursor-pointer ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-8 py-7">
                      <div className="flex items-center space-x-4">
                        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-black text-sm transition-colors ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-200 dark:border-zinc-800 text-amber-500' : 'bg-slate-100 border-slate-200 text-amber-600'
                        }`}>
                          {student.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <p className={`text-sm font-bold leading-tight transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{student.name}</p>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (onInspect) onInspect(student.id);
                               }}
                               className="p-1 rounded-md bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-all"
                               title="View Full Dashboard"
                             >
                               <ArrowRight className="w-2.5 h-2.5" />
                             </button>
                          </div>
                          <p className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-tighter">{student.email || student.id.substring(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-colors ${
                        theme === 'dark' ? 'bg-slate-950 border-white/10 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>{student.visaRoute}</span>
                    </td>
                    <td className="px-8 py-7">
                      <StatusBadge status={student.status} />
                    </td>
                    <td className="px-8 py-7">
                      <div className="space-y-1.5 w-40">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                          <span className="text-slate-500">Progress</span>
                          <span className={`${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{student.consecutiveDays}/28D</span>
                        </div>
                        <div className={`h-1.5 w-full rounded-full overflow-hidden transition-colors ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${student.consecutiveDays >= 28 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${(student.consecutiveDays / 28) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <button
                        className={`p-2.5 rounded-xl border transition-all ${
                          theme === 'dark'
                            ? 'bg-slate-800 border-white/5 text-slate-400 hover:bg-amber-500 hover:text-slate-950'
                            : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-amber-500 hover:text-white'
                        }`}
                        title="View student page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-20 text-center opacity-30">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-slate-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">No matching records</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AddStudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {}}
      />

      <StudentActionModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        student={selectedStudent}
        onSuccess={() => {}}
      />

      <AdvancedFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        currentFilters={filters}
        onApply={(f) => {
          setFilters(f);
          setIsFilterModalOpen(false);
        }}
        onReset={() => {
          setFilters({
            visaRoute: '',
            status: '',
            isNew: false,
            counselor: '',
            minBalance: '',
            maxBalance: '',
            minDays: '',
            maxDays: ''
          });
          setIsFilterModalOpen(false);
        }}
      />
    </div>
  );
};
