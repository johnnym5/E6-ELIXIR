import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon,
  Zap,
  Calendar,
  Clock,
  Settings,
  History,
  CheckCheck,
  Edit3,
  Loader2,
  TrendingUp,
  CreditCard,
  Plus,
  Minus,
  Save,
  AlertCircle,
  FileText,
  ExternalLink,
  Target
} from 'lucide-react';
import { BouncyButton } from './ui/BouncyButton';
import { modalBackdropVariants, modalBoxVariants } from '../utils/motionPresets';
import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';
import { convertCurrency, DEFAULT_EXCHANGE_RATES } from '../utils/exchangeRateEngine';
import { getCurrencyCode } from '../utils/currencyResolver';

interface StudentTopUpSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any;
  activeRequest: any;
  requestHistory: any[];
  pricingForm: {
    feePercentage: number;
    maxLimit: number;
  };
  onUpdatePricing: (pricing: any) => Promise<void>;
  onUpdateWindow: (data: any) => Promise<void>;
  onApproveRequest: (amount: number) => Promise<void>;
  onDenyRequest: () => Promise<void>;
}

export const StudentTopUpSettingsModal: React.FC<StudentTopUpSettingsModalProps> = ({
  isOpen,
  onClose,
  student,
  activeRequest,
  requestHistory,
  pricingForm: initialPricing,
  onUpdatePricing,
  onUpdateWindow,
  onApproveRequest,
  onDenyRequest
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'ledger'>('config');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Window & Pricing Config State
  const [windowForm, setWindowForm] = useState({
    localCurrency: student?.localCurrency || 'NGN',
    timerStart: student?.startDate || new Date().toISOString().split('T')[0],
    targetDays: student?.durationDays?.toString() || '28',
    extensionDays: student?.extensionDays || 0,
    manualDays: ''
  });

  const [pricingForm, setPricingForm] = useState(initialPricing);
  const [isModifyingRequest, setIsModifyingRequest] = useState(false);
  const [modifiedCapital, setModifiedCapital] = useState<number>(activeRequest?.topUpAmountNgn || 0);

  // Derived student preference
  const initialStudentTargetCurrency = useMemo(() => {
    return student?.targetCurrency || getCurrencyCode(student?.destinationCountry) || 'GBP';
  }, [student]);

  const studentTargetCountry = student?.destinationCountry || 'United Kingdom';

  const [isEditingStudentCurrency, setIsEditingStudentCurrency] = useState(false);
  const [adminOverriddenTargetCurrency, setAdminOverriddenTargetCurrency] = useState<string>('');

  useEffect(() => {
    if (initialStudentTargetCurrency) {
      setAdminOverriddenTargetCurrency(initialStudentTargetCurrency);
    }
  }, [initialStudentTargetCurrency]);

  const [inputAmount, setInputAmount] = useState<number>(0);
  const [inputCurrency, setInputCurrency] = useState<string>('NGN');

  // Derived auto-converted targets
  const calculatedNgnTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, 'NGN');
  }, [inputAmount, inputCurrency]);

  const calculatedStudentTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, adminOverriddenTargetCurrency);
  }, [inputAmount, inputCurrency, adminOverriddenTargetCurrency]);

  const calculatedGbpTarget = useMemo(() => {
    return convertCurrency(inputAmount, inputCurrency, 'GBP');
  }, [inputAmount, inputCurrency]);

  // Sync state if props change
  useEffect(() => {
    if (activeRequest) {
      setModifiedCapital(activeRequest.topUpAmountNgn || 0);
    }
  }, [activeRequest]);

  useEffect(() => {
    if (student) {
        setWindowForm(prev => ({
            ...prev,
            localCurrency: student.localCurrency || prev.localCurrency,
            timerStart: student.startDate || prev.timerStart,
            targetDays: student.durationDays?.toString() || prev.targetDays,
            extensionDays: student.extensionDays || prev.extensionDays
        }));
        setInputAmount(Number(student.targetAmountNgn) || 0);
        if (student.inputCurrencyUsed) setInputCurrency(student.inputCurrencyUsed);
    }
  }, [student]);

  const calculatedEndDate = useMemo(() => {
    if (!windowForm.timerStart) return null;
    const start = new Date(windowForm.timerStart);
    const duration = parseInt(windowForm.targetDays) || 0;
    const end = new Date(start.getTime() + (duration * 24 * 60 * 60 * 1000));
    return end.toISOString().split('T')[0];
  }, [windowForm.timerStart, windowForm.targetDays]);

  const pricingPreview = useMemo(() => {
    const amount = 1000000; // Preview for 1M
    return Math.round(amount * (pricingForm.feePercentage / 100));
  }, [pricingForm.feePercentage]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    setIsSubmitting(true);
    try {
      await onUpdatePricing(pricingForm);
      await onUpdateWindow({
        ...windowForm,
        targetGbp: calculatedGbpTarget,
        targetAmountNgn: calculatedNgnTarget,
        targetAmountForeign: calculatedStudentTarget,
        targetCurrency: adminOverriddenTargetCurrency,
        inputCurrencyUsed: inputCurrency,
        calculatedEndDate
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        variants={modalBackdropVariants}
        initial="initial" animate="animate" exit="exit"
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          variants={modalBoxVariants}
          initial="initial" animate="animate" exit="exit"
          className="bg-white dark:bg-zinc-900 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-slate-50/50 dark:bg-zinc-950/20">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white leading-none">Student Top-Up Settings</h3>
              <p className="text-slate-600 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider mt-1.5 leading-none">Configure pricing and limits for this profile</p>
            </div>
            <BouncyButton
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <XIcon className="w-6 h-6" />
            </BouncyButton>
          </div>

          {/* Tab Switcher */}
          <div className="px-6 sm:px-8 pt-6">
            <div className="bg-slate-100 dark:bg-zinc-800 p-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'config'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 font-semibold hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Window & Pricing Config
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === 'ledger'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 font-semibold hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Request Ledger & History
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 sm:p-8 no-scrollbar">
            {activeTab === 'config' ? (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Section A: Evaluation Window Parameters */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <Target className="w-4 h-4 text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest leading-none">Evaluation Window Parameters</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Dynamic Target Amount Section */}
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 dark:bg-zinc-800/60 dark:border-zinc-700/60 col-span-full">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                          POF Target Amount & Currency
                        </label>
                        {/* Student Choice Indicator Badge with Override capability */}
                        <div className="flex items-center gap-2">
                          {isEditingStudentCurrency ? (
                            <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-full pl-3 pr-1 py-1 shadow-sm">
                              <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase mr-1">Override:</span>
                              <select
                                value={adminOverriddenTargetCurrency}
                                onChange={(e) => setAdminOverriddenTargetCurrency(e.target.value)}
                                className="bg-transparent text-[10px] font-bold text-indigo-700 dark:text-indigo-300 border-none focus:ring-0 p-0 cursor-pointer"
                              >
                                <option value="GBP">GBP (£)</option>
                                <option value="CAD">CAD (C$)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                                <option value="AUD">AUD (A$)</option>
                              </select>
                              <button
                                onClick={() => setIsEditingStudentCurrency(false)}
                                className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-full transition-colors ml-1"
                              >
                                <CheckCheck className="w-3 h-3 text-emerald-500" />
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-sm">
                              Student Target: {adminOverriddenTargetCurrency} ({studentTargetCountry})
                              <button
                                onClick={() => setIsEditingStudentCurrency(true)}
                                className="ml-1 p-1 hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-full transition-colors"
                                title="Override Student Currency"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Input Amount */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mb-1">
                            Admin Entered Value
                          </span>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              value={inputAmount || ''}
                              onChange={(e) => setInputAmount(parseFloat(e.target.value) || 0)}
                              placeholder="e.g. 26000000"
                              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-3 pr-20 text-sm font-bold text-slate-900 focus:border-indigo-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white focus:outline-none transition-all"
                            />
                            {/* Currency Dropdown Selector */}
                            <select
                              value={inputCurrency}
                              onChange={(e) => setInputCurrency(e.target.value)}
                              className="absolute right-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-zinc-800 dark:text-zinc-200 border-none focus:ring-0 cursor-pointer"
                            >
                              <option value="NGN">NGN (₦)</option>
                              <option value="CAD">CAD (C$)</option>
                              <option value="GBP">GBP (£)</option>
                              <option value="USD">USD ($)</option>
                              <option value="EUR">EUR (€)</option>
                            </select>
                          </div>
                        </div>

                        {/* Live Equivalent Calculation Preview */}
                        <div className="flex flex-col justify-center rounded-xl bg-white p-3 border border-slate-200 dark:bg-zinc-900 dark:border-zinc-700 shadow-sm">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                            Converted Student Requirement ({adminOverriddenTargetCurrency})
                          </span>
                          <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                            {adminOverriddenTargetCurrency} {calculatedStudentTarget.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            Equiv. NGN: ₦{calculatedNgnTarget.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest ml-1">Target Days</label>
                      <input
                        type="number"
                        placeholder="e.g. 28"
                        value={windowForm.targetDays}
                        onChange={e => setWindowForm({ ...windowForm, targetDays: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest ml-1">Extension Days Allowed</label>
                      <input
                        type="number"
                        value={windowForm.extensionDays}
                        onChange={e => setWindowForm({ ...windowForm, extensionDays: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest ml-1">Window Start Date</label>
                      <input
                        type="date"
                        value={windowForm.timerStart}
                        onChange={e => setWindowForm({ ...windowForm, timerStart: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest ml-1">Local Currency</label>
                      <select
                        value={windowForm.localCurrency}
                        onChange={e => setWindowForm({ ...windowForm, localCurrency: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl px-5 py-3.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                      >
                        {MAJOR_CURRENCIES.map(curr => (
                          <option key={curr.code} value={curr.code}>{curr.code} - {curr.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between shadow-inner transition-colors">
                     <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Calculated End Date</p>
                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase mt-1">
                          {calculatedEndDate ? new Date(calculatedEndDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Pending Setup'}
                        </p>
                     </div>
                     <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-[8px] font-black uppercase tracking-tighter">
                        Statutory Maturity
                     </div>
                  </div>
                </div>

                {/* Section B: Top-Up Pricing & Capital Allocation */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                       <TrendingUp className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest leading-none">Top-Up Pricing & Capital Allocation</h4>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest">SERVICE FEE (%)</label>
                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{pricingForm.feePercentage}%</span>
                      </div>
                      <div className="flex gap-4 items-center">
                        <input
                          type="range" min="0.5" max="15" step="0.1"
                          value={pricingForm.feePercentage}
                          onChange={(e) => setPricingForm({ ...pricingForm, feePercentage: parseFloat(e.target.value) })}
                          className="flex-1 accent-indigo-600 bg-slate-200 dark:bg-zinc-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                        />
                        <input
                          type="number"
                          step="0.1"
                          value={pricingForm.feePercentage}
                          onChange={(e) => setPricingForm({ ...pricingForm, feePercentage: parseFloat(e.target.value) || 0 })}
                          className="w-20 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-3 text-xs font-bold text-center text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest ml-1">MAX ALLOCATION (NGN)</label>
                      <div className="relative">
                         <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₦</div>
                         <input
                           type="number"
                           value={pricingForm.maxLimit}
                           onChange={(e) => setPricingForm({ ...pricingForm, maxLimit: parseInt(e.target.value) || 0 })}
                           className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-xl pl-8 pr-5 py-4 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all"
                         />
                      </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-5 rounded-xl space-y-3 shadow-sm transition-colors">
                      <div className="flex items-center gap-2">
                         <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                         <p className="text-[10px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest">Real-time Pricing Preview</p>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-amber-200/50 dark:border-amber-900/30">
                        <span className="text-amber-800/70 dark:text-amber-200/60 uppercase tracking-tighter italic leading-none">Admin Service Fee (on ₦1,000,000)</span>
                        <span className="text-amber-900 dark:text-amber-200 text-lg font-mono leading-none">₦{pricingPreview.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Window & Pricing Configuration
                </button>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Top Section: Active / Pending Top-Up Claim */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                       <Zap className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest leading-none">Active Top-Up Claim</h4>
                  </div>

                  {!activeRequest ? (
                    <div className="py-12 text-center bg-slate-50 dark:bg-zinc-950/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 transition-colors">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-3">
                         <CheckCheck className="w-6 h-6 text-emerald-500/40" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">No pending top-up claims found</p>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 space-y-6 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Requested Capital Amount</p>
                          <div className="flex items-center gap-4">
                            {isModifyingRequest ? (
                              <div className="relative">
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 font-bold">₦</span>
                                 <input
                                   type="number"
                                   value={modifiedCapital}
                                   onChange={e => setModifiedCapital(Number(e.target.value))}
                                   className="bg-white dark:bg-zinc-950 border-2 border-indigo-500 rounded-xl pl-7 pr-4 py-2 text-xl font-black text-slate-900 dark:text-white focus:outline-none"
                                   autoFocus
                                 />
                              </div>
                            ) : (
                              <h4 className="text-3xl font-black text-slate-900 dark:text-white leading-none font-mono">₦{activeRequest.topUpAmountNgn?.toLocaleString()}</h4>
                            )}
                            <BouncyButton
                              onClick={() => setIsModifyingRequest(!isModifyingRequest)}
                              className={`p-2 rounded-lg transition-all ${isModifyingRequest ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-zinc-800 text-indigo-500 border border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50'}`}
                            >
                              {isModifyingRequest ? <CheckCheck className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                            </BouncyButton>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                           <span className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 animate-pulse">Live Claim</span>
                           <p className="text-[8px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-tighter leading-none">Logged: {new Date(activeRequest.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-5 border-t border-indigo-100 dark:border-indigo-900/20">
                         <div className="space-y-1">
                            <p className="text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Admin Service Fee</p>
                            <p className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono leading-none">₦{Math.round(modifiedCapital * (pricingForm.feePercentage / 100)).toLocaleString()}</p>
                         </div>
                         <div className="text-right space-y-1">
                            <p className="text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Payment Reference</p>
                            <div className="flex items-center justify-end gap-2">
                               <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[10px] font-black text-slate-900 dark:text-zinc-100 uppercase tracking-wider shadow-sm font-mono">
                                  {activeRequest.paymentReference || 'N/A'}
                               </div>
                            </div>
                         </div>
                      </div>

                      {activeRequest.proofUrl && (
                        <div className="pt-2">
                           <a
                             href={activeRequest.proofUrl}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-2 text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline transition-all"
                           >
                              <FileText className="w-3.5 h-3.5" />
                              View Payment Proof
                           </a>
                        </div>
                      )}

                      <div className="flex gap-4 pt-2">
                        <button
                          onClick={() => onApproveRequest(modifiedCapital)}
                          className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                          <CheckCheck className="w-4 h-4" /> Approve & Allocate Facility
                        </button>
                        <button
                          onClick={onDenyRequest}
                          className="flex-1 py-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                          <XIcon className="w-4 h-4" /> Reject Request
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Section: Settled Transaction Audit History */}
                <div className="space-y-5 pt-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                       <History className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-widest leading-none">Settled Transaction Audit History</h4>
                  </div>

                  {requestHistory.length === 0 ? (
                    <div className="py-16 text-center opacity-40 bg-slate-50 dark:bg-zinc-950/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 transition-colors">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-3">
                         <FileText className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">No previous top-up claims recorded for this student.</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm transition-colors">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400 uppercase font-bold border-b border-slate-200 dark:border-zinc-800">
                              <th className="px-6 py-4 text-left tracking-widest">Date</th>
                              <th className="px-6 py-4 text-left tracking-widest">Reference</th>
                              <th className="px-6 py-4 text-right tracking-widest">Amount (NGN)</th>
                              <th className="px-6 py-4 text-right tracking-widest">Fee Paid</th>
                              <th className="px-6 py-4 text-right tracking-widest">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900/50">
                            {requestHistory.map((req) => (
                              <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors group">
                                <td className="px-6 py-4 font-mono text-slate-500 dark:text-zinc-400 whitespace-nowrap">{new Date(req.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                   <div className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[9px] font-bold text-slate-700 dark:text-zinc-300 uppercase inline-block">
                                      {req.paymentReference || 'N/A'}
                                   </div>
                                </td>
                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">₦{req.topUpAmountNgn?.toLocaleString()}</td>
                                <td className="px-6 py-4 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">₦{req.adminServiceFeeNgn?.toLocaleString() || '0'}</td>
                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                  <div className="flex flex-col items-end gap-1">
                                     <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                       req.status === 'APPROVED'
                                         ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                                         : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                                     }`}>
                                       {req.status}
                                     </span>
                                     {req.rejectionReason && (
                                        <p className="text-[8px] text-rose-500 dark:text-rose-400/70 italic font-medium max-w-[120px] truncate" title={req.rejectionReason}>
                                           "{req.rejectionReason}"
                                        </p>
                                     )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
