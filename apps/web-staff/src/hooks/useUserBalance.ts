import { useState, useEffect } from 'react';
import { doc, collection, onSnapshot, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserBalance {
  totalEquityNgn: number;
  consolidatedBalanceNgn: number;
  gbpEquivalent: number;
  isSyncing: boolean;
  lastSyncedAt: any;
}

export const useUserBalance = (userId: string | undefined) => {
  const [balance, setBalance] = useState<UserBalance>({
    totalEquityNgn: 0,
    consolidatedBalanceNgn: 0,
    gbpEquivalent: 0,
    isSyncing: false,
    lastSyncedAt: null
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // 1. Root User Document Listener (Real-Time)
    const userRef = doc(db, 'users', userId);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBalance({
          totalEquityNgn: data.totalEquityNgn || 0,
          consolidatedBalanceNgn: data.consolidatedBalanceNgn || 0,
          gbpEquivalent: data.gbpEquivalent || 0,
          isSyncing: data.isSyncing || false,
          lastSyncedAt: data.lastSyncedAt
        });
      }
    }, (err) => {
      console.error("[useUserBalance] User profile stream error:", err);
    });

    // 2. Financial Accounts Listener (Top-Level Collection)
    const accountsRef = collection(db, 'financial_accounts');
    const q = query(accountsRef, where('userId', '==', userId));
    const unsubAccounts = onSnapshot(q, (snap) => {
      const accData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(accData);
    }, (err) => {
      console.error("[useUserBalance] Accounts stream error:", err);
    });

    // 3. PoF Evaluation Listener
    const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', userId));
    const unsubEval = onSnapshot(evalQ, (snap) => {
      if (!snap.empty) {
        setEvaluation(snap.docs[0].data());
      }
      setLoading(false);
    }, (err) => {
      console.error("[useUserBalance] Evaluation stream error:", err);
      setLoading(false);
    });

    // 4. Sync State Safeguard (10-second timeout)
    let timeout: NodeJS.Timeout;
    if (balance.isSyncing) {
      timeout = setTimeout(async () => {
        console.warn('Sync timeout reached for user:', userId);
        await updateDoc(userRef, {
          isSyncing: false,
          updatedAt: serverTimestamp()
        }).catch(err => console.error('Failed to reset sync state:', err));
      }, 10000);
    }

    return () => {
      unsubUser();
      unsubAccounts();
      unsubEval();
      if (timeout) clearTimeout(timeout);
    };
  }, [userId, balance.isSyncing]);

  return { balance, accounts, evaluation, loading };
};
