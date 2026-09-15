import { doc, collection, getDocs, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LIVE_FX_RATE } from '../constants';

/**
 * Client-Side Ledger Recalculation Engine
 * Scans all financial accounts for a user and updates the root user document
 * with consolidated totals in NGN and GBP.
 */
export const recalculateUserBalance = async (userId: string): Promise<void> => {
  if (!userId) return;

  try {
    // 1. Fetch all active financial accounts
    const q = query(collection(db, 'financial_accounts'), where('userId', '==', userId));
    const snap = await getDocs(q);

    let totalNgn = 0;

    snap.docs.forEach(d => {
      const data = d.data();
      // Only include verified accounts in consolidated balance
      if (data.status === 'VERIFIED' || data.isVerified) {
        totalNgn += Number(data.balanceNgn || data.accountBalanceNgn || 0);
      }
    });

    const totalGbp = totalNgn / LIVE_FX_RATE;

    // 2. Update Root User document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      consolidatedBalanceNgn: totalNgn,
      totalEquityNgn: totalNgn,
      gbpEquivalent: totalGbp,
      lastSyncedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 3. Update Evaluation if exists
    const evalQ = query(collection(db, 'pof_evaluations'), where('userId', '==', userId));
    const evalSnap = await getDocs(evalQ);
    if (!evalSnap.empty) {
      await updateDoc(evalSnap.docs[0].ref, {
        balanceNgn: totalNgn,
        balanceGbp: totalGbp,
        updatedAt: serverTimestamp()
      });
    }

  } catch (err) {
    console.error('Balance recalculation failed:', err);
    throw err;
  }
};
