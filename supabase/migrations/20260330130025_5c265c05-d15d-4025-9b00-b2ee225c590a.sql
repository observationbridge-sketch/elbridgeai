
-- Atomic function to activate beta subscription and increment slot counter
CREATE OR REPLACE FUNCTION public.activate_beta_subscription(p_user_id uuid, p_expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub jsonb;
  v_slots record;
BEGIN
  -- Check if already has active subscription
  IF EXISTS (SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'already_activated';
  END IF;

  -- Check slots
  SELECT slots_total, slots_used INTO v_slots FROM beta_slots WHERE id = 1 FOR UPDATE;
  IF v_slots.slots_used >= v_slots.slots_total THEN
    RAISE EXCEPTION 'beta_full';
  END IF;

  -- Insert subscription
  INSERT INTO subscriptions (user_id, plan, status, expires_at)
  VALUES (p_user_id, 'free_trial', 'active', p_expires_at);

  -- Increment slots
  UPDATE beta_slots SET slots_used = slots_used + 1 WHERE id = 1;

  SELECT jsonb_build_object('user_id', user_id, 'plan', plan, 'status', status, 'expires_at', expires_at)
  INTO v_sub FROM subscriptions WHERE user_id = p_user_id AND status = 'active';

  RETURN v_sub;
END;
$$;
