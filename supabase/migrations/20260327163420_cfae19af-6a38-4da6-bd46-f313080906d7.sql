
-- beta_slots: single-row control table
CREATE TABLE public.beta_slots (
  id int DEFAULT 1 PRIMARY KEY CHECK (id = 1),
  slots_total int NOT NULL DEFAULT 25,
  slots_used int NOT NULL DEFAULT 0
);

ALTER TABLE public.beta_slots ENABLE ROW LEVEL SECURITY;

-- Public read for landing page counter
CREATE POLICY "Public can read beta slots"
  ON public.beta_slots FOR SELECT
  TO public
  USING (true);

-- Insert the single control row
INSERT INTO public.beta_slots (id, slots_total, slots_used) VALUES (1, 25, 0);

-- waitlist table
CREATE TABLE public.waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Public insert (anyone can join)
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist FOR INSERT
  TO public
  WITH CHECK (true);
