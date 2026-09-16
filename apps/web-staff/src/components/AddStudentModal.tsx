import React, { useState, useEffect } from 'react';
import {
  X as XIcon,
  Search,
  UserPlus,
  Globe,
  Mail,
  User,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Plus
} from 'lucide-react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search');
  const [isSubmitting, setIsSaving] = useState(false);

  // Search Tab State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Manual Tab State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    country: 'GBR',
    targetGbp: 0
  });

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSearchError('');
    try {
      const lowerQuery = searchQuery.toLowerCase().trim();
      let results: any[] = [];

      // Fetch all users (limit 500 for safety) and filter locally for best reliability
      const q = query(collection(db, 'users'), limit(500));
      const snap = await getDocs(q);

      results = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((u: any) => {
        const n = (u.displayName || '').toLowerCase();
        const e = (u.email || '').toLowerCase();
        const w = (u.username || '').toLowerCase();
        const uid = (u.uid || '').toLowerCase();

        // Match any part of the query in name, email, or username
        return n.includes(lowerQuery) || e.includes(lowerQuery) || w.includes(lowerQuery) || uid === lowerQuery;
      });

      if (snap.empty) {
        setSearchError('The user database is empty. Try creating a user first.');
      } else if (results.length === 0) {
        setSearchError(`Found ${snap.docs.length} users, but none match "${searchQuery}".`);
      }

      setSearchResults(results);
    } catch (e: any) {
      console.error('Search error:', e);
      setSearchError(e.message || 'Check your connection or permissions');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddRegistered = async (user: any) => {
    setIsSaving(true);
    try {
      // 1. Check for existing evaluation to prevent duplication
      const q = query(collection(db, 'pof_evaluations'), where('userId', '==', user.id));
      const existing = await getDocs(q);

      if (!existing.empty) {
        toast.error('This student already has an active evaluation profile.');
        setIsSaving(false);
        return;
      }

      await addDoc(collection(db, 'pof_evaluations'), {
        userId: user.id,
        userEmail: user.email,
        userName: user.displayName || user.email,
        status: 'PENDING',
        isApproved: false,
        targetGBP: 0,
        visaRoute: 'UK Student Visa (Tier 4)',
        startDate: '', // Leave empty until Admin explicitly starts it
        anomalyRatio: 0.00,
        fxBufferPercent: 0.0,
        expirationDate: null,
        timerCustomMessage: null,
        isTimerActive: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSuccess();
      onClose();
    } catch (e) {
      console.error('Add student error:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // 1. Check if email already registered as a user
      const uQ = query(collection(db, 'users'), where('email', '==', formData.email.toLowerCase().trim()));
      const uSnap = await getDocs(uQ);

      if (!uSnap.empty) {
        toast.error('A user with this email is already registered. Please use "Search Registered" instead.');
        setIsSaving(false);
        return;
      }

      // 2. Check if email already in evaluations
      const eQ = query(collection(db, 'pof_evaluations'), where('userEmail', '==', formData.email.toLowerCase().trim()));
      const eSnap = await getDocs(eQ);

      if (!eSnap.empty) {
        toast.error('An evaluation for this email already exists.');
        setIsSaving(false);
        return;
      }

      const studentId = `STU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await addDoc(collection(db, 'pof_evaluations'), {
        userId: studentId, // Using generated ID as fallback userId
        userEmail: formData.email.toLowerCase().trim(),
        userName: formData.name,
        status: 'PENDING',
        isApproved: false,
        targetGBP: formData.targetGbp,
        visaRoute: `${formData.country} Student Visa`,
        startDate: '', // Leave empty until Admin explicitly starts it
        anomalyRatio: 0.00,
        fxBufferPercent: 0.0,
        expirationDate: null,
        timerCustomMessage: null,
        isTimerActive: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSuccess();
      onClose();
    } catch (e) {
      console.error('Manual add error:', e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="glass-card w-full max-w-lg animate-in zoom-in-95 duration-300 flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Modal Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-main dark:text-white uppercase tracking-tight">Add Student</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Start checking a student</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <XIcon className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-8 pt-6">
          <div className="flex items-center space-x-2 bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'search' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Search Registered
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Manual Entry
            </button>
          </div>
        </div>

        <div className="p-8">
          {activeTab === 'search' ? (
            <div className="space-y-6">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full input-rounded pl-12 pr-4 py-4 text-xs font-medium"
                />
                <button
                  onClick={handleSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-amber-500 text-slate-950 rounded-xl font-black text-[10px] uppercase hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                >
                  Search
                </button>
              </div>

              {searchError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono">
                  {searchError}
                </div>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                {isSearching ? (
                  <div className="py-10 text-center">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Searching for student...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleAddRegistered(user)}
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-between p-4 bg-slate-950 border border-white/5 rounded-2xl hover:border-amber-500/40 transition-all group group-disabled:opacity-50"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center font-black text-xs text-amber-500">
                          {user.displayName?.[0] || 'U'}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-main dark:text-white leading-tight">{user.displayName || user.username || 'User'}</p>
                          <p className="text-[10px] font-mono text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <Plus className="w-5 h-5 text-slate-600 group-hover:text-amber-500 transition-colors" />
                    </button>
                  ))
                ) : searchQuery && (
                  <div className="py-10 text-center bg-slate-950/50 rounded-3xl border border-dashed border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">No matching students found</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Identity</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    type="text"
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-xs font-medium focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Endpoint</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    type="email"
                    placeholder="student@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-xs font-medium focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destination</label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({...formData, country: e.target.value})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-amber-500/50 transition-all"
                  >
                    <option value="GBR">United Kingdom (GBR)</option>
                    <option value="CAN">Canada (CAN)</option>
                    <option value="DEU">Germany (DEU)</option>
                    <option value="USA">United States (USA)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target (GBP)</label>
                  <input
                    type="number"
                    value={formData.targetGbp}
                    onChange={(e) => setFormData({...formData, targetGbp: parseInt(e.target.value)})}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-3.5 text-xs font-bold text-emerald-400 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-4 flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-tr from-amber-400 to-amber-600 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-500/10 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Create Student Profile</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
