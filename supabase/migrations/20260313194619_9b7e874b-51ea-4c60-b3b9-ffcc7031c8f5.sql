
CREATE TABLE public.student_content_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  teacher_id uuid NOT NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  theme text NOT NULL,
  topic text NOT NULL,
  key_vocabulary text[] NOT NULL DEFAULT '{}',
  vocabulary_results jsonb NOT NULL DEFAULT '[]',
  activity_formats text[] NOT NULL DEFAULT '{}',
  challenge_type text,
  grade_band text NOT NULL DEFAULT '3-5',
  is_baseline boolean NOT NULL DEFAULT false,
  session_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.student_content_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert content history"
ON public.student_content_history FOR INSERT
TO anon WITH CHECK (true);

CREATE POLICY "Anon can read content history"
ON public.student_content_history FOR SELECT
TO anon USING (true);

CREATE POLICY "Teachers can view content history"
ON public.student_content_history FOR SELECT
TO authenticated USING (true);

CREATE INDEX idx_student_content_history_student ON public.student_content_history(student_name, teacher_id);
CREATE INDEX idx_student_content_history_date ON public.student_content_history(session_date DESC);
