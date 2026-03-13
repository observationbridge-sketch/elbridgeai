
ALTER TABLE public.sessions ADD COLUMN grade_band text NOT NULL DEFAULT '3-5';
ALTER TABLE public.student_responses ADD COLUMN grade_band text NOT NULL DEFAULT '3-5';
