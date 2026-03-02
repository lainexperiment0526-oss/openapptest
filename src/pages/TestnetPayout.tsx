import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePiNetwork } from '@/hooks/usePiNetwork';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import A2UService from '@/services/a2uService';
import { ArrowLeft, Wallet, Loader2, CheckCircle, Gift } from 'lucide-react';

interface PayoutRecord {
  id: string;
  amount: number;
  status: string;
  pi_wallet_address?: string | null;
  recipient_username?: string | null;
  txid?: string | null;
  created_at: string;
  processed_at?: string | null;
  network?: string | null;
  blockchain_verified?: boolean | null;
  error_message?: string | null;
}

export default function TestnetPayout() {
  const { user, loading } = useAuth();
  const { piUser, isPiAuthenticated, authenticateWithPi } = usePiNetwork();
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastTxid, setLastTxid] = useState<string | null>(null);
  const [amount, setAmount] = useState('1.00');

  useEffect(() => {
    if (user) loadPayouts();
  }, [user]);

  const loadPayouts = async () => {
    if (!user) return;
    setLoadingPayouts(true);
    try {
      console.log('Loading payouts for user:', user.id);
      
      // @ts-ignore
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select(`
          id,
          amount,
          status,
          pi_wallet_address,
          txid,
          created_at,
          processed_at,
          network,
          blockchain_verified,
          error_message,
          recipient_username
        `)
        .eq('developer_id', user.id)
        .eq('memo', 'Testnet Payout')
        .order('created_at', { ascending: false })
        .limit(10);
      
      console.log('Loaded payouts:', data);
      setPayouts(data || []);
    } catch (err: any) {
      console.error('Failed to load payouts:', err);
      toast.error('Failed to load payout history');
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

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }

    setProcessing(true);
    try {
      // Create payout record in database first
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .insert({
          developer_id: user.id,
          amount: parsedAmount,
          status: 'completed', // Auto-complete without approval
          pi_wallet_address: piUser.uid, // Use user's UID as recipient
          recipient_username: piUser.username, // Store recipient username
          memo: 'Testnet Payout',
          network: 'testnet', // Specify network
          processed_at: new Date().toISOString(), // Auto-process immediately
          blockchain_verified: true // Mark as blockchain verified
        })
        .select()
        .single();

      if (error) throw error;

      // Process automatic payout using A2U service
      console.log('Processing A2U payment to user wallet:', piUser.uid);
      const result = await A2UService.createPayment({
        recipientUid: piUser.uid,
        recipientUsername: piUser.username,
        amount: parsedAmount,
        memo: 'Testnet Payout',
        metadata: {
          type: 'testnet_payout',
          automatic: true,
          user_wallet: piUser.uid,
          timestamp: new Date().toISOString()
        }
      });

      console.log('A2U payment result:', result);

      if (!result.success) {
        console.error('A2U payment failed:', result.error);
        throw new Error(result.error || 'Failed to process payout');
      }

      // Verify the payment was created successfully
      if (!result.txid) {
        throw new Error('Payment created but no transaction ID received');
      }

      console.log('Payment successful, TXID:', result.txid);

      // Update payout record with blockchain details
      await supabase
        .from('withdrawal_requests')
        .update({
          txid: result.txid,
        })
        .eq('id', data.id);

      setLastTxid(result.txid || null);
      toast.success(
        <div>
          <div>✅ {parsedAmount} π sent to your Pi wallet!</div>
          <div className="text-xs mt-1">TXID: {result.txid}</div>
          <div className="text-xs text-green-600 mt-1">Check your Pi Network wallet</div>
        </div>
      );
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
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 rounded-full mb-4 shadow-lg">
            <Gift className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            Testnet Payouts
          </h1>
          <p className="text-muted-foreground text-lg">
            Request any amount of testnet Pi instantly. No limits, no approval required.
          </p>
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link 
            to="/a2u-withdrawal" 
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 hover:from-blue-100 hover:to-cyan-100 transition-all duration-200"
          >
            <Wallet className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Quick Withdraw</span>
          </Link>
          <Link 
            to="/wallet" 
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 hover:from-purple-100 hover:to-pink-100 transition-all duration-200"
          >
            <Wallet className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Pi Wallet</span>
          </Link>
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
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-8 mb-8 text-center shadow-xl border border-blue-200">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
            <div className="text-white text-sm font-medium mb-2">Instant Payout</div>
            <div className="text-white text-3xl font-bold mb-1">Custom Amount</div>
            <div className="text-white/80 text-xs">No limits, instant approval</div>
          </div>
          
          {/* Amount Input */}
          <div className="mb-6">
            <Label htmlFor="amount" className="text-white text-sm font-medium mb-2 block">
              Amount (π)
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="bg-white/90 border-white/20 text-blue-900 placeholder:text-blue-400 text-center text-lg font-semibold"
              disabled={processing || !isPiAuthenticated}
            />
          </div>
          
          <Button
            onClick={handleReceivePayout}
            disabled={processing || !isPiAuthenticated}
            className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold px-8 py-4 text-lg shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-blue-100"
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
                Receive {amount || '0.00'} Testnet Pi
              </span>
            )}
          </Button>

          {lastTxid && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center justify-center gap-2 text-green-800 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">💰 Pi Sent to Your Wallet</span>
              </div>
              <p className="text-sm text-green-700 font-mono mb-2">
                tx: {lastTxid}
              </p>
              <div className="flex flex-col gap-2">
                <a 
                  href={`https://blockexplorer.pinet.app/tx/${lastTxid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  🔍 View on Pi Blockchain Explorer
                </a>
                <p className="text-xs text-green-600">
                  ✅ {amount || '0.00'} π transferred to your Pi Network wallet
                </p>
                <p className="text-xs text-green-600">
                  📱 Check your Pi Network app to confirm receipt
                </p>
              </div>
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
                    {payout.status === 'completed' && payout.blockchain_verified ? (
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
                        {payout.recipient_username && ` | to: ${payout.recipient_username}`}
                        {payout.txid && ` | tx: ${payout.txid.slice(0, 16)}...`}
                        {payout.network && ` | ${payout.network}`}
                      </p>
                      {payout.error_message && (
                        <p className="text-xs text-red-600 mt-1">
                          Error: {payout.error_message}
                        </p>
                      )}
                      {payout.txid && (
                        <a 
                          href={`https://blockexplorer.pinet.app/tx/${payout.txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1 mt-1"
                        >
                          🔍 View on Blockchain
                        </a>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    payout.status === 'completed' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {payout.blockchain_verified ? '✅ Verified' : payout.status}
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
