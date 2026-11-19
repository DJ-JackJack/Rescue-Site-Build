-- The Animal Guardian Alliance games, 2026-11-18: Go on Green, Baby Steps, Matching and the level quizzes, played on
-- the Alliance page. Everything a game shows is here, so Taea adds and changes it on the edit page without a rebuild.
-- Nothing about the children who play is stored here or anywhere on the server: scores and progress stay in the
-- browser of the device they play on (site/assets/games.js), as the Privacy page says.
--
-- * game_situations: Go on Green. A situation in words, the animal it's about, the right light, why it's right, and
--   what the game says when each of the three lights is tapped (praise for the right one, a gentle nudge otherwise).
-- * game_questions: the question bank, easy to hard (level 1 to 3). The level quizzes use it, and so does any game
--   that needs a question to go on (the bones in Go on Green and Baby Steps). choices is a list of answers; answer is
--   the right one, counting from 1.
-- * match_pairs: Matching. One photo shown on two cards, what to notice in it, and the question asked on a match.
-- * game_art: Taea's pictures for the games (a dog, a cat, a bunny, a bone, a food bowl). With none, the games use
--   simple emoji pictures instead.

create table if not exists public.game_situations (
  id uuid primary key default gen_random_uuid(),
  level int not null default 1 check (level between 1 and 3),
  species text not null default 'dog' check (species in ('dog','cat','bunny')),
  situation text not null check (length(situation) between 1 and 300),
  light text not null check (light in ('green','yellow','red')),
  why text check (length(why) <= 400),
  green_line text check (length(green_line) <= 300),
  yellow_line text check (length(yellow_line) <= 300),
  red_line text check (length(red_line) <= 300),
  published boolean not null default false,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_questions (
  id uuid primary key default gen_random_uuid(),
  level int not null default 1 check (level between 1 and 3),
  kind text not null default 'mc' check (kind in ('tf','mc','scenario')),
  question text not null check (length(question) between 1 and 500),
  choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 5),
  answer int not null default 1 check (answer between 1 and 5),
  hint text check (length(hint) <= 400),     -- shown after a wrong answer, before the second try
  why text check (length(why) <= 500),       -- shown with the right answer
  reward text check (length(reward) <= 400), -- the well-done line, in Taea's words
  published boolean not null default false,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_pairs (
  id uuid primary key default gen_random_uuid(),
  level int not null default 1 check (level between 1 and 3),
  title text not null check (length(title) between 1 and 120),
  species text check (length(species) <= 40),
  tile text check (length(tile) <= 400),     -- what the photo shows; read out for people who can't see it
  cue text check (length(cue) <= 300),       -- what to notice, the body-language cue the arrow points to
  question text check (length(question) <= 400),
  choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) <= 5),
  answer int not null default 1 check (answer between 1 and 5),
  reward text check (length(reward) <= 500),
  photo_url text check (length(photo_url) <= 500),
  photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object'),
  published boolean not null default false,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_art (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dog','cat','bunny','bone','bowl')),
  photo_url text not null check (length(photo_url) <= 500),
  photo_alt text check (length(photo_alt) <= 300),
  published boolean not null default true,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['game_situations','game_questions','match_pairs','game_art'] loop
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
