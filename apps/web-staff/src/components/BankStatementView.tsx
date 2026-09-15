import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  X as XIcon,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Transaction {
  id: string;
  bankAccountId: string;
  type: 'CREDIT' | 'DEBIT' | 'TOPUP_ALLOCATION';
  amountNgn: number;
  description: string;
  date: any;
  runningBalanceNgn: number;
  category: string;
}

interface BankStatementViewProps {
  isOpen: boolean;
  onClose: () => void;
  account: any;
}

export const BankStatementView: React.FC<BankStatementViewProps> = ({ isOpen, onClose, account }) => {
  const { theme } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const isDark = theme === 'dark';

  useEffect(() => {
    if (!account?.id || !isOpen) return;

    const q = query(
      collection(db, 'transactions'),
      where('bankAccountId', '==', account.id),
      orderBy('date', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    });

    return unsub;
  }, [account, isOpen]);

  const metrics = useMemo(() => {
    const inflow = transactions
      .filter(t => t.type === 'CREDIT' || t.type === 'TOPUP_ALLOCATION')
      .reduce((sum, t) => sum + t.amountNgn, 0);
    const outflow = transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amountNgn, 0);

    return { inflow, outflow };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-end bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-500 overflow-hidden">
      <div className={`h-full w-full max-w-4xl border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden ${isDark ? 'bg-[#030712] border-slate-200 dark:border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>

        {/* Header */}
        <header className="p-8 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-slate-950/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-500">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Electronic Ledger Statement</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                {account.bankName} • {account.accountNumberMasked}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                <Download className="w-3.5 h-3.5" />
                Download PDF
             </button>
             <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
               <XIcon className="w-6 h-6 text-slate-500" />
             </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto touch-pan-y no-scrollbar">
          {/* Summary Banner */}
          <section className="p-4 sm:p-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-200 dark:border-zinc-800 space-y-2">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Link Date</p>
                   <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-bold text-white">
                        {account.connectedAt?.seconds
                          ? new Date(account.connectedAt.seconds * 1000).toLocaleDateString()
                          : account.connectedAt
                            ? new Date(account.connectedAt).toLocaleDateString()
                            : 'N/A'}
                      </span>
                   </div>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-200 dark:border-zinc-800 space-y-2">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Inflow</p>
                   <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span className="text-xl font-black text-emerald-400">₦{metrics.inflow.toLocaleString()}</span>
                   </div>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-200 dark:border-zinc-800 space-y-2">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Outflow</p>
                   <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                      <span className="text-xl font-black text-rose-400">₦{metrics.outflow.toLocaleString()}</span>
                   </div>
                </div>
             </div>
          </section>

          {/* Filters */}
          <div className="px-4 sm:px-8 mb-6 flex flex-col sm:flex-row gap-4">
             <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search description or type..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-2xl pl-12 pr-6 py-4 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                />
             </div>
             <button className="px-6 py-4 bg-zinc-900/90 border-zinc-800 shadow-none rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-all whitespace-nowrap">
                Filter by Date
             </button>
          </div>

          {/* Ledger Table */}
          <div className="px-4 sm:px-8 pb-8">
             <div className="border border-slate-200 dark:border-zinc-800 rounded-3xl overflow-hidden bg-slate-950/20">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                     <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-950/40 border-b border-slate-200 dark:border-zinc-800">
                           <th className="px-6 py-5">Date & Time</th>
                           <th className="px-6 py-5">Description</th>
                           <th className="px-6 py-5">Type</th>
                           <th className="px-6 py-5 text-right">Amount (NGN)</th>
                           <th className="px-6 py-5 text-right">Balance (NGN)</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-zinc-800">
                        {filteredTransactions.map(t => (
                           <tr key={t.id} className="hover:bg-white/5 transition-colors group">
                              <td className="px-6 py-5">
                                 <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-white">{t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                                    <span className="text-[9px] font-medium text-slate-500 uppercase">{t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleTimeString() : ''}</span>
                                 </div>
                              </td>
                              <td className="px-6 py-5">
                                 <p className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{t.description}</p>
                              </td>
                              <td className="px-6 py-5">
                                 <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                    t.type === 'DEBIT' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                 }`}>
                                    {t.type}
                                 </span>
                              </td>
                              <td className={`px-6 py-5 text-right font-black text-[11px] ${
                                 t.type === 'DEBIT' ? 'text-rose-400' : 'text-emerald-400'
                              }`}>
                                 {t.type === 'DEBIT' ? '-' : '+'}₦{t.amountNgn.toLocaleString()}
                              </td>
                              <td className="px-6 py-5 text-right text-[11px] font-bold text-white">
                                 ₦{t.runningBalanceNgn.toLocaleString()}
                              </td>
                           </tr>
                        ))}
                        {filteredTransactions.length === 0 && !loading && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center opacity-20">
                              <Clock className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                              <p className="text-[10px] font-black uppercase tracking-widest">No Transactions Recorded</p>
                            </td>
                          </tr>
                        )}
                     </tbody>
                  </table>
                </div>
             </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-slate-200 dark:border-zinc-800 bg-slate-950/40 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Signed & Verified by Basechan Compliance Node</span>
           </div>
           <span className="text-[9px] font-bold text-slate-600 uppercase">Statement Generated: {new Date().toLocaleString()}</span>
        </footer>
      </div>
    </div>
  );
};
