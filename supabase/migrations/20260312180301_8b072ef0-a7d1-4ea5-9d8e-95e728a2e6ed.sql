-- Tighten session_students INSERT: only allow joining active sessions
DROP POLICY "Anyone can join a session" ON public.session_students;
CREATE POLICY "Anyone can join an active session" ON public.session_students FOR INSERT TO anon, authenticated 
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sessions WHERE sessions.id = session_students.session_id AND sessions.status = 'active')
);

-- Tighten student_responses INSERT: only allow responses for valid students in valid sessions
DROP POLICY "Anyone can insert responses" ON public.student_responses;
CREATE POLICY "Students can submit responses" ON public.student_responses FOR INSERT TO anon, authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.session_students ss 
    JOIN public.sessions s ON s.id = ss.session_id 
    WHERE ss.id = student_responses.student_id 
    AND s.id = student_responses.session_id 
    AND s.status = 'active'
  )
);