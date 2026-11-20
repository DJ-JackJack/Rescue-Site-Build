-- Photos people send for the Matching game, 2026-11-21.
-- Some behaviors are hard to find a free photo of, so the Send a Photo page asks visitors for theirs.
-- * match_pairs.wanted: the pairs the Send a Photo page asks for (while they have no photo). Taea ticks them on the
--   edit page ("Ask for photos of this").
-- * game_photo_wishlist(): what the page lists. Anyone can call it: the name, animal and description of each wanted
--   pair that still has no photo, even one that isn't switched on in the game yet.
-- * game_photo_submissions: photos sent through the page. Only editors can read them, and the image sits in the
--   private game-photo-inbox bucket. NOTHING here ever goes on the site by itself: there is no approve button.
--   An editor can look at a photo, download it, ask the sender a question by email, or delete it. To use one, she
--   draws her arrows on it and adds it to a pair herself, like any other photo.
--   The submit-game-photo function is the only way in: it checks everything, keeps each sender to a few a day, and
--   saves the image and the row with the server's key. Saving it sends the editors a phone alert.

alter table public.match_pairs add column if not exists wanted boolean not null default false;

create table if not exists public.game_photo_submissions (
  id uuid primary key default gen_random_uuid(),
  image_path text not null unique check (image_path ~ '^[0-9a-f-]{36}\.jpg$'), -- in the private game-photo-inbox bucket
  w int not null check (w between 1 and 4000),
  h int not null check (h between 1 and 4000),
  pair_id uuid references public.match_pairs (id) on delete set null,      -- the behavior they think it shows, if any
  pair_title text check (length(pair_title) <= 120),                       -- its name when they sent it
  note text check (length(note) <= 1000),                                  -- what's happening in the photo
  credit text check (length(credit) <= 80),                                -- a first name, to thank them
  email text not null check (length(email) <= 200),                        -- only for questions about the photo
  created_at timestamptz not null default now(),
  notified_at timestamptz                                                  -- when the editors' phones were told
);

alter table public.game_photo_submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_photo_submissions' and policyname = 'game_photo_submissions_admin') then
    create policy game_photo_submissions_admin on public.game_photo_submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
revoke all on public.game_photo_submissions from anon, authenticated;
grant select, delete on public.game_photo_submissions to authenticated;
-- (No history is kept: a deleted photo and its sender's email are gone for good, as the Privacy page says.)

-- The photos people send. Private: only editors can look at them or delete them, and only the submit-game-photo
-- function, with the server's key, can add one. Each is a JPEG the sender's browser has already redrawn.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-photo-inbox', 'game-photo-inbox', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'game_photo_inbox_admin_select') then
    create policy game_photo_inbox_admin_select on storage.objects for select to authenticated using (bucket_id = 'game-photo-inbox' and public.is_admin());
    create policy game_photo_inbox_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'game-photo-inbox' and public.is_admin());
  end if;
end $$;

-- What the Send a Photo page asks for.
create or replace function public.game_photo_wishlist()
returns table (id uuid, title text, species text, tile text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.species, p.tile from public.match_pairs p
  where p.wanted and p.photo_url is null
  order by p.level, p.sort, p.title;
$$;
revoke execute on function public.game_photo_wishlist() from public;
grant execute on function public.game_photo_wishlist() to anon, authenticated;

-- Whether there's room for another photo from this email: 5 a day each, and 30 an hour from everyone together.
create or replace function public.game_photo_room(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.game_photo_submissions where lower(email) = lower(trim(p_email)) and created_at > now() - interval '1 day') < 5
     and (select count(*) from public.game_photo_submissions where created_at > now() - interval '1 hour') < 30;
$$;

-- Saves a photo (submit-game-photo calls this after storing the image). Checks everything again, and the room.
-- p_pair: a pair the page asks for, or null for "something else".
create or replace function public.game_photo_add(p_image_path text, p_w int, p_h int, p_email text,
                                                 p_pair uuid default null, p_note text default null, p_credit text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_title text;
begin
  if p_email is null or trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'bad email'; end if;
  if length(coalesce(p_note, '')) > 1000 or length(coalesce(p_credit, '')) > 80 then raise exception 'bad fields'; end if;
  if p_pair is not null then
    select title into v_title from public.match_pairs where id = p_pair and wanted;
    if v_title is null then raise exception 'bad pair'; end if;
  end if;
  if not public.game_photo_room(p_email) then raise exception 'slow down'; end if;
  insert into public.game_photo_submissions (image_path, w, h, pair_id, pair_title, note, credit, email)
  values (p_image_path, p_w, p_h, p_pair, v_title, nullif(trim(p_note), ''), nullif(trim(p_credit), ''), trim(p_email))
  returning id into v_id;
  return v_id;
end $$;

-- Marks the photos that haven't been announced yet as announced, and returns them (what they're for only), with how
-- many are waiting for a look. notify-message calls it, so each one is announced once.
create or replace function public.game_photo_claim() returns jsonb
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.game_photo_submissions set notified_at = now()
    where notified_at is null and created_at > now() - interval '1 day'
    returning pair_title, created_at)
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('pair', left(coalesce(pair_title, ''), 120)) order by created_at) from claimed), '[]'::jsonb),
    'waiting', (select count(*) from public.game_photo_submissions));
$$;

revoke execute on function public.game_photo_room(text) from public, anon, authenticated;
revoke execute on function public.game_photo_add(text, int, int, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.game_photo_claim() from public, anon, authenticated;
grant execute on function public.game_photo_room(text) to service_role;
grant execute on function public.game_photo_add(text, int, int, text, uuid, text, text) to service_role;
grant execute on function public.game_photo_claim() to service_role;

-- A new photo: ask notify-message to tell the editors' phones (it checks game_photo_claim itself).
create or replace function public.game_photo_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform net.http_post(
      url := 'https://yysfgsdwlddeilktumza.supabase.co/functions/v1/notify-message',
      body := '{"action": "gamephoto"}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'game_photo_notify: %', sqlerrm; -- an alert problem must never stop a photo from saving
  end;
  return null;
end $$;
revoke execute on function public.game_photo_notify() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'game_photo_notify') then
    create trigger game_photo_notify after insert on public.game_photo_submissions for each statement execute function public.game_photo_notify();
  end if;
end $$;
