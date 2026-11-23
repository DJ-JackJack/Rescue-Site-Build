-- The scenario game and "Checked by" credits, 2026-11-23.
--
-- * game_scenarios: What Would You Do?, the scenario game on the Alliance page for ages 8 to 12, in Matching's spot
--   while Matching waits for photos. A situation in words (pets, wildlife you find, basic first aid, staying aware),
--   the question, the answers to pick from, and why the right one is right. Taea writes them on the edit page; the
--   game shows on the site once 3 are switched on. Like the other game tables, nothing about the children who play is
--   stored: progress stays in the browser of the device they play on.
-- * checked_by: the people or businesses who checked part of the Alliance for Taea, like a trainer who reviewed a
--   game. Each one names what they checked (one of the games, or the whole Alliance page), and shows with it as
--   "Checked by …", with a link to them if there is one. Added only once they've agreed to be named.

create table if not exists public.game_scenarios (
  id uuid primary key default gen_random_uuid(),
  level int not null default 1 check (level between 1 and 3),
  topic text not null default 'pets' check (topic in ('pets','wildlife','firstaid','aware')),
  scenario text not null check (length(scenario) between 1 and 800),
  question text check (length(question) <= 300),   -- empty: "What would you do?"
  choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 5),
  answer int not null default 1 check (answer between 1 and 5),
  hint text check (length(hint) <= 400),     -- shown after a wrong answer, before the second try
  why text check (length(why) <= 600),       -- shown with the answer, right or not
  reward text check (length(reward) <= 400), -- the well-done line, in Taea's words
  published boolean not null default false,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checked_by (
  id uuid primary key default gen_random_uuid(),
  place text not null check (place in ('sc','gog','bs','quiz','match','aga')),
  name text not null check (length(name) between 1 and 120),
  link_url text check (link_url is null or (length(link_url) <= 500 and link_url ~ '^https://')),
  note text check (length(note) <= 200),     -- what they checked, if it helps to say, like "The dog safety scenarios"
  published boolean not null default false,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['game_scenarios','checked_by'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_public') then
      execute format('create policy %I on public.%I for select to anon, authenticated using (published)', t || '_public', t);
      execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
      -- like everything else with "Show on the site": nothing shows before its go-live time, except to editors
      execute format('create policy %I on public.%I as restrictive for select to anon using (publish_at is null or publish_at <= now())', t || '_on_time', t);
      execute format('create policy %I on public.%I as restrictive for select to authenticated using (publish_at is null or publish_at <= now() or public.is_admin())', t || '_on_time_signed_in', t);
    end if;
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
      execute format('create trigger %I after update or delete on public.%I for each row execute function public.keep_history()', t || '_history', t);
    end if;
  end loop;
end $$;
