
-- Table to track tier changes over sessions
CREATE TABLE public.student_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  teacher_id uuid NOT NULL,
  session_id uuid REFERENCES public.sessions(id),
  tier integer NOT NULL DEFAULT 1,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.student_tier_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert tier history" ON public.student_tier_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can read tier history" ON public.student_tier_history FOR SELECT TO anon USING (true);
CREATE POLICY "Teachers can view tier history" ON public.student_tier_history FOR SELECT TO authenticated USING (true);

-- Add consecutive_tier_drops to student_points
ALTER TABLE public.student_points ADD COLUMN IF NOT EXISTS consecutive_tier_drops integer NOT NULL DEFAULT 0;
