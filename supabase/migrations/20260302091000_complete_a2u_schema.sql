-- Complete A2U schema and fix loading issues
-- Add missing columns and constraints for proper A2U functionality

-- Ensure payment_id column exists and is properly indexed
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.pi_payments(id);

-- Add recipient_username column for better tracking
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS recipient_username text;

-- Add network column to track testnet vs mainnet
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS network text DEFAULT 'testnet';

-- Add blockchain_verified column to track on-chain verification
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS blockchain_verified boolean DEFAULT false;

-- Add error_message column for debugging failed transactions
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS error_message text;

-- Create proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_payment_id ON public.withdrawal_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_recipient_username ON public.withdrawal_requests(recipient_username);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_network ON public.withdrawal_requests(network);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_blockchain_verified ON public.withdrawal_requests(blockchain_verified);

-- Add constraints for data integrity
ALTER TABLE public.withdrawal_requests 
ADD CONSTRAINT IF NOT EXISTS check_withdrawal_network 
CHECK (network IN ('testnet', 'mainnet'));

-- Update existing records to have proper defaults
UPDATE public.withdrawal_requests 
SET 
  network = 'testnet',
  blockchain_verified = false
WHERE network IS NULL;

-- Create function to mark transactions as blockchain verified
CREATE OR REPLACE FUNCTION public.mark_blockchain_verified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.blockchain_verified = true;
  NEW.processed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically verify completed transactions
DROP TRIGGER IF EXISTS verify_withdrawal_blockchain ON public.withdrawal_requests;
CREATE TRIGGER verify_withdrawal_blockchain
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION public.mark_blockchain_verified();

-- Update RLS policies to include new columns
DROP POLICY IF EXISTS "Users can view their own withdrawal requests";
CREATE POLICY "Users can view their own withdrawal requests" ON public.withdrawal_requests
FOR SELECT USING (auth.uid() = developer_id);

-- Enable row level security
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
