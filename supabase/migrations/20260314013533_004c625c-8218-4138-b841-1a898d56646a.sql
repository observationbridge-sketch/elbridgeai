
CREATE POLICY "Students can update their own theme"
ON public.session_students
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
