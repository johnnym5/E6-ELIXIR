import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface AndroidBridge {
  triggerSmsSync: (mask: string, bankName: string) => void;
  getSmsMessages?: () => string;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridge;
    onSmsBalanceUpdate?: (balance: number, mask: string, timestamp: number) => void;
    onSmsSyncFailed?: (mask: string, reason: string) => void;
  }
}

export const useAndroidBridge = (callbacks?: {
  onSuccess?: (balance: number, mask: string, timestamp: number) => void;
  onFailure?: (mask: string, reason: string) => void;
}) => {
  const isNativeAndroid = Boolean(window.AndroidBridge);

  useEffect(() => {
    if (callbacks?.onSuccess) {
      window.onSmsBalanceUpdate = (balance, mask, timestamp) => {
        console.log(`[useAndroidBridge] Success: ₦${balance} for Acct ${mask}`);
        callbacks.onSuccess?.(balance, mask, timestamp);
      };
    }

    if (callbacks?.onFailure) {
      window.onSmsSyncFailed = (mask, reason) => {
        console.warn(`[useAndroidBridge] Failed: ${mask} (${reason})`);
        callbacks.onFailure?.(mask, reason);
      };
    }

    return () => {
      window.onSmsBalanceUpdate = undefined;
      window.onSmsSyncFailed = undefined;
    };
  }, [callbacks]);

  const triggerSmsSync = useCallback((mask: string, bankName: string) => {
    if (window.AndroidBridge) {
      console.log(`[useAndroidBridge] Triggering sync for mask ${mask} at ${bankName}`);
      window.AndroidBridge.triggerSmsSync(mask, bankName);
      return true;
    } else {
      console.warn('[useAndroidBridge] No Android Bridge detected');
      return false;
    }
  }, []);

  const getSmsMessages = useCallback(() => {
    if (window.AndroidBridge?.getSmsMessages) {
      try {
        const raw = window.AndroidBridge.getSmsMessages();
        return JSON.parse(raw);
      } catch (e) {
        console.error('[useAndroidBridge] Failed to parse SMS messages', e);
        return [];
      }
    }
    return [];
  }, []);

  return {
    isNativeAndroid,
    triggerSmsSync,
    getSmsMessages,
  };
};
