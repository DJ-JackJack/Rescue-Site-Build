-- Animal Story Spotlight: animals in their forever homes or at a sanctuary (like the Willow Woods horses),
-- shown on their own page instead of Animals We've Helped. The edit page moves an animal between the two.
alter table public.animals add column if not exists section text not null default 'helped' check (section in ('helped', 'spotlight'));

-- Horses aren't up for adoption unless they're marked "Still looking", so the rest start in the spotlight.
update public.animals set section = 'spotlight' where species = 'horse' and status <> 'looking' and section = 'helped';
