import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Send,
  User,
  CheckCircle2,
  Clock,
  MoreVertical,
  MessageSquare,
  ShieldCheck,
  Activity,
  ArrowRight,
  Filter,
  CheckCheck,
  Plus,
  ShieldAlert
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  where,
  limit,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotificationModal } from '../context/NotificationContext';
import { toast } from 'sonner';

interface StudentThread {
  id: string;
  name: string;
  role: 'STUDENT' | 'COUNSELOR';
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  status: string;
}

export const AdminSupportDesk: React.FC<{ initialStudentId?: string | null }> = ({ initialStudentId }) => {
  const { appUser } = useAuth();
  const { theme } = useTheme();
  const { showNotification } = useNotificationModal();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [threads, setThreads] = useState<StudentThread[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingAll, setIsSearchingAll] = useState(false);
  const [unlinkRequests, setUnlinkRequests] = useState<any[]>([]);
  const [filterRole, setFilterRole] = useState<'All' | 'Students' | 'Counselors'>('All');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 0. Fetch all students for outgoing message lookup
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'STUDENT'));
    const unsub = onSnapshot(q, (snap) => {
      setAllStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 1. Fetch unique students who have messages in the last 24h
  useEffect(() => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'support_messages'),
      where('createdAt', '>=', twentyFourHoursAgo),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const studentMap = new Map();
      snap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (!studentMap.has(d.studentId)) {
          studentMap.set(d.studentId, {
            id: d.studentId,
            name: d.senderName || 'Unknown',
            role: d.senderRole || (d.isAdmin ? 'ADMIN' : 'STUDENT'),
            lastMessage: d.text,
            lastTime: d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleTimeString() : 'Now',
            unreadCount: d.isRead === false && d.isAdmin === false ? 1 : 0,
            status: d.status || 'OPEN'
          });
        } else if (d.isRead === false && d.isAdmin === false) {
          const existing = studentMap.get(d.studentId);
          existing.unreadCount += 1;
        }
      });
      setThreads(Array.from(studentMap.values()));
    });
    return unsub;
  }, []);

  // 1b. Fetch Pending Unlink Requests
  useEffect(() => {
    const q = query(
      collection(db, 'financial_accounts'),
      where('unlinkStatus', '==', 'UNLINK_REQUESTED')
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnlinkRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // 2. Fetch messages for selected student (24h window)
  useEffect(() => {
    if (!selectedStudentId) return;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'support_messages'),
      where('studentId', '==', selectedStudentId),
      where('createdAt', '>=', twentyFourHoursAgo),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return unsub;
  }, [selectedStudentId]);

  const filteredThreads = useMemo(() => {
    // 1. If explicitly searching for ALL students (New Chat Mode)
    if (isSearchingAll) {
      const q = searchQuery.toLowerCase();

      return allStudents
        .filter(s => (s.displayName?.toLowerCase().includes(q)) || (s.email?.toLowerCase().includes(q)))
        .map(s => {
          const hasThread = threads.find(t => t.id === (s.uid || s.id));
          if (hasThread) return hasThread;

          return {
            id: s.uid || s.id,
            name: s.displayName || s.username || 'New Student',
            role: 'STUDENT' as const,
            lastMessage: 'Ready to start chat',
            lastTime: '',
            unreadCount: 0,
            status: 'NEW'
          };
        });
    }

    // 2. Default mode: show active threads with filtering
    const active = threads.filter(t => {
      if (filterRole === 'Students') return t.role === 'STUDENT';
      if (filterRole === 'Counselors') return t.role === 'COUNSELOR';
      return true;
    });

    if (searchQuery.trim().length >= 1) {
      const q = searchQuery.toLowerCase();
      return active.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    }

    return active;
  }, [threads, allStudents, filterRole, searchQuery, isSearchingAll]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedStudentId || !appUser) return;

    const msg = inputText;
    setInputText('');

    // Add message
    await addDoc(collection(db, 'support_messages'), {
      studentId: selectedStudentId,
      senderId: appUser.uid,
      text: msg,
      isAdmin: true,
      senderRole: 'ADMIN',
      senderName: 'Basechan Support',
      createdAt: serverTimestamp(),
      isRead: true,
      status: 'OPEN'
    });
  };

  const handleApproveUnlink = async (accountId: string) => {
    showNotification({
      title: 'Approve Unlink',
      message: 'Are you sure you want to accept and unlink this account? This will recalculate compliance metrics immediately.',
      type: 'CONFIRM',
      confirmText: 'Unlink Account',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'financial_accounts', accountId));
        toast.success('Account unlinked successfully.');
      }
    });
  };

  const handleRejectUnlink = async (accountId: string, studentId: string) => {
    showNotification({
      title: 'Reject Unlink',
      message: 'Are you sure you want to reject this unlinking request?',
      type: 'CONFIRM',
      confirmText: 'Reject Request',
      onConfirm: async () => {
        await updateDoc(doc(db, 'financial_accounts', accountId), {
           unlinkStatus: 'UNLINK_REJECTED',
           updatedAt: serverTimestamp()
        });

        // Notify student
        await addDoc(collection(db, 'support_messages'), {
           studentId: studentId,
           senderId: appUser?.uid || 'system',
           text: "Your request to unlink your bank account has been REJECTED. Please contact support for more details.",
           isAdmin: true,
           senderRole: 'ADMIN',
           senderName: 'Basechan Support',
           createdAt: serverTimestamp(),
           isRead: false,
           status: 'OPEN'
        });
        toast.info('Unlink request rejected.');
      }
    });
  };

  const handleResolve = async () => {
    // Typically you'd update a thread document here.
    toast.info('Ticket marked as RESOLVED');
  };

  const selectedThread = filteredThreads.find(t => t.id === selectedStudentId);

  const getBubbleStyle = (msg: any) => {
    if (msg.senderRole === 'ADMIN') return 'bg-purple-600 text-white font-bold rounded-br-none shadow-xl shadow-purple-500/10';
    if (msg.senderRole === 'COUNSELOR') return 'bg-amber-500 text-slate-950 font-bold rounded-bl-none shadow-xl shadow-amber-500/10';
    return 'bg-zinc-900/90 border-zinc-800 shadow-none text-slate-300 rounded-bl-none';
  };

  return (
    <div className={`h-full w-full flex overflow-hidden transition-colors duration-500`}>

      {/* Sidebar: Student Queue */}
      <aside className={`w-80 border-r flex flex-col transition-colors duration-500 bg-app border-slate-200 dark:border-zinc-800`}>
        <div className="p-6 border-b space-y-4 border-slate-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900 dark:text-white">Support Desk</h3>
            <button
              onClick={() => setIsSearchingAll(!isSearchingAll)}
              className={`p-2 rounded-xl transition-all ${
                isSearchingAll
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : theme === 'dark' ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-950'
              }`}
              title="Start New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {!isSearchingAll ? (
            <div className={`flex p-1 rounded-xl border ${theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-white border-slate-200 shadow-sm'}`}>
              {['All', 'Students', 'Counselors'].map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRole(r as any)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all ${
                    filterRole === r
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/10'
                      : theme === 'dark' ? 'text-slate-500 hover:text-white' : 'text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Global Student Lookup</span>
              <button onClick={() => { setIsSearchingAll(false); setSearchQuery(''); }} className="text-[9px] font-bold text-slate-500 hover:text-rose-500 uppercase tracking-tighter">Cancel</button>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={isSearchingAll ? "Enter name or email..." : "Search active tickets..."}
              autoFocus={isSearchingAll}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full border rounded-xl pl-9 pr-4 py-2 text-[10px] focus:outline-none transition-all ${
                theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
              } ${isSearchingAll ? 'ring-1 ring-amber-500/30 border-amber-500/50' : ''}`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2">
          {/* Unlink Requests Notification Section */}
          {unlinkRequests.length > 0 && (
            <div className="mb-6 space-y-2">
               <div className="flex items-center gap-2 px-3 mb-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Action Required: Unlinks ({unlinkRequests.length})</span>
               </div>
               {unlinkRequests.map(req => (
                  <div key={req.id} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-3">
                     <div className="flex justify-between items-start">
                        <div>
                           <p className="text-[11px] font-bold text-main dark:text-white uppercase">{req.bankName}</p>
                           <p className="text-[9px] font-medium text-rose-300 uppercase tracking-tighter">Request by: {req.userEmail || 'User'}</p>
                        </div>
                     </div>
                     <div className="p-2 rounded-lg bg-black/20 text-[9px] text-slate-300 italic border border-slate-200 dark:border-zinc-800">
                        "{req.unlinkReason || 'No reason provided'}"
                     </div>
                     <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveUnlink(req.id)}
                          className="flex-1 py-2 bg-emerald-500 text-slate-950 rounded-lg text-[9px] font-black uppercase tracking-tighter hover:bg-emerald-400 transition-all"
                        >
                           Accept
                        </button>
                        <button
                          onClick={() => handleRejectUnlink(req.id, req.userId)}
                          className="flex-1 py-2 bg-rose-900/50 text-rose-300 border border-rose-500/30 rounded-lg text-[9px] font-black uppercase tracking-tighter hover:bg-rose-900 transition-all"
                        >
                           Reject
                        </button>
                     </div>
                  </div>
               ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 mb-2">
             <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Threads</span>
          </div>

          {filteredThreads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedStudentId(thread.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${
                selectedStudentId === thread.id
                  ? 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/5'
                  : theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none hover:bg-white/5' : 'bg-white border-slate-200 hover:bg-slate-100 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black truncate max-w-[100px] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{thread.name}</span>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                    thread.role === 'COUNSELOR' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  }`}>
                    {thread.role}
                  </span>
                </div>
                <span className="text-[8px] font-bold text-slate-500">{thread.lastTime}</span>
              </div>
              <p className="text-[10px] text-slate-400 truncate line-clamp-1">
                {thread.role === 'COUNSELOR' ? `re: Support Request` : thread.lastMessage}
              </p>
            </button>
          ))}
          {filteredThreads.length === 0 && (
            <div className="py-20 text-center opacity-20">
              <MessageSquare className={`w-10 h-10 mx-auto mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-900'}`} />
              <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>No Active Threads</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace: Active Thread */}
      <main className={`flex-1 flex flex-col min-w-0 transition-colors duration-500 bg-white dark:bg-slate-950/20`}>
        {selectedStudentId ? (
          <>
            <header className={`px-8 py-6 border-b backdrop-blur-md flex items-center justify-between transition-colors duration-500 bg-white border-slate-200 dark:bg-slate-900/20 dark:border-zinc-800`}>
              <div className="flex items-center space-x-4">
                <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center font-black text-amber-500 transition-colors bg-white border-slate-200 shadow-sm dark:bg-slate-800 dark:border-zinc-800`}>
                  {selectedThread?.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-extrabold uppercase ${isDark ? 'text-white' : 'text-main'}`}>{selectedThread?.name}</h4>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                      selectedThread?.role === 'COUNSELOR' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    }`}>
                      {selectedThread?.role}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {selectedThread?.role === 'COUNSELOR' ? 'Internal Counselor Request' : 'Direct Student Support'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleResolve}
                  className="px-4 py-2 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-sm shadow-emerald-500/5"
                >
                  Mark as Resolved
                </button>
                <button className="p-2 text-slate-500 hover:text-slate-900 transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderRole === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] space-y-2`}>
                    <div className={`p-4 rounded-3xl text-sm ${getBubbleStyle(msg)}`}>
                      {msg.text}
                    </div>
                    <p className={`text-[8px] font-bold text-slate-500 uppercase tracking-widest ${msg.senderRole === 'ADMIN' ? 'text-right' : 'text-left'}`}>
                      {msg.senderName} • {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString() : 'Sending...'}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>

            <footer className={`p-8 border-t transition-colors duration-500 ${
              theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-slate-50 border-slate-200'
            }`}>
              <form onSubmit={handleReply} className="flex items-center space-x-4">
                <div className={`flex-1 border rounded-2xl px-6 py-4 transition-all flex items-center shadow-sm ${
                  theme === 'dark' ? 'bg-slate-950 border-slate-200 dark:border-zinc-800 focus-within:border-amber-500/50' : 'bg-white border-slate-200 focus-within:border-amber-500'
                }`}>
                  <input
                    type="text"
                    placeholder="Compose high-priority response..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className={`w-full bg-transparent border-none focus:outline-none text-xs font-medium ${
                      theme === 'dark' ? 'text-white' : 'text-slate-950'
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <Send className="w-6 h-6" />
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-30 animate-in fade-in duration-500">
            <div className={`w-20 h-20 rounded-[2rem] border flex items-center justify-center text-slate-400 ${
              theme === 'dark' ? 'bg-zinc-900/90 border-zinc-800 shadow-none' : 'bg-slate-50 border-slate-200 shadow-sm'
            }`}>
               <ShieldCheck className="w-10 h-10" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Select a support thread to audit</p>
          </div>
        )}
      </main>
    </div>
  );
};
