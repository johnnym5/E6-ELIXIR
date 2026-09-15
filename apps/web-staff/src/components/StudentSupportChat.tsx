import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  X as XIcon,
  User,
  ShieldCheck,
  MoreHorizontal,
  ArrowLeft,
  Circle
} from 'lucide-react';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  isAdmin: boolean;
}

interface StudentSupportChatProps {
  onClose?: () => void;
  isPopUp?: boolean;
}

export const StudentSupportChat: React.FC<StudentSupportChatProps> = ({ onClose, isPopUp }) => {
  const { appUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appUser?.uid) return;

    // 24-hour window filter
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const q = query(
      collection(db, 'support_messages'),
      where('studentId', '==', appUser.uid),
      where('createdAt', '>=', twentyFourHoursAgo),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (err: any) => {
      console.warn('Support chat stream error:', err);
      if (err.message?.includes('index')) {
        const indexUrl = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
        if (indexUrl) {
          toast.error("Chat Index Required", {
            description: "A database index is needed to load your conversation history.",
            action: {
              label: "Create Index",
              onClick: () => window.open(indexUrl, '_blank')
            },
            duration: 10000
          });
        }
      }
    });

    return unsub;
  }, [appUser?.uid]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !appUser) return;

    const msg = inputText;
    setInputText('');

    await addDoc(collection(db, 'support_messages'), {
      studentId: appUser.uid,
      senderId: appUser.uid,
      text: msg,
      isAdmin: false,
      senderRole: appUser.role || 'STUDENT',
      senderName: appUser.displayName,
      createdAt: serverTimestamp(),
    });
  };

  return (
    <>
      {isPopUp && (
        <div className="fixed inset-0 z-[190] bg-black/50 backdrop-blur-xs sm:hidden" onClick={onClose} />
      )}
      <div className={`flex flex-col bg-[#0D1424] border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-none animate-in fade-in zoom-in-95 duration-300 ${
        isPopUp
          ? 'fixed top-[4.5rem] right-3 sm:right-6 sm:w-96 max-h-[75vh] h-[480px] rounded-3xl z-[200] max-w-[calc(100vw-1.5rem)] shadow-none'
          : 'h-[80vh] w-full max-w-md mx-auto rounded-3xl'
      }`}>

        {/* Chat Header */}
        <header className="p-4 sm:p-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-900/80 backdrop-blur-xl flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight truncate">Counselor Support</h3>
              <div className="flex items-center space-x-1.5">
                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Counselor Active</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 shrink-0">
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
                <XIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 no-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <ShieldCheck className="w-8 h-8 text-blue-500/40" />
              <p className="text-xs font-bold text-slate-400">Need help with your proof of funds?</p>
              <p className="text-[10px] text-slate-500">Send a message below and a compliance counselor will assist you.</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.isAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[82%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.isAdmin
                  ? 'bg-zinc-900/90 border-zinc-800 shadow-none text-slate-200 rounded-bl-none'
                  : 'bg-blue-600 text-white font-medium rounded-br-none shadow-md'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xl border-t border-slate-200 dark:border-zinc-800">
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2 bg-slate-950 border border-slate-200 dark:border-zinc-800 p-1.5 rounded-2xl focus-within:border-blue-500/50 transition-all">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-transparent border-none focus:outline-none text-xs text-white px-2.5 py-1"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 active:scale-95 disabled:opacity-40 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
