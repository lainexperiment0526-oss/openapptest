-- Add memo column to withdrawal_requests table
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS memo text;

-- Add index for memo column for better query performance
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_memo ON public.withdrawal_requests(memo);

-- Update existing withdrawal_requests to have default memo if null
UPDATE public.withdrawal_requests 
SET memo = 'Withdrawal' 
WHERE memo IS NULL;
