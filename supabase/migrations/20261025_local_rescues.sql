-- From Taea's handoff packet of 2026-10-24: small local rescues, spay/neuter and community cat (TNR) help, and
-- apartments with no breed restrictions, each in its own section of the help page. Every listing was checked on
-- 2026-10-25 against the group's or property's own website (and, for rescues, its 2025 report to the state).
-- Ones that couldn't be fully confirmed are added hidden, for Taea to check and switch on in the editor.
-- Apartments are only shown where the property's own website says it has no breed restrictions.
alter table public.help_resources drop constraint help_resources_category_check;
alter table public.help_resources add constraint help_resources_category_check
  check (category in ('food','vet','behavior','housing','rehoming','birds','financing','abuse','wildlife','wildgroups','crisis','dv','mental','grief','rescues','tnr','breedhousing'));

-- The Virginia Beach SPCA's housing page is gone (it now says page not found), and its list was from May 2024.
-- The checked list of breed-friendly apartments below takes its place.
update public.help_resources set published = false where name = 'Virginia Beach SPCA Pet Friendly Housing Suggestions' and published;

-- The Peninsula SPCA clinic no longer takes walk-ins.
update public.help_resources
set description = E'Low-cost vaccines and spay/neuter surgery for the public at the Newport News shelter.\n\nNo published income limit. By appointment only, with no walk-ins: book vaccines online with a $25 non-refundable deposit. For spay/neuter and other questions, call and leave a message. They return most calls within 24 to 48 hours.',
    phone = '(757) 595-1399, ext. 112', checked_on = date '2026-10-25'
where name = 'Peninsula SPCA Low-Cost Clinic' and category = 'vet';

-- Small local rescues
insert into public.help_resources (category, name, kind, description, best_for, caution, link_url, phone, email, area, checked_on, published, sort)
select v.* from (values
  ('rescues', '4 PAWS Animal Rescue', 'Dogs and cats', 'A rescue that takes in dogs and cats and finds them new homes.', null, null, 'https://www.4pawz.org/', '(757) 544-8565', '4pawz@cox.net', 'Hayes (Gloucester)', date '2026-10-25', true, 300),
  ('rescues', 'Animal Aid Society', 'Dogs', E'A volunteer-run, no-kill shelter for dogs.\n\nTakes owner surrenders when they have room, through a form on their website, with no fee. Adopters need to live within 40 miles.', null, null, 'https://www.animalaidsociety.org/', '(757) 865-0511', 'contact@animalaidsociety.org', 'Hampton', date '2026-10-25', true, 302),
  ('rescues', 'Anna Rescues Kittens', 'Cats and kittens', 'Cat and kitten rescue and adoption, with TNR, and a guide to what to do if you find a cat or kitten.', null, null, 'https://www.annarescueskittens.com/', null, 'info@annarescueskittens.com', 'Providence Forge (New Kent)', date '2026-10-25', true, 304),
  ('rescues', 'Billy the Kidden Rescue', 'Cats and kittens', 'TNR, kitten fostering and socializing, and trapping cats stuck in drains, attics and other tight spots.', null, null, 'https://www.billythekiddenrescue.org/', '(757) 327-7306', 'billythekiddenrescue@gmail.com', 'Virginia Beach', date '2026-10-25', true, 306),
  ('rescues', 'Clever Cats Rescue', 'Cats', 'TNR, socializing stray cats, and adoption.', null, null, 'https://clevercatsrescue.com/', null, 'clevercatsrescue@gmail.com', 'Hampton', date '2026-10-25', true, 308),
  ('rescues', 'Coastal Purrs Cat Rescue', 'Cats', E'A foster-based cat rescue, with trapping, a barn cat program, and care for cats with FIV and FeLV.\n\nTakes a limited number of owner surrenders, mostly from Virginia Beach, Norfolk, Chesapeake and Portsmouth.', null, null, 'https://www.coastalpurrscatrescue.com/', '1-833-757-7877', 'coastalpurrscatrescue@gmail.com', 'Virginia Beach', date '2026-10-25', true, 310),
  ('rescues', 'Critters 4 U Rescue', 'Mostly dogs, some cats', 'A foster-based rescue for chained, neglected, abused and medical-needs animals.', null, null, 'https://critters4urescueinc.org/', '(757) 335-0028', 'critters4urescue@yahoo.com', 'Gloucester', date '2026-10-25', true, 312),
  ('rescues', 'Furry Haven', 'Many kinds of animals', E'A home-based rescue for cats, dogs, small animals, reptiles, poultry and goats.\n\nTakes owner surrenders, for a fee of $20 to $75 depending on the animal.', null, null, 'https://www.furry-haven.com/', '(757) 969-2298', 'customerservice@furry-haven.com', 'Newport News', date '2026-10-25', true, 314),
  ('rescues', 'Hope For Life Rescue', 'Dogs and cats', E'Rescues at-risk dogs and cats from shelters, with an adoption center in Virginia Beach.\n\nDoesn''t usually take owner surrenders.', null, null, 'https://www.hopeforliferescue.com/', null, null, 'Virginia Beach', date '2026-10-25', true, 316),
  ('rescues', 'Kitten Chaos Plus Cat Rescue', 'Cats and kittens', 'A foster-based cat rescue, with Saturday adoption events at the Greenbrier PetSmart in Chesapeake.', null, null, 'https://www.kittenchaospluscatrescue.org/', null, 'info@kittenchaospluscatrescue.org', 'Virginia Beach', date '2026-10-25', true, 318),
  ('rescues', 'Lil Roar Cat Rescue', 'Cats', 'A cat rescue with regular adoption events.', null, 'Not taking in new cats for now (October 2026), while they look for more fosters and funding.', 'https://www.lilroarcatrescue.com/', null, 'lilroarcatrescue@gmail.com', 'Virginia Beach', date '2026-10-25', true, 320),
  ('rescues', 'P.A.W.S. (Poquoson Animal Welfare Sanctuary)', 'Cats', 'Cat rescue and adoption, TNR, help rehoming a cat, and a list of rescues and shelters around the region. Ask them about spay/neuter vouchers.', null, null, 'https://www.poquosonanimalwelfaresanctuary.com/', '(757) 868-1379', 'poqpaws@gmail.com', 'Poquoson', date '2026-10-25', true, 322),
  ('rescues', 'Paxton Feline Rescue', 'Cats', 'A foster-based cat rescue for feral cats and cats with special or medical needs, with TNR.', null, null, 'https://www.facebook.com/PaxtonFelineRescue', null, 'paxtonfelinerescue@gmail.com', 'Moyock, NC, serving Chesapeake, Virginia Beach and Portsmouth', date '2026-10-25', true, 324),
  ('rescues', 'Purrhaps It''s Serendipity', 'Cats', 'A home-based rescue and sanctuary for stray, feral and special-needs cats, with some TNR.', null, null, 'https://www.purrhapsrescue.com/', '(757) 784-4421', 'purrhapsitsserendipityinc@gmail.com', 'Newport News', date '2026-10-25', true, 326),
  ('rescues', 'Rainbow Animal Rescue', 'Dogs', 'A foster-based rescue for dogs of all breeds.', null, null, 'https://rainbowanimalrescue.net/', '(757) 472-1583', 'rainbowanimalrescueva@gmail.com', 'Norfolk', date '2026-10-25', true, 328),
  ('rescues', 'Symbiotic Inc.', 'Dogs and cats', E'Rescues dogs and cats from shelters, especially medical, special-needs and harder-to-place animals.\n\nDoesn''t take strays. Owner surrenders case by case.', null, null, 'https://symbioticinc.org/', '(757) 379-6555', 'info@symbioticinc.org', 'Suffolk', date '2026-10-25', true, 330),
  ('rescues', 'The Cat Corner', 'Cats', 'A no-kill cat shelter, open by appointment, with help for stray and feral cats and for rehoming.', null, null, 'https://www.thecatcornerinc.com/', '(757) 722-0590', 'info@thecatcornerinc.com', 'Hampton', date '2026-10-25', true, 332),
  -- hidden until Taea checks them
  ('rescues', 'Magpie & Daisy''s Pet Rescue', 'Dogs and cats', 'A foster-based rescue for dogs, cats and some other animals, serving Portsmouth, Suffolk, Chesapeake and Isle of Wight. Takes owner surrenders.', null, null, 'https://www.facebook.com/magpiedaisypetrescue', '(757) 737-9727', 'magpie_daisy_rescue@yahoo.com', 'Carrollton (Isle of Wight)', date '2026-10-25', false, 340),
  ('rescues', 'Cat Rescue, Inc.', 'Cats', 'A home-based foster cat rescue, with help for TNR.', null, null, null, '(757) 237-6112', null, 'Chesapeake', date '2026-10-25', false, 342),
  ('rescues', 'Pawsitively Precious Adoptions', 'Cats', 'Rescue and adoption for cats, mostly strays, with TNR.', null, null, null, null, 'adoptacat@ppava.org', 'Williamsburg', date '2026-10-25', false, 344),
  ('rescues', 'Ruff Road Pet Rescue', 'Mostly cats', 'Help with feral cat colonies, rehoming, and spay/neuter.', null, null, null, null, 'ruffroadpetrescue@gmail.com', 'Portsmouth', date '2026-10-25', false, 346),
  ('rescues', 'Serenity Trail Felines', 'Community cats', 'Spay/neuter, vaccines, TNR and socializing for community and stray cats.', null, 'At capacity for now.', 'https://www.serenitytrailfelines.com/', null, 'stfelines@yahoo.com', 'Norfolk', date '2026-10-25', false, 348),
  ('rescues', 'Paws 2 Rescue', 'Dogs and cats', 'A small dog and cat rescue that has held adoption events at the Greenbrier PetSmart.', null, null, 'https://paws2rescue.godaddysites.com/', '(757) 996-3444', 'paws2rescueme@gmail.com', 'Virginia Beach', date '2026-10-25', false, 350)
) as v(category, name, kind, description, best_for, caution, link_url, phone, email, area, checked_on, published, sort)
where not exists (select 1 from public.help_resources h where h.name = v.name);

-- Spay, neuter and community cats
insert into public.help_resources (category, name, kind, description, best_for, caution, link_url, more_url, more_label, phone, email, area, checked_on, published, sort)
select v.* from (values
  ('tnr', 'ART SpayHR Spay/Neuter Vouchers', 'Dogs and cats', E'Vouchers toward spaying or neutering your own dog or cat, for Hampton Roads residents who need help paying. One request form per pet.\n\nBook with one of their partner clinics, like the Virginia Beach SPCA Neuter Scooter or Fixin'' to Save, then email your appointment to ART at least a week ahead, and they''ll email you a voucher. Vouchers are $75 to $150 and may not cover the whole bill.', null, 'Not for community or feral cats.', 'https://artanimals.org/spayhr/contact', null, null, null, 'spayhr2010@gmail.com', 'All of Hampton Roads', date '2026-10-25', true, 400),
  ('tnr', 'PETA SNIP Mobile Clinics', 'Dogs and cats', 'Low-cost spay/neuter from mobile clinics around Hampton Roads, with prices based on income and financial help for those who qualify.', null, 'Appointments required: request one online or by phone. Cash or card only.', 'https://www.peta.org/about-peta/learn-about-peta/helping-animals-in-hampton-roads/snip/', null, null, '(757) 622-7382, option 3', null, 'Hampton Roads', date '2026-10-25', true, 402),
  ('tnr', 'Tips N ToeBeans', 'Cats', 'TNR for community cats, $140 per cat for the surgery, a rabies shot and an ear tip. Also helps colony caretakers, and has cats for adoption.', null, null, 'https://tipsntoebeans.com/', null, null, null, 'contact@tipsntoebeans.com', 'Hampton', date '2026-10-25', true, 404),
  ('tnr', 'Feral Affairs Network', 'Community cats', E'TNR for community cats, plus fostering, adoption through Catnip Cat Cafe in Norfolk, and homes for working cats.\n\nMainly Norfolk, Chesapeake, Portsmouth and Virginia Beach. Suffolk, Hampton and Newport News when they can.', null, null, 'https://www.feralaffairs.org/', 'https://www.feralaffairs.org/contact/', 'Contact form', null, null, 'Norfolk', date '2026-10-25', true, 406),
  ('tnr', 'Save Them Spay Them Love Them', 'Cats', 'Helps pay for TNR and spay/neuter for colony caretakers and cat owners with low incomes.', null, 'Still rebuilding after a fire in 2025, so they may be slower to answer.', 'https://www.facebook.com/savethemspaythemlovethem', null, null, null, 'savespaylove@gmail.com', 'Virginia Beach, serving Hampton Roads', date '2026-10-25', true, 408),
  ('tnr', 'No More Chasin'' Tails', 'Kittens and community cats', 'A foster-based kitten nursery for unweaned kittens, pregnant or nursing feral cats and friendly cats, with its own spay/neuter clinic.', null, 'The clinic is only for nonprofit rescues and feral cats right now, not pets. Email to book.', 'https://www.nomorechasintails.com/', null, null, '(757) 255-8804', 'nomorechasintails@gmail.com', 'Newport News', date '2026-10-25', true, 410),
  -- hidden until Taea checks them
  ('tnr', 'Operation Cat Snip', 'Community cats', 'TNR help and advocacy on the Peninsula.', null, null, 'https://www.facebook.com/operationcatsnipferal', null, null, null, 'feralcatcolonies@gmail.com', 'Newport News', date '2026-10-25', false, 420),
  ('tnr', 'Auburn Bachand', 'Community cats', 'A private TNR expert. Text first.', null, null, null, null, null, 'Text (757) 344-1498', null, null, date '2026-10-25', false, 422)
) as v(category, name, kind, description, best_for, caution, link_url, more_url, more_label, phone, email, area, checked_on, published, sort)
where not exists (select 1 from public.help_resources h where h.name = v.name);

-- Hidden until Taea checks it: their own website couldn't be read.
insert into public.help_resources (category, name, description, link_url, area, checked_on, published, sort)
select 'food', 'Pennies for P.A.W.S.', 'Free snuffle mats, blankets and DIY enrichment kits for shelters, rescues and pet owners, delivered in parts of Hampton Roads.', 'https://pennies-for-paws.org/', 'Smithfield', date '2026-10-25', false, 80
where not exists (select 1 from public.help_resources where name = 'Pennies for P.A.W.S.');

-- Apartments with no breed restrictions, as their own websites said on 2026-10-25
insert into public.help_resources (category, name, kind, description, link_url, area, checked_on, published, sort)
select v.* from (values
  ('breedhousing', '226 Oceana', 'Dogs and cats', 'No breed or weight restrictions. Up to 2 pets. $350 fee for the first pet and $150 for the second, plus $35 a month per pet.', 'https://www.226oceana.com/apartments/va/virginia-beach/pet-friendly', 'Virginia Beach', date '2026-10-25', true, 500),
  ('breedhousing', 'The Courtyards of Chanticleer', 'Dogs and cats', 'No breed restrictions. Up to 2 pets, with management approval. Weight limits may apply on upper floors.', 'https://www.courtyardsofchanticleer-prg.com/', 'Virginia Beach', date '2026-10-25', true, 502),
  ('breedhousing', 'Linkhorn Bay Apartments', 'Dogs and cats', 'No breed restrictions. Up to 2 pets, with management approval. Weight limits may apply on upper floors.', 'https://www.linkhornbayapartments-prg.com/', 'Virginia Beach', date '2026-10-25', true, 504),
  ('breedhousing', 'South Beach Apartments', 'Dogs and cats', 'No breed or weight restrictions for dogs. Up to 2 pets.', 'https://www.southbeachvb.com/', 'Virginia Beach', date '2026-10-25', true, 506),
  ('breedhousing', 'Marcella at Town Center', 'Dogs and cats', 'Dogs of all sizes and breeds, and cats. Up to 2 pets. $350 fee for one pet or $500 for two, plus $35 a month per pet. They ask for a photo and vet records.', 'https://boydhomes.com/marcella-at-town-center/', 'Hampton', date '2026-10-25', true, 510),
  ('breedhousing', 'Rivers Landing', 'Dogs and cats', 'No breed restrictions. Up to 2 pets, with management approval. Weight limits may apply on upper floors.', 'https://www.lifeatriverslanding.com/', 'Hampton', date '2026-10-25', true, 512),
  ('breedhousing', 'MAA Adalay Bay', 'Dogs and cats', 'All sizes and breeds, up to 2 pets. $400 fee per pet, plus $35 a month per pet.', 'https://www.maac.com/virginia/chesapeake/maa-adalay-bay/', 'Chesapeake', date '2026-10-25', true, 520),
  ('breedhousing', 'Gates of West Bay', 'Dogs and cats', 'No breed restrictions and no weight limit. Up to 2 pets. $350 fee for the first pet and $150 for the second, plus $35 a month.', 'https://www.gatesnorfolk.com/', 'Norfolk', date '2026-10-25', true, 522),
  -- hidden until someone calls: only listing sites say this, not the property itself
  ('breedhousing', 'Runaway Bay', 'Dogs and cats', 'Listing sites say no breed or weight restrictions and up to 3 pets, but the property''s own pet page says to call to confirm.', 'https://www.harborgroupmanagement.com/apartments/va/virginia-beach/runaway-bay/pet-friendly', 'Virginia Beach', date '2026-10-25', false, 530),
  ('breedhousing', 'Bayville Apartments', 'Dogs only', 'No cats. No breed restrictions, a 70 lb weight limit, and up to 2 pets.', null, 'Virginia Beach', date '2026-10-25', false, 532)
) as v(category, name, kind, description, link_url, area, checked_on, published, sort)
where not exists (select 1 from public.help_resources h where h.name = v.name);
