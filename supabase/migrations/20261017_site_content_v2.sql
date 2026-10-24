-- Applied to Supabase project "rescue-site" on 2026-10-17 (run as one transaction through the SQL tool,
-- because the migration tool timed out). Decisions from the site's owners:
-- * Animals are filmed only with the owner's or caretaker's consent, so organizations whose animals tae
--   has filmed can be featured (feature_ok = true).
-- * Rescues on Sniffari lists publicly advertised programs; no shelter OK is needed.
-- * Public buildings' addresses are fine to show. The no-address rule protects private homes and individuals.

alter table public.animals drop constraint animals_status_check;
alter table public.animals add constraint animals_status_check check (status in ('adopted','placed','foster','sanctuary','looking'));
alter table public.animals add column herd text;

alter policy sniffari_public on public.sniffari_programs using (published);
alter table public.sniffari_programs alter column shelter_ok set default true;
comment on column public.sniffari_programs.shelter_ok is 'Unused since 2026-10-17: public programs are listed without shelter OK.';
alter table public.sniffari_programs add column address text;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete cascade,
  title text not null,
  starts_on date not null,
  time_text text,
  place text,
  link_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
-- events show only while upcoming
create policy events_public on public.events for select to anon, authenticated
  using (published and starts_on >= current_date
         and (partner_id is null or exists (select 1 from public.partners p where p.id = partner_id and p.published and p.feature_ok)));
create policy events_admin on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Data loaded the same day (summary):
-- partners: NACC renamed Norfolk Animal Care Center; SPCA renamed Virginia Beach SPCA (slug virginia-beach-spca);
--   added Reba's Animal Rescue, Virginia Beach Animal Care and Adoption Center (vbacac), Peninsula SPCA,
--   Chesapeake Animal Services (all feature_ok), Portsmouth Humane Society (hidden). Isle of Wight still hidden.
-- goals: hay drive unpublished (draft until Willow Woods' founder approves); "Kitten milk replacement drive"
--   (Peninsula SPCA) added as met, April 2026.
-- animals: eBay renamed Ebay (Herd One); Warrior, Cat, Ladybug added (Herd One); 12 dogs from tae's
--   Happy Tails list (Rossalynn hidden, status unknown); "looking"/"foster" checked 2026-10-16.
-- sniffari_programs: Pack Adventures (NACC), Beach Buddies (VB SPCA), Snout & About (Chesapeake Animal
--   Services), Dog Field Trips (VBACAC); Paws Around Ptown (Portsmouth Humane Society) hidden until it has a link.
-- events: four Willow Woods events, Oct 17 to Dec 12, 2026.

-- 2026-10-18: display order for horses within a herd (tae's order: Ebay, Warrior, Cat, Ladybug; then Steele)
alter table public.animals add column sort int not null default 100;
