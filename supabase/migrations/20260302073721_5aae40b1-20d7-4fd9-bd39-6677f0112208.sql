
CREATE TABLE public.a2u_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id UUID NOT NULL,
  recipient_pi_uid TEXT NOT NULL,
  recipient_username TEXT,
  amount NUMERIC NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  payment_id TEXT,
  txid TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.a2u_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own a2u payments" ON public.a2u_payments
  FOR SELECT USING (auth.uid() = sender_user_id);

CREATE POLICY "Users can create a2u payments" ON public.a2u_payments
  FOR INSERT WITH CHECK (auth.uid() = sender_user_id);

CREATE POLICY "Users can update their own a2u payments" ON public.a2u_payments
  FOR UPDATE USING (auth.uid() = sender_user_id);

CREATE POLICY "Admins can view all a2u payments" ON public.a2u_payments
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
