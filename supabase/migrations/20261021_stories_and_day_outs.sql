-- From Taea's list of 2026-10-19: more room for each animal's story, more on help listings, and the Sniffari
-- page's day-out videos and dog-friendly places.

-- Animals: a longer story and dated updates and notes, shown in the Happy Tails pop-up.
alter table public.animals add column if not exists story text check (length(story) <= 6000);
alter table public.animals add column if not exists updates jsonb not null default '[]'::jsonb; -- [{"date":"2026-10-19","text":"..."}]

-- Help listings: an email, a second link (like a free resource library), and a caution shown with the listing
-- (like "This is a credit card, not financial assistance").
alter table public.help_resources add column if not exists email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.help_resources add column if not exists more_url text check (more_url is null or more_url ~ '^https?://');
alter table public.help_resources add column if not exists more_label text check (length(more_label) <= 80);
alter table public.help_resources add column if not exists caution text check (length(caution) <= 400);

-- Videos of the dogs' day outs, and the dog-friendly places Taea picks (both on the Sniffari page).
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  url text not null check (url ~ '^https://'),
  posted_on date,
  note text check (length(note) <= 300),
  photo_url text,
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  area text check (length(area) <= 100), -- a city or a public place; never a private address
  why text check (length(why) <= 1000),
  link_url text check (link_url is null or link_url ~ '^https?://'),
  photo_url text,
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.videos enable row level security;
alter table public.places enable row level security;
create policy videos_public on public.videos for select to anon, authenticated using (published);
create policy videos_admin on public.videos for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy places_public on public.places for select to anon, authenticated using (published);
create policy places_admin on public.places for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.videos, public.places from anon, authenticated;
grant select on public.videos, public.places to anon;
grant select, insert, update, delete on public.videos, public.places to authenticated;
create trigger videos_touch before update on public.videos for each row execute function public.touch_updated_at();
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
create trigger videos_history after update or delete on public.videos for each row execute function public.keep_history();
create trigger places_history after update or delete on public.places for each row execute function public.keep_history();

-- Recently deleted can bring these back too.
create or replace function public.restore_deleted(p_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tx bigint;
  e record;
  n int := 0;
  tables text[] := array['partners','goals','goal_bars','animals','events','sniffari_programs','help_resources','videos','places','messages','site_text'];
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
