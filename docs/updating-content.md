# Updating the site's content

Goals, animals, rescues, events and Sniffari programs live in the Supabase project **rescue-site**. Changes show on the site straight away; no rebuild is needed.

Until the simple editing page is built, make changes in the Supabase dashboard: **Table Editor**, pick the table, and edit the row. Or ask Claude in a session that has the Supabase connector, for example "set the hay round bales to 24, updated today".

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

The homepage stat ("X of Y dogs I featured were home within 3 months") appears by itself once at least 5 dogs were featured 3 or more months ago. Until then the site uses her own words.

## Rescues and shelters

In `partners`, an organization appears when both `feature_ok` and `published` are ticked. Filming an organization's animals (always done with consent) counts as OK to feature. Use the organization's proper full name. Add `website_url`, `adopt_url` and `donate_url` when you have them; `mission` only in their own words with their permission. Isle of Wight and Portsmouth Humane Society are in the table, hidden.

## Rescues on Sniffari

Add a row to `sniffari_programs` with the shelter, program, city, the shelter's public address, sign-up link, facts (like "Free", "Full day") and tags (`free`, `half`, `kids`, `first`). It shows once `published` is ticked; no shelter OK is needed for publicly advertised programs. Set `checked_on` whenever you confirm the details. Filter buttons only appear for tags at least one program has.

## Events

Add a row to `events` with the organization, `title`, `starts_on` (date), and optionally `time_text`, `place` and `link_url`. Tick `published`. Each event disappears by itself the day after it happens.

## Messages

Every form on the site lands in `messages`, tagged by topic (`partner`, `help`, `dog`, `sniffari`, `other`). Tick `handled` once it's dealt with. Only signed-in admins can read this table; the public site can't.

## Homepage wall photos

Put a photo in `site/assets/photos/` (for example `willow-woods.jpg`, cropped to 4:5), then set that photo's `data-img` in `site/pages/index.html` to `assets/photos/willow-woods.jpg`. This one needs a push to `main`.
