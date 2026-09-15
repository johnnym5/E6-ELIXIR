// MasterAppPortal — Unified Governance & Student Portal
import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc
} from 'firebase/firestore';
import {
  ShieldCheck,
  Shield,
  LayoutDashboard,
  Users,
  Sliders,
  LogOut,
  BarChart3,
  Loader2,
  Compass,
  MessageCircle,
  Eye,
  Sun,
  Moon,
  ShieldAlert,
  ArrowLeft,
  Bell,
  X as XIcon,
  Database,
  Briefcase,
  User,
  RefreshCw
} from 'lucide-react';
import { resolveUserStatus } from '../services/userStatusService';
import { ProfessionalSpinner } from './ui/LoadingStates';
import { NotificationDropdown } from './ui/NotificationDropdown';
import { AdminNotificationPopover } from './ui/AdminNotificationPopover';
import { HelpModalTrigger } from './HelpModalTrigger';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggle } from './ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdropVariants, modalBoxVariants } from '../utils/motionPresets';
import { PageTransition } from './ui/PageTransition';
import { BouncyButton } from './ui/BouncyButton';

// Import View Components
import { StaffDashboard } from './Dashboard';
import { CounselorPortal } from './CounselorPortal';
import { StudentMobileFirstDashboard } from './StudentMobileFirstDashboard';
import { StudentDashboardView } from './StudentDashboardView';
import { SettingsConsole } from './SettingsConsole';
import { StudentSupportChat } from './StudentSupportChat';
import { AdminSupportDesk } from './AdminSupportDesk';
import { StaffStudentViewMode } from './StaffStudentViewMode';
import { StudentOnboardingWizard } from './StudentOnboardingWizard';
import { AppUpdateModal } from './AppUpdateModal';
import { AdminCounselorRoster } from './AdminCounselorRoster';
import { AdminStudentProfileDrawer } from './AdminStudentProfileDrawer';
import { StudentProfileModal } from './StudentProfileModal';
import { useUserBalance } from '../hooks/useUserBalance';
import { PushNotificationService } from '../services/pushNotificationService';
import { getPlatformType } from '../utils/deviceDetection';
import { toast } from 'sonner';

export const MasterAppPortal: React.FC = () => {
  const { appUser, role, currentUser, loading: authLoading, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { balance, accounts: balanceAccounts, evaluation, loading: balanceLoading } = useUserBalance(currentUser?.uid);
  const navigate = useNavigate();

  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isAdminSupportOpen, setIsAdminSupportOpen] = useState(false);
  const [supportInitialStudentId, setSupportInitialStudentId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [inspectingStudentId, setInspectingStudentId] = useState<string | null>(null);

  // Profile Drawer State (Accessible globally in portal)
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [selectedStudentForDrawer, setSelectedStudentForDrawer] = useState<any>(null);
  const [drawerTab, setDrawerTab] = useState<'profile' | 'activity' | 'governance'>('profile');
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);

  // Profile Menu State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Push Notification & Deep-Link Initialization ---
  useEffect(() => {
    if (!currentUser?.uid) return;

    const pushService = PushNotificationService.getInstance();
    const platform = getPlatformType();

    // 1. Initialize based on platform
    if (platform === 'MOBILE_WEB' || platform === 'DESKTOP_WEB') {
      pushService.initWebPush(currentUser.uid);
    } else {
      pushService.initNativePush(currentUser.uid, (data) => {
        if (data.studentId) {
          navigateStudent(data.studentId, data.actionType || 'profile');
        }
      });
    }

    // 2. Navigation Helper
    const navigateStudent = async (studentId: string, tab: string = 'profile') => {
      setDrawerTab(tab as any);
      const userSnap = await getDoc(doc(db, 'users', studentId));
      if (userSnap.exists()) {
        setSelectedStudentForDrawer({ id: studentId, ...userSnap.data() });
        setIsProfileDrawerOpen(true);
      }
    };

    // 3. Listen for global navigation events (from FCM foreground toasts)
    const handleNavEvent = (e: any) => {
      const { studentId, action } = e.detail;
      if (studentId) navigateStudent(studentId, action);
    };

    window.addEventListener('app:navigate:student' as any, handleNavEvent);

    const handleOpenSettings = (e: any) => {
      setIsSettingsOpen(true);
      // Pass tab info if available
      if (e.detail?.tab) {
        // We'll need to pass this to SettingsConsole
        (window as any)._pendingSettingsTab = e.detail.tab;
      }
    };
    window.addEventListener('app:open-settings' as any, handleOpenSettings);

    return () => {
      window.removeEventListener('app:navigate:student' as any, handleNavEvent);
      window.removeEventListener('app:open-settings' as any, handleOpenSettings);
    };
  }, [currentUser?.uid]);

  // Determine user status for routing
  const userStatus = appUser ? resolveUserStatus({
    isApproved: appUser.isApproved,
    onboardingComplete: !!appUser.onboardingComplete || !!(appUser as any).setupCompleted,
    status: (appUser as any).status,
    verificationFailed: (appUser as any).verificationFailed,
    targetGbp: appUser.onboardingProfile?.targetGbp || 0,
    consecutiveDays: (appUser as any).consecutiveDays || 0
  }) : null;

  if (authLoading || !appUser || !currentUser) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center">
        <ProfessionalSpinner message="Verifying session..." />
      </div>
    );
  }

  // Gated: Onboarding Wizard for new students
  if (userStatus === 'PENDING_ONBOARDING' && role === 'STUDENT') {
    return (
      <StudentOnboardingWizard
        onComplete={async () => {
          await refreshProfile();
        }}
      />
    );
  }

  const isStaffOrAdmin = role === 'STAFF_AUDITOR' || role === 'COUNSELOR' || role === 'ADMIN_GOVERNANCE';
  const isAdmin = role === 'ADMIN_GOVERNANCE';
  const isDark = theme === 'dark';
  const platform = getPlatformType();
  const isNative = platform === 'NATIVE_ANDROID';

  const navItems = isStaffOrAdmin ? [
    ...(isAdmin ? [{ id: 'counselors', label: 'Counselors', icon: Briefcase }] : []),
    { id: 'support', label: 'Support Desk', icon: MessageCircle },
    { id: 'params', label: 'Settings', icon: Sliders },
  ] : [];

  return (
    <div className={`h-screen w-full flex flex-col font-sans selection:bg-amber-500/30 overflow-hidden transition-colors duration-500 relative ${
      theme === 'dark' ? 'bg-[#030712] text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* ── Native Status Bar Spacer / "Border" ── */}
      {isNative && (
        <div className={`h-8 w-full flex-shrink-0 z-[200] border-y transition-colors duration-500 ${
          isDark ? 'bg-slate-950 border-slate-200 dark:border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
        }`} />
      )}

      {/* Dynamic Animated Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <AnimatePresence mode="sync">
          <motion.div
            key={role === 'STUDENT' ? (isDark ? 'student_dark' : 'student_light') : (isDark ? 'admin_dark' : 'admin_light')}
            initial={{ opacity: 1, scale: 1.0, x: '-6%' }}
            animate={{
              opacity: 1,
              scale: [1.0, 1.75, 1.0],
              x: ['-6%', '6%', '-6%'],
              y: ['-2%', '3%', '-2%'],
            }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{
              opacity: { duration: 0 },
              scale: { duration: 42, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
              x: { duration: 38, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
              y: { duration: 32, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' },
            }}
            className="absolute inset-[-20%] bg-cover bg-center"
            style={{
              backgroundImage: `url(${
                role === 'STUDENT'
                  ? (isDark ? '/bg_student_dark.jpg' : '/bg_student_light.jpg')
                  : (isDark ? '/bg_admin_dark.jpg' : '/bg_admin_light.jpg')
              })`,
              filter: isDark ? 'brightness(0.65) contrast(1.15)' : 'brightness(1.1) contrast(1.0) saturate(0.9)',
            }}
          />
        </AnimatePresence>

        {/* ── High-Depth Frosted Glass Backdrop Overlay ── */}
        <div
          className={`absolute inset-0 transition-colors duration-700 ${
            isDark ? 'bg-[#030712]/70' : 'bg-white/82'
          }`}
          style={{
            backdropFilter: 'blur(60px) saturate(140%)',
            WebkitBackdropFilter: 'blur(60px) saturate(140%)',
          }}
        />

        {/* ── Specular Highlights ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 40%)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(255, 255, 255, 0.8) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.6) 0%, transparent 50%)',
          }}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto no-scrollbar">

          {/* Restructured Top Header - High Density Utility Cluster */}
          <header className={`h-16 flex-shrink-0 px-2 sm:px-4 border-b flex items-center justify-between transition-colors duration-500 backdrop-blur-md sticky top-0 z-[100] bg-surface-glass border-surface-glass-border shadow-2xl`}>
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
              {inspectingStudentId ? (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setInspectingStudentId(null);
                    }}
                    aria-label="Exit student view"
                    className="flex items-center gap-1.5 bg-zinc-900/90 border-zinc-800 shadow-none text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg depth-btn-glass shrink-0"
                  >
                    <ArrowLeft className="w-2.5 h-2.5" />
                    <span>Exit</span>
                  </button>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-amber-400" />
                    <span>ADMIN INSPECTOR MODE</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 truncate">
                  <h1 className="text-xs sm:text-lg md:text-xl font-black uppercase tracking-tight text-depth-header whitespace-nowrap overflow-hidden">
                    <span className="text-slate-600 dark:text-slate-400">HI </span>
                    <span className="text-accent-gold dark:text-amber-500">{appUser?.displayName?.split(' ')[0]?.toUpperCase() || 'ADMIN'}</span>
                  </h1>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 shrink-0 relative" ref={profileMenuRef}>
               {/* Global Action Cluster */}
               <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Help & Onboarding Knowledge Base Trigger */}
                  <HelpModalTrigger role={isStaffOrAdmin ? 'ADMIN' : 'STUDENT'} />

                  {/* Notification Bell */}
                  {isStaffOrAdmin ? (
                    <AdminNotificationPopover
                      onViewStudent={async (userId, eventId) => {
                        setDrawerTab('activity');
                        setHighlightEventId(eventId || null);
                        const userSnap = await getDoc(doc(db, 'users', userId));
                        if (userSnap.exists()) {
                          setSelectedStudentForDrawer({ id: userId, ...userSnap.data() });
                          setIsProfileDrawerOpen(true);
                        } else {
                          toast.error("Could not find student profile.");
                        }
                      }}
                    />
                  ) : (
                    <NotificationDropdown />
                  )}
               </div>

               {/* Profile FAB Button */}
               <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsProfileOpen(!isProfileOpen);
                  }}
                  aria-label="User menu"
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 p-0.5 transition-all hover:scale-105 active:scale-95 shadow-xl ${
                    isDark
                      ? 'border-blue-500 shadow-blue-500/20 bg-slate-900'
                      : 'border-blue-600 shadow-blue-600/10 bg-white'
                  }`}
               >
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-slate-800 border border-slate-200 dark:border-zinc-800">
                    {appUser.photoURL ? (
                      <img src={appUser.photoURL} alt="User Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] sm:text-sm font-black text-blue-400 uppercase">{appUser.displayName?.[0] || 'A'}</span>
                    )}
                  </div>
               </button>

               {/* DROPDOWN MENU - Comprehensive Governance & Support */}
               {isProfileOpen && (
                 <div className={`absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl z-[150] p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-200 origin-top-right border ${
                   isDark
                     ? 'bg-zinc-900/90 backdrop-blur-[75px] border-zinc-800 text-white shadow-none'
                     : 'bg-white border-slate-200 text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.15)]'
                 }`}>
                   <div className="p-3 border-b border-white/5 mb-1">
                      <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest">{appUser?.role?.replace('_', ' ')}</p>
                      <p className="text-xs font-bold truncate mt-0.5">{appUser?.displayName}</p>
                   </div>

                   <div className="space-y-0.5">
                      <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-3 my-1 opacity-50">Account & Theme</p>

                      {/* Theme Toggle Inside Dropdown */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleTheme(e);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${
                          isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                           {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-blue-600" />}
                           <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                        </div>
                        <span className="text-[8px] opacity-40 font-mono">Theme</span>
                      </button>

                      {/* Profile Settings */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsProfileModalOpen(true);
                          setIsProfileOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${
                          isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>My Profile</span>
                      </button>

                      {/* Support Button (Student Only) */}
                      {role === 'STUDENT' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsSupportOpen(true);
                            setIsProfileOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${
                            isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Talk to Support</span>
                        </button>
                      )}

                      {navItems.length > 0 && (
                        <>
                          <div className="h-px bg-white/5 mx-2 my-1" />
                          <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-3 my-1 opacity-50">Governance</p>
                          {navItems.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (item.id === 'support') setIsAdminSupportOpen(true);
                                else if (item.id === 'params' || item.id === 'database') {
                                  setActiveTab(item.id);
                                  setIsSettingsOpen(true);
                                }
                                else setActiveTab(item.id);
                                setIsProfileOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${
                                activeTab === item.id
                                  ? 'bg-amber-500 text-slate-950 shadow-md'
                                  : isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <item.icon className={`w-3 h-3 ${activeTab === item.id ? 'text-slate-950' : 'text-slate-500'}`} />
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </>
                      )}
                   </div>

                   <div className={`pt-1 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                     <button
                       type="button"
                       onClick={(e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         signOut(auth);
                       }}
                       className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-rose-500 hover:bg-rose-500/10 transition-all"
                     >
                       <LogOut className="w-3 h-3" />
                       <span>Log Out</span>
                     </button>
                   </div>
                  </div>
                )}
              </div>
          </header>

          <div className="w-full flex-1 flex flex-col">
            <div className="w-full h-full flex flex-col">
              {inspectingStudentId ? (
                <StaffStudentViewMode studentId={inspectingStudentId} onExit={() => setInspectingStudentId(null)} />
              ) : (!appUser.isApproved && (appUser as any).status !== 'TOPUP_PENDING' && !(appUser as any).hasPendingTopUp) && role === 'STUDENT' ? (
                <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4 sm:space-y-8">
                  <div className="w-14 h-14 sm:w-24 sm:h-24 rounded-xl sm:rounded-[2.5rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-2xl shadow-amber-500/10">
                    <ShieldAlert className="w-6 h-6 sm:w-12 sm:h-12 animate-pulse" />
                  </div>
                  <div className="space-y-1 sm:space-y-3 max-w-md">
                    <h2 className={`text-lg sm:text-3xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Account Pending</h2>
                    <p className="text-[10px] sm:text-sm font-medium text-slate-400 leading-relaxed uppercase tracking-wider px-2">
                      Please wait for admin to approve your account.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5 scale-90 sm:scale-100">
                    <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Awaiting Clearance...</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const t = toast.loading('Re-verifying approval...');
                        await refreshProfile();
                        toast.success('Check complete.', { id: t });
                      }}
                      className="ml-2 p-1.5 rounded-lg bg-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-slate-950 transition-all"
                      title="Refresh Approval Status"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <PageTransition key={activeTab} className="w-full h-full flex flex-col flex-1">
                    {role === 'STUDENT' && activeTab === 'dashboard' && (
                      <StudentDashboardView
                        studentId={currentUser?.uid || appUser.uid}
                        viewMode="STUDENT"
                        studentName={appUser.displayName}
                      />
                    )}
                    {activeTab === 'dashboard' && isStaffOrAdmin && (
                       role === 'COUNSELOR' ? <CounselorPortal /> : <StaffDashboard
                          onInspect={(id) => setInspectingStudentId(id)}
                          onMessageStudent={(id) => {
                            setSupportInitialStudentId(id);
                            setIsAdminSupportOpen(true);
                          }}
                          onViewProfile={(student, tab) => {
                            setSelectedStudentForDrawer(student);
                            setDrawerTab(tab || 'profile');
                            setIsProfileDrawerOpen(true);
                          }}
                        />
                    )}
                    {activeTab === 'students' && isStaffOrAdmin && (
                       <StaffDashboard
                          onInspect={(id) => setInspectingStudentId(id)}
                          onMessageStudent={(id) => {
                            setSupportInitialStudentId(id);
                            setIsAdminSupportOpen(true);
                          }}
                          onViewProfile={(student, tab) => {
                            setSelectedStudentForDrawer(student);
                            setDrawerTab(tab || 'profile');
                            setIsProfileDrawerOpen(true);
                          }}
                        />
                    )}
                    {activeTab === 'counselors' && isAdmin && (
                      <AdminCounselorRoster />
                    )}
                    {role === 'COUNSELOR' && activeTab === 'students' && <CounselorPortal />}
                  </PageTransition>
                </AnimatePresence>
              )}

            </div>
          </div>
        </main>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {isAdminSupportOpen && (
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            onClick={() => { setIsAdminSupportOpen(false); setActiveTab('dashboard'); }}
          >
            <motion.div
              variants={modalBoxVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`w-full max-w-6xl h-[90vh] rounded-[2.5rem] border overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] flex flex-col ${
                isDark ? 'bg-[#0D111A] border-slate-200 dark:border-zinc-800' : 'bg-white border-slate-200'
              }`}
              onClick={e => e.stopPropagation()}
            >
              <div className={`p-6 border-b flex justify-between items-center ${isDark ? 'bg-slate-950/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-amber-500" />
                  <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Support Governance Desk</h3>
                </div>
                <BouncyButton onClick={() => { setIsAdminSupportOpen(false); setActiveTab('dashboard'); }} className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}>
                  <XIcon className="w-6 h-6" />
                </BouncyButton>
              </div>
              <div className="flex-1 overflow-hidden p-4 md:p-8">
                <AdminSupportDesk initialStudentId={supportInitialStudentId} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            variants={modalBackdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            onClick={() => { setIsSettingsOpen(false); setActiveTab('dashboard'); }}
          >
            <motion.div
              variants={modalBoxVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`w-full max-w-5xl h-[85vh] rounded-[2.5rem] border overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] flex flex-col ${
                isDark ? 'bg-[#0D111A] border-slate-200 dark:border-zinc-800' : 'bg-white border-slate-200'
              }`}
              onClick={e => e.stopPropagation()}
            >
              <div className={`p-6 border-b flex justify-between items-center ${isDark ? 'bg-slate-950/20 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-amber-500" />
                  <h3 className={`text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Settings</h3>
                </div>
                <BouncyButton onClick={() => { setIsSettingsOpen(false); setActiveTab('dashboard'); }} className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}>
                  <XIcon className="w-6 h-6" />
                </BouncyButton>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <SettingsConsole initialTab={activeTab === 'database' ? 'database' : 'risk'} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {role === 'STUDENT' && isSupportOpen && (
        <StudentSupportChat isPopUp={true} onClose={() => setIsSupportOpen(false)} />
      )}

      {/* Global Student Inspector Drawer */}
      <AdminStudentProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => {
          setIsProfileDrawerOpen(false);
          setHighlightEventId(null);
        }}
        student={selectedStudentForDrawer}
        initialTab={drawerTab}
        highlightEventId={highlightEventId}
      />

      {getPlatformType() === 'NATIVE_ANDROID' && <AppUpdateModal />}

      <StudentProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onUpdate={refreshProfile}
        userProfile={{
          ...appUser,
          ...appUser?.onboardingProfile,
          targetAmountGbp: evaluation?.targetGBP,
          windowStartDate: evaluation?.startDate,
          targetDays: evaluation?.totalTargetDays,
          evaluationWindowDays: evaluation?.evaluationWindowDays,
          extensionDays: evaluation?.extensionDays,
          approvedTopUpNgn: appUser?.approvedCapitalNgn || appUser?.topUpAmountNgn || evaluation?.approvedTopUpNgn,
          targetAmountNgn: evaluation?.targetNGN || (evaluation?.targetGBP * 1945.50) // Fallback rate
        }}
        consolidatedBalance={balance.consolidatedBalanceNgn}
        holdingProgress={(() => {
          if (!evaluation?.startDate) return 0;
          const start = new Date(evaluation.startDate).getTime();
          const target = evaluation.totalTargetDays || 28;
          const days = Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), target);
          return Math.round((days / target) * 100);
        })()}
      />
    </div>
  );
};

export default MasterAppPortal;
