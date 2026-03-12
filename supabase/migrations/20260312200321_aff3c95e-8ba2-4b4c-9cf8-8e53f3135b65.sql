
CREATE TABLE public.teacher_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL UNIQUE,
  weekly_email_opt_out boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own preferences"
  ON public.teacher_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert their own preferences"
  ON public.teacher_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their own preferences"
  ON public.teacher_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
