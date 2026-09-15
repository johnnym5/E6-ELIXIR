import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Download,
  Image as ImageIcon,
  File as FileIcon,
  Rocket,
  Send,
  Layers,
  Eye,
  ExternalLink
} from 'lucide-react';
import { doc, collection, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { toast } from 'sonner';
import { generateAndUploadMandatePackage } from '../utils/pdfEngine';

interface RequirementItem {
  id: string;
  label: string;
  type: 'IMAGE' | 'PDF';
  description: string;
  isRequired: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const StudentDocumentUploadWizard: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentUser, appUser } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [submissions, setSubmissions] = useState<Record<string, any>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStage, setCurrentStage] = useState(1);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);

  // 1. Unified Multi-Stage Definitions
  const stageInfo = [
    { title: 'Download Template', subtitle: 'Get Blank Upgrade Form' },
    { title: 'Upload Signed Form', subtitle: 'Submit Completed Mandate' },
    { title: 'Supporting Documents', subtitle: 'Identity & Address Proof' },
    { title: 'Package Assembly', subtitle: 'Merging Document Flow' },
    { title: 'Review & Dispatch', subtitle: 'Download Final Package' },
  ];

  const currentStageInfo = stageInfo[currentStage - 1];

  // 2. Data Fetching Helper
  const fetchBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 3. Handlers
  const handleDownloadTemplate = async () => {
    const t = toast.loading('Connecting to compliance engine...');
    try {
      const response = await fetch('/templates/Upgrade_Form.pdf');

      if (!response.ok) throw new Error(`Template not found (Error ${response.status})`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Parallex_Upgrade_Form_Blank.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Template downloaded. Please print and sign.", { id: t });
    } catch (err: any) {
      toast.error(err.message, { id: t });
    }
  };

  const handleCompilePackage = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    const t = toast.loading('Executing Multi-Page Assembly Pipeline...');
    try {
      const requiredIds = [
        'signed_upgrade_form',
        'passport_photo',
        'id_data_page',
        'utility_bill',
        'nin_doc',
        'bvn_doc'
      ];

      const supportingDocs = requiredIds.map(id => {
        const sub = submissions[id];
        if (!sub || !sub.value) throw new Error(`Missing ${id.replace(/_/g, ' ')}`);
        return {
          id,
          url: sub.value,
          fileType: sub.fileType
        };
      });

      const downloadUrl = await generateAndUploadMandatePackage({
        userId: currentUser.uid,
        studentData: appUser || {},
        supportingDocs
      });

      setCompiledPdfUrl(downloadUrl);
      toast.success("Master package compiled successfully!", { id: t });
      setCurrentStage(5);
    } catch (e: any) {
      toast.error(e.message, { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (requirementId: string, file: File) => {
    if (!currentUser) return;

    setUploadingId(requirementId);
    setUploadProgress(0);

    const fileExt = file.name.split('.').pop();
    const storagePath = `student_documents/${currentUser.uid}/${requirementId}.${fileExt}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        toast.error('Upload failed: ' + error.message);
        setUploadingId(null);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        const subRef = doc(db, 'users', currentUser.uid, 'submitted_documents', requirementId);
        await setDoc(subRef, {
          requirementId,
          value: downloadURL,
          fileType: file.type,
          fileName: file.name,
          storagePath,
          status: 'PENDING_REVIEW',
          updatedAt: serverTimestamp()
        });

        toast.success('Document uploaded');
        setUploadingId(null);
      }
    );
  };

  // 4. Effects
  useEffect(() => {
    if (!currentUser) return;
    const q = collection(db, 'users', currentUser.uid, 'submitted_documents');
    const unsub = onSnapshot(q, (snap) => {
      const data: Record<string, any> = {};
      snap.docs.forEach(d => {
        data[d.id] = d.data();
      });
      setSubmissions(data);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (appUser?.compiledPackageDownloadUrl) {
       setCompiledPdfUrl(appUser.compiledPackageDownloadUrl);
    }
  }, [appUser]);

  // 5. Stage Logic
  const getStageRequirements = (stage: number): RequirementItem[] => {
    if (stage === 2) {
      return [{
        id: 'signed_upgrade_form',
        label: 'Signed Upgrade Form',
        type: 'IMAGE',
        description: 'Upload a clear scan or photo of your signed Upgrade Form.',
        isRequired: true
      }];
    }
    if (stage === 3) {
      return [
        { id: 'passport_photo', label: 'Passport Photograph', type: 'IMAGE', description: 'White background, high resolution.', isRequired: true },
        { id: 'id_data_page', label: 'Passport Data Page', type: 'IMAGE', description: 'Full data page showing photo and name.', isRequired: true },
        { id: 'utility_bill', label: 'Utility Bill', type: 'IMAGE', description: 'Maximum 3 months old.', isRequired: true },
        { id: 'nin_doc', label: 'NIN Slip / Document', type: 'IMAGE', description: 'Official NIN verification document.', isRequired: true },
        { id: 'bvn_doc', label: 'BVN Verification', type: 'IMAGE', description: 'BVN validation record or slip.', isRequired: true }
      ];
    }
    return [];
  };

  const stageRequirements = getStageRequirements(currentStage);
  const totalStages = 5;

  const isStageComplete = currentStage === 1 ? true :
    currentStage === 2 ? (submissions['signed_upgrade_form']?.status === 'PENDING_REVIEW' || submissions['signed_upgrade_form']?.status === 'APPROVED') :
    currentStage === 3 ? [
      'passport_photo', 'id_data_page', 'utility_bill', 'nin_doc', 'bvn_doc'
    ].every(id => submissions[id]?.status === 'PENDING_REVIEW' || submissions[id]?.status === 'APPROVED') :
    currentStage === 4 ? !!compiledPdfUrl : true;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-8 border-b border-surface-glass-border flex justify-between items-center bg-slate-950/10 dark:bg-slate-950/20">
          <div>
            <h3 className="text-2xl font-black text-main dark:text-white uppercase tracking-tight leading-none">Compliance</h3>
            <p className="text-[10px] text-muted dark:text-slate-500 font-bold uppercase tracking-widest mt-2">
              Stage {currentStage} of {totalStages}: {currentStageInfo?.title}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 dark:hover:bg-slate-800 rounded-xl transition-colors text-subtle"><XIcon className="w-6 h-6" /></button>
        </header>

        <div className="px-8 pt-4 flex gap-2">
          {stageInfo.map((_, i) => (
             <div
               key={i}
               className={`h-1.5 flex-1 rounded-full transition-all ${
                 i + 1 === currentStage ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]' :
                 i + 1 < currentStage ? 'bg-emerald-500/50' : 'bg-white/5'
               }`}
             />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar touch-pan-y">
          {currentStage === 1 && (
            <div className="text-center space-y-8 animate-in fade-in zoom-in-95 duration-500 py-10">
              <div className="w-24 h-24 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mx-auto shadow-2xl shadow-blue-500/10">
                <FileText className="w-12 h-12" />
              </div>
              <div className="max-w-md mx-auto space-y-3">
                <h3 className="text-3xl font-black text-main dark:text-white uppercase tracking-tight leading-tight">Step 1: Get Template</h3>
                <p className="text-sm font-medium text-muted dark:text-slate-400 leading-relaxed">
                  Download the blank Upgrade Form template. You must fill it out manually, sign it, and scan it back for the next stage.
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-blue-600/5 border border-blue-500/20 max-w-sm mx-auto flex items-start gap-4 text-left">
                <ShieldCheck className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-muted leading-relaxed uppercase tracking-tighter">
                  Ensure all information matches your official ID documents exactly to avoid compliance delays.
                </p>
              </div>

              <button
                onClick={handleDownloadTemplate}
                className="px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 mx-auto"
              >
                <Download className="w-5 h-5" />
                Download Blank Form
              </button>
            </div>
          )}

          {(currentStage === 2 || currentStage === 3) && (
            <div className="space-y-6">
              {stageRequirements.map((req) => {
                const submission = submissions[req.id];
                const isUploading = uploadingId === req.id;

                return (
                  <div key={req.id} className={`p-6 rounded-3xl border transition-all ${
                    submission ? (
                      submission.status === 'APPROVED' ? 'bg-emerald-500/5 border-emerald-500/20' :
                      submission.status === 'REJECTED' ? 'bg-rose-500/5 border-rose-500/20' :
                      'bg-blue-600/5 border-blue-500/20 shadow-lg shadow-blue-500/5'
                    ) : 'bg-white/5 border-white/5'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[8px] font-black text-subtle uppercase tracking-[0.2em]">{req.type}</p>
                          <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[6px] font-black uppercase">Mandatory</span>
                        </div>
                        <h4 className="text-base font-black text-main dark:text-white uppercase tracking-tight leading-tight truncate">{req.label}</h4>
                        <p className="text-[10px] text-muted font-medium leading-relaxed mt-1">{req.description}</p>
                      </div>
                      {submission && (
                        <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase shrink-0 ${
                          submission.status === 'APPROVED' ? 'bg-emerald-500 text-white' :
                          submission.status === 'REJECTED' ? 'bg-rose-500 text-white' :
                          'bg-blue-600 text-white animate-pulse'
                        }`}>
                          {submission.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {submission ? (
                         <div className="flex items-center justify-between p-4 bg-slate-950/40 border border-white/5 rounded-2xl">
                           <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400">
                                 {req.type === 'IMAGE' ? <ImageIcon className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
                              </div>
                              <div className="min-w-0">
                                 <p className="text-[10px] font-bold text-main dark:text-white uppercase truncate">{submission.fileName || 'Document Node'}</p>
                                 <p className="text-[8px] text-subtle font-mono uppercase">Synced: {submission.updatedAt?.seconds ? new Date(submission.updatedAt.seconds * 1000).toLocaleString() : 'Just now'}</p>
                              </div>
                           </div>
                           {submission.status !== 'APPROVED' && (
                             <label className="p-2.5 rounded-xl bg-white/5 hover:bg-blue-600 text-white transition-all cursor-pointer shadow-lg">
                                <Upload className="w-4 h-4" />
                                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => e.target.files?.[0] && handleFileUpload(req.id, e.target.files[0])} />
                             </label>
                           )}
                         </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl cursor-pointer transition-all hover:bg-white/5 ${isUploading ? 'pointer-events-none' : ''}`}>
                           {isUploading ? (
                             <div className="w-full space-y-4">
                                <div className="flex justify-between items-end px-2">
                                   <span className="text-[10px] font-black text-blue-500 uppercase">Encrypting...</span>
                                   <span className="text-xs font-black text-white font-mono">{Math.round(uploadProgress)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                   <motion.div className="h-full bg-blue-600" animate={{ width: `${uploadProgress}%` }} />
                                </div>
                             </div>
                           ) : (
                             <>
                               <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-3 shadow-lg">
                                  <Upload className="w-6 h-6" />
                               </div>
                               <p className="text-[10px] font-black uppercase text-main dark:text-white tracking-widest">Upload Document</p>
                               <p className="text-[8px] text-subtle font-bold uppercase mt-1">IMAGE OR PDF • MAX 10MB</p>
                             </>
                           )}
                           <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => e.target.files?.[0] && handleFileUpload(req.id, e.target.files[0])} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentStage === 4 && (
            <div className="text-center py-12 space-y-8 animate-in fade-in duration-500">
               <div className="w-24 h-24 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mx-auto shadow-2xl shadow-blue-500/10">
                  <Layers className="w-12 h-12" />
               </div>
               <div className="space-y-3">
                  <h3 className="text-3xl font-black text-main dark:text-white uppercase tracking-tight leading-tight">Package Assembly</h3>
                  <p className="text-sm font-medium text-muted dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    We will now merge your completed Upgrade Form and all 5 supporting documents into a single, multi-page master PDF.
                  </p>
               </div>

               <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-6 text-left space-y-4 max-w-md mx-auto">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span className="text-[10px] font-black uppercase text-main dark:text-slate-300">Unified Multi-Page Compiler Engine</span>
                  </div>
                  <ul className="space-y-2">
                    {[
                      'Completed Upgrade Form (Page 1)',
                      'Passport Photograph (Page 2)',
                      'International Passport Data (Page 3)',
                      'Utility Bill (Page 4)',
                      'NIN Slip (Page 5)',
                      'BVN Record (Page 6)'
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-[9px] font-bold text-muted uppercase tracking-widest">
                        <div className="w-1 h-1 rounded-full bg-blue-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
               </div>

               <button
                 onClick={handleCompilePackage}
                 disabled={isSubmitting}
                 className="w-full max-w-sm py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-black text-base uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 mx-auto"
               >
                 {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Rocket className="w-6 h-6" />}
                 Assemble Master Package
               </button>
            </div>
          )}

          {currentStage === 5 && (
            <div className="space-y-8 animate-in zoom-in-95 duration-500">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mx-auto shadow-2xl shadow-blue-500/10">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-main dark:text-white uppercase tracking-tight leading-tight">Review Master Package</h3>
                <p className="text-sm font-medium text-muted dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Your 6-page regulatory package is assembled and ready. Please review it before final dispatch to our governance queue.
                </p>
              </div>

              {compiledPdfUrl ? (
                <div className="aspect-[4/5] w-full rounded-3xl overflow-hidden border border-white/10 bg-black/40 relative group">
                  <iframe
                    src={`${compiledPdfUrl}#view=FitH&toolbar=0`}
                    className="w-full h-full border-none"
                    title="Master Package Preview"
                    onError={() => toast.error("Failed to load PDF preview.")}
                  />

                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => window.open(compiledPdfUrl, '_blank')}
                      className="p-2 bg-slate-900/80 backdrop-blur-md border border-white/20 rounded-lg text-white"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[4/5] w-full rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center space-y-4">
                   <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                   <p className="text-xs font-black text-muted uppercase tracking-widest">Fetching Assembled Package...</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => window.open(compiledPdfUrl!, '_blank')}
                  className="py-4 bg-slate-900 border border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Review Full Page
                </button>
                <a
                  href={compiledPdfUrl || '#'}
                  download={`Upgrade_Package_${appUser?.displayName}.pdf`}
                  className="py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Master PDF
                </a>
              </div>
            </div>
          )}
        </div>

        <footer className="p-8 border-t border-surface-glass-border bg-slate-950/10 dark:bg-slate-950/40 flex gap-4">
           {currentStage > 1 && currentStage < 5 && (
             <button
               onClick={() => setCurrentStage(s => s - 1)}
               className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all border border-white/5"
             >
               Previous Stage
             </button>
           )}
           {currentStage < totalStages ? (
             <button
               onClick={() => setCurrentStage(s => s + 1)}
               disabled={!isStageComplete || isSubmitting}
               className="flex-[2] py-4 bg-blue-600 disabled:opacity-30 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20"
             >
               <span>{currentStage === 3 ? 'Proceed to Assembly' : 'Continue'}</span>
               <ArrowRight className="w-4 h-4" />
             </button>
           ) : (
             <button
               onClick={onClose}
               className="flex-1 py-4 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
             >
               Return to Dashboard
             </button>
           )}
        </footer>
      </motion.div>
    </div>
  );
};

export default StudentDocumentUploadWizard;
