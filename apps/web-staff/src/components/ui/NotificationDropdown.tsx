import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bell,
  X as XIcon,
  UserPlus,
  Zap,
  ShieldAlert,
  Settings,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Trash2,
  Clock,
  History
} from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { toast } from 'sonner';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

interface SystemNotification {
  id: string;
  type: string;
  message: string;
  time: string;
  isRead: boolean;
}

export const NotificationDropdown: React.FC = () => {
  const { theme } = useTheme();
  const { currentUser } = useAuth();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch real activity - Dual Stream: Personal Notifications + Subject Audit Logs
  useEffect(() => {
    if (!currentUser) return;

    // 1. Fetch direct personal notifications
    const qNotif = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const unsubNotif = onSnapshot(qNotif, (snap) => {
      const personal = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || 'INFO',
          message: data.message || data.body || data.title || 'New notification',
          time: data.createdAt?.seconds
            ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          isRead: data.isRead || false,
          createdAt: data.createdAt?.seconds || 0
        };
      });

      // 2. Fetch subject audit logs (Actions taken by staff on this student)
      const qAudit = query(
        collection(db, 'audit_logs'),
        where('studentId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(15)
      );

      const unsubAudit = onSnapshot(qAudit, (auditSnap) => {
        const audits = auditSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            type: data.action || 'AUDIT',
            message: data.detail || `System Action: ${data.action}`,
            time: data.createdAt?.seconds
              ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Just now',
            isRead: true, // Audit logs are informational/history
            createdAt: data.createdAt?.seconds || 0
          };
        });

        // Merge and sort
        const merged = [...personal, ...audits].sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(merged as any);
      }, (err: any) => {
        console.warn('Audit stream error:', err);

        // If the error is a missing index, we show a helpful Toast with the link
        if (err.message?.includes('index')) {
          const indexUrl = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
          if (indexUrl) {
            toast.error("Database Index Required", {
              description: "Click to generate the required index for your notifications.",
              action: {
                label: "Create Index",
                onClick: () => window.open(indexUrl, '_blank')
              },
              duration: 10000
            });
          }
        }

        // Fallback to just personal notifications to keep the app working
        const sortedPersonal = personal.sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(sortedPersonal as any);
      });

      return unsubAudit;
    }, (err) => {
      console.warn('Notification stream error:', err);
    });

    return unsubNotif;
  }, [currentUser]);

  const pageSize = 5;
  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const hasFreshNotification = useMemo(() => {
    // A notification is "fresh" if unread AND arrived in the last 60 seconds
    const nowInSeconds = Date.now() / 1000;
    return notifications.some(n => !n.isRead && (nowInSeconds - (n as any).createdAt) < 60);
  }, [notifications]);

  const totalPages = Math.ceil(notifications.length / pageSize);
  const paginatedNotifications = useMemo(() => {
    const start = (page - 1) * pageSize;
    return notifications.slice(start, start + pageSize);
  }, [notifications, page]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearAll = () => {
    setNotifications([]);
    setPage(1);
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    // If we're on a page that becomes empty, go back
    if (paginatedNotifications.length === 1 && page > 1) {
      setPage(page - 1);
    }
  };

  const getIcon = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes('USER') || t.includes('STUDENT')) return <UserPlus className="w-4 h-4 text-emerald-400" />;
    if (t.includes('TOP_UP') || t.includes('ADJUST')) return <Zap className="w-4 h-4 text-amber-400" />;
    if (t.includes('ANOMALY') || t.includes('FLAG') || t.includes('RISK')) return <ShieldAlert className="w-4 h-4 text-rose-400" />;
    if (t.includes('OVERRIDE') || t.includes('CONFIG') || t.includes('UPDATE')) return <Settings className="w-4 h-4 text-cyan-400" />;
    return <History className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all depth-btn-glass relative ${
          isOpen
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
            : hasFreshNotification
              ? 'bg-blue-500/10 border-slate-200 dark:border-zinc-800 text-blue-500 animate-pulse shadow-none'
              : unreadCount > 0
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                : 'bg-white/5 border-white/5 text-slate-300 hover:text-white'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
           <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 ${isDark ? 'border-slate-900' : 'border-white'} ${hasFreshNotification ? 'bg-blue-500' : 'bg-amber-500'}`} />
        )}
      </button>

      {/* Dropdown Window (Positioned under Bell) */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 bg-white border-slate-200 dark:bg-slate-900 dark:border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[500] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          {/* Header */}
          <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-accent-gold" />
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-main">Notifications</h3>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleMarkAllRead}
                title="Mark all as read"
                className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-amber-500 transition-all"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List Area - Reduced Height & Spacing */}
          <div className="max-h-[350px] overflow-y-auto no-scrollbar p-2 space-y-1.5">
            {notifications.length > 0 ? (
              paginatedNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 rounded-xl border transition-all group relative flex gap-3 ${
                    !notif.isRead
                      ? (isDark ? 'bg-amber-500/5 border-amber-500/10' : 'bg-amber-50 border-amber-200')
                      : (isDark ? 'bg-white/5 border-white/5 opacity-80' : 'bg-slate-50 border-slate-100')
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-950' : 'bg-white shadow-sm'}`}>
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] leading-tight ${!notif.isRead ? 'font-bold' : 'font-medium text-slate-400'}`}>
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-2.5 h-2.5 text-slate-500" />
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{notif.time}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissNotification(notif.id)}
                    className="p-1.5 h-fit rounded-lg bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-12 text-center opacity-20 flex flex-col items-center">
                <Bell className="w-10 h-10 mb-2" />
                <p className="text-[9px] font-black uppercase tracking-[0.3em]">Clear</p>
              </div>
            )}
          </div>

          {/* Footer: Compact Pagination */}
          <div className={`p-3 border-t flex items-center justify-between px-4 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pg {page} of {totalPages || 1}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 bg-white/5 text-slate-400 disabled:opacity-10 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage(page + 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 bg-white/5 text-slate-400 disabled:opacity-10 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
