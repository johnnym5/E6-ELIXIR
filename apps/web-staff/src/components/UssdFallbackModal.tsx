import React, { useState, useMemo } from 'react';
import {
  X as XIcon,
  Phone,
  ArrowRight,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Smartphone
} from 'lucide-react';
import {
  collection,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LIVE_FX_RATE } from '../constants';

interface UssdFallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  linkedBanks: string[]; // Only show these banks
}

const USSD_CODES: Record<string, string> = {
  "Guaranty Trust Bank (GTB)": "*737*6*1#",
  "United Bank for Africa (UBA)": "*919*00#",
  "Access Bank": "*901*00#",
  "Zenith Bank": "*966*00#",
  "First Bank of Nigeria": "*894*00#",
  "Fidelity Bank": "*770#",
  "First City Monument Bank (FCMB)": "*329*0#",
  "Stanbic IBTC Bank": "*909#",
  "Sterling Bank": "*822#",
  "Wema Bank": "*945#",
  "Union Bank": "*826#",
  "Ecobank Nigeria": "*326#",
  "Polaris Bank": "*833#",
  "Keystone Bank": "*7111#"
};

export const UssdFallbackModal: React.FC<UssdFallbackModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  linkedBanks
}) => {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [selectedBank, setSelectedBank] = useState('');
  const [manualBalance, setManualBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Filter USSD codes based on linked banks
  const availableUSSD = useMemo(() => {
    // If no linked banks, show none or maybe a prompt
    const banks = Object.keys(USSD_CODES).filter(b =>
      linkedBanks.some(lb => b.toLowerCase().includes(lb.toLowerCase()) || lb.toLowerCase().includes(b.toLowerCase()))
    );
    return banks;
  }, [linkedBanks]);

  if (!isOpen) return null;

  const handleDial = (bankName: string) => {
    const code = USSD_CODES[bankName];
    if (!code) return;

    // Format for tel link (replace # with %23)
    const telLink = `tel:${code.replace('#', '%23')}`;
    window.location.href = telLink;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedBank || !manualBalance) return;

    setIsSubmitting(true);
    try {
      const balance = parseFloat(manualBalance);
      const fxRate = LIVE_FX_RATE; // Use same rate as dashboards

      await addDoc(collection(db, 'financial_accounts'), {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        bankName: selectedBank,
        accountName: currentUser.displayName || 'Self',
        accountNumberMasked: '•••• USSD',
        accountType: 'SAVINGS',
        balanceNgn: balance,
        balanceGbp: Math.round((balance / fxRate) * 100) / 100,
        connectionMethod: 'MANUAL_DEPOSIT', // Source via USSD
        sourceLabel: 'USSD Offline Fallback',
        status: 'VERIFIED',
        lastSyncedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
        setIsSuccess(false);
        setSelectedBank('');
        setManualBalance('');
      }, 2000);
    } catch (err) {
      console.error('USSD Save error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="w-full max-w-md glass-card overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`p-8 border-b flex justify-between items-center ${isDark ? 'border-slate-200 dark:border-zinc-800 bg-slate-950/20' : 'border-slate-100 bg-slate-50'}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>USSD Fallback</h3>
              <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-slate-200 dark:border-zinc-800 text-blue-400 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Offline Check
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Verify balance via bank shortcode</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <XIcon className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="p-8">
          {isSuccess ? (
            <div className="py-10 text-center space-y-4 animate-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className={`text-xl font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Balance Confirmed</h4>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Ledger updated via USSD protocol.</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Step 1: Select Bank & Dial */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Step 1: Dial Shortcode</label>
                <div className="grid grid-cols-1 gap-2">
                  {availableUSSD.length > 0 ? (
                    availableUSSD.map((bank) => (
                      <button
                        key={bank}
                        onClick={() => {
                          setSelectedBank(bank);
                          handleDial(bank);
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          selectedBank === bank
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                            : isDark ? 'bg-slate-900/50 border-white/10 text-slate-300 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className={`w-4 h-4 ${selectedBank === bank ? 'text-white' : 'text-slate-500'}`} />
                          <span className="text-[11px] font-bold uppercase truncate max-w-[180px]">{bank}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-black">{USSD_CODES[bank]}</span>
                          <Phone className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center space-y-2 opacity-60">
                      <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-[10px] font-bold uppercase text-slate-400">No matching USSD codes found</p>
                      <p className="text-[9px] text-slate-500">Connect a supported bank first to enable offline USSD sync.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Confirm Balance */}
              <form onSubmit={handleSubmit} className="space-y-6 pt-6 border-t border-white/5">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Step 2: Confirm Seen Balance (₦)</label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="number"
                      required
                      disabled={!selectedBank}
                      value={manualBalance}
                      onChange={(e) => setManualBalance(e.target.value)}
                      className="w-full input-rounded pl-12 pr-6 py-4 text-sm font-bold"
                      placeholder={selectedBank ? "Enter amount from USSD screen" : "Select a bank first"}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-slate-500 leading-relaxed font-medium">
                    <span className="text-blue-500 font-black">Data Safety:</span> Manual entries are cross-referenced with your next automated sync to maintain ledger integrity.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedBank || !manualBalance}
                  className="w-full flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-tr from-blue-500 to-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Confirm & Update Ledger</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
