
ALTER TABLE public.session_students ADD COLUMN theme text DEFAULT NULL;

ALTER TABLE public.sessions ADD COLUMN theme_options text[] DEFAULT ARRAY['Nature & animals', 'Superheroes', 'Fantasy & myths']::text[];
