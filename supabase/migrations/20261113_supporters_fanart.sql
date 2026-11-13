-- Supporters and fan art, 2026-11-13.
-- * supporters: Patreon supporters who'd like their name on the Supporters page. Taea adds them on the edit page,
--   only once they've said yes; nothing comes from Patreon on its own.
-- * fanart: the art on the Fan Art page, each piece credited the way its artist asked. Only approved art is here.
-- * fanart_submissions: art sent through the Fan Art page's form, waiting for Taea to look at it. Only editors can
--   read it, and the image sits in the private fanart-inbox bucket. Approving copies the art to the public photos and
--   adds it to fanart; approving or declining then deletes the submission, its image and the sender's email.
--   The submit-fanart function is the only way in: it checks everything, keeps each sender to a few a day, and saves
--   the image and the row with the server's key. Saving it sends the editors a phone alert, like a new message.

create table if not exists public.supporters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),   -- exactly as they'd like to be shown
  tier text check (length(tier) <= 40),                       -- their Patreon tier, if they'd like it shown
  published boolean not null default true,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fanart (
  id uuid primary key default gen_random_uuid(),
  title text check (length(title) <= 120),
  credit text not null check (length(credit) between 1 and 80),            -- the artist, as they asked to be credited
  credit_url text check (length(credit_url) <= 500 and credit_url ~ '^https://'), -- where to find more of their art
  photo_url text not null check (length(photo_url) <= 500),
  photo_alt text check (length(photo_alt) <= 300),                         -- what's in it, for people who can't see it
  w int check (w > 0), h int check (h > 0),                                -- its size, when it's known
  published boolean not null default true,
  publish_at timestamptz,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fanart_submissions (
  id uuid primary key default gen_random_uuid(),
  image_path text not null unique check (image_path ~ '^[0-9a-f-]{36}\.jpg$'), -- in the private fanart-inbox bucket
  w int not null check (w between 1 and 4000),
  h int not null check (h between 1 and 4000),
  title text check (length(title) <= 120),
  credit text not null check (length(credit) between 1 and 80),
  credit_url text check (length(credit_url) <= 500 and credit_url ~ '^https://'),
  note text check (length(note) <= 1000),                                  -- anything they'd like to tell Taea
  email text not null check (length(email) <= 200),                        -- only for questions about the art
  created_at timestamptz not null default now(),
  notified_at timestamptz                                                  -- when the editors' phones were told
);

alter table public.supporters enable row level security;
alter table public.fanart enable row level security;
alter table public.fanart_submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'supporters' and policyname = 'supporters_public') then
    create policy supporters_public on public.supporters for select to anon, authenticated using (published);
    create policy supporters_admin on public.supporters for all to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy fanart_public on public.fanart for select to anon, authenticated using (published);
    create policy fanart_admin on public.fanart for all to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy fanart_submissions_admin on public.fanart_submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
    -- like everything else with "Show on the site": nothing shows before its go-live time, except to editors
    create policy supporters_on_time on public.supporters as restrictive for select to anon using (publish_at is null or publish_at <= now());
    create policy supporters_on_time_signed_in on public.supporters as restrictive for select to authenticated using (publish_at is null or publish_at <= now() or public.is_admin());
    create policy fanart_on_time on public.fanart as restrictive for select to anon using (publish_at is null or publish_at <= now());
    create policy fanart_on_time_signed_in on public.fanart as restrictive for select to authenticated using (publish_at is null or publish_at <= now() or public.is_admin());
  end if;
end $$;
revoke all on public.supporters, public.fanart, public.fanart_submissions from anon, authenticated;
grant select on public.supporters, public.fanart to anon;
grant select, insert, update, delete on public.supporters, public.fanart to authenticated;
grant select, delete on public.fanart_submissions to authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'supporters_touch') then
    create trigger supporters_touch before update on public.supporters for each row execute function public.touch_updated_at();
    create trigger supporters_history after update or delete on public.supporters for each row execute function public.keep_history();
    create trigger fanart_touch before update on public.fanart for each row execute function public.touch_updated_at();
    create trigger fanart_history after update or delete on public.fanart for each row execute function public.keep_history();
  end if;
end $$;
-- (fanart_submissions keeps no history: declined art and senders' emails are gone for good, as the Privacy page says.)

-- The images people send. Private: only editors can look at them (to approve or decline) or delete them, and only the
-- submit-fanart function, with the server's key, can add one. Each is a JPEG the sender's browser has already redrawn.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fanart-inbox', 'fanart-inbox', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fanart_inbox_admin_select') then
    create policy fanart_inbox_admin_select on storage.objects for select to authenticated using (bucket_id = 'fanart-inbox' and public.is_admin());
    create policy fanart_inbox_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'fanart-inbox' and public.is_admin());
  end if;
end $$;

-- Whether there's room for another submission from this email: 5 a day each, and 30 an hour from everyone together.
create or replace function public.fanart_room(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.fanart_submissions where lower(email) = lower(trim(p_email)) and created_at > now() - interval '1 day') < 5
     and (select count(*) from public.fanart_submissions where created_at > now() - interval '1 hour') < 30;
$$;

-- Saves a submission (submit-fanart calls this after storing the image). Checks everything again, and the room.
create or replace function public.fanart_add(p_image_path text, p_w int, p_h int, p_credit text, p_email text,
                                             p_title text default null, p_credit_url text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_email is null or trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'bad email'; end if;
  if length(trim(coalesce(p_credit, ''))) not between 1 and 80 then raise exception 'bad credit'; end if;
  if not public.fanart_room(p_email) then raise exception 'slow down'; end if;
  insert into public.fanart_submissions (image_path, w, h, title, credit, credit_url, note, email)
  values (p_image_path, p_w, p_h, nullif(trim(p_title), ''), trim(p_credit), nullif(trim(p_credit_url), ''), nullif(trim(p_note), ''), trim(p_email))
  returning id into v_id;
  return v_id;
end $$;

-- Marks the submissions that haven't been announced yet as announced, and returns them (the credit only), with how
-- many are waiting for a look. notify-message calls it, so each one is announced once.
create or replace function public.fanart_claim() returns jsonb
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.fanart_submissions set notified_at = now()
    where notified_at is null and created_at > now() - interval '1 day'
    returning credit, created_at)
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('credit', left(credit, 80)) order by created_at) from claimed), '[]'::jsonb),
    'waiting', (select count(*) from public.fanart_submissions));
$$;

revoke execute on function public.fanart_room(text) from public, anon, authenticated;
revoke execute on function public.fanart_add(text, int, int, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fanart_claim() from public, anon, authenticated;
grant execute on function public.fanart_room(text) to service_role;
grant execute on function public.fanart_add(text, int, int, text, text, text, text, text) to service_role;
grant execute on function public.fanart_claim() to service_role;

-- New art: ask notify-message to tell the editors' phones (it checks fanart_claim itself, so this call carries nothing).
create or replace function public.fanart_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform net.http_post(
      url := 'https://yysfgsdwlddeilktumza.supabase.co/functions/v1/notify-message',
      body := '{"action": "fanart"}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'fanart_notify: %', sqlerrm; -- an alert problem must never stop art from saving
  end;
  return null;
end $$;
revoke execute on function public.fanart_notify() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'fanart_notify') then
    create trigger fanart_notify after insert on public.fanart_submissions for each statement execute function public.fanart_notify();
  end if;
end $$;
