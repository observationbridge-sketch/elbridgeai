-- Fix slots_used for existing signup (mrsalgado21@yahoo.com)
UPDATE public.beta_slots SET slots_used = 1 WHERE id = 1;

-- Create subscription for the existing user if they don't have one
INSERT INTO public.subscriptions (user_id, plan, status, expires_at)
SELECT u.id, 'free_trial', 'active', now() + interval '90 days'
FROM auth.users u
WHERE u.email = 'mrsalgado21@yahoo.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id AND s.status = 'active'
  );