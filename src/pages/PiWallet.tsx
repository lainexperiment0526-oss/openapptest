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
import { ArrowLeft, Wallet, ArrowUpRight, ArrowDownLeft, Loader2, CreditCard } from 'lucide-react';

interface PaymentRecord {
  id: string;
  amount: number;
  memo: string;
  status: string;
  created_at: string;
  metadata: any;
}

export default function PiWallet() {
  const { user, loading } = useAuth();
  const { piUser, isPiReady, isPiAuthenticated, authenticateWithPi, createPiPayment } = usePiNetwork();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [isTopUp, setIsTopUp] = useState(false);

  useEffect(() => {
    if (user) loadWalletData();
  }, [user]);

  const loadWalletData = async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const { data } = await supabase
        .from('pi_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setPayments(data || []);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleTopUp = async () => {
    const parsed = parseFloat(topUpAmount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    if (!isPiReady) {
      toast.error('Pi Network not available. Please use Pi Browser.');
      return;
    }

    setIsTopUp(true);
    try {
      if (!isPiAuthenticated) {
        const piAuth = await authenticateWithPi();
        if (!piAuth) {
          toast.error('Pi authentication required');
          return;
        }
      }

      await createPiPayment(parsed, `Wallet top-up: ${parsed} Pi`, {
        type: 'wallet_topup',
      }, {
        onPaymentCompleted: () => {
          toast.success(`Successfully topped up ${parsed} Pi!`);
          setTopUpAmount('');
          loadWalletData();
        },
        onPaymentCancelled: () => {
          toast.info('Top-up cancelled');
        },
        onPaymentError: (err) => {
          toast.error('Top-up failed: ' + (err?.message || 'Unknown error'));
        },
      });
    } catch (err: any) {
      if (err.message !== 'Payment cancelled') {
        toast.error(err.message || 'Top-up failed');
      }
    } finally {
      setIsTopUp(false);
    }
  };

  const totalTopUps = payments
    .filter((p) => p.status === 'completed' && p.metadata?.type === 'wallet_topup')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalSpent = payments
    .filter((p) => p.status === 'completed' && p.metadata?.type !== 'wallet_topup')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Sign in Required</h1>
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

        <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Pi Wallet
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Manage your Pi payments. Top up and track your transaction history.
        </p>

        {/* Pi User Info */}
        {piUser && (
          <div className="rounded-2xl bg-card p-4 border border-border mb-6">
            <p className="text-sm text-muted-foreground">Connected as</p>
            <p className="text-lg font-bold text-foreground">@{piUser.username}</p>
            <p className="text-xs text-muted-foreground">UID: {piUser.uid}</p>
          </div>
        )}

        {/* Balance Summary */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-2xl bg-card p-4 border border-border text-center">
            <ArrowDownLeft className="h-5 w-5 text-green-500 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Total Top-ups</p>
            <p className="text-xl font-bold text-foreground">{totalTopUps.toFixed(2)} Pi</p>
          </div>
          <div className="rounded-2xl bg-card p-4 border border-border text-center">
            <ArrowUpRight className="h-5 w-5 text-red-500 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className="text-xl font-bold text-foreground">{totalSpent.toFixed(2)} Pi</p>
          </div>
        </div>

        {/* Top Up */}
        <div className="rounded-2xl bg-card p-6 border border-border mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Top Up Wallet
          </h2>
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label>Amount (Pi)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleTopUp} disabled={isTopUp || !isPiReady} size="lg">
                {isTopUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Top Up'
                )}
              </Button>
            </div>
          </div>
          {!isPiReady && (
            <p className="text-xs text-muted-foreground mt-2">Requires Pi Browser</p>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link to="/a2u" className="rounded-2xl bg-card p-4 border border-border text-center hover:border-primary transition-colors">
            <ArrowUpRight className="h-5 w-5 text-primary mx-auto mb-2" />
            <p className="font-medium text-foreground text-sm">Send Pi (A2U)</p>
            <p className="text-xs text-muted-foreground">App-to-User payments</p>
          </Link>
          <Link to="/purchases" className="rounded-2xl bg-card p-4 border border-border text-center hover:border-primary transition-colors">
            <CreditCard className="h-5 w-5 text-primary mx-auto mb-2" />
            <p className="font-medium text-foreground text-sm">Purchases</p>
            <p className="text-xs text-muted-foreground">View app purchases</p>
          </Link>
        </div>

        {/* Transaction History */}
        <div className="rounded-2xl bg-card p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Transaction History</h2>
          {loadingData ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transactions yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div>
                    <p className="font-medium text-foreground">{Number(p.amount).toFixed(2)} Pi</p>
                    <p className="text-xs text-muted-foreground">{p.memo || 'No memo'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    p.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    p.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {p.status}
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
