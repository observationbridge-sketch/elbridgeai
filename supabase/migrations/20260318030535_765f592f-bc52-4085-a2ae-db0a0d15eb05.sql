ALTER TABLE public.student_responses
  ADD COLUMN speaking_duration_seconds numeric NULL,
  ADD COLUMN speaking_full_attempt boolean NULL;