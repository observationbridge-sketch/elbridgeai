CREATE POLICY "Authenticated can insert badges"
ON public.student_badges
FOR INSERT
TO authenticated
WITH CHECK (true);