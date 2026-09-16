import { useState, useEffect } from 'react';
import {
  doc,
  collection,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface StudentBalance {
  totalEquityNgn: number;
  consolidatedBalanceNgn: number;
  gbpEquivalent: number;
  isSyncing: boolean;
  lastSyncedAt: any;
}

export interface StudentProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  mandateStatus?:
    | 'NOT_STARTED'
    | 'DRAFT_GENERATED'
    | 'MANDATE_SUBMITTED_AWAITING_APPROVAL'
    | 'MANDATE_APPROVED'
    | 'MANDATE_REJECTED';
  isApproved?: boolean;
  onboardingComplete?: boolean;
  raw?: any;
}

export interface StudentDashboardData {
  balance: StudentBalance;
  accounts: any[];
  evaluation: any | null;
  userProfile: StudentProfile | null;
  pendingTopUpRequest: any | null;
  loading: boolean;
}

export const useStudentDashboardData = (userId: string | undefined): StudentDashboardData => {
  const [balance, setBalance] = useState<StudentBalance>({
    totalEquityNgn: 0,
    consolidatedBalanceNgn: 0,
    gbpEquivalent: 0,
    isSyncing: false,
    lastSyncedAt: null,
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<StudentProfile | null>(null);
  const [pendingTopUpRequest, setPendingTopUpRequest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // 1. User document — balance fields + mandateStatus + displayName
    const userRef = doc(db, 'users', userId);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBalance({
          totalEquityNgn: data.totalEquityNgn || 0,
          consolidatedBalanceNgn: data.consolidatedBalanceNgn || 0,
          gbpEquivalent: data.gbpEquivalent || 0,
          isSyncing: data.isSyncing || false,
          lastSyncedAt: data.lastSyncedAt,
        });
        setUserProfile({
          uid: userId,
          displayName: data.displayName || data.userName || '',
          email: data.email,
          photoURL: data.photoURL,
          mandateStatus: data.mandateStatus,
          isApproved: data.isApproved,
          onboardingComplete: data.onboardingComplete,
          raw: data,
        });
      }
    }, (err) => {
      console.error('[useStudentDashboardData] User profile error:', err);
    });

    // 2. Financial accounts
    const accountsQ = query(
      collection(db, 'financial_accounts'),
      where('userId', '==', userId)
    );
    const unsubAccounts = onSnapshot(accountsQ, (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('[useStudentDashboardData] Accounts error:', err);
    });

    // 3. PoF Evaluation
    const evalQ = query(
      collection(db, 'pof_evaluations'),
      where('userId', '==', userId)
    );
    const unsubEval = onSnapshot(
      evalQ,
      (snap) => {
        if (!snap.empty) {
          setEvaluation({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setEvaluation(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useStudentDashboardData] Eval error:', err);
        setLoading(false);
      }
    );

    // 4. Active top-up request (PENDING state)
    const topupQ = query(
      collection(db, 'topup_requests'),
      where('userId', '==', userId),
      where('status', '==', 'PENDING_ADMIN_VERIFICATION'),
      limit(1)
    );
    const unsubTopup = onSnapshot(topupQ, (snap) => {
      setPendingTopUpRequest(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    }, (err) => {
      console.error('[useStudentDashboardData] Topup error:', err);
    });

    // 5. Sync-state safety timeout
    let syncTimeout: ReturnType<typeof setTimeout>;
    if (balance.isSyncing) {
      syncTimeout = setTimeout(async () => {
        console.warn('Sync timeout reached for user:', userId);
        await updateDoc(userRef, {
          isSyncing: false,
          updatedAt: serverTimestamp(),
        }).catch((e) => console.error('Failed to reset sync state:', e));
      }, 10_000);
    }

    return () => {
      unsubUser();
      unsubAccounts();
      unsubEval();
      unsubTopup();
      if (syncTimeout) clearTimeout(syncTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { balance, accounts, evaluation, userProfile, pendingTopUpRequest, loading };
};
