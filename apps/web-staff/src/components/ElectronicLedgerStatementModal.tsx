import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, Search, Download, Calendar, ArrowUpRight,
  ArrowDownLeft, FileText, Loader2, Filter,
  ExternalLink
} from 'lucide-react';
import {
  collection, query, orderBy, limit, onSnapshot, doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { StatementTransaction, FuzzySmsParser } from '../services/fuzzySmsParser';
import { StatementPdfGenerator } from '../services/statementPdfGenerator';
import { toast } from 'sonner';

interface ElectronicLedgerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    id: string;
    bankName: string;
    accountNumberMasked: string;
    totalInflowNgn?: number;
    totalOutflowNgn?: number;
    linkDate?: string;
  };
  studentName: string;
}

export const ElectronicLedgerStatementModal: React.FC<ElectronicLedgerStatementModalProps> = ({
  isOpen,
  onClose,
  account,
  studentName
}) => {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Fetch Transactions
  useEffect(() => {
    if (!isOpen || !account.id) return;

    const txnsRef = collection(db, 'financial_accounts', account.id, 'transactions');
    const q = query(txnsRef, orderBy('timestamp', 'desc'), limit(50));

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as StatementTransaction));
      setTransactions(data);
      setLoading(false);
    }, (err) => {
      console.error("Ledger fetch error:", err);
      toast.error("Failed to load ledger records.");
      setLoading(false);
    });

    return unsub;
  }, [isOpen, account.id]);

  // 2. Filter Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.amountNgn.toString().includes(searchTerm)
    );
  }, [transactions, searchTerm]);

  // 3. Export PDF
  const handleExport = async () => {
    const t = toast.loading('Preparing official ledger statement...');
    try {
      await StatementPdfGenerator.generate({
        studentName,
        bankName: account.bankName,
        accountNumber: account.accountNumberMasked,
        totalInflow: account.totalInflowNgn || 0,
        totalOutflow: account.totalOutflowNgn || 0,
        linkDate: account.linkDate ? FuzzySmsParser.formatTimestamp(account.linkDate).split(' ')[0] : 'Scanning...',
        transactions: transactions.slice(0, 10) // Limit to last 10 as per requirement
      });
      toast.success('Statement downloaded successfully.', { id: t });
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF.', { id: t });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-5xl h-[85vh] bg-[#030712] border border-slate-200 dark:border-zinc-800 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-500">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Electronic Ledger Statement</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                {account.bankName} • {account.accountNumberMasked}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all">
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 md:p-8 bg-white/[0.01]">
          <div className="p-5 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Link Date</p>
            <p className="text-lg font-bold text-white uppercase">
              {account.linkDate ? FuzzySmsParser.formatTimestamp(account.linkDate).split(' ')[0] : 'Scanning...'}
            </p>
          </div>
          <div className="p-5 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Inflow</p>
            <p className="text-xl font-black text-emerald-500">
              ₦{(account.totalInflowNgn || 0).toLocaleString()}
            </p>
          </div>
          <div className="p-5 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Outflow</p>
            <p className="text-xl font-black text-rose-500">
              ₦{(account.totalOutflowNgn || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="px-6 md:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search descriptions..."
              className="w-full bg-zinc-900/90 border-zinc-800 shadow-none rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleExport}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>

        {/* Transactions Table */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-8 no-scrollbar">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Decrypting Ledger...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
              <FileText className="w-16 h-16" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No records found</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4 text-center">Type</th>
                    <th className="px-6 py-4 text-right">Amount (NGN)</th>
                    <th className="px-6 py-4 text-right">Balance (NGN)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-slate-300">
                  {filteredTransactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-[10px]">
                        {FuzzySmsParser.formatTimestamp(txn.timestamp)}
                      </td>
                      <td className="px-6 py-4 font-bold uppercase max-w-xs truncate">
                        {txn.description}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black ${
                          txn.type === 'CREDIT'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {txn.type === 'CREDIT' ? 'CR' : 'DR'}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${
                        txn.type === 'CREDIT' ? 'text-emerald-400' : 'text-slate-100'
                      }`}>
                        {txn.amountNgn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-500">
                        {txn.runningBalanceNgn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
