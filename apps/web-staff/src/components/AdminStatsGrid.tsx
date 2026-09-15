import React, { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Zap,
  Clock,
  ShieldAlert,
  Loader2,
  BarChart3,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface StatItem {
  label: string;
  value: number;
  icon: any;
  color: string;
  description: string;
  filterId: string;
}

interface AdminStatsGridProps {
  students: any[];
  activeFilter: string;
  onFilterSelect: (filterId: string) => void;
  isDark?: boolean;
}

export const AdminStatsGrid: React.FC<AdminStatsGridProps> = ({
  students,
  activeFilter,
  onFilterSelect,
  isDark = true
}) => {
  const [isMetricsExpanded, setIsMetricsExpanded] = useState(false);

  // Exact calculations adhering to requirement 2
  const stats = useMemo(() => {
    const total = students.filter(s => s.isApproved || s.status === 'TOPUP_PENDING').length;
    const cleared = students.filter(s => s.status === 'CLEARED' && s.isApproved).length;
    
    // Top-Up Required alignment:
    // student.status === 'TOPUP_PENDING' || student.topUpStatus === 'REQUEST_PENDING' || student.hasPendingTopUp === true
    const topUpRequired = students.filter(student =>
      student.status === 'TOPUP_PENDING' ||
      student.topUpStatus === 'REQUEST_PENDING' ||
      student.hasPendingTopUp === true ||
      !!student.pendingRequest ||
      student.status === 'NEEDS_TOPUP'
    ).length;

    const nearMaturity = students.filter(s => s.status === 'NEAR_MATURITY' && s.isApproved).length;
    const authFailed = students.filter(s => (s.status === 'AWAITING_VERIFICATION' || s.status === 'UNAUTHENTICATED') && s.status !== 'TOPUP_PENDING').length;
    const incomplete = students.filter(s => s.status === 'PENDING_ONBOARDING' && s.status !== 'TOPUP_PENDING' && !s.hasPendingTopUp).length;

    return { total, cleared, topUpRequired, nearMaturity, authFailed, incomplete };
  }, [students]);

  const statConfigs: StatItem[] = [
    { label: "Total Students", value: stats.total, icon: Users, color: "text-slate-600 dark:text-slate-300", description: "Authorized student profiles", filterId: 'ALL' },
    { label: "Cleared", value: stats.cleared, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", description: "Full POF maturity reached", filterId: 'CLEARED' },
    { label: "Top Up Required", value: stats.topUpRequired, icon: Zap, color: "text-amber-600 dark:text-amber-400", description: "Funding needed or pending", filterId: 'TOPUP_PENDING' },
    { label: "Almost Done", value: stats.nearMaturity, icon: Clock, color: "text-indigo-600 dark:text-indigo-400", description: "Near 28-day maturity", filterId: 'NEAR_MATURITY' },
    { label: "Auth Failed", value: stats.authFailed, icon: ShieldAlert, color: "text-rose-600 dark:text-rose-500", description: "Verification failed or pending", filterId: 'UNAPPROVED' },
    ...(stats.incomplete > 0 ? [{ label: "Incomplete", value: stats.incomplete, icon: Loader2, color: "text-slate-600 dark:text-slate-400", description: "Awaiting setup completion", filterId: 'INCOMPLETE' }] : []),
  ];

  const activeStat = statConfigs.find(c => c.filterId === activeFilter) || statConfigs[0];

  const handleCardClick = (filterId: string) => {
    // Clicking TOP UP REQUIRED metric card sets the active filter to TOPUP_PENDING
    onFilterSelect(filterId);
    setIsMetricsExpanded(false);
  };

  return (
    <div className="space-y-3">
      {/* Mobile Accordion Toggle */}
      <div className="md:hidden">
        <button
          onClick={() => setIsMetricsExpanded(!isMetricsExpanded)}
          className="w-full glass-card p-4 flex items-center justify-between border border-slate-200 dark:border-zinc-800 bg-slate-900/80 backdrop-blur-md shadow-xl transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-xl bg-slate-950 border border-white/5 ${activeStat.color}`}>
              <activeStat.icon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{activeStat.label}</p>
              <p className="text-xl font-black text-white leading-none mt-1">{activeStat.value}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-200 dark:border-zinc-800 text-slate-400">
             <BarChart3 className="w-3.5 h-3.5" />
             <span className="text-[9px] font-black uppercase tracking-widest">
               {isMetricsExpanded ? 'Collapse' : 'Expand'} ({statConfigs.length})
             </span>
             <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMetricsExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        <AnimatePresence>
          {isMetricsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-2 pt-3">
                {statConfigs.map((s) => (
                  <StatCardComponent
                    key={s.filterId}
                    stat={s}
                    isActive={activeFilter === s.filterId}
                    onClick={() => handleCardClick(s.filterId)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop Grid */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {statConfigs.map((s) => (
          <StatCardComponent
            key={s.filterId}
            stat={s}
            isActive={activeFilter === s.filterId}
            onClick={() => handleCardClick(s.filterId)}
          />
        ))}
      </div>
    </div>
  );
};

const StatCardComponent: React.FC<{
  stat: StatItem;
  isActive: boolean;
  onClick: () => void;
}> = ({ stat, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`glass-card p-3 sm:p-4 text-left transition-all duration-300 relative overflow-hidden group flex flex-col justify-between w-full border ${
        isActive
          ? 'ring-2 ring-amber-500 bg-amber-500/10 border-amber-500/30'
          : 'hover:border-slate-200 dark:hover:border-zinc-800'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className={`p-2 rounded-xl bg-slate-950/40 border border-white/5 ${stat.color}`}>
          <stat.icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
          {stat.value}
        </p>
        <p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider mt-1 truncate">
          {stat.label}
        </p>
        <p className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5 truncate hidden sm:block">
          {stat.description}
        </p>
      </div>
      <div
        className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-300 ${
          isActive ? 'bg-amber-500' : 'bg-transparent group-hover:bg-white/10'
        }`}
      />
    </button>
  );
};
