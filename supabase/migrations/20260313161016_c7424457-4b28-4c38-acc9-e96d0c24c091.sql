-- Student points table
CREATE TABLE public.student_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  teacher_id uuid NOT NULL,
  total_points integer NOT NULL DEFAULT 0,
  sessions_completed integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  last_session_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_name, teacher_id)
);

ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read student points" ON public.student_points FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert student points" ON public.student_points FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update student points" ON public.student_points FOR UPDATE TO anon USING (true);
CREATE POLICY "Teachers can view student points" ON public.student_points FOR SELECT TO authenticated USING (true);

-- Student badges table
CREATE TABLE public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  teacher_id uuid NOT NULL,
  badge_id text NOT NULL,
  badge_name text NOT NULL,
  badge_icon text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_name, teacher_id, badge_id)
);

ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read badges" ON public.student_badges FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert badges" ON public.student_badges FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Teachers can view badges" ON public.student_badges FOR SELECT TO authenticated USING (true);

-- Enable realtime for leaderboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_points;