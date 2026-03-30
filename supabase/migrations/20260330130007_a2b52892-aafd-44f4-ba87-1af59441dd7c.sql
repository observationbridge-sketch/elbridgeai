
-- Add unique constraint on user_id to prevent duplicate subscriptions
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
