-- Photos, plus content updates from the photo guide and Krys's answers (Oct 18).
-- Photo paths are relative to the site (for example "assets/photos/dog-zazu.jpg").
-- The page resolves them against the site's base path and only ever shows http(s) images.
-- Applied with execute_sql in one transaction.

alter table public.goals add column if not exists photo_url text;

update public.goals set photo_url = 'assets/photos/goal-kitten-milk.jpg'
  where title = 'Kitten milk replacement drive';

update public.animals set photo_url = v.photo
  from (values
    ('Zazu', 'nacc', 'assets/photos/dog-zazu.jpg'),
    ('Tyce', 'nacc', 'assets/photos/dog-tyce.jpg'),
    ('Jax', 'nacc', 'assets/photos/dog-jax.jpg'),
    ('Hammy', 'nacc', 'assets/photos/dog-hammy.jpg'),
    ('Babe & Buster', 'rebas-animal-rescue', 'assets/photos/dog-babe-and-buster.jpg'),
    ('Jessee', 'rebas-animal-rescue', 'assets/photos/dog-jess.jpg'),
    ('Buddy', 'vbacac', 'assets/photos/dog-buddy.jpg')
  ) as v(name, slug, photo), public.partners p
  where p.slug = v.slug and animals.partner_id = p.id and animals.name = v.name;

-- Her photo guide: Hammy has been adopted.
update public.animals set status = 'adopted'
  where name = 'Hammy' and partner_id = (select id from public.partners where slug = 'nacc');

-- Doc Holiday (Willow Woods). Hidden until the spelling is confirmed.
insert into public.animals (name, species, status, partner_id, sort, photo_url, people_ok, published)
select 'Doc Holiday', 'horse', 'sanctuary', id, 6, 'assets/photos/horse-doc-holiday.jpg', true, false
from public.partners where slug = 'willow-woods'
and not exists (select 1 from public.animals where name = 'Doc Holiday');

-- The Spice litter's rescue. Filmed with consent, so OK to feature; hidden until we have their website link.
insert into public.partners (slug, name, kind, feature_ok, published, sort)
values ('frankies-friends-animal-rescue', 'Frankie''s Friends Animal Rescue', 'rescue', true, false, 25)
on conflict (slug) do nothing;

-- Isle of Wight: proper name and link from Krys. Stays hidden until their dogs are added.
update public.partners
  set name = 'Isle of Wight County Animal Services', kind = 'shelter',
      website_url = 'https://www.isleofwight.gov/our_services/animal_services/index.php'
  where slug = 'isle-of-wight';

-- Paws Around Ptown now has its sign-up link.
update public.sniffari_programs
  set signup_url = 'https://portsmouthhumanesociety.org/pawsaroundptown/', published = true, checked_on = '2026-10-18'
  where program_name = 'Paws Around Ptown';
