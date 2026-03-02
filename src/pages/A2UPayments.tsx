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
import { ArrowLeft, Send, Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface A2UPayment {
  id: string;
  recipient_pi_uid: string;
  recipient_username: string | null;
  amount: number;
  memo: string;
  payment_id: string | null;
  txid: string | null;
  status: string;
  created_at: string;
}

export default function A2UPayments() {
  const { user, loading } = useAuth();
  const { piUser, isPiAuthenticated, authenticateWithPi, forceReauthenticate } = usePiNetwork();
  const [payments, setPayments] = useState<A2UPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [sending, setSending] = useState(false);

  const [recipientUid, setRecipientUid] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (user) loadPayments();
  }, [user]);

  const loadPayments = async () => {
    if (!user) return;
    setLoadingPayments(true);
    try {
      const { data } = await supabase
        .from('a2u_payments')
        .select('*')
        .eq('sender_user_id', user.id)
        .order('created_at', { ascending: false });
      setPayments((data as A2UPayment[]) || []);
    } catch (err) {
      console.error('Failed to load A2U payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleSendPayment = async () => {
    if (!user) return;

    if (!recipientUid.trim()) {
      toast.error('Recipient Pi UID is required');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }
    if (!memo.trim()) {
      toast.error('Memo is required');
      return;
    }

    setSending(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Step 1: Create the A2U payment
      const createRes = await fetch(`${baseUrl}/functions/v1/a2u-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          recipientUid: recipientUid.trim(),
          recipientUsername: recipientUsername.trim() || null,
          amount: parsedAmount,
          memo: memo.trim(),
          metadata: { sender_username: piUser?.username || 'unknown' },
          senderUserId: user.id,
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create payment');
      }

      const paymentId = createData.paymentId;
      toast.info('Payment created. Submitting to blockchain...');

      // Step 2: Submit to blockchain
      const submitRes = await fetch(`${baseUrl}/functions/v1/a2u-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          paymentId,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitData.success) {
        throw new Error(submitData.error || 'Failed to submit payment');
      }

      const txid = submitData.txid;
      toast.info('Transaction submitted. Completing payment...');

      // Step 3: Complete the payment
      const completeRes = await fetch(`${baseUrl}/functions/v1/a2u-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          paymentId,
          txid,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeData.success) {
        throw new Error(completeData.error || 'Failed to complete payment');
      }

      toast.success(`Successfully sent ${parsedAmount} Pi to ${recipientUsername || recipientUid}!`);
      setRecipientUid('');
      setRecipientUsername('');
      setAmount('');
      setMemo('');
      loadPayments();
    } catch (err: any) {
      console.error('A2U payment error:', err);
      toast.error(err.message || 'Payment failed');
    } finally {
      setSending(false);
    }
  };

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Sign in Required</h1>
          <p className="text-muted-foreground mb-6">You need to sign in to use A2U payments.</p>
          <Link to="/auth"><Button>Sign In</Button></Link>
        </main>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-500" />;
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

        <h1 className="text-2xl font-bold text-foreground mb-2">A2U Payments</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Send Pi directly to users (App-to-User). Payments are processed on the Pi blockchain.
        </p>

        {/* Pi Authentication Status */}
        {!isPiAuthenticated && (
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Pi Network Authentication Required</p>
                <p className="text-xs text-yellow-700">Please authenticate with Pi Network to use A2U payments.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button 
                onClick={() => authenticateWithPi()} 
                className="bg-yellow-600 hover:bg-yellow-700"
                size="sm"
              >
                Authenticate with Pi
              </Button>
              <Button 
                onClick={() => forceReauthenticate()} 
                variant="outline"
                size="sm"
              >
                Force Re-authenticate
              </Button>
            </div>
          </div>
        )}

        {/* Send Payment Form */}
        <div className="rounded-2xl bg-card p-6 border border-border mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Send className="h-5 w-5" /> Send Pi to User
          </h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Recipient Pi UID *</Label>
                <Input
                  value={recipientUid}
                  onChange={(e) => setRecipientUid(e.target.value)}
                  placeholder="User's Pi UID"
                />
              </div>
              <div className="space-y-2">
                <Label>Recipient Username</Label>
                <Input
                  value={recipientUsername}
                  onChange={(e) => setRecipientUsername(e.target.value)}
                  placeholder="@username (optional)"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount (Pi) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Memo *</Label>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Payment reason"
                />
              </div>
            </div>
            <Button
              onClick={handleSendPayment}
              disabled={sending}
              className="w-full"
              size="lg"
            >
              {sending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing A2U Payment...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Send Payment
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Payment History */}
        <div className="rounded-2xl bg-card p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Payment History</h2>
          {loadingPayments ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No A2U payments yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-start gap-3">
                    {statusIcon(p.status)}
                    <div>
                      <p className="font-medium text-foreground">
                        {Number(p.amount).toFixed(2)} Pi → {p.recipient_username || p.recipient_pi_uid.slice(0, 12) + '...'}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.memo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()}
                        {p.txid && ` | txid: ${p.txid.slice(0, 16)}...`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    p.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    p.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
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
