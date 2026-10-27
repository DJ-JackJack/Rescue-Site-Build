-- Help listings by city, 2026-10-27: the help pages (Help Keeping Your Pet, Caring for Yourself, Wildlife) list help
-- city by city, with buttons at the top to jump to each. A listing says which of these it helps, one or more:
-- the seven cities, all of Hampton Roads, or "further" (Further Abroad: online, nationwide, statewide, or based
-- outside the area). Smaller places count with the closest of the seven. "area" stays as the words shown with it.
alter table public.help_resources add column if not exists cities text[] not null default '{}'
  check (cities <@ array['virginia-beach', 'norfolk', 'chesapeake', 'portsmouth', 'suffolk', 'hampton', 'newport-news', 'hampton-roads', 'further']::text[]);

-- The listings there already, by the area they give. Only ones without cities yet, so this is safe to run again.
update public.help_resources set cities = case
    when area ~ ', Virginia Beach, VA ' or area = 'Virginia Beach' then array['virginia-beach']
    when area ~ ', Norfolk, VA ' or area = 'Norfolk' then array['norfolk']
    when area ~ ', Chesapeake, VA ' or area = 'Chesapeake' then array['chesapeake']
    when area = 'Portsmouth' then array['portsmouth']
    when area in ('Suffolk', 'Suffolk and Isle of Wight', 'Isle of Wight County', 'Carrollton (Isle of Wight)', 'Smithfield') then array['suffolk']
    when area in ('Hampton', 'Poquoson') then array['hampton']
    when area in ('Newport News', 'Williamsburg', 'Yorktown', 'Gloucester', 'Hayes (Gloucester)') then array['newport-news']
    when area in ('Hampton and Newport News', 'Newport News and Poquoson') then array['hampton', 'newport-news']
    when area = 'Moyock, NC, serving Chesapeake, Virginia Beach and Portsmouth' then array['virginia-beach', 'chesapeake', 'portsmouth']
    when area in ('All of Hampton Roads', 'Hampton Roads', 'Virginia Beach, serving Hampton Roads', 'Virginia''s coast') then array['hampton-roads']
    when area in ('Online', 'Nationwide', 'Anywhere in the U.S.', 'Statewide', 'All of Virginia', 'Wakefield', 'Waynesboro', 'Providence Forge (New Kent)') then array['further']
    when coalesce(area, '') = '' and category = 'financing' then array['further']
    when coalesce(area, '') = '' then array['hampton-roads']
    else cities end
  where cities = '{}';
