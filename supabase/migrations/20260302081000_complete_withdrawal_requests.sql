-- Add payment_id column to withdrawal_requests table if it doesn't exist
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS payment_id TEXT;

-- Add indexes for better performance on withdrawal_requests
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_developer_id ON public.withdrawal_requests(developer_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON public.withdrawal_requests(created_at);

-- Add constraints to ensure valid status values
ALTER TABLE public.withdrawal_requests 
ADD CONSTRAINT IF NOT EXISTS check_withdrawal_requests_status 
CHECK (status IN ('pending', 'processing', 'submitted', 'completed', 'cancelled', 'failed'));

-- Add constraint to ensure amount is positive
ALTER TABLE public.withdrawal_requests 
ADD CONSTRAINT IF NOT EXISTS check_withdrawal_requests_amount_positive 
CHECK (amount > 0);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for withdrawal_requests table
DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at
BEFORE UPDATE ON public.withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add RLS policies for withdrawal_requests
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own withdrawal requests
CREATE POLICY IF NOT EXISTS "Users can view their own withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = developer_id);

-- Users can create their own withdrawal requests
CREATE POLICY IF NOT EXISTS "Users can create withdrawal requests" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (auth.uid() = developer_id);

-- Users can update their own withdrawal requests
CREATE POLICY IF NOT EXISTS "Users can update their own withdrawal requests" ON public.withdrawal_requests
  FOR UPDATE USING (auth.uid() = developer_id);

-- Admins can view all withdrawal requests
CREATE POLICY IF NOT EXISTS "Admins can view all withdrawal requests" ON public.withdrawal_requests
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all withdrawal requests
CREATE POLICY IF NOT EXISTS "Admins can update all withdrawal requests" ON public.withdrawal_requests
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
