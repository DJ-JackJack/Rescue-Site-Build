-- The edit page (/edit/): help resources, editable page text, and photo storage.
-- Same rules as the rest: visitors read published rows only; admins (public.admins) edit everything.
-- Applied with execute_sql in one transaction.

-- Local help, shown on the help page under its category.
create table if not exists public.help_resources (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('food','vet','behavior','housing','rehoming','birds')),
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 600),
  link_url text check (link_url is null or link_url ~ '^https?://'),
  phone text check (length(phone) <= 40),
  area text check (length(area) <= 100),           -- a city or "All of Hampton Roads"; never a private address
  checked_on date,                                 -- when someone last confirmed it's still running
  sort int not null default 100,
  published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.help_resources enable row level security;
create policy help_public on public.help_resources for select to anon, authenticated using (published);
create policy help_admin on public.help_resources for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.help_resources to anon, authenticated;
grant insert, update, delete on public.help_resources to authenticated;
create trigger help_touch before update on public.help_resources for each row execute function public.touch_updated_at();

-- Wording that can be changed from the edit page. An empty body means "use the text built into the page".
create table if not exists public.site_text (
  key text primary key check (key ~ '^[a-z0-9_.-]{1,60}$'),
  body text not null default '' check (length(body) <= 6000),
  updated_at timestamptz not null default now()
);
alter table public.site_text enable row level security;
create policy site_text_public on public.site_text for select to anon, authenticated using (true);
create policy site_text_admin on public.site_text for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.site_text to anon, authenticated;
grant insert, update, delete on public.site_text to authenticated;
create trigger site_text_touch before update on public.site_text for each row execute function public.touch_updated_at();

-- Photos uploaded from the edit page. Anyone can view them (they're on the site); only admins can add,
-- replace or remove them. The edit page resizes each photo and strips its hidden data (like GPS) first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;
create policy photos_admin_select on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy photos_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy photos_admin_update on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_admin()) with check (bucket_id = 'photos' and public.is_admin());
create policy photos_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_admin());
