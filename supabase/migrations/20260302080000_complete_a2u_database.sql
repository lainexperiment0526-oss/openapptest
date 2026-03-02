-- Add indexes for better performance on A2U payments
CREATE INDEX IF NOT EXISTS idx_a2u_payments_sender_user_id ON public.a2u_payments(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_a2u_payments_recipient_pi_uid ON public.a2u_payments(recipient_pi_uid);
CREATE INDEX IF NOT EXISTS idx_a2u_payments_status ON public.a2u_payments(status);
CREATE INDEX IF NOT EXISTS idx_a2u_payments_created_at ON public.a2u_payments(created_at);

-- Add constraint to ensure amount is positive
ALTER TABLE public.a2u_payments 
ADD CONSTRAINT check_a2u_payments_amount_positive 
CHECK (amount > 0);

-- Add constraint to ensure status is valid
ALTER TABLE public.a2u_payments 
ADD CONSTRAINT check_a2u_payments_status 
CHECK (status IN ('pending', 'created', 'submitted', 'completed', 'cancelled', 'failed'));

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for a2u_payments table
DROP TRIGGER IF EXISTS a2u_payments_updated_at ON public.a2u_payments;
CREATE TRIGGER a2u_payments_updated_at
BEFORE UPDATE ON public.a2u_payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
