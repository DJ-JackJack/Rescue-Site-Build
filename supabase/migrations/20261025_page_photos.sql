-- Photos Taea adds to any page from the edit page, and photos already on a page that she's changed or hidden.
-- The build gives every page its photo spots (see site/photospots.mjs): "before:b.help.1a2b3c4d" is the spot just above
-- one part of the help page, "after:…" the spot just below the last part of a section or box. A photo already on a
-- page has a key like "i.home.1a2b3c4d"; a row for it with layout "swap" changes that photo, or hides it if it has none.
create table if not exists public.page_photos (
  id uuid primary key default gen_random_uuid(),
  page text not null check (page ~ '^[a-z0-9-]{1,60}$'),        -- the page, like "help" or "home"
  spot text not null check (spot ~ '^((before|after):b|i)\.[a-z0-9-]{1,60}\.[0-9a-f]{8}(-[0-9]+)?$'),
  layout text not null default 'full' check (layout in ('full', 'banner', 'left', 'right', 'small', 'row', 'swap')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 12), -- [{"url": "https://…", "alt": "…", "w": 1600, "h": 1200}]
  caption text check (length(caption) <= 300),
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (layout = 'swap' or jsonb_array_length(photos) >= 1),
  check (layout in ('row') or jsonb_array_length(photos) <= 1),
  check ((layout = 'swap') = (spot like 'i.%'))
);
alter table public.page_photos enable row level security;
create policy page_photos_public on public.page_photos for select to anon, authenticated using (published);
create policy page_photos_admin on public.page_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.page_photos from anon, authenticated;
grant select on public.page_photos to anon;
grant select, insert, update, delete on public.page_photos to authenticated;
create trigger page_photos_touch before update on public.page_photos for each row execute function public.touch_updated_at();
create trigger page_photos_history after update or delete on public.page_photos for each row execute function public.keep_history();

-- Recently deleted can bring them back.
create or replace function public.restore_deleted(p_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tx bigint;
  e record;
  n int := 0;
  tables text[] := array['partners','goals','goal_bars','animals','events','collabs','sniffari_programs','foster_programs','adventures','help_resources','videos','places','page_photos','messages','site_text'];
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
