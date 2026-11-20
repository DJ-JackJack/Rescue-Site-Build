-- Matching content, 2026-11-21: a new draft pair, and the pairs the Send a Photo page starts out asking for.
-- * "The Tense Body Warning": Taea's idea, a dog showing warning signs (stiff body, tight mouth, hard eyes). A draft:
--   hidden, with no photo yet, for her to check like the others.
-- * wanted: the pairs that have no photo and none on the way. The Shake-Off is one of them: the wet husky photo isn't
--   used, since a wet dog shaking reads as drying off rather than shaking off stress.
-- Adds and ticks only; anything already there is left as it is.

insert into public.match_pairs (level, title, species, tile, cue, question, choices, answer, reward, photo_url, published, sort)
select 2, 'The Tense Body Warning', 'Dog',
  'A dog standing stiff and still, with a tight, closed mouth and hard, staring eyes.', null,
  'You matched the Tense Body Warning! What is this dog telling you?',
  '["\"I''m not comfortable. Please give me space.\"", "\"Come pet me!\"", "\"Let''s play fetch!\""]'::jsonb, 1,
  'That''s right! A stiff body, a tight mouth and hard eyes mean a dog needs space. Back away slowly and let them be.',
  null, false, 205
where not exists (select 1 from public.match_pairs where title = 'The Tense Body Warning');

update public.match_pairs set wanted = true
where photo_url is null and title in (
  'The Full-Body Shake-Off', 'The Swishing Cat Tail', 'The "Whale Eye" / Half-Moon Eye', 'The High, Stiff Flag Tail',
  'The Cat "Airplane Ears"', 'The Cat Belly Trap', 'The Raised Paw / "Hover Paw"', 'The Submissive Grin',
  'The Pilomotor Hackles / Raised Fur', 'The Cat Dilated "Saucer" Pupils', 'The Dog "Hard Stare" / Freeze Over Food',
  'The Cat "Skin Ripple" / Twitching Back', 'Goldfish Gulping at the Surface', 'Goldfish Hiding Behind the Plants',
  'The Tense Body Warning');
