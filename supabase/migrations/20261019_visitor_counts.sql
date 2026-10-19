-- Visitor counts: how many times each page is viewed per day, and where visits come from (TikTok, Google, ...).
-- No cookies and nothing about the visitor is stored: just a page, a day and a number. Only editors can read them.
-- Days are Hampton Roads time.

create table if not exists public.page_views (
  day date not null,
  path text not null,
  views int not null default 0,
  primary key (day, path)
);
create table if not exists public.visit_sources (
  day date not null,
  source text not null,
  visits int not null default 0,
  primary key (day, source)
);
alter table public.page_views enable row level security;
alter table public.visit_sources enable row level security;
create policy page_views_admin on public.page_views for select to authenticated using (public.is_admin());
create policy visit_sources_admin on public.visit_sources for select to authenticated using (public.is_admin());
grant select on public.page_views, public.visit_sources to authenticated;

-- Called by every page. Anything odd is ignored, and a day holds at most 60 pages and 40 sources,
-- so junk can't pile up.
create or replace function public.count_view(p_path text, p_source text default null) returns void
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
end $$;
revoke execute on function public.count_view(text, text) from public, authenticated;
grant execute on function public.count_view(text, text) to anon;

-- Totals for the edit page's Visitors screen: per day, per page and per source, over the last p_days days.
create or replace function public.visitor_summary(p_days int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d0 date := (now() at time zone 'America/New_York')::date - (least(greatest(coalesce(p_days, 7), 1), 3660) - 1);
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'from', d0,
    'days', (select coalesce(jsonb_agg(jsonb_build_array(day, n) order by day), '[]') from (select day, sum(views)::int n from public.page_views where day >= d0 group by day) x),
    'pages', (select coalesce(jsonb_agg(jsonb_build_array(path, n) order by n desc, path), '[]') from (select path, sum(views)::int n from public.page_views where day >= d0 group by path) x),
    'sources', (select coalesce(jsonb_agg(jsonb_build_array(source, n) order by n desc, source), '[]') from (select source, sum(visits)::int n from public.visit_sources where day >= d0 group by source) x));
end $$;
revoke execute on function public.visitor_summary(int) from public, anon;
grant execute on function public.visitor_summary(int) to authenticated;

-- "Start the counts fresh" (for launch day, so preview visits don't count).
create or replace function public.clear_visitor_counts() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.page_views where true;
  delete from public.visit_sources where true;
end $$;
revoke execute on function public.clear_visitor_counts() from public, anon;
grant execute on function public.clear_visitor_counts() to authenticated;
