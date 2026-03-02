import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Eye, CheckCircle, XCircle, Clock, AlertCircle, Search, Filter, RefreshCw, Wallet, User, Calendar } from 'lucide-react';

interface WithdrawalRequest {
  id: string;
  developer_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'submitted' | 'completed' | 'cancelled' | 'failed';
  pi_wallet_address: string | null;
  txid: string | null;
  payment_id: string | null;
  created_at: string;
  processed_at: string | null;
  updated_at: string;
  memo?: string;
  developer?: {
    email: string;
    raw_user_meta_data: {
      pi_username?: string;
    };
  };
}

interface WithdrawalWithDeveloper extends Omit<WithdrawalRequest, 'developer'> {
  developer: {
    email: string;
    raw_user_meta_data: {
      pi_username?: string;
    };
  };
}

export default function AdminWithdrawals() {
  const { user, isAdmin, loading } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isAdmin) loadWithdrawals();
  }, [isAdmin]);

  const loadWithdrawals = async () => {
    if (!isAdmin) return;
    setLoadingWithdrawals(true);
    try {
      // First get withdrawal requests
      const { data: withdrawals, error: withdrawalError } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (withdrawalError) throw withdrawalError;

      // Then get developer info for each withdrawal
      const withdrawalsWithDevelopers = await Promise.all(
        (withdrawals || []).map(async (withdrawal) => {
          const { data: developer } = await supabase.auth.admin.getUserById(withdrawal.developer_id);
          
          return {
            ...withdrawal,
            developer: {
              email: developer?.user?.email || 'Unknown',
              raw_user_meta_data: developer?.user?.user_metadata || {}
            }
          } as WithdrawalRequest;
        })
      );

      setWithdrawals(withdrawalsWithDevelopers);
    } catch (err) {
      console.error('Failed to load withdrawal requests:', err);
      toast.error('Failed to load withdrawal requests');
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const handleApprove = async (withdrawal: WithdrawalRequest) => {
    setProcessing(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Process withdrawal using A2U payment system
      const response = await fetch(`${baseUrl}/functions/v1/a2u-withdrawal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process_withdrawal',
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          recipientAddress: withdrawal.pi_wallet_address,
          memo: withdrawal.memo || `Withdrawal for ${withdrawal.developer?.raw_user_meta_data?.pi_username || withdrawal.developer?.email}`,
          developerId: withdrawal.developer_id,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to process withdrawal');
      }

      toast.success('Withdrawal approved and processed successfully!');
      loadWithdrawals();
    } catch (err: any) {
      console.error('Failed to approve withdrawal:', err);
      toast.error(err.message || 'Failed to approve withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (withdrawal: WithdrawalRequest, reason: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('withdrawal_requests')
        .update({ 
          status: 'cancelled',
          processed_at: new Date().toISOString()
        })
        .eq('id', withdrawal.id);

      if (error) throw error;

      toast.success('Withdrawal rejected successfully!');
      loadWithdrawals();
      setSelectedWithdrawal(null);
    } catch (err: any) {
      console.error('Failed to reject withdrawal:', err);
      toast.error(err.message || 'Failed to reject withdrawal');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'processing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'submitted': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'processing': return <RefreshCw className="h-4 w-4 animate-spin" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredWithdrawals = withdrawals.filter(withdrawal => {
    const matchesSearch = searchTerm === '' || 
      withdrawal.developer?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      withdrawal.developer?.raw_user_meta_data?.pi_username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      withdrawal.pi_wallet_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      withdrawal.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || withdrawal.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!loading && !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-6">You need admin privileges to access this page.</p>
          <Link to="/"><Button>Go Home</Button></Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Admin Withdrawal Management
          </h1>
          <Button onClick={loadWithdrawals} disabled={loadingWithdrawals} variant="outline">
            <RefreshCw className={`h-4 w-4 ${loadingWithdrawals ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <Label className="text-sm">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email, username, wallet address, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <Label className="text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal List */}
        {loadingWithdrawals ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading withdrawal requests...</p>
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No withdrawal requests found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'No withdrawal requests have been submitted yet'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredWithdrawals.map((withdrawal) => (
              <Card key={withdrawal.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-lg">
                          {Number(withdrawal.amount).toFixed(2)} Pi
                        </span>
                        <Badge className={getStatusColor(withdrawal.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(withdrawal.status)}
                            {withdrawal.status}
                          </span>
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Developer:</span>
                            <span>{withdrawal.developer?.email}</span>
                            {withdrawal.developer?.raw_user_meta_data?.pi_username && (
                              <Badge variant="outline">
                                @{withdrawal.developer.raw_user_meta_data.pi_username}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Wallet:</span>
                            <span className="font-mono text-xs">
                              {withdrawal.pi_wallet_address?.slice(0, 16)}...
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Created:</span>
                            <span>{new Date(withdrawal.created_at).toLocaleString()}</span>
                          </div>
                          {withdrawal.processed_at && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Processed:</span>
                              <span>{new Date(withdrawal.processed_at).toLocaleString()}</span>
                            </div>
                          )}
                          {withdrawal.txid && (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">TXID:</span>
                              <span className="font-mono text-xs">
                                {withdrawal.txid.slice(0, 16)}...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {withdrawal.memo && (
                        <div className="mt-3 p-2 bg-secondary rounded">
                          <p className="text-sm"><span className="font-medium">Memo:</span> {withdrawal.memo}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Withdrawal Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <Label className="text-muted-foreground">Amount</Label>
                                <p className="font-semibold">{Number(withdrawal.amount).toFixed(2)} Pi</p>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Status</Label>
                                <Badge className={getStatusColor(withdrawal.status)}>
                                  {withdrawal.status}
                                </Badge>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Developer Email</Label>
                                <p>{withdrawal.developer?.email}</p>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Pi Username</Label>
                                <p>{withdrawal.developer?.raw_user_meta_data?.pi_username || 'N/A'}</p>
                              </div>
                              <div className="col-span-2">
                                <Label className="text-muted-foreground">Wallet Address</Label>
                                <p className="font-mono text-xs">{withdrawal.pi_wallet_address}</p>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Created</Label>
                                <p>{new Date(withdrawal.created_at).toLocaleString()}</p>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Processed</Label>
                                <p>{withdrawal.processed_at ? new Date(withdrawal.processed_at).toLocaleString() : 'Not processed'}</p>
                              </div>
                              {withdrawal.txid && (
                                <div className="col-span-2">
                                  <Label className="text-muted-foreground">Transaction ID</Label>
                                  <p className="font-mono text-xs">{withdrawal.txid}</p>
                                </div>
                              )}
                              {withdrawal.payment_id && (
                                <div className="col-span-2">
                                  <Label className="text-muted-foreground">Payment ID</Label>
                                  <p className="font-mono text-xs">{withdrawal.payment_id}</p>
                                </div>
                              )}
                            </div>
                            {withdrawal.memo && (
                              <div>
                                <Label className="text-muted-foreground">Memo</Label>
                                <p>{withdrawal.memo}</p>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      {withdrawal.status === 'pending' && (
                        <>
                          <Button 
                            onClick={() => handleApprove(withdrawal)} 
                            disabled={processing}
                            size="sm"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <RejectDialog 
                            withdrawal={withdrawal}
                            onReject={handleReject}
                            processing={processing}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RejectDialog({ 
  withdrawal, 
  onReject, 
  processing 
}: { 
  withdrawal: WithdrawalRequest; 
  onReject: (w: WithdrawalRequest, reason: string) => void; 
  processing: boolean; 
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  const handleReject = () => {
    if (!reason.trim()) {
      return;
    }
    onReject(withdrawal, reason);
    setOpen(false);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <XCircle className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Withdrawal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reason for rejection</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a reason for rejecting this withdrawal..."
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={processing || !reason.trim()}
            >
              Reject Withdrawal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
