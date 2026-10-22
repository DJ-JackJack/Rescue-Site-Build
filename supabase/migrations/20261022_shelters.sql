-- From Taea's list of 2026-10-22: an "unknown" status for animals she's lost touch with, collaborations with each
-- rescue (past, current and planned, like portraits or shelter treats), extra links for rescues and day-out programs,
-- and the NACC Pack Adventures link pointing at the city's own program page.

-- Animals: "Unknown (lost contact)".
alter table public.animals drop constraint animals_status_check;
alter table public.animals add constraint animals_status_check
  check (status in ('adopted','placed','foster','sanctuary','looking','unknown'));

-- Extra links, like preferred ways to donate or a program to highlight: [{"url": "https://…", "label": "…"}]
alter table public.partners add column if not exists links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array');
alter table public.sniffari_programs add column if not exists links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array');

-- Day-out programs can be tagged as offering sleepovers (a night or a weekend in a home).
alter table public.sniffari_programs drop constraint if exists sniffari_programs_tags_check;
alter table public.sniffari_programs add constraint sniffari_programs_tags_check
  check (tags <@ array['free','half','kids','first','sleepover']::text[]);

-- Collaborations with a rescue. Whether one is coming up, happening now or done comes from its dates.
create table if not exists public.collabs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text check (length(kind) <= 60),                  -- like "Portraits" or "Shelter treats"
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  ongoing boolean not null default false,                -- no end date yet
  description text check (length(description) <= 1000),
  link_url text check (link_url is null or link_url ~ '^https?://'),
  photo_url text,
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collabs enable row level security;
create policy collabs_public on public.collabs for select to anon, authenticated
  using (published and exists (select 1 from public.partners p where p.id = partner_id and p.published and p.feature_ok));
create policy collabs_admin on public.collabs for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.collabs from anon, authenticated;
grant select on public.collabs to anon;
grant select, insert, update, delete on public.collabs to authenticated;
create trigger collabs_touch before update on public.collabs for each row execute function public.touch_updated_at();
create trigger collabs_history after update or delete on public.collabs for each row execute function public.keep_history();

-- Recently deleted can bring back collaborations (after their rescue, if both were deleted together), and the
-- foster programs and Sniffari adventures from the same list (20261022_foster.sql, 20261022_adventures.sql).
create or replace function public.restore_deleted(p_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_tx bigint;
  e record;
  n int := 0;
  tables text[] := array['partners','goals','goal_bars','animals','events','collabs','sniffari_programs','foster_programs','adventures','help_resources','videos','places','messages','site_text'];
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

-- NACC's Pack Adventures: the city's program page first, the Friends of NACC page as an extra link.
update public.sniffari_programs
  set signup_url = 'https://www.norfolk.gov/5039/NACC-Pack-Adventures',
      links = '[{"url": "https://friendsofnacc.org/recreation", "label": "Friends of NACC"}]'::jsonb
  where program_name = 'Pack Adventures' and signup_url = 'https://friendsofnacc.org/recreation';

-- Willow Woods' website and donation links were saved with the page's title in front of the link. Keep just the link.
update public.partners set website_url = substring(website_url from 'https://share\.google/\S+')
  where slug = 'willow-woods' and website_url ~ '\s' and website_url ~ 'https://share\.google/\S+';
update public.partners set donate_url = substring(donate_url from 'https://share\.google/\S+')
  where slug = 'willow-woods' and donate_url ~ '\s' and donate_url ~ 'https://share\.google/\S+';
