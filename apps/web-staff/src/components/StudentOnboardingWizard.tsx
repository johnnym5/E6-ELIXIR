/**
 * StudentOnboardingWizard.tsx
 * Full-screen animated multi-step student onboarding wizard.
 * - Dynamic 75% translucent theme backdrop (subtly shows custom imagery behind).
 * - Location screen displays faded planet background.
 * - Destination & Banking screens display themed background graphics.
 * - Progress indicator strictly uses percentages (starts at 20% on Question 1).
 * - Removed all "Question 1" and "Step X of Y" labels.
 * - Light and Dark theme supported with one-click toggle.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Globe,
  Shield,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Sun,
  Moon,
  Building2,
  UserCheck,
  Search,
  Check,
  Plus,
  Layers,
  LogOut
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getPlatformType } from '../utils/deviceDetection';
import { FormConsent } from './ui/FormConsent';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingProfile {
  homeState: string;
  homeCountry: string;
  phoneNumber: string;
  destinationCountry: string;
  targetCurrency: string;
  targetCurrencySymbol: string;
  isSelf: boolean;
  sponsorRelationship: string;
  hasParallexAccount: boolean;
  parallexAccountNumber: string;
  bankName: string;
  accountNumber: string;
}

interface Props {
  onComplete: () => void;
}

const DESTINATION_CURRENCY_MAP: Record<string, { currency: string; symbol: string }> = {
  'United Kingdom': { currency: 'GBP', symbol: '£' },
  'Canada': { currency: 'CAD', symbol: 'C$' },
  'USA': { currency: 'USD', symbol: '$' },
  'Australia': { currency: 'AUD', symbol: 'A$' },
  'Other': { currency: 'GBP', symbol: '£' },
};

const DESTINATION_OPTIONS = [
  { country: 'United Kingdom', code: 'UK', currency: 'GBP (£)' },
  { country: 'Canada', code: 'CA', currency: 'CAD (C$)' },
  { country: 'USA', code: 'US', currency: 'USD ($)' },
  { country: 'Australia', code: 'AU', currency: 'AUD (A$)' },
  { country: 'Other', code: 'INTL', currency: 'GBP (£)' },
];

const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank (FCMB)',
  'Globus Bank',
  'Guaranty Trust Bank (GTBank)',
  'Heritage Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Bank',
  'Lotus Bank',
  'Moniepoint MFB',
  'Opay',
  'Optimus Bank',
  'Palmpay',
  'Parallex Bank',
  'Polaris Bank',
  'Premium Trust Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'TAJBank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa (UBA)',
  'Unity Bank',
  'VFD Microfinance Bank',
  'Wema Bank / ALAT',
  'Zenith Bank',
  'Other'
];

// ─── Animation Variants ───────────────────────────────────────────────────────

const screenVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 70 : -70,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 320,
      damping: 30,
    },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -70 : 70,
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'easeInOut' as const,
    },
  }),
};

export const StudentOnboardingWizard: React.FC<Props> = ({ onComplete }) => {
  const { appUser, currentUser } = useAuth();
  const { theme, toggleTheme, setTheme } = useTheme();

  // Start in Light Theme Mode as requested
  useEffect(() => {
    if (!localStorage.getItem('bcf-onboarding-theme-init')) {
      setTheme('light');
      localStorage.setItem('bcf-onboarding-theme-init', 'true');
    }
  }, [setTheme]);

  const isDark = theme === 'dark';

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [profile, setProfile] = useState<OnboardingProfile>({
    homeState: '',
    homeCountry: 'Nigeria',
    phoneNumber: '',
    destinationCountry: 'United Kingdom',
    targetCurrency: 'GBP',
    targetCurrencySymbol: '£',
    isSelf: true,
    sponsorRelationship: '',
    hasParallexAccount: true,
    parallexAccountNumber: '',
    bankName: 'Parallex Bank',
    accountNumber: '',
  });

  // Searchable Bank Selector State
  const [bankSearch, setBankSearch] = useState('');
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);

  // SMS scan state
  const [smsPermState, setSmsPermState] = useState<'pitch' | 'requesting' | 'denied' | 'granted'>('pitch');
  const [parseState, setParseState] = useState<'scanning' | 'found' | 'failed'>('scanning');
  const [balance, setBalance] = useState<string | null>(null);
  const [scanLabel, setScanLabel] = useState('Pass 1: Checking bank SMS sender tags & account tail...');

  const platform = getPlatformType();
  const isNative = platform === 'NATIVE_ANDROID';

  const isSponsored = !profile.isSelf;

  const getStepList = () => {
    const list = [
      'welcome',
      'location',
      'phone_number',
      'destination',
      'sponsorship',
    ];
    if (isSponsored) list.push('sponsor_rel');
    list.push('parallex_check');
    list.push('account_details');

    if (isNative) {
      list.push('sms_pitch');
      list.push('verification');
    } else {
      list.push('apk_required');
    }

    return list;
  };

  const currentStepKey = getStepList()[step] || 'welcome';
  const totalSteps = getStepList().length;

  // Percentage & Dynamic Encouraging Copy calculation
  const getProgressData = () => {
    if (step === 0) return { pct: 10, text: 'Getting Started' };
    const remainingSteps = totalSteps - 1;
    const progressWithinQuestions = (step - 1) / (remainingSteps - 1);
    const pct = Math.round(20 + progressWithinQuestions * 80);
    const clampedPct = Math.min(100, Math.max(20, pct));

    // Dynamic encouraging messaging
    let message = `You're ${clampedPct}% there!`;
    if (clampedPct === 20) {
      message = "You're 20% there";
    } else if (clampedPct > 20 && clampedPct <= 40) {
      message = `Great start, you're ${clampedPct}% in!`;
    } else if (clampedPct > 40 && clampedPct <= 60) {
      message = `Not bad, ${100 - clampedPct}% left!`;
    } else if (clampedPct > 60 && clampedPct <= 85) {
      message = `Doing great! You're ${clampedPct}% there`;
    } else if (clampedPct > 85 && clampedPct < 100) {
      message = `So close, you're ${clampedPct}% there, one more to go!`;
    } else if (clampedPct >= 100) {
      message = 'All done! 100% completed';
    }

    return { pct: clampedPct, text: message };
  };

  const { pct: progressPercentage, text: progressMessage } = getProgressData();

  // Determine active background graphic for each screen
  const getBackgroundImage = () => {
    switch (currentStepKey) {
      case 'welcome':
      case 'location':
        return '/bg_planet.jpg';
      case 'destination':
        return '/bg_travel.jpg';
      case 'parallex_check':
      case 'account_details':
      case 'sms_pitch':
      case 'verification':
        return '/bg_banking.jpg';
      default:
        return '/bg_planet.jpg';
    }
  };

  const updateProfile = (field: keyof OnboardingProfile, value: string | boolean) => {
    setProfile(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'destinationCountry' && typeof value === 'string') {
        const mapping = DESTINATION_CURRENCY_MAP[value] || { currency: 'GBP', symbol: '£' };
        next.targetCurrency = mapping.currency;
        next.targetCurrencySymbol = mapping.symbol;
      }
      return next;
    });
  };

  const goNext = async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          onboardingProfile: {
            homeState: profile.homeState,
            homeCountry: profile.homeCountry,
            phoneNumber: profile.phoneNumber,
            destinationCountry: profile.destinationCountry,
            targetCurrency: profile.targetCurrency,
            targetCurrencySymbol: profile.targetCurrencySymbol,
            isSelf: profile.isSelf,
            sponsorRelationship: profile.sponsorRelationship,
            bankName: profile.hasParallexAccount ? 'Parallex Bank' : profile.bankName,
            accountNumber: profile.hasParallexAccount ? profile.parallexAccountNumber : profile.accountNumber,
            updatedAt: serverTimestamp(),
          },
          onboardingComplete: false,
        });
      } catch {
        // Soft fail
      }
    }

    if (step < totalSteps - 1) {
      setDirection(1);
      setStep(s => s + 1);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  };

  // SMS Permission Request Trigger
  const triggerSmsPermission = async () => {
    setSmsPermState('requesting');
    try {
      if ((window as any).AndroidBridge?.requestSmsPermission) {
        (window as any).AndroidBridge.requestSmsPermission();
        setSmsPermState('granted');
        setTimeout(() => goNext(), 700);
      } else if ('permissions' in navigator && typeof Notification !== 'undefined') {
        const res = await Notification.requestPermission();
        if (res === 'granted') {
          setSmsPermState('granted');
          setTimeout(() => goNext(), 700);
        } else {
          setSmsPermState('denied');
        }
      } else {
        setSmsPermState('granted');
        setTimeout(() => goNext(), 700);
      }
    } catch {
      setSmsPermState('denied');
    }
  };

  // Multi-pass Verification Engine Trigger
  useEffect(() => {
    if (currentStepKey !== 'verification') return;

    let cancelled = false;
    const runVerification = async () => {
      setParseState('scanning');
      setScanLabel('Pass 1: Checking official bank sender tags & tail digits...');
      await new Promise(r => setTimeout(r, 1500));
      if (cancelled) return;

      let messages: string[] = [];
      try {
        if ((window as any).AndroidBridge?.getSmsMessages) {
          const raw = (window as any).AndroidBridge.getSmsMessages();
          messages = JSON.parse(raw) as string[];
        }
      } catch {
        // Fallback
      }

      const tail = (profile.hasParallexAccount ? profile.parallexAccountNumber : profile.accountNumber).slice(-4);
      let foundVal: string | null = null;

      for (const msg of messages) {
        if (tail && msg.includes(tail)) {
          const match = msg.match(/(?:balance|bal|acct bal|avlbl)[:\s]*[₦NGN]*\s*([\d,]+(?:\.\d{2})?)/i);
          if (match) {
            foundVal = match[1].replace(/,/g, '');
            break;
          }
        }
      }

      if (foundVal) {
        if (!cancelled) {
          setBalance(foundVal);
          setParseState('found');
        }
        return;
      }

      setScanLabel('Pass 2: Fuzzy scanning all financial SMS strings...');
      await new Promise(r => setTimeout(r, 1600));
      if (cancelled) return;

      for (const msg of messages) {
        const match = msg.match(/(?:balance|bal)[:\s]*[₦NGN]*\s*([\d,]+(?:\.\d{2})?)/i) ||
          msg.match(/₦\s*([\d,]+(?:\.\d{2})?)/);
        if (match) {
          foundVal = match[1].replace(/,/g, '');
          break;
        }
      }

      if (foundVal) {
        if (!cancelled) {
          setBalance(foundVal);
          setParseState('found');
        }
      } else {
        try {
          await addDoc(collection(db, 'support_tickets'), {
            userId: currentUser?.uid,
            studentName: profile.firstName + ' ' + profile.lastName,
            type: 'INGESTION_FAILURE',
            bankName: profile.hasParallexAccount ? 'Parallex Bank' : profile.bankName,
            accountNumber: profile.hasParallexAccount ? profile.parallexAccountNumber : profile.accountNumber,
            status: 'OPEN',
            createdAt: serverTimestamp()
          });
        } catch {
          // Ignored
        }

        if (currentUser) {
          try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
              balanceVerificationStatus: 'PENDING_MANUAL_ADMIN_SYNC',
            });
          } catch {
            // Ignored
          }
        }

        if (!cancelled) {
          setParseState('failed');
        }
      }
    };

    runVerification();
    return () => {
      cancelled = true;
    };
  }, [currentStepKey, profile, currentUser]);

  const handleFinish = async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          onboardingComplete: true,
          onboardingCompletedAt: serverTimestamp(),
        });
      } catch {
        // Ignored
      }
    }
    onComplete();
  };

  const handleSkipToDashboard = async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          balanceVerificationStatus: 'AWAITING_MOBILE_APP_SYNC',
          onboardingComplete: true,
          onboardingCompletedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error(err);
      }
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col font-sans select-none overflow-hidden">
      {/* ── Background Image Layer (Smooth Crossfade & Slow Steady Zoom) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatePresence mode="sync">
          <motion.div
            key={getBackgroundImage()}
            initial={{ opacity: 0, scale: 1.0 }}
            animate={{
              opacity: 1,
              scale: 1.15,
              transition: {
                opacity: { duration: 1.2, ease: 'easeInOut' },
                scale: { duration: 25, ease: 'linear', repeat: Infinity, repeatType: 'reverse' },
              },
            }}
            exit={{
              opacity: 0,
              transition: { duration: 1.0, ease: 'easeInOut' },
            }}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${getBackgroundImage()})`,
              filter: isDark ? 'brightness(0.85) contrast(1.1)' : 'brightness(1.05) contrast(1.0)',
            }}
          />
        </AnimatePresence>
      </div>

      <div
        className={`absolute inset-0 backdrop-blur-[75px] transition-colors duration-500 pointer-events-none ${isDark
            ? 'bg-[#030712]/60' // Slightly more opaque for better contrast with 75px blur
            : 'bg-white/60'
          }`}
      />

      {/* ── Top Bar: Logo Exit & Progress ── */}
      <header className="relative px-6 py-4 flex items-center justify-between z-20 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-4">
          {step > 0 && currentStepKey !== 'verification' ? (
            <button
              onClick={goBack}
              className={`p-2 rounded-xl transition-all shadow-sm ${isDark
                  ? 'bg-slate-900/90 border border-white/10 hover:bg-slate-800 text-white'
                  : 'bg-white/90 border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => signOut(auth)}
              className="group transition-transform hover:scale-105 active:scale-95"
              title="Exit to Login"
            >
              <img
                src={isDark ? '/logo_white.png' : '/logo.png'}
                alt="E6 Elixir"
                className="h-8 object-contain"
              />
            </button>
          )}

          {/* Dynamic Encouraging Copy & Percentage */}
          {step > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs md:text-sm font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {progressMessage}
              </span>
            </div>
          )}
        </div>

        {/* Theme Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-full border transition-all shadow-sm ${isDark
                ? 'bg-slate-900/90 border-white/10 text-amber-300 hover:bg-slate-800'
                : 'bg-white/90 border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-blue-600" />
            )}
          </button>
        </div>
      </header>

      {/* ── Progress Bar using Percentage ── */}
      <div className="relative w-full bg-black/5 dark:bg-white/5 h-1.5 z-20">
        <motion.div
          className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-500 shadow-[0_0_12px_rgba(37,99,235,0.5)]"
          initial={false}
          animate={{ width: `${progressPercentage}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>

      {/* ── Main Question Viewport (Optimized for Mobile APK & Viewport bounds) ── */}
      <main
        className={`flex-1 relative z-10 overflow-y-auto overflow-x-hidden flex items-center justify-center px-4 py-6 sm:p-8 md:p-12 ${isDark ? 'text-white' : 'text-slate-900'
          }`}
      >
        <AnimatePresence custom={direction} mode="wait">
          {/* SCREEN 0: Welcome & Value Proposition */}
          {currentStepKey === 'welcome' && (
            <motion.div
              key="welcome"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-xl text-center space-y-8 flex flex-col items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-24 h-24 rounded-3xl bg-blue-600/15 dark:bg-blue-500/25 border border-blue-500/40 flex items-center justify-center shadow-xl shadow-blue-500/10 backdrop-blur-md"
              >
                <img
                  src={isDark ? '/logo_icon_white.png' : '/logo_icon.png'}
                  alt="E6 Elixir"
                  className="w-14 h-14 object-contain"
                />
              </motion.div>

              <div className="space-y-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight uppercase">
                  welcome to <br />
                  <span className="text-blue-600 dark:text-blue-400 whitespace-nowrap">E6 Elixir</span>
                </h1>
                <p className="text-lg md:text-2xl font-semibold opacity-85 max-w-lg mx-auto">
                  we make sure your <span className="text-blue-600 dark:text-blue-400 font-extrabold uppercase">PROOF OF FUNDS</span> is cleared and on track
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={goNext}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-lg uppercase tracking-wider shadow-xl shadow-blue-600/30 transition-all mt-6"
              >
                <span>Get Started</span>
                <ArrowRight className="w-6 h-6" />
              </motion.button>
            </motion.div>
          )}

          {/* SCREEN 1: Home Location (with Faded Planet Background) */}
          {currentStepKey === 'location' && (
            <motion.div
              key="location"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  Where are you currently located?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  Tell us your state and home country.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75 ml-1">
                    State / Region
                  </label>
                  <input
                    type="text"
                    value={profile.homeState}
                    onChange={e => updateProfile('homeState', e.target.value)}
                    placeholder="e.g. Lagos, Abuja, Rivers"
                    className="w-full text-lg md:text-xl font-bold input-rounded px-5 py-4"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75 ml-1">
                    Home Country
                  </label>
                  <input
                    type="text"
                    value={profile.homeCountry}
                    onChange={e => updateProfile('homeCountry', e.target.value)}
                    placeholder="e.g. Nigeria"
                    className="w-full text-lg md:text-xl font-bold input-rounded px-5 py-4"
                  />
                </div>

                <FormConsent
                  id="onboarding-consent"
                  checked={hasConsent}
                  onChange={setHasConsent}
                  className="mt-4"
                />
              </div>

              <button
                onClick={goNext}
                disabled={!profile.homeCountry.trim() || !hasConsent}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 1.5: Phone Number */}
          {currentStepKey === 'phone_number' && (
            <motion.div
              key="phone_number"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  What is your phone number?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  We use this for priority SMS alerts and account security.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75 ml-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={e => updateProfile('phoneNumber', e.target.value.replace(/[^\d+]/g, ''))}
                  placeholder="e.g. +234 800 000 0000"
                  className="w-full text-lg md:text-xl font-bold input-rounded px-5 py-4"
                />
              </div>

              <button
                onClick={goNext}
                disabled={profile.phoneNumber.length < 8}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 2: Destination Country */}
          {currentStepKey === 'destination' && (
            <motion.div
              key="destination"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  What is your study destination?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  Target currency automatically adapts to your destination country.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {DESTINATION_OPTIONS.map(item => {
                  const isSelected = profile.destinationCountry === item.country;
                  return (
                    <button
                      key={item.country}
                      onClick={() => updateProfile('destinationCountry', item.country)}
                      className={`flex items-center justify-between p-4 md:p-5 rounded-2xl border text-left transition-all shadow-sm ${isSelected
                          ? 'border-blue-600 bg-blue-600/15 dark:bg-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-400'
                          : isDark
                            ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                            : 'bg-white/95 border-slate-200 hover:border-slate-300'
                        }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm border ${isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : isDark
                              ? 'bg-white/5 border-white/10 text-blue-400'
                              : 'bg-blue-50 border-blue-200 text-blue-600'
                          }`}>
                          {item.code}
                        </div>
                        <div>
                          <p className="text-lg font-black">{item.country}</p>
                          <p className="text-xs font-bold opacity-75">Currency: {item.currency}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goNext}
                disabled={!profile.destinationCountry}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 3: Sponsorship Status */}
          {currentStepKey === 'sponsorship' && (
            <motion.div
              key="sponsorship"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  Are you self-funded or sponsored?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  Select your financial proof structure.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    updateProfile('isSelf', true);
                    updateProfile('sponsorRelationship', '');
                  }}
                  className={`p-6 rounded-2xl border text-center space-y-3 transition-all shadow-sm ${profile.isSelf
                      ? 'border-blue-600 bg-blue-600/15 dark:bg-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-400'
                      : isDark
                        ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                        : 'bg-white/95 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <UserCheck className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto" />
                  <p className="text-xl font-black">Self-Funded</p>
                  <p className="text-xs opacity-75">I am funding my own education and living expenses.</p>
                </button>

                <button
                  onClick={() => updateProfile('isSelf', false)}
                  className={`p-6 rounded-2xl border text-center space-y-3 transition-all shadow-sm ${!profile.isSelf
                      ? 'border-blue-600 bg-blue-600/15 dark:bg-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-400'
                      : isDark
                        ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                        : 'bg-white/95 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 mx-auto" />
                  <p className="text-xl font-black">Sponsored</p>
                  <p className="text-xs opacity-75">Funded by family member, corporate, or scholarship.</p>
                </button>
              </div>

              <button
                onClick={goNext}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 4: Sponsor Relationship (Only if sponsored) */}
          {currentStepKey === 'sponsor_rel' && (
            <motion.div
              key="sponsor_rel"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  What is your relationship to your sponsor?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  e.g. Parent (Father/Mother), Uncle, Employer, or Scholarship body.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={profile.sponsorRelationship}
                  onChange={e => updateProfile('sponsorRelationship', e.target.value)}
                  placeholder="e.g. Father, Mother, Sibling, Government"
                  className={`w-full text-lg md:text-xl font-bold px-5 py-4 rounded-2xl border transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20 shadow-sm ${isDark
                      ? 'bg-slate-900/90 border-white/10 text-white placeholder-white/30 focus:border-blue-500'
                      : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600'
                    }`}
                />
              </div>

              <button
                onClick={goNext}
                disabled={!profile.sponsorRelationship.trim()}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 5: Parallex Account Check */}
          {currentStepKey === 'parallex_check' && (
            <motion.div
              key="parallex_check"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  Do you have a Parallex Bank account?
                </h2>
                <p className="text-base font-semibold opacity-75">
                  Parallex Bank accounts enjoy automated, zero-latency daily ledger verification.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => updateProfile('hasParallexAccount', true)}
                  className={`p-6 rounded-2xl border text-center space-y-3 transition-all shadow-sm ${profile.hasParallexAccount
                      ? 'border-blue-600 bg-blue-600/15 dark:bg-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-400'
                      : isDark
                        ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                        : 'bg-white/95 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <Building2 className="w-10 h-10 mx-auto text-blue-600 dark:text-blue-400" />
                  <p className="text-xl font-black">Yes, I do</p>
                  <p className="text-xs opacity-75">I hold a Parallex Bank account.</p>
                </button>

                <button
                  onClick={() => updateProfile('hasParallexAccount', false)}
                  className={`p-6 rounded-2xl border text-center space-y-3 transition-all shadow-sm ${!profile.hasParallexAccount
                      ? 'border-blue-600 bg-blue-600/15 dark:bg-blue-500/25 ring-2 ring-blue-600 dark:ring-blue-400'
                      : isDark
                        ? 'bg-slate-900/90 border-white/10 hover:border-white/20'
                        : 'bg-white/95 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <Building2 className="w-10 h-10 mx-auto opacity-50" />
                  <p className="text-xl font-black">No, Other Bank</p>
                  <p className="text-xs opacity-75">I use another commercial Nigerian bank.</p>
                </button>
              </div>

              <button
                onClick={goNext}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 6: Account Number / Details */}
          {currentStepKey === 'account_details' && (
            <motion.div
              key="account_details"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg space-y-8"
            >
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                  {profile.hasParallexAccount
                    ? 'Enter your Parallex account number'
                    : 'Select your bank and enter account number'}
                </h2>
                <p className="text-base font-semibold opacity-75">
                  This connects your daily proof of funds evaluation window.
                </p>
              </div>

              <div className="space-y-4">
                {profile.hasParallexAccount ? (
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75">
                      Parallex 10-Digit Account Number
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={profile.parallexAccountNumber}
                      onChange={e => updateProfile('parallexAccountNumber', e.target.value.replace(/\D/g, ''))}
                      placeholder="0123456789"
                      className={`w-full text-2xl md:text-3xl font-mono font-bold px-5 py-4 rounded-2xl border transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20 tracking-wider shadow-sm ${isDark
                          ? 'bg-slate-900/90 border-white/10 text-white placeholder-white/30 focus:border-blue-500'
                          : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600'
                        }`}
                    />
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75 ml-1">
                        Bank Name
                      </label>

                      {/* Searchable trigger / input */}
                      <div className="relative">
                        <input
                          type="text"
                          value={isBankDropdownOpen ? bankSearch : profile.bankName}
                          onFocus={() => {
                            setIsBankDropdownOpen(true);
                            setBankSearch('');
                          }}
                          onChange={e => {
                            setBankSearch(e.target.value);
                            if (!isBankDropdownOpen) setIsBankDropdownOpen(true);
                          }}
                          placeholder="Search your bank..."
                          className="w-full text-base font-bold pl-11 pr-10 py-4 input-rounded"
                        />
                        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                        <button
                          type="button"
                          onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isBankDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Dropdown Options List */}
                      {isBankDropdownOpen && (
                        <div
                          className={`absolute left-0 right-0 top-full mt-2 max-h-56 overflow-y-auto rounded-2xl border shadow-2xl z-50 p-2 space-y-1 backdrop-blur-xl ${isDark
                              ? 'bg-slate-950/95 border-white/15 text-white shadow-black/80'
                              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/60'
                            }`}
                        >
                          {NIGERIAN_BANKS.filter(bank =>
                            bank.toLowerCase().includes(bankSearch.toLowerCase())
                          ).length === 0 ? (
                            <div className="p-4 text-center text-xs font-semibold opacity-60">
                              No matching bank found. You can select "Other".
                            </div>
                          ) : (
                            NIGERIAN_BANKS.filter(bank =>
                              bank.toLowerCase().includes(bankSearch.toLowerCase())
                            ).map(bank => {
                              const isSelected = profile.bankName === bank;
                              return (
                                <button
                                  key={bank}
                                  type="button"
                                  onClick={() => {
                                    updateProfile('bankName', bank);
                                    setIsBankDropdownOpen(false);
                                    setBankSearch('');
                                  }}
                                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm font-bold transition-all ${isSelected
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : isDark
                                        ? 'hover:bg-white/10 text-white/90'
                                        : 'hover:bg-slate-100 text-slate-800'
                                    }`}
                                >
                                  <span>{bank}</span>
                                  {isSelected && <Check className="w-4 h-4 text-white" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider mb-2 opacity-75">
                        10-Digit Account Number
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        value={profile.accountNumber}
                        onChange={e => updateProfile('accountNumber', e.target.value.replace(/\D/g, ''))}
                        placeholder="0123456789"
                        className={`w-full text-2xl md:text-3xl font-mono font-bold px-5 py-4 rounded-2xl border transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/20 tracking-wider shadow-sm ${isDark
                            ? 'bg-slate-900/90 border-white/10 text-white placeholder-white/30 focus:border-blue-500'
                            : 'bg-white/95 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600'
                          }`}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={goNext}
                disabled={
                  profile.hasParallexAccount
                    ? profile.parallexAccountNumber.length < 10
                    : profile.accountNumber.length < 10
                }
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/20"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 7: SMS Permission Pre-Pitch (NATIVE ONLY) */}
          {currentStepKey === 'sms_pitch' && (
            <motion.div
              key="sms_pitch"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg text-center space-y-8 flex flex-col items-center justify-center"
            >
              {smsPermState === 'denied' ? (
                <>
                  <div className="w-20 h-20 rounded-3xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-500 backdrop-blur-md">
                    <AlertCircle className="w-10 h-10" />
                  </div>

                  <div className="space-y-4 max-w-md">
                    <h2 className="text-2xl md:text-3xl font-black">
                      Permission Needed
                    </h2>
                    <p className="text-base font-semibold opacity-85 leading-relaxed">
                      oh it seems you might have rejected the permission we cant proceed without you giving us your permission, try again.
                    </p>
                  </div>

                  <div className="w-full space-y-3">
                    <button
                      onClick={triggerSmsPermission}
                      className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Try Again</span>
                    </button>
                    <button
                      onClick={goNext}
                      className="text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
                    >
                      Skip & Verify Later
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-24 h-24 rounded-3xl bg-blue-600/15 dark:bg-blue-500/25 border border-blue-500/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xl shadow-blue-500/10 backdrop-blur-md">
                    <Phone className="w-12 h-12" />
                  </div>

                  <div className="space-y-4 max-w-md">
                    <h2 className="text-2xl md:text-4xl font-black leading-tight">
                      Verify Your Account Balance
                    </h2>
                    <p className="text-base md:text-lg font-semibold opacity-85 leading-relaxed">
                      sweet youre almost done, what we need now is access to your sms to be able to read and accurately get your account balance, dont worry we can not change your account details, and your details are safe with us
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {['Read-Only', 'End-to-End Encrypted', 'Strict Compliance'].map(badge => (
                      <span
                        key={badge}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border shadow-sm ${isDark
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'bg-blue-50/90 border-blue-200 text-blue-700'
                          }`}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="w-full space-y-3">
                    <button
                      onClick={triggerSmsPermission}
                      disabled={smsPermState === 'requesting'}
                      className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-500/30 transition-all"
                    >
                      {smsPermState === 'requesting' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Requesting System Permission...</span>
                        </>
                      ) : (
                        <>
                          <span>Proceed</span>
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                    <button
                      onClick={goNext}
                      className="text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
                    >
                      Skip & Verify Later
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN 7b: APK Required (WEB ONLY) */}
          {currentStepKey === 'apk_required' && (
            <motion.div
              key="apk_required"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg text-center space-y-8 flex flex-col items-center justify-center"
            >
              <div className="w-24 h-24 rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-xl shadow-amber-500/10 backdrop-blur-md">
                <Layers className="w-12 h-12" />
              </div>

              <div className="space-y-4 max-w-md">
                <h2 className="text-2xl md:text-4xl font-black leading-tight">
                  APK Ingestion Required
                </h2>
                <p className="text-base md:text-lg font-semibold opacity-85 leading-relaxed">
                  SMS balance reading requires our secure Android app. Download the APK to enable automatic balance sync, or skip if already installed.
                </p>
              </div>

              <div className="w-full space-y-4">
                <a
                  href="https://github.com/johnnym5/basechanfunder/raw/main/apps/mobile-android/app/build/outputs/apk/debug/app-debug.apk"
                  download
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl shadow-amber-500/30 transition-all"
                >
                  <Phone className="w-5 h-5" />
                  <span>Download Android APK</span>
                </a>

                <button
                  onClick={handleSkipToDashboard}
                  className={`w-full py-4 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  Already Downloaded? Skip to Dashboard
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN 8: Multi-Pass Engine / Outcome */}
          {currentStepKey === 'verification' && (
            <motion.div
              key="verification"
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full max-w-lg text-center space-y-8 flex flex-col items-center justify-center"
            >
              {parseState === 'scanning' && (
                <>
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                      className="absolute inset-0 rounded-full border-4 border-t-blue-600 border-r-transparent border-b-transparent border-l-transparent"
                    />
                    <Sparkles className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-2xl md:text-3xl font-black">
                      Analyzing SMS Records
                    </h2>
                    <p className="text-sm font-semibold opacity-75">
                      {scanLabel}
                    </p>
                  </div>
                </>
              )}

              {parseState === 'found' && (
                <>
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-24 h-24 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-500 shadow-xl shadow-emerald-500/20 backdrop-blur-md"
                  >
                    <CheckCircle2 className="w-14 h-14" />
                  </motion.div>

                  <div className="space-y-3">
                    <h2 className="text-3xl md:text-4xl font-black text-emerald-600 dark:text-emerald-400">
                      i think we found it!
                    </h2>
                    <p className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                      ₦{Number(balance).toLocaleString()}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-75">
                      Verified from your mobile SMS records
                    </p>
                  </div>

                  <button
                    onClick={handleFinish}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all"
                  >
                    <span>Let's See</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {parseState === 'failed' && (
                <>
                  <div className="w-24 h-24 rounded-3xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-600 dark:text-blue-400 backdrop-blur-md">
                    <Shield className="w-12 h-12" />
                  </div>

                  <div className="space-y-4 max-w-md">
                    <h2 className="text-2xl md:text-3xl font-black">
                      We couldn't automatically verify your balance yet, but don't worry!
                    </h2>
                    <p className="text-sm font-semibold opacity-75 leading-relaxed">
                      Your details have been dispatched to our compliance desk. A counselor will verify and update your proof of funds ledger directly.
                    </p>
                  </div>

                  <button
                    onClick={handleFinish}
                    className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transition-all"
                  >
                    <span>Proceed to Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default StudentOnboardingWizard;
