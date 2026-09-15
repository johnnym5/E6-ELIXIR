import { useMemo } from 'react';
import { LIVE_FX_RATE } from '../constants';

export type AccountType = 'SAVINGS' | 'CURRENT' | 'DOMICILIARY' | 'SPONSORED';
export type ConnectionMethod = 'MONO_OPEN_BANKING' | 'OKRA_AGGREGATOR' | 'MANUAL_DEPOSIT' | 'TOP_UP';
export type AccountStatus = 'VERIFIED' | 'SYNCING' | 'NEEDS_REAUTH';
export type UnlinkStatus = 'ACTIVE' | 'UNLINK_REQUESTED' | 'UNLINK_APPROVED' | 'UNLINK_REJECTED';

export interface LinkedBankAccount {
  id: string;
  bankName: string;
  accountName?: string;
  accountNumber?: string;
  accountNumberMasked: string;
  accountType: AccountType;
  balanceNgn: number;
  balanceGbp: number;
  orgTopUpCapitalNgn: number;
  isCapitalBreached: boolean;
  isVerified: boolean;
  isDedicatedParallex?: boolean;
  lastTransactionAt?: string;
  connectionMethod: ConnectionMethod;
  lastSyncedAt: string;
  connectedAt?: string;
  status: AccountStatus;
  unlinkStatus: UnlinkStatus;
  isSystemTopUp: boolean;
  unlinkReason?: string;
  verificationStatus?: string;
  verificationBadge?: string;
}

interface UseAccountProcessorProps {
  liveAccounts: any[];
  appUser: any;
  liveBalance: any;
  activeUserId: string | undefined;
  selectedAccountIds: string[];
}

export const useAccountProcessor = ({
  liveAccounts,
  appUser,
  liveBalance,
  activeUserId,
  selectedAccountIds,
}: UseAccountProcessorProps) => {
  const accounts = useMemo(() => {
    const list: LinkedBankAccount[] = [];

    const hasDedicatedTopUp = liveAccounts.some(
      (a) => a.id.startsWith('TOPUP_') || a.accountType === 'SPONSORED' || a.connectionMethod === 'TOP_UP'
    );

    const profileApprovedTopUp = Number(appUser?.approvedCapitalNgn || appUser?.topUpAmountNgn || 0);
    const consolidatedNgn = Number(liveBalance?.consolidatedBalanceNgn || appUser?.consolidatedBalanceNgn || 0);

    for (const item of liveAccounts) {
      const isTopUpDoc = item.id.startsWith('TOPUP_') || item.accountType === 'SPONSORED' || item.connectionMethod === 'TOP_UP';
      const rawBalNgn = Number(item.accountBalanceNgn ?? item.balanceNgn ?? item.balanceNGN ?? 0);
      const topUpCapitalNgn = Number(item.orgTopUpCapitalNgn || 0);

      if (!hasDedicatedTopUp && topUpCapitalNgn > 0 && !isTopUpDoc) {
        const actualBal = Math.max(rawBalNgn - topUpCapitalNgn, 0);
        list.push({
          id: item.id,
          bankName: item.bankName || 'Unknown Bank',
          accountName: item.accountName || item.bankName || 'Primary Account',
          accountNumberMasked: item.accountNumberMasked || item.accountMask || '•••• ****',
          accountType: item.accountType || item.type || 'SAVINGS',
          balanceNgn: actualBal,
          balanceGbp: Math.round((actualBal / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: 0,
          isCapitalBreached: false,
          isVerified: item.isVerified ?? true,
          isDedicatedParallex: item.isDedicatedParallex || item.bankName?.includes('Parallex'),
          lastTransactionAt: item.lastTransactionAt || (item.lastSyncedAt?.seconds ? new Date(item.lastSyncedAt.seconds * 1000).toISOString() : null),
          isSystemTopUp: false,
          unlinkStatus: item.unlinkStatus || 'ACTIVE',
          connectionMethod: item.connectionMethod || item.provider || 'MANUAL_DEPOSIT',
          lastSyncedAt: item.lastSyncedAt?.seconds
            ? new Date(item.lastSyncedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          status: item.status || 'VERIFIED',
          verificationBadge: item.verificationBadge
        });

        list.push({
          id: `TOPUP_${item.id}`,
          bankName: 'Organization Top-Up Capital',
          accountName: 'Basechan Sponsored Capital',
          accountNumberMasked: '•••• TOPUP',
          accountType: 'SPONSORED',
          balanceNgn: topUpCapitalNgn,
          balanceGbp: Math.round((topUpCapitalNgn / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: topUpCapitalNgn,
          isCapitalBreached: false,
          isVerified: true,
          isDedicatedParallex: false,
          lastTransactionAt: item.lastTransactionAt || new Date().toISOString(),
          isSystemTopUp: false,
          unlinkStatus: 'ACTIVE',
          connectionMethod: 'TOP_UP',
          lastSyncedAt: 'Just now',
          status: 'VERIFIED'
        });
      } else {
        const isThisTopUp = isTopUpDoc;
        const balGbp = item.balanceGbp || item.balanceGBP || Math.round((rawBalNgn / LIVE_FX_RATE) * 100) / 100;

        list.push({
          id: item.id,
          bankName: isThisTopUp ? (item.bankName || 'Organization Top-Up Capital') : (item.bankName || 'Unknown Bank'),
          accountName: item.accountName || item.bankName || (isThisTopUp ? 'Basechan Sponsored Capital' : 'Primary Account'),
          accountNumberMasked: item.accountNumberMasked || item.accountMask || (isThisTopUp ? '•••• TOPUP' : '•••• ****'),
          accountType: isThisTopUp ? 'SPONSORED' : (item.accountType || item.type || 'SAVINGS'),
          balanceNgn: rawBalNgn,
          balanceGbp: balGbp,
          orgTopUpCapitalNgn: isThisTopUp ? rawBalNgn : 0,
          isCapitalBreached: false,
          isVerified: item.isVerified ?? true,
          isDedicatedParallex: item.isDedicatedParallex || item.bankName?.includes('Parallex'),
          lastTransactionAt: item.lastTransactionAt || (item.lastSyncedAt?.seconds ? new Date(item.lastSyncedAt.seconds * 1000).toISOString() : null),
          isSystemTopUp: false,
          unlinkStatus: item.unlinkStatus || 'ACTIVE',
          connectionMethod: item.connectionMethod || item.provider || (isThisTopUp ? 'TOP_UP' : 'MANUAL_DEPOSIT'),
          lastSyncedAt: item.lastSyncedAt?.seconds
            ? new Date(item.lastSyncedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Just now',
          status: item.status || 'VERIFIED',
          verificationBadge: item.verificationBadge
        });
      }
    }

    const currentTopUpExists = list.some((a) => a.accountType === 'SPONSORED' || a.id.startsWith('TOPUP_') || a.connectionMethod === 'TOP_UP');
    if (!currentTopUpExists) {
      const totalPersonalNgn = list.reduce((sum, a) => sum + (Number(a.balanceNgn) || 0), 0);
      const topUpAmount = profileApprovedTopUp > 0
        ? profileApprovedTopUp
        : (consolidatedNgn > totalPersonalNgn ? consolidatedNgn - totalPersonalNgn : 0);

      if (topUpAmount > 0 && activeUserId) {
        list.push({
          id: `TOPUP_${activeUserId}`,
          bankName: 'Organization Top-Up Capital',
          accountName: 'Basechan Sponsored Capital',
          accountNumberMasked: '•••• TOPUP',
          accountType: 'SPONSORED',
          balanceNgn: topUpAmount,
          balanceGbp: Math.round((topUpAmount / LIVE_FX_RATE) * 100) / 100,
          orgTopUpCapitalNgn: topUpAmount,
          isCapitalBreached: false,
          isVerified: true,
          isDedicatedParallex: false,
          lastTransactionAt: new Date().toISOString(),
          isSystemTopUp: false,
          unlinkStatus: 'ACTIVE',
          connectionMethod: 'TOP_UP',
          lastSyncedAt: 'Just now',
          status: 'VERIFIED'
        });
      }
    }

    return list;
  }, [liveAccounts, appUser, liveBalance, activeUserId]);

  const totals = useMemo(() => {
    const selectedAccounts = accounts.filter((a) => selectedAccountIds.includes(a.id));
    const accountsNgn = selectedAccounts.reduce((sum, acc) => sum + (Number(acc.balanceNgn) || 0), 0);

    let ngn = 0;
    if (selectedAccountIds.length > 0) {
      ngn = accountsNgn;
    } else if (accounts.length === 0) {
      ngn = liveBalance?.consolidatedBalanceNgn || 0;
    }

    const gbp = ngn > 0 ? ngn / LIVE_FX_RATE : (liveBalance?.gbpEquivalent || 0);

    return { ngn, gbp, accountsNgn };
  }, [accounts, selectedAccountIds, liveBalance]);

  return { accounts, totals };
};
