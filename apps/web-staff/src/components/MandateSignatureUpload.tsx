import React from 'react';
import { FileSignature, Upload, Info, AlertTriangle } from 'lucide-react';

interface MandateSignatureUploadProps {
  onUpload: (base64: string) => void;
  uploaded: boolean;
}

export const MandateSignatureUpload: React.FC<MandateSignatureUploadProps> = ({ onUpload, uploaded }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpload(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 rounded-[2rem] bg-blue-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-500 mx-auto shadow-2xl shadow-blue-500/10">
          <FileSignature className="w-10 h-10" />
        </div>
        <div className="max-w-md mx-auto">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">Wet Signature Verification</h3>
          <p className="text-sm font-medium text-slate-400 mt-2 leading-relaxed">
            Please print the downloaded mandate form, sign it by hand in the designated box, and upload a clear scan or photo of the signed page.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-xs">1</div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-tight">Sign the Printed Form</p>
          </div>
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            Ensure your signature matches your official ID. Use a black or blue pen.
          </p>
        </div>
        <div className="p-6 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-xs">2</div>
            <p className="text-xs font-bold text-slate-300 uppercase tracking-tight">Capture & Upload</p>
          </div>
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            The scan must be high-resolution and include all four corners of the page.
          </p>
        </div>
      </div>

      <div className={`p-10 rounded-[2.5rem] border-2 border-dashed transition-all text-center space-y-6 ${
        uploaded ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-900/90 border-zinc-800 shadow-none hover:border-blue-500/30'
      }`}>
        {uploaded ? (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 mx-auto shadow-xl shadow-emerald-500/20">
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-lg font-black text-white uppercase tracking-tight">Mandate Page Uploaded</p>
            <label className="cursor-pointer inline-block text-[10px] font-black text-amber-500 uppercase tracking-widest hover:text-amber-400">
              Replace Upload
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        ) : (
          <label className="cursor-pointer block space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-blue-500 mx-auto group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="text-lg font-black text-white uppercase tracking-tight">Drop Signed Form Here</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Accepts JPG, PNG or PDF</p>
            </div>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
            <div className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 inline-block mt-2">
              Browse Files
            </div>
          </label>
        )}
      </div>

      <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <p className="text-[10px] font-bold text-rose-200/70 uppercase tracking-tight leading-relaxed">
          The regulatory team will manually verify this signature against your ID card. Any mismatch will result in a compliance flag and mandate rejection.
        </p>
      </div>
    </div>
  );
};
