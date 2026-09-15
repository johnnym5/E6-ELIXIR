import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bell, X as XIcon, CheckCheck, User, Clock, Zap,
  ShieldAlert, ShieldCheck, CreditCard, Lock,
  ChevronRight, History, Loader2, Eye
} from 'lucide-react';
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useTheme } from '../../context/ThemeContext';
import { toast } from 'sonner';

interface NotificationItem {
  id: string;
  userId: string;
  studentName: string;
  type: 'TOPUP_SUBMITTED' | 'FEE_PAID' | 'CAPITAL_ENCROACHMENT' | 'POF_EXPIRING' | 'SYNC_STALE' | 'UNLINK_REQUESTED' | 'SECURITY_ALERT' | 'INACTIVITY_ALERT' | string;
  message: string;
  amount?: string;
  daysInactive?: number;
  requiresAction?: boolean;
  actionTaken?: 'DELETE' | 'LEAVE' | null;
  time: string;
  isRead: boolean;
  rawTime: any;
}

interface AdminNotificationPopoverProps {
  onViewStudent: (userId: string, eventId?: string) => void;
}

export const AdminNotificationPopover: React.FC<AdminNotificationPopoverProps> = ({ onViewStudent }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // We listen to the global 'notifications' collection for admin (governance perspective)
    // In a real app, this would probably be a specific 'admin_alerts' collection
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          userId: d.userId,
          studentName: d.studentName || d.userName || 'Unknown Student',
          type: d.type || 'INFO',
          message: d.body || d.message || '',
          amount: d.amount,
          isRead: d.isRead || false,
          requiresAction: d.requiresAction || false,
          actionTaken: d.actionTaken || null,
          daysInactive: d.daysInactive,
          rawTime: d.createdAt,
          time: d.createdAt?.seconds
            ? new Date(d.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now'
        } as NotificationItem;
      });
      setNotifications(logs);
    }, (err: any) => {
      console.warn('Admin Notification Stream Error:', err);
      if (err.message?.includes('index')) {
        const indexUrl = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
        if (indexUrl) {
          toast.error("Admin Index Required", {
            description: "Notifications need a database index to display.",
            action: {
              label: "Build Index",
              onClick: () => window.open(indexUrl, '_blank')
            },
            duration: 10000
          });
        }
      }
    });

    return unsub;
  }, []);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const hasFreshNotification = useMemo(() => {
    // A notification is "fresh" if unread AND arrived in the last 60 seconds
    const nowInSeconds = Date.now() / 1000;
    return notifications.some(n => !n.isRead && n.rawTime?.seconds && (nowInSeconds - n.rawTime.seconds) < 60);
  }, [notifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    });
    await batch.commit();
  };

  const handleItemClick = async (notif: NotificationItem) => {
    if (notif.requiresAction) return; // Action must be taken via specific buttons
    if (!notif.isRead) {
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
    }
    onViewStudent(notif.userId, notif.id);
    setIsOpen(false);
  };

  const handleInactivityAction = async (notif: NotificationItem, action: 'DELETE' | 'LEAVE') => {
    const confirmMsg = action === 'DELETE'
      ? `Are you sure you want to permanently DELETE ${notif.studentName} and all their records?`
      : `Set a follow-up reminder for ${notif.daysInactive === 30 ? '60' : '90'} days for ${notif.studentName}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      if (action === 'DELETE') {
        // reuse the cascading delete logic client-side
        await updateDoc(doc(db, 'users', notif.userId), {
          status: 'DELETED',
          isArchived: true,
          hardDeleted: true,
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        const userRef = doc(db, 'users', notif.userId);
        const userSnap = await getDoc(userRef);
        const currentLevel = userSnap.data()?.inactivityReminderLevel || 30;
        await updateDoc(userRef, {
          inactivityReminderLevel: currentLevel === 30 ? 60 : 90,
          lastInactivityAction: 'LEAVE',
          updatedAt: serverTimestamp()
        });
      }

      // Mark notification as read and processed
      await updateDoc(doc(db, 'notifications', notif.id), {
        isRead: true,
        actionTaken: action,
        updatedAt: serverTimestamp()
      });

      toast.success(action === 'DELETE' ? 'User records archived' : 'Reminder scheduled');
    } catch (e) {
      toast.error("Failed to process inactivity action");
    }
  };

  // Notification Engine: Third-Person Perspective Transformer
  const getPerspectiveData = (n: NotificationItem) => {
    const name = n.studentName;
    const amt = n.amount ? `₦${Number(n.amount).toLocaleString()}` : '';

    switch (n.type) {
      case 'TOPUP_SUBMITTED':
        return {
          icon: <Zap className="w-4 h-4 text-amber-400" />,
          text: <><span className="font-bold text-white">{name}</span> requested a top-up of <span className="text-amber-400">{amt}</span>.</>,
          cta: "Review & Verify Fee"
        };
      case 'FEE_PAID':
        return {
          icon: <CheckCheck className="w-4 h-4 text-emerald-400" />,
          text: <><span className="font-bold text-white">{name}</span> uploaded proof of <span className="text-emerald-400">{amt}</span> top-up fee payment.</>,
          cta: "Verify Receipt"
        };
      case 'CAPITAL_ENCROACHMENT':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
          text: <><span className="text-rose-500 font-bold uppercase tracking-tighter">Capital Encroached:</span> <span className="font-bold text-white">{name}'s</span> balance dropped below org floor.</>,
          cta: "Inspect Ledger"
        };
      case 'POF_EXPIRING':
        return {
          icon: <Clock className="w-4 h-4 text-amber-500" />,
          text: <><span className="text-amber-500 font-bold uppercase tracking-tighter">POF Expiring:</span> <span className="font-bold text-white">{name}'s</span> statutory 28-day window expires soon.</>,
          cta: "Alert Student"
        };
      case 'SYNC_STALE':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
          text: <><span className="text-rose-400 font-bold uppercase tracking-tighter">Sync Disruption:</span> No updates parsed for <span className="font-bold text-white">{name}</span> in 5 days.</>,
          cta: "Check Bridge"
        };
      case 'UNLINK_REQUESTED':
        return {
          icon: <Lock className="w-4 h-4 text-blue-400" />,
          text: <><span className="text-blue-400 font-bold uppercase tracking-tighter">Unlink Requested:</span> <span className="font-bold text-white">{name}</span> requested capital release.</>,
          cta: "Approve Unlink"
        };
      case 'SECURITY_ALERT':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-cyan-400" />,
          text: <><span className="text-cyan-400 font-bold uppercase tracking-tighter">Security Alert:</span> <span className="font-bold text-white">{name}</span> registered a new mobile device ID.</>,
          cta: "Verify Identity"
        };
      case 'INACTIVITY_ALERT':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
          text: (
            <div className="space-y-2">
              <p><span className="text-rose-500 font-bold uppercase tracking-tighter">User Inactive:</span> <span className="font-bold text-white">{name}</span> has been offline for <span className="text-rose-400 font-bold">{n.daysInactive}+ days</span>.</p>
              {!n.actionTaken ? (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleInactivityAction(n, 'DELETE'); }}
                    className="flex-1 py-1.5 bg-rose-600/20 border border-rose-500/30 text-rose-400 text-[8px] font-black uppercase rounded-lg hover:bg-rose-600 hover:text-white transition-all"
                  >
                    Delete Records
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleInactivityAction(n, 'LEAVE'); }}
                    className="flex-1 py-1.5 bg-white/5 border border-white/10 text-slate-400 text-[8px] font-black uppercase rounded-lg hover:bg-white/10 hover:text-white transition-all"
                  >
                    Leave (Remind later)
                  </button>
                </div>
              ) : (
                <p className="text-[8px] font-black text-slate-500 uppercase italic">Action Taken: {n.actionTaken}</p>
              )}
            </div>
          ),
          cta: "Action Required"
        };
      default:
        return {
          icon: <Bell className="w-4 h-4 text-slate-400" />,
          text: n.message || "New system event received.",
          cta: "View Activity"
        };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Governance notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all depth-btn-glass relative ${
          isOpen
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
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

      {/* Popover Window */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-[360px] bg-white border-slate-200 dark:bg-slate-900 dark:border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[500] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">

          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-950/40">
            <h3 className="text-accent-gold text-[10px] font-black uppercase tracking-widest ml-1">Notifications</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMarkAllRead}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-amber-500 transition-all"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List Area */}
          <div className="max-h-[420px] overflow-y-auto p-2 space-y-1.5 no-scrollbar">
            {notifications.length > 0 ? (
              notifications.map((n) => {
                const data = getPerspectiveData(n);
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border transition-all group relative flex gap-3.5 ${
                      !n.isRead
                        ? 'bg-white/[0.04] border-white/10 shadow-sm'
                        : 'bg-transparent border-transparent opacity-60 hover:bg-white/[0.02]'
                    }`}
                  >
                    {!n.isRead && (
                      <div className="absolute left-1 top-4 w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                    )}

                    <div className="w-9 h-9 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-center shrink-0 shadow-inner">
                      {data.icon}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex justify-between items-start">
                        <p className="text-[11px] leading-relaxed text-slate-300">
                          {data.text}
                        </p>
                        <span className="text-[8px] font-black text-slate-500 uppercase ml-2 whitespace-nowrap">{n.time}</span>
                      </div>

                      <button
                        onClick={() => handleItemClick(n)}
                        className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors py-1 group/btn"
                      >
                        <Eye className="w-3 h-3 group-hover/btn:scale-110 transition-transform" />
                        <span>View Student Activity</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center opacity-20 flex flex-col items-center">
                <Bell className="w-12 h-12 mb-3" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Clear</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/5 bg-slate-950/20 text-center">
             <button
                onClick={() => setIsOpen(false)}
                className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
             >
               Dismiss Panel
             </button>
          </div>
        </div>
      )}
    </div>
  );
};
