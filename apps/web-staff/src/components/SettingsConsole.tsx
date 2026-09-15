import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  Database,
  RefreshCw,
  Globe,
  Zap,
  Lock,
  Activity,
  ChevronRight,
  Save,
  Info,
  Key,
  ShieldCheck,
  Bell,
  Clock,
  TrendingUp,
  Plus,
  X as XIcon,
  Edit3,
  FileText,
  Trash2,
  HardDrive,
  UserCheck,
  ZapOff,
  Archive,
  RotateCcw
} from 'lucide-react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FirestoreDatabaseExplorer } from './FirestoreDatabaseExplorer';
import { StorageExplorer } from './StorageExplorer';
import { IncidentEngine, SystemIncident } from '../services/incidentEngine';
import { toast } from 'sonner';
import { seedRequirementsClientSide } from '../utils/governanceService';

import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';

// --- Types ---

type SettingTab = 'risk' | 'destinations' | 'document_requirements' | 'api' | 'security' | 'database' | 'storage' | 'trash' | 'troubleshooting';

interface RiskConfig {
  fxBuffer: number;
  holdingDays: number;
  anomalyThreshold: number;
  gracePeriodHours: number;
}

interface BankApiKey {
  id: string;
  bankName: string;
  keyType: string;
  keyValue: string;
}

interface ApiConfig {
  bankKeys: BankApiKey[];
  oandaRefresh: number;
}

interface SecurityConfig {
  emailAlerts: boolean;
  smsGraceTrigger: boolean;
  errorAuditLog: boolean;
  sessionTimeout: number;
}

interface DestinationRule {
  code: string;
  country: string;
  cost: string;
  rule: string;
}

interface RequirementItem {
  id: string;
  label: string;
  type: 'TEXT' | 'IMAGE' | 'DOC' | 'PDF';
  description: string;
  isRequired: boolean;
  stage: number;
  templateUrl?: string;
}

// --- Main Component ---

export const SettingsConsole: React.FC<{ initialTab?: SettingTab }> = ({ initialTab }) => {
  const { theme } = useTheme();
  const { role } = useAuth();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<SettingTab>(initialTab || (window as any)._pendingSettingsTab || 'risk');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Clear the pending tab after consumption
  useEffect(() => {
    if ((window as any)._pendingSettingsTab) {
       (window as any)._pendingSettingsTab = null;
    }

    const handleSwitch = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('app:settings:switch', handleSwitch);
    return () => window.removeEventListener('app:settings:switch', handleSwitch);
  }, []);

  // Form States
  const [risk, setRisk] = useState<RiskConfig>({
    fxBuffer: 10.5,
    holdingDays: 28,
    anomalyThreshold: 2.5,
    gracePeriodHours: 24
  });

  const [api, setApi] = useState<ApiConfig>({
    bankKeys: [],
    oandaRefresh: 900
  });

  const [newBankForm, setNewBankForm] = useState({
    bankName: '',
    keyType: 'Public Key',
    keyValue: ''
  });

  const [isAddingBank, setIsAddingBank] = useState(false);

  const [security, setSecurity] = useState<SecurityConfig>({
    emailAlerts: true,
    smsGraceTrigger: false,
    errorAuditLog: true,
    sessionTimeout: 60
  });

  const [destinations, setDestinations] = useState<DestinationRule[]>([
    { code: "GBR", country: "United Kingdom", cost: "£1,334 /mo", rule: "28 Days Continuous" },
    { code: "CAN", country: "Canada", cost: "$20,635 Min", rule: "30 Days Continuous" },
    { code: "DEU", country: "Germany", cost: "€11,208 Total", rule: "90 Days Prior" },
    { code: "USA", country: "United States", cost: "I-20 Coverage", rule: "30 Days Proof" },
    { code: "OTH", country: "Others", cost: "Varies", rule: "Custom Rule" },
  ]);

  const [editingDestination, setEditingDestination] = useState<DestinationRule | null>(null);

  const [globalRequirements, setGlobalRequirements] = useState<RequirementItem[]>([]);
  const [isRequirementModalOpen, setIsRequirementModalOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<RequirementItem | null>(null);

  const [defaultCurrency, setDefaultCurrency] = useState('NGN');

  // Global App Params (Rate etc)
  const [globalParams, setGlobalParams] = useState({
    fxRate: LIVE_FX_RATE,
    lastUpdate: 'Just now'
  });

  // 1. Listen for Live Config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRisk({
          fxBuffer: data.fxBuffer || 10.5,
          holdingDays: data.holdingDays || 28,
          anomalyThreshold: data.anomalyThreshold || 2.5,
          gracePeriodHours: data.gracePeriodHours || 24
        });
        setApi({
          bankKeys: data.bankKeys || [],
          oandaRefresh: data.oandaRefresh || 900
        });
        setSecurity({
          emailAlerts: data.emailAlerts ?? true,
          smsGraceTrigger: data.smsGraceTrigger ?? false,
          errorAuditLog: data.errorAuditLog ?? true,
          sessionTimeout: data.sessionTimeout || 60
        });
        if (data.destinations) {
          setDestinations(data.destinations);
        }
        setDefaultCurrency(data.defaultCurrency || 'NGN');
        setGlobalParams({
          fxRate: data.fxRate || LIVE_FX_RATE,
          lastUpdate: data.updatedAt?.seconds
            ? new Date(data.updatedAt.seconds * 1000).toLocaleTimeString()
            : 'Recently'
        });
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // 1b. Listen for Document Requirements
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'document_requirements'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGlobalRequirements(data.globalRequirements || []);
      }
    });
    return unsub;
  }, []);

  const handleAddBank = () => {
    if (!newBankForm.bankName || !newBankForm.keyValue) return;

    const newBank: BankApiKey = {
      id: Math.random().toString(36).substr(2, 9),
      ...newBankForm
    };

    setApi({
      ...api,
      bankKeys: [...api.bankKeys, newBank]
    });

    setNewBankForm({ bankName: '', keyType: 'Public Key', keyValue: '' });
    setIsAddingBank(false);
    toast.success(`${newBankForm.bankName} configuration staged`);
  };

  const handleRemoveBank = (id: string) => {
    setApi({
      ...api,
      bankKeys: api.bankKeys.filter(b => b.id !== id)
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save global config
      await setDoc(doc(db, 'system_config', 'global'), {
        ...risk,
        ...api,
        ...security,
        destinations,
        defaultCurrency,
        fxRate: globalParams.fxRate,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Save document requirements
      await setDoc(doc(db, 'system_config', 'document_requirements'), {
        globalRequirements,
        updatedAt: serverTimestamp()
      });

      toast.success('System configuration synchronized globally');
      setTimeout(() => setIsSaving(false), 800);
    } catch (e) {
      console.error('Save settings error:', e);
      toast.error('Failed to sync global configuration');
      setIsSaving(false);
    }
  };

  const handleAddRequirement = (req: RequirementItem) => {
    setGlobalRequirements(prev => [...prev, req]);
  };

  const handleUpdateRequirement = (req: RequirementItem) => {
    setGlobalRequirements(prev => prev.map(item => item.id === req.id ? req : item));
  };

  const handleDeleteRequirement = (id: string) => {
    setGlobalRequirements(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className={`animate-in fade-in duration-500 font-sans flex flex-col h-full min-h-0 pb-4 bg-app text-main ${activeTab === 'database' ? 'space-y-4' : 'space-y-8'}`}>

      {/* Quick Save Header */}
      <header className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="group flex items-center space-x-3 px-6 py-4 bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-95 disabled:opacity-50 depth-btn-gold"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>Save Changes</span>
        </button>
      </header>

      {/* Interactive Tabs */}
      <div className={`flex items-center space-x-2 p-1.5 rounded-2xl border backdrop-blur-md overflow-x-auto no-scrollbar max-w-full ${
        theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        {[
          { id: 'risk', label: 'Risk & FX Buffers', icon: Sliders },
          { id: 'troubleshooting', label: 'Troubleshooting', icon: Info },
          { id: 'trash', label: 'Trash / Purge', icon: Trash2 },
          { id: 'database', label: 'Database Explorer', icon: Database },
          { id: 'destinations', label: 'Destination Rules', icon: Globe },
          { id: 'document_requirements', label: 'Document Requirements', icon: FileText },
          { id: 'security', label: 'Security & Alerts', icon: ShieldCheck },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingTab)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'database' ? 'flex flex-col h-full' : 'glass-card p-8 border border-white/5'} overflow-y-auto no-scrollbar`}>

        {activeTab === 'risk' && (
          <div className="space-y-10">
            {/* Live Rate Override (New) */}
            <div className={`p-6 rounded-3xl border-2 border-dashed ${theme === 'dark' ? 'bg-blue-500/5 border-slate-200 dark:border-zinc-800' : 'bg-blue-50 border-blue-200'}`}>
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                <h4 className="text-sm font-extrabold uppercase text-slate-900 dark:text-white tracking-tight">Live FX Exchange Protocol</h4>
                  </div>
                  <span className="text-[10px] font-mono text-blue-500 font-bold uppercase">Manual Master Override</span>
               </div>
               <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Current Base Rate (£1.00 = ₦?)</label>
                    <input
                      type="number"
                      value={globalParams.fxRate}
                      onChange={(e) => setGlobalParams({...globalParams, fxRate: parseFloat(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-sm font-black text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className={`px-6 py-4 rounded-2xl border ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-white border-slate-200'}`}>
                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Effective Pulse</p>
                    <p className="text-xs font-mono font-bold text-blue-500">₦{globalParams.fxRate.toLocaleString()}</p>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-xs font-extrabold uppercase text-slate-900 dark:text-white tracking-wider">Default Local Currency</label>
                <div className="grid grid-cols-3 gap-2">
                  {MAJOR_CURRENCIES.slice(0, 15).map((curr) => (
                    <button
                      key={curr.code}
                      onClick={() => setDefaultCurrency(curr.code)}
                      className={`py-3 rounded-xl border text-[10px] font-black transition-all ${
                        defaultCurrency === curr.code
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                          : theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 text-slate-500 hover:text-white' : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {curr.code} ({curr.symbol})
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-tight">Set the default operational currency for new student evaluations.</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-slate-900 dark:text-white tracking-wider">FX Volatility Buffer (%)</label>
                  <span className="text-sm font-black text-amber-500 font-mono">{risk.fxBuffer}%</span>
                </div>
                <input
                  type="range" min="1" max="25" step="0.5"
                  value={risk.fxBuffer}
                  onChange={(e) => setRisk({...risk, fxBuffer: parseFloat(e.target.value)})}
                  className="w-full accent-amber-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-tight">Safety margin applied over statutory GBP requirements to insulate against NGN/GHS devaluation.</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-slate-900 dark:text-white tracking-wider">Min. Holding Period (Days)</label>
                  <span className="text-sm font-black text-amber-500 font-mono">{risk.holdingDays} Days</span>
                </div>
                <input
                  type="range" min="7" max="90" step="1"
                  value={risk.holdingDays}
                  onChange={(e) => setRisk({...risk, holdingDays: parseInt(e.target.value)})}
                  className="w-full accent-amber-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-tight">Global evaluation window. Standard UKVI requirement is 28 continuous days.</p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-slate-900 dark:text-white tracking-wider">Anomaly Threshold (R-Ratio)</label>
                  <span className="text-sm font-black text-rose-500 font-mono">{risk.anomalyThreshold}</span>
                </div>
                <input
                  type="range" min="1" max="10" step="0.1"
                  value={risk.anomalyThreshold}
                  onChange={(e) => setRisk({...risk, anomalyThreshold: parseFloat(e.target.value)})}
                  className="w-full accent-rose-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-tight">Triggers deposit flag if (Deposit - Median) / Median exceeds this ratio. Detects "Parked Money".</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-slate-900 dark:text-white tracking-wider">Grace Period (Hours)</label>
                  <span className="text-sm font-black text-cyan-500 font-mono">{risk.gracePeriodHours}h</span>
                </div>
                <input
                  type="range" min="4" max="72" step="4"
                  value={risk.gracePeriodHours}
                  onChange={(e) => setRisk({...risk, gracePeriodHours: parseInt(e.target.value)})}
                  className="w-full accent-cyan-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-tight">Time allowed for students to respond to top-up alerts before a compliance break is logged.</p>
              </div>
            </div>
          </div>
        </div>
      )}

        {activeTab === 'destinations' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {destinations.map((d) => (
              <div key={d.code} className="glass-subcard p-6 space-y-4 relative">
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-black text-amber-500 ${
                    theme === 'dark' ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200 shadow-sm'
                  }`}>{d.code}</div>
                  <button
                    onClick={() => setEditingDestination(d)}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                    title="Edit Destination Parameters"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                <h4 className={`font-black uppercase tracking-tight truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{d.country}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase"><span className="text-slate-500">Living Expense</span><span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>{d.cost}</span></div>
                  <div className="flex justify-between text-[10px] font-bold uppercase"><span className="text-slate-500">Embassy Rule</span><span className={`text-right ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{d.rule}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'document_requirements' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <div>
                <h4 className={`text-lg font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Global Document Requirements</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Configure master checklist for all student evaluations</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const t = toast.loading('Seeding global requirements...');
                    try {
                      await seedRequirementsClientSide();
                      toast.success('Requirements seeded successfully', { id: t });
                    } catch (e: any) {
                      toast.error('Seeding failed: ' + e.message, { id: t });
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Seed Defaults</span>
                </button>
                <button
                  onClick={() => { setEditingRequirement(null); setIsRequirementModalOpen(true); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Required Item</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {globalRequirements.map((req) => (
                <div key={req.id} className="flex items-center justify-between p-6 glass-subcard transition-all hover:bg-white/[0.07]">
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                      req.type === 'PDF' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                      req.type === 'IMAGE' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                      req.type === 'DOC' ? 'bg-blue-500/10 border-slate-200 dark:border-zinc-800 text-blue-500' :
                      'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    }`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h5 className={`text-sm font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{req.label}</h5>
                        {req.isRequired && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[7px] font-black uppercase">Mandatory</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{req.type} • {req.description || 'No instructions provided'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setEditingRequirement(req); setIsRequirementModalOpen(true); }}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-blue-400 transition-all"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRequirement(req.id)}
                      className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-600 hover:text-white transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {globalRequirements.length === 0 && (
                <div className="py-20 text-center opacity-30 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                  <FileText className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Global Requirements Configured</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <div>
                <h4 className={`text-lg font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Banking API Infrastructure</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Manage secure keys for Open Banking providers</p>
              </div>
              <button
                onClick={() => setIsAddingBank(!isAddingBank)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isAddingBank ? 'bg-slate-800 text-slate-400' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                }`}
              >
                {isAddingBank ? <XIcon className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{isAddingBank ? 'Cancel' : 'Add Bank Provider'}</span>
              </button>
            </div>

            {isAddingBank && (
              <div className="glass-subcard p-8 animate-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bank / Provider Name</label>
                    <input
                      value={newBankForm.bankName}
                      onChange={e => setNewBankForm({...newBankForm, bankName: e.target.value})}
                      placeholder="e.g. Mono, Okra, Parallex"
                      className="w-full bg-slate-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Key Type</label>
                    <select
                      value={newBankForm.keyType}
                      onChange={e => setNewBankForm({...newBankForm, keyType: e.target.value})}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none"
                    >
                      <option>Public Key</option>
                      <option>Secret Key</option>
                      <option>Auth Token</option>
                      <option>Client ID</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Key Value</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={newBankForm.keyValue}
                        onChange={e => setNewBankForm({...newBankForm, keyValue: e.target.value})}
                        placeholder="Enter key value..."
                        className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handleAddBank}
                        disabled={!newBankForm.bankName || !newBankForm.keyValue}
                        className="px-6 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {api.bankKeys.map((bank) => (
                <div key={bank.id} className="flex items-center justify-between p-6 glass-subcard transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className={`text-sm font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{bank.bankName}</h5>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{bank.keyType}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="hidden md:block">
                      <p className="text-[9px] font-mono text-emerald-500 opacity-60">••••••••••••••••••••••••</p>
                    </div>
                    <button
                      onClick={() => handleRemoveBank(bank.id)}
                      className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {api.bankKeys.length === 0 && !isAddingBank && (
                <div className="py-20 text-center opacity-30 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                  <Key className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">No API Keys Configured</p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-white/5">
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-[10px] font-medium text-slate-500 leading-relaxed uppercase tracking-tighter">
                  API keys are encrypted at rest using AES-256-GCM. Changing these keys will affect live ingestion from the respective providers.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trash' && (
          <TrashManager />
        )}

        {activeTab === 'troubleshooting' && (
          <TroubleshootingHub />
        )}

        {activeTab === 'security' && (
          <div className="max-w-2xl space-y-6">
            {[
              { label: 'Email Balance Alerts', desc: 'Notify students instantly if a daily closing balance drop occurs.', key: 'emailAlerts' },
              { label: 'SMS Grace Triggers', desc: 'Send priority SMS for student-initiated top-up requests.', key: 'smsGraceTrigger' },
              { label: 'Error Audit Log', desc: 'Enable forensic tracking of UI/API reference errors.', key: 'errorAuditLog' }
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-6 glass-subcard transition-all hover:bg-white/[0.07]">
                <div>
                  <h4 className={`text-sm font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.label}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">{item.desc}</p>
                </div>
                <button
                  onClick={() => setSecurity({...security, [item.key]: !security[item.key as keyof SecurityConfig]})}
                  className={`w-12 h-6 rounded-full transition-all relative ${security[item.key as keyof SecurityConfig] ? 'bg-emerald-500' : 'bg-slate-800'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${security[item.key as keyof SecurityConfig] ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'database' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <FirestoreDatabaseExplorer />
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <StorageExplorer />
          </div>
        )}
      </div>
    </div>

    <RequirementItemModal
      isOpen={isRequirementModalOpen}
      onClose={() => setIsRequirementModalOpen(false)}
      requirement={editingRequirement}
      onSave={(req) => {
        if (editingRequirement) handleUpdateRequirement(req);
        else handleAddRequirement(req);
        setIsRequirementModalOpen(false);
      }}
    />

    <ManualEditDestinationModal
      isOpen={!!editingDestination}
      onClose={() => setEditingDestination(null)}
      destination={editingDestination}
      onSave={(updated) => {
        setDestinations(prev => prev.map(d => d.code === updated.code ? updated : d));
        setEditingDestination(null);
      }}
    />
    </div>
  );
};

const RequirementItemModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  requirement: RequirementItem | null;
  onSave: (req: RequirementItem) => void;
}> = ({ isOpen, onClose, requirement, onSave }) => {
  const [form, setForm] = useState<RequirementItem>({
    id: '',
    label: '',
    type: 'PDF',
    description: '',
    isRequired: true,
    stage: 1,
    templateUrl: ''
  });

  useEffect(() => {
    if (requirement) setForm({ ...requirement, templateUrl: requirement.templateUrl || '' });
    else setForm({ id: Math.random().toString(36).substr(2, 9), label: '', type: 'PDF', description: '', isRequired: true, stage: 1, templateUrl: '' });
  }, [requirement, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div className="glass-card w-full max-w-md animate-in zoom-in-95 duration-300 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
          <div>
            <h3 className="text-xl font-black text-main dark:text-white uppercase tracking-tight">{requirement ? 'Edit' : 'Add'} Document Requirement</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Configure structural check item</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500"><XIcon className="w-6 h-6" /></button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Field Label</label>
              <input
                value={form.label}
                onChange={e => setForm({...form, label: e.target.value})}
                placeholder="e.g. International Passport Data Page"
                className="w-full bg-slate-950 border border-slate-200 dark:border-zinc-800 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Input Type</label>
              <select
                value={form.type}
                onChange={e => setForm({...form, type: e.target.value as any})}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none"
              >
                <option value="TEXT">Text Input / Response</option>
                <option value="IMAGE">Image (.jpg, .png)</option>
                <option value="DOC">Word Document (.doc, .docx)</option>
                <option value="PDF">PDF File (.pdf)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Workflow Stage</label>
              <select
                value={form.stage}
                onChange={e => setForm({...form, stage: parseInt(e.target.value)})}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none"
              >
                <option value={1}>Stage 1: Profile & Professional</option>
                <option value={2}>Stage 2: Identity Proofs</option>
                <option value={3}>Stage 3: Financial & Tax</option>
                <option value={4}>Stage 4: Mandate & References</option>
                <option value={5}>Stage 5: Final Submission</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Instruction / Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Instructions for the student..."
                rows={3}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Template Download URL (Optional)</label>
              <input
                value={form.templateUrl}
                onChange={e => setForm({...form, templateUrl: e.target.value})}
                placeholder="e.g. /downloads/template.pdf"
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex items-center justify-between p-4 glass-subcard">
              <div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Mandatory Requirement</p>
                <p className="text-[8px] text-slate-500 uppercase font-bold mt-0.5">Blocking if not submitted</p>
              </div>
              <button
                onClick={() => setForm({...form, isRequired: !form.isRequired})}
                className={`w-12 h-6 rounded-full transition-all relative ${form.isRequired ? 'bg-emerald-500' : 'bg-slate-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${form.isRequired ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
          <button
            onClick={() => onSave(form)}
            disabled={!form.label}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {requirement ? 'Commit Requirement Change' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ManualEditDestinationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  destination: DestinationRule | null;
  onSave: (d: DestinationRule) => void;
}> = ({ isOpen, onClose, destination, onSave }) => {
  const [form, setForm] = useState<DestinationRule>({ code: '', country: '', cost: '', rule: '' });

  useEffect(() => {
    if (destination) setForm(destination);
  }, [destination]);

  if (!isOpen || !destination) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md" onClick={onClose}>
      <div className="glass-card w-full max-w-md animate-in zoom-in-95 duration-300 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
          <div>
            <h3 className="text-xl font-black text-main dark:text-white uppercase tracking-tight">Edit Rule: {destination.code}</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Manual Parameter Override</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500"><XIcon className="w-6 h-6" /></button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Country Name</label>
              <input
                value={form.country}
                onChange={e => setForm({...form, country: e.target.value})}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Living Expense Requirement</label>
              <input
                value={form.cost}
                onChange={e => setForm({...form, cost: e.target.value})}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Embassy / Holding Rule</label>
              <input
                value={form.rule}
                onChange={e => setForm({...form, rule: e.target.value})}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          <button
            onClick={() => onSave(form)}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20 active:scale-95 transition-all"
          >
            Update Staged Rule
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsConsole;

const TrashManager: React.FC = () => {
  const [archivedUsers, setArchivedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for isArchived flag OR status: ARCHIVED for backward compatibility
    const q = query(collection(db, 'users'), where('isArchived', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      setArchivedUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const calculateDaysLeft = (archivedAt: any) => {
    if (!archivedAt) return 7;
    const start = archivedAt instanceof Timestamp ? archivedAt.toMillis() : new Date(archivedAt).getTime();
    const expiry = start + (7 * 24 * 60 * 60 * 1000); // 7 day window
    const diff = expiry - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handlePurge = async (uid: string, name: string) => {
    if (!window.confirm(`PERMANENT DATA WIPE: Are you sure you want to completely erase ${name}? This will delete their Auth account, Firestore documents, and all Storage files. THIS CANNOT BE UNDONE.`)) return;

    const t = toast.loading(`Executing cascading purge for ${name}...`);
    try {
      const functions = getFunctions(app);
      const deleteUserFn = httpsCallable(functions, "deleteUserCompletely");

      const response: any = await deleteUserFn({ targetUid: uid });

      if (response.data?.success) {
        toast.success("Deleted successfully", { id: t });
      } else {
        throw new Error(response.data?.message || "Purge failed");
      }
    } catch (e: any) {
      console.error("Purge failed:", e);
      toast.error(e.message || "Failed to execute cascading purge.", { id: t });
    }
  };

  const handleRestore = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        isArchived: false,
        hardDeleted: false,
        status: 'ACTIVE',
        updatedAt: serverTimestamp()
      });
      toast.success("User restored to active roster");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
           <h4 className="text-sm font-black uppercase text-main dark:text-white tracking-tight">System Recycle Bin</h4>
           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Soft-archived profiles awaiting hard deletion</p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500" /></div>
      ) : archivedUsers.length === 0 ? (
        <div className="py-20 text-center opacity-20 flex flex-col items-center gap-4">
           <Trash2 className="w-12 h-12" />
           <p className="text-xs font-black uppercase tracking-[0.2em]">Trash is Empty</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {archivedUsers.map(user => {
             const daysLeft = calculateDaysLeft(user.archivedAt);
             return (
               <div key={user.id} className="p-6 rounded-3xl bg-zinc-900/90 border-zinc-800 shadow-none space-y-4 relative overflow-hidden group">
                  <div className="flex justify-between items-start">
                     <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-amber-500 shrink-0">
                           <Archive className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                           <p className="text-sm font-bold text-white uppercase truncate">{user.displayName || 'Unknown Student'}</p>
                           <p className="text-[9px] font-mono text-slate-500 truncate">{user.email}</p>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <button
                           onClick={() => handleRestore(user.id)}
                           title="Restore User"
                           className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/10"
                        >
                           <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                           onClick={() => handlePurge(user.id, user.displayName)}
                           title="Permanent Wipe"
                           className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-lg shadow-rose-500/10"
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                        daysLeft <= 2 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-amber-500/10 text-amber-500'
                     }`}>
                        <Clock className="w-2.5 h-2.5" />
                        {daysLeft} Days Left to Restore
                     </span>
                     <p className="text-[8px] font-bold text-slate-600 uppercase">Archived: {user.archivedAt?.seconds ? new Date(user.archivedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                  </div>
               </div>
             );
           })}
        </div>
      )}
    </div>
  );
};

const TroubleshootingHub: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
         <h4 className="text-sm font-black uppercase text-main dark:text-white tracking-tight">Technical Knowledge Base</h4>
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Past incidents and verified resolution strategies</p>
      </div>

      <div className="space-y-4">
         {[
           { code: 'AUTH_SESSION_EXPIRED', pattern: 'invalid_rapt', res: 'Run "gcloud auth application-default login" in terminal.' },
           { code: 'TEMPLATE_MISSING', pattern: 'Upgrade_Form.pdf 404', res: 'Ensure file is in apps/server/assets folder with correct underscore naming.' },
           { code: 'CORS_PROTOCOL_BLOCK', pattern: 'Mixed Content', res: 'Synchronize HTTPS/HTTP between frontend and backend in .env.' },
           { code: 'DB_INDEX_REQUIRED', pattern: 'needs an index', res: 'Click the Firebase link in the error console to auto-generate.' },
         ].map(issue => (
           <div key={issue.code} className="p-6 rounded-3xl bg-blue-600/5 border border-blue-500/20 space-y-3">
              <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{issue.code}</span>
                 <span className="text-[8px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono italic">Match: {issue.pattern}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Resolution Steps</p>
                 <p className="text-xs font-bold text-white">{issue.res}</p>
              </div>
           </div>
         ))}

         <div className="p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-100/40 dark:bg-slate-900/40 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
            <div>
               <p className="text-xs font-black text-main dark:text-white uppercase tracking-widest">New Incident Encountered?</p>
               <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xs mx-auto mt-2 italic">"If you see an error not listed above, please paste the code here and we will build a recovery protocol for it."</p>
            </div>
         </div>
      </div>
    </div>
  );
};
