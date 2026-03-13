ALTER TABLE public.student_responses 
ADD COLUMN session_part text NOT NULL DEFAULT 'part2',
ADD COLUMN strategy text;