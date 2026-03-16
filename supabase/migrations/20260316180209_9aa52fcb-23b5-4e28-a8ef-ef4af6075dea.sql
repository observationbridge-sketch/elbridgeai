-- Add per-session performance columns to student_points
ALTER TABLE public.student_points
ADD COLUMN last_session_score integer DEFAULT 0,
ADD COLUMN last_session_total integer DEFAULT 0,
ADD COLUMN last_domain_scores jsonb DEFAULT '{}'::jsonb,
ADD COLUMN last_grade_band text DEFAULT '3-5';
