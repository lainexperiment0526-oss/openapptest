-- Create pi_payments table to track A2U payments
-- This table will store all Pi Network payment transactions

CREATE TABLE IF NOT EXISTS public.pi_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id text NOT NULL UNIQUE, -- Pi Network payment identifier
  developer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_uid text NOT NULL, -- Pi Network user UID
  recipient_username text, -- Pi Network username
  amount numeric NOT NULL, -- Payment amount
  memo text, -- Payment description
  metadata jsonb, -- Payment metadata
  status text NOT NULL DEFAULT 'pending', -- pending, submitted, completed, cancelled
  txid text, -- Blockchain transaction ID
  network text DEFAULT 'testnet', -- testnet or mainnet
  blockchain_verified boolean DEFAULT false, -- On-chain verification status
  from_address text, -- Sender wallet address
  to_address text, -- Recipient wallet address
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone -- When payment was processed
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pi_payments_payment_id ON public.pi_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_pi_payments_developer_id ON public.pi_payments(developer_id);
CREATE INDEX IF NOT EXISTS idx_pi_payments_recipient_uid ON public.pi_payments(recipient_uid);
CREATE INDEX IF NOT EXISTS idx_pi_payments_status ON public.pi_payments(status);
CREATE INDEX IF NOT EXISTS idx_pi_payments_created_at ON public.pi_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_pi_payments_txid ON public.pi_payments(txid);

-- Add constraints for data integrity
ALTER TABLE public.pi_payments 
ADD CONSTRAINT IF NOT EXISTS check_pi_payments_status 
CHECK (status IN ('pending', 'submitted', 'completed', 'cancelled', 'failed'));

ALTER TABLE public.pi_payments 
ADD CONSTRAINT IF NOT EXISTS check_pi_payments_network 
CHECK (network IN ('testnet', 'mainnet'));

ALTER TABLE public.pi_payments 
ADD CONSTRAINT IF NOT EXISTS check_pi_payments_amount_positive 
CHECK (amount > 0);

-- Enable Row Level Security
ALTER TABLE public.pi_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for pi_payments
-- Users can view their own payments
CREATE POLICY "Users can view their own pi payments" ON public.pi_payments
FOR SELECT USING (auth.uid() = developer_id);

-- Users can create payments
CREATE POLICY "Users can create pi payments" ON public.pi_payments
FOR INSERT WITH CHECK (auth.uid() = developer_id);

-- Admins can view all payments
CREATE POLICY "Admins can view all pi payments" ON public.pi_payments
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all payments
CREATE POLICY "Admins can update all pi payments" ON public.pi_payments
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to update payment status
CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_pi_payments_updated_at ON public.pi_payments;
CREATE TRIGGER update_pi_payments_updated_at
BEFORE UPDATE ON public.pi_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_status();
