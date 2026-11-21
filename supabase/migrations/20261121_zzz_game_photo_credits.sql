-- Credits for photos people send for the games, 2026-11-21.
-- Someone who sends a photo through the Send a Photo page can give a name to be credited as. If Taea uses the photo,
-- she types that name into the pair's "Photo by" box herself: nothing is copied over on its own. A name shows only
-- while its pair is switched on and has a photo: under the photo when the pair is matched, and in the thank-you list
-- on the Send a Photo page.

alter table public.match_pairs add column if not exists photo_credit text check (length(photo_credit) <= 80);
