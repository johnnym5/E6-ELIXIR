import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, ChevronRight, ChevronLeft, Download, Send,
  Loader2, CheckCircle2, FileText, ShieldCheck,
  Rocket, AlertCircle, Eye
} from 'lucide-react';
import { MandateTextForm } from './MandateTextForm';
import { MandateDocumentUploader } from './MandateDocumentUploader';
import { MandateSignatureUpload } from './MandateSignatureUpload';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { FormConsent } from './ui/FormConsent';
import { generateMandateOverlayClientSide, stampMandateTemplate, generateAndUploadMandatePackage } from '../utils/pdfEngine';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface AccountMandateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

const STAGES = [
  { id: 1, title: 'Form Details', subtitle: 'Capture Mandate Info' },
  { id: 2, title: 'Supporting Docs', subtitle: 'Required Attachments' },
  { id: 3, title: 'Review & Draft', subtitle: 'Download Pre-filled PDF' },
  { id: 4, title: 'Wet Signature', subtitle: 'Upload Signed Page' },
  { id: 5, title: 'Final Submission', subtitle: 'Compile & Submit' },
];

export const AccountMandateWizard: React.FC<AccountMandateWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const { currentUser } = useAuth();
  const [stage, setStage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [hasFinalConsent, setHasFinalConsent] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    accountName: '',
    accountNumber: '',
    mandateAuthorisation: 'SOLE_SIGNATORY',
    bvn: '',
    surname: '',
    firstName: '',
    otherName: '',
    identificationType: 'INTERNATIONAL_PASSPORT',
    identificationNo: '',
    telephoneNo: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Files State
  const [files, setFiles] = useState<Record<string, string>>({});
  const [signedMandate, setSignedMandate] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNext = () => {
    if (stage === 1) {
        if (!formData.surname || !formData.firstName || !formData.bvn) {
            toast.error("Please fill in all required personal details.");
            return;
        }
        if (!hasConsent) {
            toast.error("Please provide data processing consent to proceed.");
            return;
        }
    }
    if (stage === 2) {
        const required = ['passport_photo', 'id_data_page', 'utility_bill', 'nin_doc', 'bvn_doc'];
        const missing = required.filter(r => !files[r]);
        if (missing.length > 0) {
            toast.error("Please upload all 5 mandatory documents.");
            return;
        }
    }
    setStage(prev => prev + 1);
  };

  const handleBack = () => setStage(prev => prev - 1);

  const generateOverlay = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      const url = await generateMandateOverlayClientSide({
        ...formData,
        userId: currentUser.uid,
        passportPhotoBase64: files.passport_photo
      });
      setOverlayUrl(url);
      toast.success("Precise overlay generated! You can now preview and print.");
    } catch (e: any) {
      toast.error("Overlay generation failed: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadDraft = async () => {
    setIsSubmitting(true);
    try {
      const pdfBytes = await stampMandateTemplate('/templates/Upgrade_Form.pdf', {
        ...formData,
        passportPhotoBase64: files.passport_photo
      });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mandate_Draft_${formData.surname}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Mandate draft downloaded! Please sign and upload in next step.");
    } catch (e) {
      toast.error("Draft generation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitFinalPackage = async () => {
    if (!currentUser) return;
    setIsSubmitting(true);
    const t = toast.loading('Compiling regulatory package...');
    try {
      const supportingDocs = [
        { id: 'signed_upgrade_form', url: signedMandate!, fileType: 'image/jpeg' },
        { id: 'passport_photo', url: files.passport_photo, fileType: 'image/jpeg' },
        { id: 'id_data_page', url: files.id_data_page, fileType: 'image/jpeg' },
        { id: 'utility_bill', url: files.utility_bill, fileType: 'image/jpeg' },
        { id: 'nin_doc', url: files.nin_doc, fileType: 'image/jpeg' },
        { id: 'bvn_doc', url: files.bvn_doc, fileType: 'image/jpeg' }
      ];

      await generateAndUploadMandatePackage({
        userId: currentUser.uid,
        studentData: formData,
        supportingDocs
      });

      toast.success("Mandate package submitted successfully! Awaiting regulatory review.", { id: t });
      if (onComplete) onComplete();
      onClose();
    } catch (e) {
      toast.error("Final submission failed.", { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 bg-slate-950/90 backdrop-blur-2xl">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-4xl max-h-[90vh] bg-[#0D111A] border border-white/10 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Account Mandate Setup</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Parallex Bank Regulatory Onboarding</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all">
              <XIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Stepper */}
          <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
            {STAGES.map((s, i) => (
              <div key={s.id} className="flex items-center gap-4 shrink-0">
                <div className={`flex items-center gap-3 ${stage >= s.id ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                    stage === s.id ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' :
                    stage > s.id ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white'
                  }`}>
                    {stage > s.id ? <CheckCircle2 className="w-5 h-5" /> : s.id}
                  </div>
                  <div className="hidden lg:block">
                    <p className="text-[9px] font-black uppercase text-slate-500 leading-none">{s.subtitle}</p>
                    <p className={`text-[11px] font-bold mt-1 ${stage === s.id ? 'text-amber-500' : 'text-white'}`}>{s.title}</p>
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`w-8 h-[2px] rounded-full transition-all ${stage > s.id ? 'bg-emerald-500' : 'bg-white/5'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
            {stage === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <MandateTextForm
                  data={formData}
                  onChange={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                />
                <FormConsent
                  id="mandate-initial-consent"
                  checked={hasConsent}
                  onChange={setHasConsent}
                />
              </div>
            )}
            {stage === 2 && (
              <MandateDocumentUploader
                files={files}
                onUpload={(type, base64) => setFiles(prev => ({ ...prev, [type]: base64 }))}
              />
            )}
            {stage === 3 && (
              <div className="text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-24 h-24 rounded-[2.5rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mx-auto shadow-2xl shadow-amber-500/10">
                    <Download className="w-12 h-12" />
                </div>
                <div className="max-w-md mx-auto space-y-3">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tight">Review & Generate</h3>
                    <p className="text-sm font-medium text-slate-400 leading-relaxed">
                        We've mapped your data and photo onto the official template. Please generate the precise overlay, review for accuracy, and print it out for signing.
                    </p>
                </div>

                {overlayUrl ? (
                  <div className="space-y-6">
                    <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 max-w-sm mx-auto flex items-center gap-4 text-left">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-tight">Overlay Ready</p>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Document is pre-filled and aligned with your passport photo.</p>
                        </div>
                    </div>
                    <div className="flex justify-center gap-4">
                      <a
                        href={overlayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" /> Preview PDF
                      </a>
                      <button
                        onClick={() => window.open(overlayUrl, '_blank')}
                        className="px-8 py-4 bg-amber-500 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> Download to Print
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={generateOverlay}
                    disabled={isSubmitting}
                    className="px-10 py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 mx-auto"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
                    Generate Pre-Filled Overlay
                  </button>
                )}
              </div>
            )}
            {stage === 4 && (
              <MandateSignatureUpload
                onUpload={(base64) => setSignedMandate(base64)}
                uploaded={!!signedMandate}
              />
            )}
            {stage === 5 && (
              <div className="text-center space-y-8 animate-in fade-in zoom-in-95 duration-500 py-10">
                <div className="w-24 h-24 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 mx-auto shadow-2xl shadow-emerald-500/10">
                    <Rocket className="w-12 h-12" />
                </div>
                <div className="max-w-md mx-auto space-y-3">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tight">Ready for Blast-off</h3>
                    <p className="text-sm font-medium text-slate-400 leading-relaxed">
                        Your wet-signed mandate and all 5 supporting documents are ready for compilation into your master regulatory package.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 text-left">
                        <ShieldCheck className="w-6 h-6 text-blue-400" />
                        <span className="text-[10px] font-black uppercase text-slate-400">Bank-Grade Encryption</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 text-left">
                        <Rocket className="w-6 h-6 text-purple-400" />
                        <span className="text-[10px] font-black uppercase text-slate-400">Express Submission</span>
                    </div>
                </div>

                <div className="max-w-lg mx-auto">
                  <FormConsent
                    id="mandate-final-consent"
                    checked={hasFinalConsent}
                    onChange={setHasFinalConsent}
                  />
                </div>

                <button
                  onClick={submitFinalPackage}
                  disabled={isSubmitting || !signedMandate || !hasFinalConsent}
                  className="px-12 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:teal-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 mx-auto"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Submit Master Package
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
            <button
              onClick={handleBack}
              disabled={stage === 1 || isSubmitting}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/5 text-slate-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-20"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Back</span>
            </button>

            {stage < 5 && (
                <button
                    onClick={handleNext}
                    disabled={isSubmitting || (stage === 4 && !signedMandate)}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50"
                >
                    <span>{stage === 3 ? 'I have signed it, next' : 'Continue'}</span>
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
