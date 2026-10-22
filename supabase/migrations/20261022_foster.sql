-- From Taea's list of 2026-10-22: a Foster page, with the foster programs at the shelters and rescues the site covers.
-- Like the day-out programs, these are publicly advertised programs, so no shelter OK is needed to list them.
create table if not exists public.foster_programs (
  id uuid primary key default gen_random_uuid(),
  shelter_name text not null check (length(shelter_name) between 1 and 150),
  program_name text check (length(program_name) <= 120),
  city text check (length(city) <= 60),
  facts text[] not null default '{}',             -- quick facts, one per line, like "Food and vet care provided"
  tags text[] not null default '{}' check (tags <@ array['free','dogs','cats','kittens','puppies','medical','short','sleepover','adopt']::text[]),
  signup_url text check (signup_url is null or signup_url ~ '^https?://'),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  checked_on date,
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.foster_programs enable row level security;
create policy foster_public on public.foster_programs for select to anon, authenticated using (published);
create policy foster_admin on public.foster_programs for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.foster_programs from anon, authenticated;
grant select on public.foster_programs to anon;
grant select, insert, update, delete on public.foster_programs to authenticated;
create trigger foster_touch before update on public.foster_programs for each row execute function public.touch_updated_at();
create trigger foster_history after update or delete on public.foster_programs for each row execute function public.keep_history();
