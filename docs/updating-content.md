# Updating the site's content

Goals, animals, rescues, events, Sniffari programs, the local help list and some page wording live in the Supabase project **rescue-site**. Changes show on the site straight away; no rebuild is needed.

**The easy way is the edit page at `/edit/`.** See `docs/editing-guide.md`. This document explains what each setting does underneath, for anyone working in the Supabase dashboard (**Table Editor**) instead.

## Shelter goals

- **New figures from a shelter:** in `goal_bars`, set `current` on each bar. Then in `goals`, set `figures_updated_at` to today's date. The site shows "Updated N days ago". After 14 days without an update, it says "An update is coming" in place of the old numbers.
- **Donation link:** set `donate_url` on the goal to the shelter's own donation page. Until then the card says "Donation link coming soon".
- **Goal met:** set `status` to `met` and `met_on` to the date. It moves to "Goals met".
- **Homepage goal:** the homepage shows the active goal with `featured` ticked.

## Animals (the proof wall)

Add a row to `animals`:

- `name`, `species` (dog, cat, horse, bird, other) and `status` (adopted, foster, sanctuary, looking, placed).
- Horses: `herd` (for example "Herd One") groups them on the Willow Woods page, and `sort` sets their order.
- `featured_on`: the date of the video. `adopted_on`: the adoption date. These two dates drive the adoption numbers.
- `transport`: tick it for transport runs like the puppy relay, so they don't count in the adoption stat.
- For a dog still looking: `listing_url` (the rescue's live listing) and `checked_on` (the date you last confirmed it's still available). If `checked_on` is more than 4 weeks old, the dog hides itself until it's re-checked.
- `people_ok`: untick it if a person shown or named hasn't agreed yet. The animal stays hidden until it's ticked.
- `published`: tick it to show the animal.
- `journey`: the steps shown when someone taps the animal, in order, as a list like `[{"date": "2026-08-25", "label": "Featured", "detail": "Video posted"}]` (`date` and `detail` can be left out). Leave it `[]` and the site builds the steps from `featured_on` and `adopted_on`.

The homepage stat ("X of Y dogs I featured were home within 3 months") appears by itself once at least 5 dogs were featured 3 or more months ago. Until then the site uses her own words.

## Rescues and shelters

In `partners`, an organization appears when both `feature_ok` and `published` are ticked. Filming an organization's animals (always done with consent) counts as OK to feature. Use the organization's proper full name. Add `website_url`, `adopt_url` and `donate_url` when you have them; `mission` only in their own words with their permission. Isle of Wight County Animal Services, Portsmouth Humane Society and Frankie's Friends Animal Rescue are in the table, hidden for now.

## Rescues on Sniffari

Add a row to `sniffari_programs` with the shelter, program, city, the shelter's public address, sign-up link, facts (like "Free", "Full day") and tags (`free`, `half`, `kids`, `first`). It shows once `published` is ticked; no shelter OK is needed for publicly advertised programs. Set `checked_on` whenever you confirm the details. Filter buttons only appear for tags at least one program has.

## Events

Add a row to `events` with the organization, `title`, `starts_on` (date), and optionally `time_text`, `place` and `link_url`. Tick `published`. Each event disappears by itself the day after it happens.

## Messages

Every form on the site lands in `messages`, tagged by topic (`partner`, `help`, `dog`, `sniffari`, `other`). Tick `handled` once it's dealt with. Only signed-in admins can read this table; the public site can't.

## Photos

Photos live in `site/assets/photos/` and go live with a push to `main`. Before adding one:

- **Strip the hidden data.** Phone photos can carry GPS location. Run it through `convert in.jpg -auto-orient -strip -resize 1000x1000 -quality 80 out.jpg` (ImageMagick), or any tool that removes location data.
- **Check the background.** No house, street, house number, license plate, mail or anything that points to a private home.
- **Crop out phone screens.** Screenshots often have player buttons or menus over them; crop those off, or ask for the original.
- Size: about 640×640 for animal cards, 480×600 (4:5) for the homepage wall, up to 1000 px for page photos.

Where they show up:

- **An animal's photo:** set `photo_url` on the row in `animals` to the path, for example `assets/photos/dog-zazu.jpg`. It shows on Happy Tails, the rescue cards and the journey popup. A full `https://` link to a photo elsewhere works too.
- **A goal's photo:** set `photo_url` on the row in `goals` the same way.
- **Homepage wall:** set the photo's `data-img` in `site/pages/index.html`, for example `assets/photos/wall-willow-woods.jpg`, cropped to 4:5.
- **Other pages** (the book, Meet the Flock, the Spice litter, Sniffari) have their photos written into the page files in `site/pages/`.

If a photo can't load, the emoji placeholder shows instead.

The original files from the shared Drive folder are kept in `responses/drive-photos/` (private, never committed).

## Local help list

`help_resources`: `category` (food, vet, behavior, housing, rehoming, birds), `name`, `description`, `link_url`, `phone`, `area` (a city or "All of Hampton Roads", never a private address), `checked_on`, `sort`, `published`. Published rows show on the help page under their category; a category with none keeps its short description.

## Page wording

`site_text`: one row per editable piece of wording, by `key` (for example `home.intro`, `about.body`). An empty `body` means the page's own words. In a page file, `data-text="key" data-label="..."` marks wording as editable; the edit page picks it up on the next build.

## Who can edit

The `admins` table lists the email addresses allowed to edit. It can't be read or changed from the site; add a row in the Table Editor or with SQL. Accounts are made in Authentication → Users ("Allow new users to sign up" stays off).

## Keeping the database awake

Free Supabase projects pause after about a week with very little use, and a paused project stops the live content and the edit page. `.github/workflows/keep-awake.yml` reads a little public data twice a day so that doesn't happen. If it ever finds the project paused, the run fails and GitHub sends a failure email: open the Supabase dashboard and choose **Resume project**. It can also be run by hand from the Actions tab (Keep database awake → Run workflow).

GitHub turns off scheduled workflows in a public repo after 60 days without a commit. It emails a warning first; the **Enable workflow** button on the Actions tab (or any commit) turns it back on.
