import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  AuthError,
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { deriveRole } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  AtSign,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
} from 'lucide-react';

import { getPlatformType } from '../utils/deviceDetection';

type AuthMode = 'login' | 'signup';

// ─── Glassmorphic Field ────────────────────────────────────────
const Field: React.FC<{
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  toggle?: React.ReactNode;
  autoComplete?: string;
}> = ({ label, type = 'text', value, onChange, placeholder, icon, toggle, autoComplete }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-mono font-bold tracking-wider text-slate-400 uppercase">{label}</label>
    <div className="relative">
      {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{icon}</div>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-[#020617]/80 border border-white/10 focus:border-[#F5B651]/60 focus:ring-1 focus:ring-[#F5B651]/20 text-white placeholder-slate-500 text-sm rounded-xl py-3.5 transition-all outline-none font-sans"
        style={{ paddingLeft: icon ? '2.75rem' : '1rem', paddingRight: toggle ? '2.75rem' : '1rem' }}
      />
      {toggle && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500">{toggle}</div>}
    </div>
  </div>
);

// ─── Main Auth Page ────────────────────────────────────────────
export const AuthPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [mode, setMode] = useState<AuthMode>('login');
  
  // Form State
  const [identifier, setIdentifier] = useState(''); // Can be Username OR Email on login
  const [email, setEmail] = useState('');           // Explicit email on signup
  const [username, setUsername] = useState('');     // Explicit username on signup
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  
  // Status State
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const platform = getPlatformType();
  const isNative = platform === 'NATIVE_ANDROID';

  // ── Detect environment
  const isWebView = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as any).chrome;

  // ── Handle Native Google Login Callbacks
  React.useEffect(() => {
    if (isNative) {
      (window as any).onNativeGoogleLoginSuccess = async (idToken: string) => {
        console.log("Native Google Login Success. Exchanging ID Token...");
        setGoogleLoading(true);
        try {
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          console.log("Native Credential synced with Firebase Auth.");
        } catch (err: any) {
          console.error("Native Credential sync failed:", err);
          setError(`Google Sign-In failed: The ID Token was rejected by the e6elixir Firebase project. Ensure the Web Client ID in MainActivity.kt matches your active e6elixir project, and your local debug/release SHA-1 fingerprint is added to your Firebase Console settings.`);
          setGoogleLoading(false);
        }
      };

      (window as any).onNativeGoogleLoginError = (error: string) => {
        console.error("Native Google Login Error:", error);
        setError(`Google sign-in failed (Native): ${error}`);
        setGoogleLoading(false);
      };
    }

    return () => {
      delete (window as any).onNativeGoogleLoginSuccess;
      delete (window as any).onNativeGoogleLoginError;
    };
  }, [isNative]);

  // ── Handle Redirect Result
  React.useEffect(() => {
    const checkRedirect = async () => {
      try {
        await getRedirectResult(auth);
      } catch (err) {
        setError(friendly(err as AuthError));
      }
    };
    checkRedirect();
  }, []);

  const friendly = (err: AuthError) => {
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid username/email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled. Please try again.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/unauthorized-domain':
        return 'Domain Unauthorized: Please add "localhost" to your Authorized Domains in the Firebase Console (Auth -> Settings).';
      default:
        return err.message;
    }
  };

  // ── Login with Username OR Email
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const rawIdentifier = identifier.trim().toLowerCase();
    if (!rawIdentifier || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setLoading(true);

    try {
      let resolvedEmail = rawIdentifier;

      // If user did NOT enter an email (no '@'), resolve username to email from Firestore
      if (!rawIdentifier.includes('@')) {
        const cleanUsername = rawIdentifier.replace(/^@/, '');
        
        // 1. Query Firestore for exact username match
        const usernameQuery = query(
          collection(db, 'users'),
          where('username', '==', cleanUsername)
        );
        const usernameSnap = await getDocs(usernameQuery);

        if (!usernameSnap.empty) {
          resolvedEmail = usernameSnap.docs[0].data().email;
        } else {
          setError(`No account found with username "@${cleanUsername}". Please verify your username or sign in with your email.`);
          setLoading(false);
          return;
        }
      }

      // Execute Firebase Authentication with resolved email
      await signInWithEmailAndPassword(auth, resolvedEmail, password);
    } catch (err) {
      setError(friendly(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  // ── Registration with Full Name, Custom Username & Email
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (username.trim() || email.split('@')[0] || '')
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }
    if (!cleanUsername) {
      setError('Please enter a valid username.');
      return;
    }
    if (!cleanEmail || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Check if username is taken
      const existingUserQuery = query(
        collection(db, 'users'),
        where('username', '==', cleanUsername)
      );
      const existingUserSnap = await getDocs(existingUserQuery);

      if (!existingUserSnap.empty) {
        setError(`The username "@${cleanUsername}" is taken.`);
        setLoading(false);
        return;
      }

      // Create user
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });

      // Send verification email using custom settings
      import('../firebase').then(({ getActionCodeSettings }) => {
        sendEmailVerification(cred.user, getActionCodeSettings());
      });

      const { role: derivedRole, name: whitelistedName } = deriveRole(cleanEmail);

      // Save profile
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cleanEmail,
        username: cleanUsername,
        displayName: whitelistedName || cleanName,
        photoURL: '',
        role: derivedRole,
        isApproved: derivedRole !== 'STUDENT',
        createdAt: serverTimestamp(),
      });

      setSuccess(`Account created! You can now log in.`);
      setMode('login');
    } catch (err) {
      setError(friendly(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  // ── Google SSO
  const handleGoogle = async () => {
    setError('');
    setSuccess('');
    setGoogleLoading(true);

    const platform = getPlatformType();
    const isNative = platform === 'NATIVE_ANDROID';
    const hasBridge = !!(window as any).AndroidBridge;
    const hasMethod = !!(window as any).AndroidBridge?.triggerNativeGoogleLogin;

    console.log(`[GoogleAuth] Platform: ${platform}, Bridge: ${hasBridge}, Method: ${hasMethod}`);

    try {
      // For Native Android WebView, use the bridge to trigger native picker
      if (isNative && hasMethod) {
        console.log("[GoogleAuth] Triggering Native Bridge Login...");
        (window as any).AndroidBridge.triggerNativeGoogleLogin();
        return;
      }

      console.log("[GoogleAuth] Falling back to Firebase SDK Auth...");
      if (isNative) {
        await signInWithPopup(auth, googleProvider);
      } else {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          await signInWithRedirect(auth, googleProvider);
        } else {
          await signInWithPopup(auth, googleProvider);
        }
      }
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      // If popup is blocked or fails due to COOP, fallback to redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request' || err.message?.includes('Cross-Origin-Opener-Policy')) {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirErr) {
          setError(friendly(redirErr as AuthError));
        }
      } else {
        setError(friendly(err as AuthError));
      }
    } finally {
      // Small delay to prevent UI flicker before redirect starts
      setTimeout(() => setGoogleLoading(false), 2000);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center font-sans p-4 relative overflow-hidden transition-colors duration-500 ${
        isDark ? 'bg-[#090D16] text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ── Native Status Bar Spacer ── */}
      {isNative && (
        <div className={`fixed top-0 left-0 right-0 h-8 flex-shrink-0 z-[200] border-b transition-colors duration-500 ${
          isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200 shadow-sm'
        }`} />
      )}
      {/* ── Animated Flying Plane Background (Positioned bottom-left, slow fade-in, slow zoom, slow drift from left to right) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 1.0, x: '-8%', y: '4%' }}
          animate={{
            opacity: 1,
            scale: [1.0, 1.15, 1.08],
            x: ['-8%', '6%', '-2%'],
            y: ['4%', '-3%', '2%'],
          }}
          transition={{
            opacity: { duration: 2.0, ease: 'easeOut' },
            scale: { duration: 32, ease: 'linear', repeat: Infinity, repeatType: 'reverse' },
            x: { duration: 45, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
            y: { duration: 35, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
          }}
          className="absolute inset-[-15%] bg-cover bg-center"
          style={{
            backgroundImage: "url('/bg_plane.jpg')",
            backgroundPosition: 'left bottom',
            filter: isDark ? 'brightness(0.75) contrast(1.15)' : 'brightness(1.02) contrast(1.02)',
          }}
        />
      </div>

      {/* ── 75% Opaque Frosted Glass Backdrop Overlay ── */}
      <div
        className={`absolute inset-0 backdrop-blur-lg transition-colors duration-500 pointer-events-none ${
          isDark ? 'bg-[#090D16]/75' : 'bg-white/75'
        }`}
      />

      {/* ── Top-Right Theme Toggle ── */}
      <div className="absolute top-5 right-5 z-30">
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-bold transition-all shadow-md backdrop-blur-md ${
            isDark
              ? 'bg-slate-900/90 border-white/10 text-amber-300 hover:bg-slate-800'
              : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-blue-600" />
          )}
        </button>
      </div>

      {/* Ambient orbs */}
      <div
        className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo + Brand */}
        <div className="text-center mb-6 sm:mb-8 space-y-2 sm:space-y-3">
          <div className="flex justify-center">
            <img
              src={isDark ? '/logo_white.png' : '/logo.png'}
              alt="E6 Elixir Logo"
              className="h-12 sm:h-20 object-contain drop-shadow-xl"
            />
          </div>
          <p className="text-[10px] sm:text-xs text-slate-400 font-mono">Proof of Funds Compliance & Verification Platform</p>
        </div>

        {/* Card */}
        <div
          className={`rounded-2xl border p-6 sm:p-8 space-y-4 sm:space-y-6 shadow-2xl transition-all ${
            isDark ? 'border-white/10 bg-slate-900/80' : 'border-slate-200/80 bg-white/85'
          }`}
          style={{ backdropFilter: 'blur(24px)' }}
        >
          {/* Mode toggle */}
          <div className={`flex rounded-xl border p-1 ${isDark ? 'bg-[#0A0D14] border-white/8' : 'bg-slate-100 border-slate-200'}`}>
            {(['login', 'signup'] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === m
                    ? 'bg-gradient-to-r from-[#F5B651] to-[#E5A635] text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Error / Success banners */}
          {error && (
            <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
            {isLogin ? (
              /* LOGIN MODE: Username or Email */
              <Field
                label="Username or Email Address"
                value={identifier}
                onChange={setIdentifier}
                placeholder="username or you@example.com"
                icon={<User className="w-4 h-4" />}
                autoComplete="username"
              />
            ) : (
              /* SIGNUP MODE: Full Name, Username, Email */
              <>
                <Field
                  label="Full Name"
                  value={name}
                  onChange={setName}
                  placeholder="e.g. Chidi Ogunlesi"
                  icon={<User className="w-4 h-4" />}
                  autoComplete="name"
                />
                <Field
                  label="Username"
                  value={username}
                  onChange={setUsername}
                  placeholder="e.g. chidi_ogunlesi"
                  icon={<AtSign className="w-4 h-4" />}
                  autoComplete="username"
                />
                <Field
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  icon={<Mail className="w-4 h-4" />}
                  autoComplete="email"
                />
              </>
            )}

            <Field
              label="Password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              toggle={
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="cursor-pointer hover:text-white transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {!isLogin && (
              <Field
                label="Confirm Password"
                type={showPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
              />
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F5B651] to-[#E5A635] text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all disabled:opacity-60 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center space-x-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[11px] font-mono text-slate-500">OR</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Google SSO */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full py-3 rounded-xl bg-[#181B25] border border-white/10 hover:border-white/25 text-white font-semibold text-sm flex items-center justify-center space-x-3 transition-all disabled:opacity-60 cursor-pointer"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
