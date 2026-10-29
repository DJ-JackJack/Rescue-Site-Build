-- Twin Squawk and scheduling, 2026-10-29.
-- * articles: the posts on Twin Squawk, the site's news page.
-- * Anything with "Show on the site" can also wait for a set time (publish_at) before it shows. The database keeps it
--   from visitors until then, so it goes live on its own at that minute, with nothing to run.
-- * Every 5 minutes, a job looks for things that have just gone live and asks notify-message to send the editors a
--   phone alert. went_live notes each one announced, so each is announced once.

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),   -- its address: /twin-squawk/#slug
  title text not null check (length(title) between 1 and 200),
  summary text check (length(summary) <= 400),                           -- the short bit on the list
  body text check (length(body) <= 20000),                               -- paragraphs, "## " for a heading
  photo_url text,
  photo_frame jsonb check (photo_frame is null or jsonb_typeof(photo_frame) = 'object'),
  photo_alt text check (length(photo_alt) <= 300),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 30), -- [{"url","alt","w","h","x","y","z"}]
  videos jsonb not null default '[]'::jsonb check (jsonb_typeof(videos) = 'array'),     -- [{"url": "https://…", "title": "…"}]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),       -- [{"url": "https://…", "label": "…"}]
  published boolean not null default true,
  publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.articles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'articles' and policyname = 'articles_public') then
    create policy articles_public on public.articles for select to anon, authenticated using (published);
    create policy articles_admin on public.articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
revoke all on public.articles from anon, authenticated;
grant select on public.articles to anon;
grant select, insert, update, delete on public.articles to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'articles_touch') then
    create trigger articles_touch before update on public.articles for each row execute function public.touch_updated_at();
    create trigger articles_history after update or delete on public.articles for each row execute function public.keep_history();
  end if;
end $$;

-- A set time to go live, on everything with "Show on the site". Empty means it shows as soon as it's switched on.
-- Visitors (and signed-in people who aren't editors) don't see it before then; editors always do. These rules are
-- added to each table's own ("restrictive"), so everything else about who sees what stays as it was.
do $$
declare t text;
begin
  foreach t in array array['articles','animals','goals','partners','events','collabs','sniffari_programs','foster_programs','adventures','videos','places','help_resources','page_photos'] loop
    execute format('alter table public.%I add column if not exists publish_at timestamptz', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_on_time') then
      execute format('create policy %I on public.%I as restrictive for select to anon using (publish_at is null or publish_at <= now())', t || '_on_time', t);
      execute format('create policy %I on public.%I as restrictive for select to authenticated using (publish_at is null or publish_at <= now() or public.is_admin())', t || '_on_time_signed_in', t);
    end if;
  end loop;
end $$;

-- Things that have gone live and been announced: one row each time, so a rescheduled one is announced again.
create table if not exists public.went_live (
  tbl text not null,
  row_id uuid not null,
  publish_at timestamptz not null,
  title text,
  announced_at timestamptz not null default now(),
  primary key (tbl, row_id, publish_at)
);
alter table public.went_live enable row level security;
revoke all on public.went_live from anon, authenticated;

-- What's gone live in the last 2 days and hasn't been announced: the table, the row, when, its name and what kind it is.
create or replace function public.live_due() returns table (tbl text, row_id uuid, publish_at timestamptz, title text, what text)
language plpgsql stable security definer set search_path = '' as $$
declare k record;
begin
  for k in select * from (values
      ('articles', 'title', 'Twin Squawk', 'true'),
      ('animals', 'name', 'Animal', 'people_ok'),
      ('goals', 'title', 'Shelter goal', 'true'),
      ('partners', 'name', 'Rescue or shelter', 'feature_ok'),
      ('events', 'title', 'Event', 'true'),
      ('collabs', 'title', 'Collaboration', 'true'),
      ('sniffari_programs', 'coalesce(program_name, shelter_name)', 'Day-out program', 'true'),
      ('foster_programs', 'coalesce(program_name, shelter_name)', 'Foster program', 'true'),
      ('adventures', 'title', 'Day out', 'true'),
      ('videos', 'title', 'Day-out video', 'true'),
      ('places', 'name', 'Dog-friendly place', 'true'),
      ('help_resources', 'name', 'Help listing', 'true'),
      ('page_photos', '''A photo on the '' || page || '' page''', 'Photo', 'true')
    ) v(t, label_sql, kind, extra) loop
    return query execute format(
      'select %L::text, x.id, x.publish_at, left((%s)::text, 120), %L::text from public.%I x
       where x.published and %s and x.publish_at <= now() and x.publish_at > now() - interval ''2 days''
         and not exists (select 1 from public.went_live w where w.tbl = %L and w.row_id = x.id and w.publish_at = x.publish_at)',
      k.t, k.label_sql, k.kind, k.t, k.extra, k.t);
  end loop;
end $$;

-- Notes what's due as announced and returns it, for notify-message to send. Only the server can call it.
create or replace function public.live_claim() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  with due as (select * from public.live_due()),
  claimed as (
    insert into public.went_live (tbl, row_id, publish_at, title)
    select d.tbl, d.row_id, d.publish_at, d.title from due d
    on conflict do nothing
    returning went_live.tbl, went_live.row_id, went_live.publish_at)
  select coalesce(jsonb_agg(jsonb_build_object('tbl', d.tbl, 'title', d.title, 'what', d.what) order by d.publish_at), '[]'::jsonb) into out
  from due d join claimed c on c.tbl = d.tbl and c.row_id = d.row_id and c.publish_at = d.publish_at;
  return jsonb_build_object('items', out);
end $$;

-- Run every 5 minutes: if something has gone live, ask notify-message to announce it (it asks live_claim what).
create or replace function public.announce_scheduled() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.live_due()) then
    begin
      perform net.http_post(
        url := 'https://yysfgsdwlddeilktumza.supabase.co/functions/v1/notify-message',
        body := '{"action": "live"}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 10000);
    exception when others then
      raise warning 'announce_scheduled: %', sqlerrm;
    end;
  end if;
end $$;
revoke execute on function public.live_due() from public, anon, authenticated;
revoke execute on function public.live_claim() from public, anon, authenticated;
revoke execute on function public.announce_scheduled() from public, anon, authenticated;
grant execute on function public.live_claim() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'announce-scheduled';
    perform cron.schedule('announce-scheduled', '*/5 * * * *', 'select public.announce_scheduled()');
  end if;
end $$;

-- Recently deleted can bring back an article too.
create or replace function public.restore_deleted(p_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tx bigint;
  e record;
  n int := 0;
  tables text[] := array['partners','goals','goal_bars','animals','events','collabs','sniffari_programs','foster_programs','adventures','help_resources','videos','places','page_photos','articles','messages','site_text'];
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select h.tx into v_tx from public.content_history h where h.id = p_id and h.op = 'delete' and h.restored_at is null;
  if v_tx is null then raise exception 'That one was already restored or is too old.'; end if;
  for e in
    select h.id, h.tbl, h.data from public.content_history h
    where h.tx = v_tx and h.op = 'delete' and h.restored_at is null
    order by array_position(tables, h.tbl), h.id
  loop
    if not (e.tbl = any(tables)) then continue; end if;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', e.tbl, e.tbl) using e.data;
    update public.content_history set restored_at = now() where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.restore_deleted(bigint) from public, anon;
grant execute on function public.restore_deleted(bigint) to authenticated;
