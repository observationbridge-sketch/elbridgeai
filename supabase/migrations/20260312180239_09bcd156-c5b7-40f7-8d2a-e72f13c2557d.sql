-- Sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own sessions" ON public.sessions FOR SELECT TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can create sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update their own sessions" ON public.sessions FOR UPDATE TO authenticated USING (auth.uid() = teacher_id);
CREATE POLICY "Anyone can read active sessions by code" ON public.sessions FOR SELECT TO anon USING (status = 'active');

-- Session students table
CREATE TABLE public.session_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.session_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join a session" ON public.session_students FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Teachers can view students in their sessions" ON public.session_students FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sessions WHERE sessions.id = session_students.session_id AND sessions.teacher_id = auth.uid())
);
CREATE POLICY "Anon can view session students" ON public.session_students FOR SELECT TO anon USING (true);

-- Student responses table
CREATE TABLE public.student_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.session_students(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('reading', 'writing', 'speaking', 'listening')),
  question TEXT NOT NULL,
  student_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  wida_level TEXT NOT NULL DEFAULT 'Developing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert responses" ON public.student_responses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Teachers can view responses for their sessions" ON public.student_responses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.sessions WHERE sessions.id = student_responses.session_id AND sessions.teacher_id = auth.uid())
);

CREATE INDEX idx_sessions_code ON public.sessions(code);
CREATE INDEX idx_sessions_teacher ON public.sessions(teacher_id);
CREATE INDEX idx_session_students_session ON public.session_students(session_id);
CREATE INDEX idx_student_responses_session ON public.student_responses(session_id);