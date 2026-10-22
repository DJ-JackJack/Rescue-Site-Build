-- From Taea's list of 2026-10-22: the dog day outs she goes on, shared on Rescues on Sniffari. Each one has her
-- write-up, its videos, a photo gallery and links to the places they visited.
create table if not exists public.adventures (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  went_on date,
  dogs text check (length(dogs) <= 200),                       -- the dogs who went, like "Tyce and Zazu"
  partner_id uuid references public.partners(id) on delete set null,   -- the shelter they came from
  story text check (length(story) <= 6000),
  videos jsonb not null default '[]'::jsonb check (jsonb_typeof(videos) = 'array'),         -- [{"url": "https://…", "title": "…"}]
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 40), -- ["https://…", …]
  businesses jsonb not null default '[]'::jsonb check (jsonb_typeof(businesses) = 'array'), -- [{"url": "https://…", "name": "…"}]
  sort int not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.adventures enable row level security;
create policy adventures_public on public.adventures for select to anon, authenticated using (published);
create policy adventures_admin on public.adventures for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.adventures from anon, authenticated;
grant select on public.adventures to anon;
grant select, insert, update, delete on public.adventures to authenticated;
create trigger adventures_touch before update on public.adventures for each row execute function public.touch_updated_at();
create trigger adventures_history after update or delete on public.adventures for each row execute function public.keep_history();
-- Recently deleted already knows this table (see restore_deleted in 20261022_shelters.sql).
