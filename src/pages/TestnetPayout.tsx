import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePiNetwork } from '@/hooks/usePiNetwork';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import A2UService from '@/services/a2uService';
import { ArrowLeft, Wallet, Loader2, CheckCircle, Gift } from 'lucide-react';

interface PayoutRecord {
  id: string;
  amount: number;
  status: string;
  pi_wallet_address?: string;
  txid?: string;
  created_at: string;
  processed_at?: string;
}

export default function TestnetPayout() {
  const { user, loading } = useAuth();
  const { piUser, isPiAuthenticated, authenticateWithPi } = usePiNetwork();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastTxid, setLastTxid] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadPayouts();
  }, [user]);

  const loadPayouts = async () => {
    if (!user) return;
    setLoadingPayouts(true);
    try {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('developer_id', user.id)
        .eq('memo', 'Testnet Payout')
        .order('created_at', { ascending: false })
        .limit(5);
      setPayouts((data || []) as any[]);
    } catch (err) {
      console.error('Failed to load payout history:', err);
    } finally {
      setLoadingPayouts(false);
    }
  };

  const handleReceivePayout = async () => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    if (!isPiAuthenticated) {
      toast.error('Please authenticate with Pi Network first');
      authenticateWithPi();
      return;
    }

    if (!piUser?.uid) {
      toast.error('Pi Network user information not available');
      return;
    }

    // Check if user already received a payout in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPayout } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('developer_id', user.id)
      .eq('memo', 'Testnet Payout')
      .gte('created_at', twentyFourHoursAgo)
      .single();

    if (recentPayout) {
      toast.error('You can only receive one testnet payout per 24 hours');
      return;
    }

    setProcessing(true);
    try {
      // Create payout record in database first
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .insert({
          developer_id: user.id,
          amount: 0.01,
          status: 'pending',
          pi_wallet_address: piUser.uid, // Use user's UID as the recipient
          memo: 'Testnet Payout',
        })
        .select()
        .single();

      if (error) throw error;

      // Process automatic payout using A2U service
      const result = await A2UService.createPayment({
        recipientUid: piUser.uid,
        recipientUsername: piUser.username,
        amount: 0.01,
        memo: 'Testnet Payout',
        metadata: {
          type: 'testnet_payout',
          automatic: true
        }
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to process payout');
      }

      // Update payout record with blockchain details
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          txid: result.txid,
          processed_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      setLastTxid(result.txid || null);
      toast.success('Testnet payout of 0.01 π received successfully!');
      loadPayouts();
    } catch (err: any) {
      console.error('Payout error:', err);
      toast.error(err.message || 'Payout failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Sign in Required</h1>
          <p className="text-muted-foreground mb-6">You need to sign in to receive testnet payouts.</p>
          <Link to="/auth"><Button>Sign In</Button></Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
            <Gift className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Testnet Payouts</h1>
          <p className="text-muted-foreground">
            This is for developer payouts testing (A2U). Only 0.01 π per click is allowed.
          </p>
        </div>

        {/* Pi Authentication Status */}
        {!isPiAuthenticated && (
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 mb-6">
            <div className="text-center">
              <p className="text-sm font-medium text-yellow-800 mb-3">Pi Network Authentication Required</p>
              <Button 
                onClick={() => authenticateWithPi()} 
                className="bg-yellow-600 hover:bg-yellow-700"
                size="sm"
              >
                Authenticate with Pi
              </Button>
            </div>
          </div>
        )}

        {/* Payout Button */}
        <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 p-8 mb-8 text-center">
          <Button
            onClick={handleReceivePayout}
            disabled={processing || !isPiAuthenticated}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-8 py-4 text-lg"
            size="lg"
          >
            {processing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Receive your 0.01 Testnet Pi
              </span>
            )}
          </Button>

          {lastTxid && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center justify-center gap-2 text-green-800 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Payout submitted</span>
              </div>
              <p className="text-sm text-green-700">
                tx: {lastTxid}
              </p>
            </div>
          )}
        </div>

        {/* Recent Payouts */}
        <div className="rounded-2xl bg-card p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Payouts</h2>
          {loadingPayouts ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : payouts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payouts yet.</p>
          ) : (
            <div className="space-y-3">
              {payouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-start gap-3">
                    {payout.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-yellow-500 animate-spin mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        +{Number(payout.amount).toFixed(2)} Test-Pi
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payout.created_at).toLocaleString()}
                        {payout.txid && ` | tx: ${payout.txid.slice(0, 16)}...`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    payout.status === 'completed' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {payout.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
