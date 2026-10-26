-- Pages that weren't found, 2026-10-26: when the "Page not found" page shows, the address that was tried is counted
-- too, so a mistyped or old link that people keep using can be spotted on the edit page's Visitors screen. Only the
-- page part of the address is kept (like /happy-tails), never anything after a ? or #, and nothing about the visitor.

create table if not exists public.missed_pages (
  day date not null,
  path text not null,
  views int not null default 0,
  primary key (day, path)
);
alter table public.missed_pages enable row level security;
drop policy if exists missed_pages_admin on public.missed_pages;
create policy missed_pages_admin on public.missed_pages for select to authenticated using (public.is_admin());
revoke all on public.missed_pages from anon, authenticated;
grant select on public.missed_pages to authenticated;

-- count_view takes the address that wasn't found as a third, optional value. The old two-value version goes, so
-- pages built before this (still calling with two) reach this one. A day holds at most 30 addresses not found.
drop function if exists public.count_view(text, text);
create or replace function public.count_view(p_path text, p_source text default null, p_missed text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'America/New_York')::date;
begin
  if p_path is null or p_path !~ '^/[a-z0-9/_-]{0,80}$' then return; end if;
  if exists (select 1 from public.page_views where day = d and path = p_path)
     or (select count(*) from public.page_views where day = d) < 60 then
    insert into public.page_views as v (day, path, views) values (d, p_path, 1)
    on conflict (day, path) do update set views = v.views + 1;
  end if;
  if p_source ~ '^[a-z0-9][a-z0-9.-]{0,39}$' and (exists (select 1 from public.visit_sources where day = d and source = p_source)
     or (select count(*) from public.visit_sources where day = d) < 40) then
    insert into public.visit_sources as s (day, source, visits) values (d, p_source, 1)
    on conflict (day, source) do update set visits = s.visits + 1;
  end if;
  if p_path = '/404' and p_missed ~ '^/[A-Za-z0-9/._-]{0,100}$' and (exists (select 1 from public.missed_pages where day = d and path = p_missed)
     or (select count(*) from public.missed_pages where day = d) < 30) then
    insert into public.missed_pages as m (day, path, views) values (d, p_missed, 1)
    on conflict (day, path) do update set views = m.views + 1;
  end if;
end $$;
revoke execute on function public.count_view(text, text, text) from public, authenticated;
grant execute on function public.count_view(text, text, text) to anon;

-- The Visitors screen's totals, now with the addresses not found (the 50 most tried).
create or replace function public.visitor_summary(p_days int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d0 date := (now() at time zone 'America/New_York')::date - (least(greatest(coalesce(p_days, 7), 1), 3660) - 1);
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'from', d0,
    'days', (select coalesce(jsonb_agg(jsonb_build_array(day, n) order by day), '[]') from (select day, sum(views)::int n from public.page_views where day >= d0 group by day) x),
    'pages', (select coalesce(jsonb_agg(jsonb_build_array(path, n) order by n desc, path), '[]') from (select path, sum(views)::int n from public.page_views where day >= d0 group by path) x),
    'sources', (select coalesce(jsonb_agg(jsonb_build_array(source, n) order by n desc, source), '[]') from (select source, sum(visits)::int n from public.visit_sources where day >= d0 group by source) x),
    'missed', (select coalesce(jsonb_agg(jsonb_build_array(path, n) order by n desc, path), '[]') from (select path, sum(views)::int n from public.missed_pages where day >= d0 group by path order by n desc, path limit 50) x));
end $$;
revoke execute on function public.visitor_summary(int) from public, anon;
grant execute on function public.visitor_summary(int) to authenticated;

-- "Start the counts fresh" clears these too.
create or replace function public.clear_visitor_counts() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.page_views where true;
  delete from public.visit_sources where true;
  delete from public.missed_pages where true;
end $$;
revoke execute on function public.clear_visitor_counts() from public, anon;
grant execute on function public.clear_visitor_counts() to authenticated;
