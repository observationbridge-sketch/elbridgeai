CREATE POLICY "Authenticated can insert content history"
ON public.student_content_history
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can insert points"
ON public.student_points
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update points"
ON public.student_points
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);