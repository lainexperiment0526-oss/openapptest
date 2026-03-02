import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

declare global {
  interface Window {
    Pi: {
      init: (config: { version: string; sandbox?: boolean }) => void;
      authenticate: (
        scopes: string[],
        onIncompletePaymentFound: (payment: any) => void
      ) => Promise<{
        user: { uid: string; username: string };
        accessToken: string;
      }>;
      createPayment: (payment: {
        amount: string;
        memo: string;
        metadata?: Record<string, any>;
      }) => {
        on(event: 'ready' | 'approve' | 'complete' | 'cancel', callback: () => void): void;
        on(event: 'error', callback: (error: any) => void): void;
        start(): void;
      };
      Ads: {
        requestAd: (adType: string) => Promise<void>;
        showAd: (adType: string) => Promise<void>;
        isAdReady: (adType: string) => boolean;
      };
    };
  }
}

interface PiUser {
  uid: string;
  username: string;
  accessToken: string;
  wallet_address?: string;
}

interface PiContextType {
  piUser: PiUser | null;
  isPiReady: boolean;
  isPiAuthenticated: boolean;
  piLoading: boolean;
  authenticateWithPi: () => Promise<PiUser | null>;
  forceReauthenticate: () => Promise<PiUser | null>;
  createPiPayment: (amount: number, memo: string, metadata?: Record<string, any>, callbacks?: {
    onPaymentApproved?: () => void;
    onPaymentCompleted?: () => void;
    onPaymentCancelled?: () => void;
    onPaymentError?: (error: any) => void;
  }) => Promise<void>;
  showPiAd: (adType: 'interstitial' | 'rewarded') => Promise<boolean>;
  signOutPi: () => void;
}

const PiContext = createContext<PiContextType | undefined>(undefined);

const PI_SDK_URL = 'https://sdk.minepi.com/pi-sdk.js';
const isPiBrowser = () => /pibrowser|pi browser/i.test(navigator.userAgent);
const initPi = () => {
  if (!window.Pi) return false;
  window.Pi.init({ version: '2.0' });
  return true;
};

export function PiProvider({ children }: { children: ReactNode }) {
  const [piUser, setPiUser] = useState<PiUser | null>(null);
  const [isPiReady, setIsPiReady] = useState(false);
  const [piLoading, setPiLoading] = useState(true);

  useEffect(() => {
    // Check if already loaded
    if (initPi()) {
      setIsPiReady(true);
      setPiLoading(false);
      return;
    }

    // Skip Pi SDK loading on localhost if not in Pi Browser to avoid cross-origin errors
    if (!isPiBrowser() && window.location.hostname === 'localhost') {
      console.log('Pi SDK loading skipped on localhost (not in Pi Browser)');
      setPiLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = PI_SDK_URL;
    script.async = true;
    script.onload = () => {
      // Pi object can be attached slightly after script onload on some WebViews.
      if (initPi()) {
        setIsPiReady(true);
        setPiLoading(false);
        return;
      }

      let retries = 0;
      const maxRetries = 10;
      const retryInterval = window.setInterval(() => {
        retries += 1;
        if (initPi()) {
          window.clearInterval(retryInterval);
          setIsPiReady(true);
          setPiLoading(false);
          return;
        }
        if (retries >= maxRetries) {
          window.clearInterval(retryInterval);
          console.warn('Pi SDK loaded but Pi object is unavailable');
          setPiLoading(false);
        }
      }, 200);
    };
    script.onerror = () => {
      console.warn('Pi SDK not available (not in Pi Browser)');
      setPiLoading(false);
    };
    document.head.appendChild(script);
  }, []);

  const onIncompletePaymentFound = useCallback(async (payment: any) => {
    console.log('Incomplete payment found:', payment);
    // Try to complete it via backend
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${baseUrl}/functions/v1/pi-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', paymentId: payment.identifier, txid: payment.transaction?.txid }),
      });
    } catch (err) {
      console.error('Failed to complete payment:', err);
    }
  }, []);

  const forceReauthenticate = useCallback(async (): Promise<PiUser | null> => {
    // Clear current user and force re-authentication
    setPiUser(null);
    
    // Clear any stored Pi auth data
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pi_auth');
      localStorage.removeItem('pi_user');
    }
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-authenticate with full scopes (duplicate logic to avoid circular dependency)
    if (!window.Pi) {
      console.warn('Pi SDK not available');
      return null;
    }
    try {
      setPiLoading(true);
      const auth = await window.Pi.authenticate(
        ['payments', 'username', 'wallet_address'],
        onIncompletePaymentFound
      );
      const user: PiUser = {
        uid: auth.user.uid,
        username: auth.user.username,
        accessToken: auth.accessToken,
        wallet_address: (auth.user as any)?.wallet_address,
      };
      setPiUser(user);
      return user;
    } catch (err: any) {
      console.error('Pi re-authentication failed:', err);
      // Check if it's a scope error
      if (err?.message?.includes('missing_scope') || err?.message?.includes('wallet_address')) {
        toast.error('Wallet address scope required. Please try again in a few minutes.', {
          duration: 5000,
        });
      }
      return null;
    } finally {
      setPiLoading(false);
    }
  }, [onIncompletePaymentFound]);

  const authenticateWithPi = useCallback(async (): Promise<PiUser | null> => {
    if (!window.Pi) {
      console.warn('Pi SDK not available');
      return null;
    }
    try {
      setPiLoading(true);
      const auth = await window.Pi.authenticate(
        ['payments', 'username', 'wallet_address'],
        onIncompletePaymentFound
      );
      const user: PiUser = {
        uid: auth.user.uid,
        username: auth.user.username,
        accessToken: auth.accessToken,
        wallet_address: (auth.user as any)?.wallet_address,
      };
      setPiUser(user);
      return user;
    } catch (err: any) {
      console.error('Pi authentication failed:', err);
      // Check if it's a scope error
      if (err?.message?.includes('missing_scope') || err?.message?.includes('wallet_address')) {
        toast.error('Wallet address scope required. Please click "Force Re-authenticate" below.', {
          duration: 5000,
          action: {
            label: 'Force Re-authenticate',
            onClick: () => forceReauthenticate(),
          },
        });
      }
      return null;
    } finally {
      setPiLoading(false);
    }
  }, [onIncompletePaymentFound, forceReauthenticate]);

  const createPiPayment = useCallback(async (
    amount: number,
    memo: string,
    metadata?: Record<string, any>,
    callbacks?: {
      onPaymentApproved?: () => void;
      onPaymentCompleted?: () => void;
      onPaymentCancelled?: () => void;
      onPaymentError?: (error: any) => void;
    }
  ): Promise<void> => {
    if (!window.Pi?.createPayment) {
      console.error('Pi SDK not available');
      callbacks?.onPaymentError?.(new Error('Pi SDK not available'));
      return;
    }

    // Check if user has wallet_address scope before attempting payment
    if (!piUser?.wallet_address) {
      toast.error('Wallet address scope required. Please re-authenticate to continue.', {
        duration: 5000,
        action: {
          label: 'Re-authenticate Now',
          onClick: () => forceReauthenticate(),
        },
      });
      callbacks?.onPaymentError?.(new Error('Wallet address scope not authorized'));
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const payment = window.Pi.createPayment({
          amount: amount.toFixed(2),
          memo,
          metadata,
        });

        payment.on('ready', () => {
          console.log('Payment ready');
        });

        payment.on('approve', () => {
          console.log('Payment approved');
          callbacks?.onPaymentApproved?.();
        });

        payment.on('complete', () => {
          console.log('Payment completed');
          callbacks?.onPaymentCompleted?.();
          resolve();
        });

        payment.on('cancel', () => {
          console.log('Payment cancelled');
          callbacks?.onPaymentCancelled?.();
          reject(new Error('Payment cancelled'));
        });

        payment.on('error', (error: any) => {
          console.error('Payment error:', error);
          // Check for wallet_address scope error
          if (error?.message?.includes('missing_scope') || error?.message?.includes('wallet_address')) {
            toast.error('Wallet address scope required. Please re-authenticate to continue.', {
              duration: 5000,
              action: {
                label: 'Re-authenticate Now',
                onClick: () => forceReauthenticate(),
              },
            });
          }
          callbacks?.onPaymentError?.(error);
          reject(error);
        });

        payment.start();
      } catch (error: any) {
        console.error('Failed to create payment:', error);
        // Check for wallet_address scope error
        if (error?.message?.includes('missing_scope') || error?.message?.includes('wallet_address')) {
          toast.error('Wallet address scope required. Please re-authenticate to continue.', {
            duration: 5000,
            action: {
              label: 'Re-authenticate Now',
              onClick: () => forceReauthenticate(),
            },
          });
        }
        callbacks?.onPaymentError?.(error);
        reject(error);
      }
    });
  }, [piUser, forceReauthenticate]);

  const showPiAd = useCallback(async (adType: 'interstitial' | 'rewarded'): Promise<boolean> => {
    if (!window.Pi?.Ads) {
      console.warn('Pi Ads not available');
      return false;
    }
    try {
      await window.Pi.Ads.requestAd(adType);
      await window.Pi.Ads.showAd(adType);
      return true;
    } catch (err) {
      console.error('Pi Ad error:', err);
      return false;
    }
  }, []);

  const signOutPi = useCallback(() => {
    setPiUser(null);
  }, []);

  return (
    <PiContext.Provider value={{
      piUser,
      isPiReady,
      isPiAuthenticated: !!piUser,
      piLoading,
      authenticateWithPi,
      forceReauthenticate,
      createPiPayment,
      showPiAd,
      signOutPi,
    }}>
      {children}
    </PiContext.Provider>
  );
}

export function usePiNetwork() {
  const context = useContext(PiContext);
  if (!context) throw new Error('usePiNetwork must be used within PiProvider');
  return context;
}
