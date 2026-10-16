-- Applied to Supabase project "rescue-site" (yysfgsdwlddeilktumza) as migrations
-- site_content_v1 and site_content_v1_grants.
-- Content for the public site. Visitors (anon) read published rows only; admins edit everything.
-- No table stores a location: animal, rescue and wildlife locations stay off the site by design.

create table public.admins (email text primary key);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins a where a.email = lower(auth.jwt() ->> 'email')) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null default 'rescue' check (kind in ('sanctuary','rescue','shelter')),
  mission text,
  website_url text, adopt_url text, donate_url text,
  feature_ok boolean not null default false,   -- the organization said yes to being featured
  published boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  title text not null,
  why text,
  price_note text,
  donate_url text,                              -- the shelter's own donation page
  status text not null default 'active' check (status in ('active','met')),
  featured boolean not null default false,      -- shown on the homepage
  figures_updated_at date,                      -- null = no figures from the shelter yet
  met_on date,
  sort int not null default 100,
  published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.goal_bars (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  label text not null,
  target numeric not null check (target > 0),
  current numeric check (current >= 0),          -- null = not reported yet
  sort int not null default 100
);

create table public.animals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null default 'dog' check (species in ('dog','cat','horse','bird','other')),
  status text not null check (status in ('adopted','placed','sanctuary','looking')),
  partner_id uuid references public.partners(id) on delete set null,
  featured_on date,
  adopted_on date,
  transport boolean not null default false,   -- transport runs (the puppy relay) are not counted in the adoption stat
  note text,
  listing_url text,
  checked_on date,            -- last time a "looking" status was confirmed with the rescue
  photo_url text,
  journey jsonb not null default '[]'::jsonb,  -- [{"label":"Featured","detail":"...","date":"2026-05-01"}]
  people_ok boolean not null default true,     -- any people shown or named have agreed
  published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'adopted' or adopted_on is null or featured_on is null or adopted_on >= featured_on)
);

create table public.sniffari_programs (
  id uuid primary key default gen_random_uuid(),
  shelter_name text not null,
  program_name text,
  city text,
  signup_url text,
  facts text[] not null default '{}',
  tags text[] not null default '{}' check (tags <@ array['free','half','kids','first']::text[]),
  checked_on date,
  shelter_ok boolean not null default false,
  published boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('partner','help','dog','sniffari','other')),
  name text, email text not null, body text,
  details jsonb not null default '{}'::jsonb,
  page text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create trigger partners_touch before update on public.partners for each row execute function public.touch_updated_at();
create trigger goals_touch before update on public.goals for each row execute function public.touch_updated_at();
create trigger animals_touch before update on public.animals for each row execute function public.touch_updated_at();
create trigger sniffari_touch before update on public.sniffari_programs for each row execute function public.touch_updated_at();

alter table public.partners enable row level security;
alter table public.goals enable row level security;
alter table public.goal_bars enable row level security;
alter table public.animals enable row level security;
alter table public.sniffari_programs enable row level security;
alter table public.messages enable row level security;

revoke all on public.partners, public.goals, public.goal_bars, public.animals, public.sniffari_programs, public.messages from anon, authenticated;
grant select on public.partners, public.goals, public.goal_bars, public.animals, public.sniffari_programs to anon, authenticated;
grant insert, update, delete on public.partners, public.goals, public.goal_bars, public.animals, public.sniffari_programs to authenticated;
grant select, update, delete on public.messages to authenticated;

create policy partners_public on public.partners for select to anon, authenticated
  using (published and feature_ok);
create policy goals_public on public.goals for select to anon, authenticated
  using (published and exists (select 1 from public.partners p where p.id = partner_id and p.published and p.feature_ok));
create policy goal_bars_public on public.goal_bars for select to anon, authenticated
  using (exists (select 1 from public.goals g join public.partners p on p.id = g.partner_id
                 where g.id = goal_id and g.published and p.published and p.feature_ok));
create policy animals_public on public.animals for select to anon, authenticated
  using (published and people_ok
         and (status <> 'looking' or checked_on >= current_date - 28)
         and (partner_id is null or exists (select 1 from public.partners p where p.id = partner_id and p.published and p.feature_ok)));
create policy sniffari_public on public.sniffari_programs for select to anon, authenticated
  using (published and shelter_ok);

create policy partners_admin on public.partners for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy goals_admin on public.goals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy goal_bars_admin on public.goal_bars for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy animals_admin on public.animals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sniffari_admin on public.sniffari_programs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy messages_admin on public.messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.submit_message(p_topic text, p_email text, p_name text default null, p_body text default null,
                                      p_details jsonb default '{}'::jsonb, p_page text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_topic not in ('partner','help','dog','sniffari','other') then raise exception 'bad topic'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'bad email'; end if;
  if length(coalesce(p_name,'')) > 200 or length(coalesce(p_body,'')) > 5000 or length(coalesce(p_page,'')) > 200
     or pg_column_size(coalesce(p_details,'{}'::jsonb)) > 8192 or jsonb_typeof(coalesce(p_details,'{}'::jsonb)) <> 'object' then
    raise exception 'too long';
  end if;
  if (select count(*) from public.messages where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.messages where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'slow down';
  end if;
  insert into public.messages(topic, email, name, body, details, page)
  values (p_topic, trim(p_email), nullif(trim(p_name),''), nullif(trim(p_body),''), coalesce(p_details,'{}'::jsonb), p_page);
end $$;
revoke all on function public.submit_message(text,text,text,text,jsonb,text) from public;
grant execute on function public.submit_message(text,text,text,text,jsonb,text) to anon;

-- site_content_v1_grants
revoke execute on function public.is_admin() from anon;
revoke execute on function public.submit_message(text,text,text,text,jsonb,text) from authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated;

-- Seed data (only facts from tae's answers; unreported numbers stay empty) was inserted once:
-- partners willow-woods (approved, published), nacc / isle-of-wight / spca (not approved, hidden);
-- the hay goal with Round bales (target 70) and Square bales (target 200), no figures yet;
-- animals eBay and Steele (horses, in sanctuary at Willow Woods).
