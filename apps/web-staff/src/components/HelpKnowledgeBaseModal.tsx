import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon,
  Search,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Shield,
  RotateCcw
} from 'lucide-react';
import { modalBackdropVariants, modalBoxVariants } from '../utils/motionPresets';
import { BouncyButton } from './ui/BouncyButton';
import { STUDENT_HELP_DATA, STUDENT_HELP_CATEGORIES } from '../data/studentHelpData';
import { ADMIN_HELP_DATA, ADMIN_HELP_CATEGORIES } from '../data/adminHelpData';

export interface HelpKnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'ADMIN' | 'STUDENT';
}

export const HelpKnowledgeBaseModal: React.FC<HelpKnowledgeBaseModalProps> = ({
  isOpen,
  onClose,
  role
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Topics');

  const categories = role === 'ADMIN' ? ADMIN_HELP_CATEGORIES : STUDENT_HELP_CATEGORIES;
  const rawData = role === 'ADMIN' ? ADMIN_HELP_DATA : STUDENT_HELP_DATA;

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return rawData.filter((section) => {
      // Category filter
      if (selectedCategory !== 'All Topics' && section.category !== selectedCategory) {
        return false;
      }

      // Search query filter
      if (!q) return true;

      const inTitle = section.title.toLowerCase().includes(q);
      const inDesc = section.description.toLowerCase().includes(q);
      const inTags = section.tags.some((t) => t.toLowerCase().includes(q));

      const inBullets = section.bulletPoints?.some((b) => b.toLowerCase().includes(q));
      const inSteps = section.steps?.some(
        (s) => s.title.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q)
      );
      const inGlossary = section.glossaryItems?.some(
        (g) =>
          g.buttonText.toLowerCase().includes(q) ||
          g.actionDescription.toLowerCase().includes(q) ||
          g.locationTip.toLowerCase().includes(q)
      );

      return inTitle || inDesc || inTags || inBullets || inSteps || inGlossary;
    });
  }, [rawData, searchQuery, selectedCategory]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={modalBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-slate-950/85 backdrop-blur-md overflow-hidden"
        >
          <motion.div
            variants={modalBoxVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[88vh] max-h-[850px] flex flex-col rounded-3xl border border-slate-200 dark:border-zinc-800 bg-[#0F172A] text-slate-100 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] overflow-hidden"
          >
            {/* TOP HEADER */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10 shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-white tracking-tight uppercase">
                      Knowledge Base & Onboarding
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Official protocols, step-by-step guidance, and interactive button glossary
                  </p>
                </div>
              </div>

              <BouncyButton
                onClick={onClose}
                aria-label="Close Knowledge Base"
                className="p-2.5 rounded-xl bg-white/5 border border-slate-200 dark:border-zinc-800 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </BouncyButton>
            </div>

            {/* STICKY SEARCH & CATEGORY BAR */}
            <div className="p-4 sm:p-5 border-b border-white/5 bg-slate-950/40 space-y-3 shrink-0">
              {/* Search Input */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-amber-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search help topics, buttons, or compliance rules..."
                  className="w-full bg-zinc-900/90 border-zinc-800 shadow-none focus:border-amber-500/60 rounded-2xl pl-12 pr-10 py-3.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Navigation Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 scale-[1.02]'
                          : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SCROLLABLE CONTENT BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {filteredSections.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-slate-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-slate-500">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">
                      No help topics found matching &ldquo;{searchQuery}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try searching for different keywords such as &ldquo;sync&rdquo;, &ldquo;mandate&rdquo;, &ldquo;top-up&rdquo;, or &ldquo;fee&rdquo;.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All Topics');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                </div>
              ) : (
                filteredSections.map((section) => (
                  <div
                    key={section.id}
                    className="p-5 sm:p-6 rounded-2xl bg-zinc-900/90 border-zinc-800 shadow-none hover:border-amber-500/30 transition-all space-y-4 shadow-lg"
                  >
                    {/* Section Category & Title */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 font-mono">
                          {section.category}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-white tracking-tight mt-0.5">
                          {section.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {section.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-mono text-slate-400 border border-white/5"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {section.description}
                    </p>

                    {/* Bullet Points */}
                    {section.bulletPoints && section.bulletPoints.length > 0 && (
                      <ul className="space-y-2.5 pt-1">
                        {section.bulletPoints.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span className="leading-snug">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Step-by-Step 5-Stage Protocol */}
                    {section.steps && section.steps.length > 0 && (
                      <div className="space-y-2.5 pt-2">
                        {section.steps.map((s) => (
                          <div
                            key={s.stepNumber}
                            className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950/40 border border-white/5 hover:border-amber-500/20 transition-all"
                          >
                            <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono text-xs font-black shrink-0">
                              {s.stepNumber}
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-white uppercase tracking-wide">
                                {s.title}
                              </h4>
                              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                                {s.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Interactive Button Glossary */}
                    {section.glossaryItems && section.glossaryItems.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {section.glossaryItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 hover:border-amber-500/20 transition-all space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 font-mono text-xs font-black tracking-wider shadow-sm">
                                {item.buttonText}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {item.actionDescription}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">
                              <span className="font-bold text-slate-400 uppercase tracking-wider">Where: </span>
                              {item.locationTip}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Callout Box */}
                    {section.callout && (
                      <div
                        className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                          section.callout.type === 'warning'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                            : section.callout.type === 'tip'
                            ? 'bg-blue-500/10 border-slate-200 dark:border-zinc-800 text-blue-300'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                        }`}
                      >
                        {section.callout.type === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                        ) : section.callout.type === 'tip' ? (
                          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                        ) : (
                          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                        )}
                        <span className="leading-snug">{section.callout.text}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-2">
                <span>You can re-open this guide at any time by clicking the <strong className="text-amber-400 font-bold">?</strong> button in the header.</span>
              </div>
              <BouncyButton
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:bg-amber-400"
              >
                Got It / Dismiss
              </BouncyButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default HelpKnowledgeBaseModal;
