
create table if not exists public.content_bank (
  id            uuid primary key default gen_random_uuid(),
  grade         text not null,
  theme         text not null,
  topic         text not null,
  anchor        jsonb not null,
  part2_activities jsonb not null,
  part3_challenge  jsonb,
  used_count    integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists content_bank_grade_theme
  on public.content_bank (grade, theme);

create index if not exists content_bank_used
  on public.content_bank (used_count asc, last_used_at asc nulls first);

alter table public.content_bank enable row level security;

create policy "Anyone can read content bank"
  on public.content_bank for select
  using (true);

create policy "Service role can insert"
  on public.content_bank for insert
  with check (true);

create or replace function get_cached_session(
  p_grade text,
  p_theme text
)
returns setof public.content_bank
language sql
stable
as $$
  (
    select * from public.content_bank
    where grade = p_grade
      and theme = p_theme
    order by used_count asc, last_used_at asc nulls first
    limit 1
  )
  union all
  (
    select * from public.content_bank
    where grade = p_grade
      and not exists (
        select 1 from public.content_bank
        where grade = p_grade and theme = p_theme
      )
    order by random()
    limit 1
  )
  limit 1;
$$;

create or replace function mark_session_used(p_id uuid)
returns void
language sql
as $$
  update public.content_bank
  set used_count   = used_count + 1,
      last_used_at = now()
  where id = p_id;
$$;
