import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePiNetwork } from '@/hooks/usePiNetwork';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import A2UService from '@/services/a2uService';
import { ArrowLeft, Wallet, Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  pi_wallet_address: string | null;
  txid: string | null;
  created_at: string;
  processed_at: string | null;
}

export default function A2UWithdrawal() {
  const { user, loading } = useAuth();
  const { piUser, isPiAuthenticated, authenticateWithPi, forceReauthenticate } = usePiNetwork();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (user) loadWithdrawals();
  }, [user]);

  const loadWithdrawals = async () => {
    if (!user) return;
    setLoadingWithdrawals(true);
    try {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('developer_id', user.id)
        .order('created_at', { ascending: false });
      setWithdrawals((data as WithdrawalRequest[]) || []);
    } catch (err) {
      console.error('Failed to load withdrawal requests:', err);
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const handleQuickWithdrawal = async () => {
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

    setWithdrawing(true);
    try {
      // Create withdrawal request in database first
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .insert({
          developer_id: user.id,
          amount: 0.01,
          status: 'pending',
          pi_wallet_address: piUser.uid,
          memo: 'Quick A2U Withdrawal',
        })
        .select()
        .single();

      if (error) throw error;

      // Process withdrawal using A2U service
      const result = await A2UService.createPayment({
        recipientUid: piUser.uid,
        recipientUsername: piUser.username,
        amount: 0.01,
        memo: 'Quick A2U Withdrawal',
        metadata: {
          type: 'quick_withdrawal',
          automatic: true
        }
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to process withdrawal');
      }

      // Update withdrawal record with blockchain details
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          txid: result.txid,
          processed_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      toast.success(`Quick withdrawal of 0.01 Pi completed successfully!`);
      loadWithdrawals();
    } catch (err: any) {
      console.error('Quick withdrawal error:', err);
      toast.error(err.message || 'Quick withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!user) {
      toast.error('Please sign in first');
      return;
    }

    if (!isPiAuthenticated) {
      toast.error('Please authenticate with Pi Network first');
      authenticateWithPi();
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }

    if (!walletAddress.trim()) {
      toast.error('Pi wallet address is required');
      return;
    }

    if (!memo.trim()) {
      toast.error('Memo is required');
      return;
    }

    setWithdrawing(true);
    try {
      // Create withdrawal request in database first
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .insert({
          developer_id: user.id,
          amount: parsedAmount,
          status: 'pending',
          pi_wallet_address: walletAddress.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Process withdrawal using A2U service with PiNetwork backend
      const result = await A2UService.createWithdrawal({
        recipientAddress: walletAddress.trim(),
        amount: parsedAmount,
        memo: memo.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to process withdrawal');
      }

      // Update withdrawal record with blockchain details
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          txid: result.txid,
          processed_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      toast.success(`Withdrawal of ${parsedAmount} Pi completed successfully!`);
      setAmount('');
      setWalletAddress('');
      setMemo('');
      loadWithdrawals();
    } catch (err: any) {
      console.error('Withdrawal error:', err);
      // Check for wallet_address scope error in catch block
      if (err.message?.includes('missing_scope') || err.message?.includes('wallet_address')) {
        toast.error('Wallet address scope required. Please re-authenticate with Pi Network.', {
          duration: 5000,
          action: {
            label: 'Re-authenticate',
            onClick: () => forceReauthenticate(),
          },
        });
      } else {
        toast.error(err.message || 'Withdrawal failed');
      }
    } finally {
      setWithdrawing(false);
    }
  };

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Sign in Required</h1>
          <p className="text-muted-foreground mb-6">You need to sign in to use A2U withdrawals.</p>
          <Link to="/auth"><Button>Sign In</Button></Link>
        </main>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-2">A2U Withdrawals</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Withdraw Pi from your account to any Pi wallet address using App-to-User payments.
        </p>

        {/* Pi Authentication Status */}
        {!isPiAuthenticated && (
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Pi Network Authentication Required</p>
                <p className="text-xs text-yellow-700">Please authenticate with Pi Network to use withdrawals.</p>
              </div>
            </div>
            <Button 
              onClick={() => authenticateWithPi()} 
              className="mt-3 bg-yellow-600 hover:bg-yellow-700"
              size="sm"
            >
              Authenticate with Pi
            </Button>
          </div>
        )}

        {/* Quick Withdrawal */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Quick Withdrawal
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Get an instant 0.01 Pi withdrawal to your Pi wallet - no forms required!
          </p>
          <Button
            onClick={handleQuickWithdrawal}
            disabled={withdrawing || !isPiAuthenticated}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            size="lg"
          >
            {withdrawing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing Quick Withdrawal...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Quick Withdraw 0.01 Pi
              </span>
            )}
          </Button>
        </div>

        {/* Withdrawal Form */}
        <div className="rounded-2xl bg-card p-6 border border-border mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Withdraw Pi
          </h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (Pi) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={!isPiAuthenticated}
              />
            </div>
            <div className="space-y-2">
              <Label>Recipient Pi Wallet Address *</Label>
              <Input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Pi wallet address (starts with S...)"
                disabled={!isPiAuthenticated}
              />
            </div>
            <div className="space-y-2">
              <Label>Memo *</Label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Withdrawal reason or reference"
                rows={3}
                disabled={!isPiAuthenticated}
              />
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing || !isPiAuthenticated}
              className="w-full"
              size="lg"
            >
              {withdrawing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing Withdrawal...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Withdraw Pi
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Withdrawal History */}
        <div className="rounded-2xl bg-card p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Withdrawal History</h2>
          {loadingWithdrawals ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No withdrawal requests yet.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-start gap-3">
                    {statusIcon(w.status)}
                    <div>
                      <p className="font-medium text-foreground">
                        {Number(w.amount).toFixed(2)} Pi
                      </p>
                      <p className="text-xs text-muted-foreground">
                        To: {w.pi_wallet_address?.slice(0, 16)}...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleString()}
                        {w.txid && ` | txid: ${w.txid.slice(0, 16)}...`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    w.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    w.status === 'cancelled' || w.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {w.status}
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
