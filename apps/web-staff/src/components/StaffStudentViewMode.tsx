import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  serverTimestamp,
  addDoc,
  limit,
  runTransaction,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import {
  X as XIcon,
  ShieldAlert,
  Edit3,
  Plus,
  Trash2,
  Calendar,
  Building2,
  TrendingUp,
  Activity,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Settings,
  Save,
  Zap,
  CreditCard,
  CheckCheck
} from 'lucide-react';
import { StudentTopUpSettingsModal } from './StudentTopUpSettingsModal';
import { StudentDashboardView } from './StudentDashboardView';
import { MAJOR_CURRENCIES, LIVE_FX_RATE } from '../constants';
import { StudentDashboardSkeleton } from './ui/LoadingStates';

interface StaffStudentViewModeProps {
  studentId: string;
  onExit: () => void;
}

export const StaffStudentViewMode: React.FC<StaffStudentViewModeProps> = ({ studentId, onExit }) => {
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideTab, setModalTab] = useState<'request' | 'history' | 'days' | 'pricing'>('request');

  // Form States
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [requestHistory, setRequestHistory] = useState<any[]>([]);
  const [isModifying, setIsModifying] = useState(false);
  const [modifiedCapital, setModifiedCapital] = useState<number>(0);
  const [isProcessing, setIsSubmitting] = useState(false);

  const [holdingDays, setHoldingDays] = useState('');
  const [targetGbpInput, setTargetGbpInput] = useState('');
  const [localCurrency, setLocalCurrency] = useState('NGN');
  const [timerStartInput, setTimerStartInput] = useState(new Date().toISOString().split('T')[0]);
  const [durationDays, setDurationDays] = useState('28');

  const calculatedEndDate = useMemo(() => {
    if (!timerStartInput) return null;
    const start = new Date(timerStartInput);
    const duration = parseInt(durationDays) || 0;
    const end = new Date(start.getTime() + (duration * 24 * 60 * 60 * 1000));
    return end.toISOString().split('T')[0];
  }, [timerStartInput, durationDays]);

  // Pricing States
  const [pricingForm, setPricingForm] = useState({
    feePercentage: 2.5,
    maxLimit: 150000000
  });

  useEffect(() => {
    if (!studentId) return;

    // 1. Listen to Student Evaluation
    const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', studentId));
    const unsubEval = onSnapshot(evalQ, (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        setStudent({ id: docSnap.id, ...data });

        if (data.targetGBP) setTargetGbpInput(data.targetGBP.toString());
        if (data.localCurrency) setLocalCurrency(data.localCurrency);
        if (data.startDate) setTimerStartInput(data.startDate);
        if (data.topUpPricingConfig) {
          setPricingForm({
            feePercentage: data.topUpPricingConfig.topUpFeePercentage || 2.5,
            maxLimit: data.topUpPricingConfig.maxAllowedTopUpNgn || 150000000
          });
        }
      } else {
        getDoc(doc(db, 'users', studentId)).then(userSnap => {
           if (userSnap.exists()) {
             setStudent({ userId: studentId, userName: userSnap.data().displayName, email: userSnap.data().email });
           }
        });
      }
      setLoading(false);
    });

    // 2. Listen to Pending Top-Up Request
    const requestQ = query(
        collection(db, 'topup_requests'),
        where('userId', '==', studentId),
        where('status', '==', 'PENDING_ADMIN_VERIFICATION'),
        limit(1)
    );
    const unsubRequest = onSnapshot(requestQ, (snap) => {
        if (!snap.empty) {
            const data = snap.docs[0].data();
            setActiveRequest({ id: snap.docs[0].id, ...data });
            setModifiedCapital(data.topUpAmountNgn || 0);
        } else {
            setActiveRequest(null);
        }
    });

    // 3. Listen to Top-Up Request History
    const historyQ = query(
        collection(db, 'topup_requests'),
        where('userId', '==', studentId),
        where('status', 'in', ['APPROVED', 'REJECTED'])
    );
    const unsubHistory = onSnapshot(historyQ, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRequestHistory(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    return () => {
        unsubEval();
        unsubRequest();
        unsubHistory();
    };
  }, [studentId]);

  const handleApproveRequest = async (amount: number) => {
    if (!activeRequest || !studentId) return;
    setIsSubmitting(true);
    const t = toast.loading('Synchronizing Dual-Ledger Facility...');
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', studentId);
        const requestRef = doc(db, 'topup_requests', activeRequest.id);
        const facilityRef = doc(db, 'financial_accounts', `TOPUP_${studentId}`);

        // 1. Update Request Status
        transaction.update(requestRef, {
          status: 'APPROVED',
          approvedAt: serverTimestamp(),
          approvedCapitalNgn: Number(amount),
          adminServiceFeeNgn: Math.round(Number(amount) * (pricingForm.feePercentage / 100))
        });

        // 2. Initialize or Update Top-Up Facility
        transaction.set(facilityRef, {
          userId: studentId,
          accountName: 'Basechan Sponsored Capital',
          bankName: 'Organization Top-Up Capital',
          accountNumberMasked: '•••• TOPUP',
          accountType: 'SPONSORED',
          balanceNgn: Number(amount),
          balanceGbp: Math.round((Number(amount) / LIVE_FX_RATE) * 100) / 100,
          status: 'VERIFIED',
          isVerified: true,
          connectionMethod: 'TOP_UP',
          updatedAt: serverTimestamp()
        }, { merge: true });

        // 3. Update Student Root Record
        transaction.update(userRef, {
          topUpStatus: 'APPROVED',
          hasPendingTopUp: false,
          isApproved: true,
          updatedAt: serverTimestamp()
        });

        // 4. Update Evaluation if exists
        const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', studentId));
        const evalSnap = await getDocs(evalQ);
        if (!evalSnap.empty) {
          transaction.update(evalSnap.docs[0].ref, {
            isApproved: true,
            updatedAt: serverTimestamp()
          });
        }
      });

      toast.success('Top-Up approved successfully!', { id: t });
      setIsOverrideModalOpen(false);
    } catch (err: any) {
      toast.error('Transaction failed: ' + err.message, { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDenyRequest = async () => {
    if (!activeRequest || !studentId) return;
    const reason = window.prompt("Reason for denial:");
    if (reason === null) return; // Cancelled

    setIsSubmitting(true);
    const t = toast.loading('Denying claim...');
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', studentId);
        const requestRef = doc(db, 'topup_requests', activeRequest.id);

        transaction.update(requestRef, {
          status: 'REJECTED',
          rejectionReason: reason || 'Information mismatch',
          rejectedAt: serverTimestamp()
        });

        transaction.update(userRef, {
          topUpStatus: 'REJECTED',
          hasPendingTopUp: false,
          status: 'ACTION_REQUIRED',
          updatedAt: serverTimestamp()
        });
      });

      toast.success('Request denied.', { id: t });
      setIsOverrideModalOpen(false);
    } catch (err: any) {
      toast.error('Failed: ' + err.message, { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateWindow = async (data: any) => {
    if (!student) return;
    setIsSubmitting(true);

    const updates: any = {
      targetGBP: parseFloat(data.targetGbp) || 0,
      targetAmountNgn: data.targetAmountNgn || 0,
      targetAmountForeign: data.targetAmountForeign || 0,
      targetCurrency: data.targetCurrency || 'GBP',
      inputCurrencyUsed: data.inputCurrencyUsed || 'NGN',
      localCurrency: data.localCurrency,
      startDate: data.timerStart,
      expirationDate: data.calculatedEndDate,
      durationDays: parseInt(data.targetDays) || 28,
      isTimerActive: true,
      updatedAt: serverTimestamp()
    };

    let detailParts = [
      `target: £${data.targetGbp}`,
      `currency: ${data.localCurrency}`,
      `start: ${data.timerStart}`,
      `end: ${data.calculatedEndDate}`,
      `inputCurrency: ${data.inputCurrencyUsed}`
    ];

    if (data.manualDays) {
      const days = parseInt(data.manualDays) || 0;
      const newStart = new Date();
      newStart.setDate(newStart.getDate() - days + 1);
      updates.startDate = newStart.toISOString().split('T')[0];
      detailParts.push(`manual counter: ${days} days`);
    }

    try {
      const targetUid = student.userId || student.id;
      // 1. Update student profile in users collection for global sync
      await updateDoc(doc(db, 'users', targetUid), {
        targetAmountNgn: updates.targetAmountNgn,
        targetAmountForeign: updates.targetAmountForeign,
        targetCurrency: updates.targetCurrency,
        inputCurrencyUsed: updates.inputCurrencyUsed,
        targetGBP: updates.targetGBP,
        updatedAt: serverTimestamp()
      });

      // 2. Update evaluation record
      await setDoc(doc(db, 'pof_evaluations', targetUid), {
        ...updates,
        userId: targetUid,
        userName: student.userName || student.name || 'Student',
        userEmail: student.email || '',
        createdAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'audit_logs'), {
        actor: 'Staff Inspector',
        action: 'EVALUATION_SETUP',
        detail: `Configured ${student.userName || student.name}: ${detailParts.join(', ')}`,
        studentId: targetUid,
        createdAt: serverTimestamp()
      });

      toast.success('Setup configuration applied.');
    } catch (e: any) {
      toast.error('Setup failed: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePricing = async (pricing: any) => {
    if (!student) return;
    setIsSubmitting(true);

    const updates = {
      topUpPricingConfig: {
        topUpFeePercentage: Number(pricing.feePercentage),
        maxAllowedTopUpNgn: Number(pricing.maxLimit),
        updatedAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'pof_evaluations', studentId), {
        ...updates,
        userId: studentId,
        userName: student.userName || student.name || 'Student',
        userEmail: student.email || '',
        createdAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'audit_logs'), {
        actor: 'Staff Inspector',
        action: 'PRICING_CONFIG_UPDATE',
        detail: `Updated pricing for ${student.userName}: ${pricing.feePercentage}% fee, ₦${pricing.maxLimit.toLocaleString()} limit`,
        studentId: studentId,
        createdAt: serverTimestamp()
      });

      toast.success('Top-Up pricing updated.');
    } catch (e: any) {
      toast.error('Pricing update failed: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <StudentDashboardSkeleton />;
  }

  return (
    <div className="relative w-full">
      <StudentDashboardView
        studentId={studentId}
        viewMode="ADMIN"
        studentName={student?.userName || student?.displayName || 'Student'}
        onAdminAction={(tab) => {
          setModalTab((tab as any) || 'balance');
          setIsOverrideModalOpen(true);
        }}
        onExit={onExit}
      />

      <StudentTopUpSettingsModal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        student={student}
        activeRequest={activeRequest}
        requestHistory={requestHistory}
        pricingForm={pricingForm}
        onUpdatePricing={handleUpdatePricing}
        onUpdateWindow={handleUpdateWindow}
        onApproveRequest={handleApproveRequest}
        onDenyRequest={handleDenyRequest}
      />
    </div>
  );
};

const History: React.FC = () => {
    return <div className="p-8 text-center text-slate-500 uppercase font-black text-[10px]">Unified history node coming soon</div>
}
