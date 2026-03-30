
-- Replace the blanket unique constraint with a partial unique index on active subs only
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_user_id_unique;
CREATE UNIQUE INDEX subscriptions_user_id_active_unique ON subscriptions (user_id) WHERE status = 'active';
