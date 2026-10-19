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
- `story`: her story of the animal (up to 6,000 characters), shown first when someone taps them. A blank line starts a new paragraph.
- `journey`: the steps shown when someone taps the animal, in order, as a list like `[{"date": "2026-08-25", "label": "Featured", "detail": "Video posted"}]` (`date` and `detail` can be left out). Leave it `[]` and the site builds the steps from `featured_on` and `adopted_on`.
- `updates`: dated updates and notes, shown under the journey, newest first, as a list like `[{"date": "2026-10-19", "text": "Settling in at home"}]`.

The homepage stat ("X of Y dogs I featured were home within 3 months") appears by itself once at least 5 dogs were featured 3 or more months ago. Until then the site uses her own words.

## Rescues and shelters

In `partners`, an organization appears when both `feature_ok` and `published` are ticked. Filming an organization's animals (always done with consent) counts as OK to feature. Use the organization's proper full name. Add `website_url`, `adopt_url` and `donate_url` when you have them; `mission` only in their own words with their permission. Isle of Wight County Animal Services, Portsmouth Humane Society and Frankie's Friends Animal Rescue are in the table, hidden for now.

## Rescues on Sniffari

Add a row to `sniffari_programs` with the shelter, program, city, the shelter's public address, sign-up link, facts (like "Free", "Full day") and tags (`free`, `half`, `kids`, `first`). It shows once `published` is ticked; no shelter OK is needed for publicly advertised programs. Set `checked_on` whenever you confirm the details. Filter buttons only appear for tags at least one program has.

The same page has two more parts, each hidden until it has a published row:

- `videos`: videos of the dogs' day outs. `title`, `url` (an `https://` link to the post on TikTok, Instagram, YouTube or Facebook), and optionally `posted_on`, `note` and a cover `photo_url`. They're links, not embeds, so no outside scripts or cookies load on the page. They show by `sort`, then newest first.
- `places`: her dog-friendly places. `name`, `area` (a city or the public place, never a private address), `why`, and optionally `link_url` and `photo_url`.

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

`help_resources`: `category` (food, vet, behavior, housing, rehoming, birds), `name`, `description` (line breaks are kept), `link_url`, `phone` (extra words are fine; the call button dials the first number), `email`, `more_url` and `more_label` (a second link, like a free resource library), `caution` (shown in a yellow box, like "This is a credit card, not financial assistance"), `area` (a city, "All of Hampton Roads", or a public building's address; never a private home or a wildlife rehab or release site), `checked_on`, `sort`, `published`. Published rows show on the help page under their category; a category with none keeps its short description.

## Page wording

Every piece of wording on the site can be changed from the edit page (Page wording). Saved wording is in `site_text`, one row per `key`; an empty `body` means the original words.

- **Keys come from the build** (`site/wording.mjs`). Each text on a page gets one: `w.<page>.<fingerprint>` for text, `a.<page>.<fingerprint>` for photo descriptions and form hints, `p.<page>.title` / `.description` for the page title and description. The shared header, menu, footer and contact form use the page name `all`. The fingerprint comes from the words themselves, so a saved change follows the words even if the page around them moves. If the original words are changed in the page file, the old saved change stops applying, and the edit page lists it under "Saved wording that's no longer on the site".
- **Longer blocks** marked `data-text="key" data-label="..."` in a page file (like `home.intro`, `about.body`) are edited as one piece, with blank lines for paragraphs and `## ` for headings.
- **The site's own phrases** (labels, counts, empty lists, form replies) are the `t("js.key", "Default words {name}")` calls in `site/assets/site.js`. The build lists them; `{name}` parts are filled in by the script.
- **New text needs nothing extra:** anything added to a page is editable after the next build. Text the script writes live (counts, the journey pop-up, form replies) is skipped on the page and edited through its `t()` phrases.
- **Built in, then kept fresh:** the build reads `site_text` and builds saved wording into the pages (`SITE_TEXT_FILE` swaps in a JSON file for tests). The deploy workflow runs on every push and every night at about 4 AM, so link previews and search engines see the latest. In between, `site.js` puts in anything saved since the last build, and puts the original back if a change was undone (`data-t-orig`).

## Who can edit

The `admins` table lists the email addresses allowed to edit. It can't be read or changed from the site; add a row in the Table Editor or with SQL. Accounts are made in Authentication → Users ("Allow new users to sign up" stays off).

## Recently deleted and backups

- **In the database:** every change or delete to the site's content keeps a copy of the row as it was, for 90 days, in `content_history` (only editors can read it). Deleted messages are kept the same way. The edit page's **Recently deleted** screen restores deleted rows (`restore_deleted`), together with anything deleted at the same time, like a goal's lines. **Remove for good** deletes every saved copy of it. Earlier versions of an edited row aren't on the edit page; they can be put back with SQL from `content_history` (`op = 'update'`).
- **Off-site, weekly:** `.github/workflows/backup.yml` runs `tools/backup-content.mjs` every Monday. It saves the public content (every table the site shows) and the photos uploaded from the edit page, and keeps each copy for 90 days: Actions tab → **Back up site content** → a run → the `site-content-...` file under Artifacts. It uses the public key, so hidden rows and messages aren't in it; that's what makes it safe in a public repo. It can also be run by hand (Run workflow).

## Message notifications

Editors can get a phone notification for each new message (Web Push, no app or extra account):

- **Signing up a device:** edit page → Messages → **Turn on notifications**. The browser signs up with its push service (Google, Apple, Mozilla or Microsoft) and the sign-up is saved in `push_subscriptions` (editors only). iPhones and iPads only allow this for web apps on the Home Screen. `site/edit-sw.js`, published as `/edit/sw.js`, shows the notifications and opens Messages when one is tapped.
- **Sending:** after each new message, the trigger `messages_notify` asks the Edge Function `notify-message` (`supabase/functions/notify-message/`) to announce it, through `pg_net`, so the form never waits and a problem there can't lose a message. The function trusts nothing in the call: `push_claim` marks the messages not yet announced (`messages.notified_at`) and returns only their topic and name. Each notification is encrypted for the device it goes to, and says the topic and who it's from, never the message. Devices that turned notifications off are forgotten automatically.
- **Keys:** the function makes its VAPID keys on first use and keeps them in `push_state`, which only the server can read. Nobody has to handle them.
- **If notifications stop:** open Messages on that device and tap **Send a test**. If the test doesn't arrive, turn them off and on again there. The function's logs are in the Supabase dashboard under Edge Functions → notify-message → Logs.
- **Updating the function:** it's deployed with `verify_jwt` off, because it checks callers itself. Redeploy it from `supabase/functions/notify-message/` with the same setting.

## Visitor counts

The site counts page views itself, with no cookies and nothing about the visitor: `count_view` adds 1 to today's row in `page_views` (page + day) and, when someone arrives from outside the site, to `visit_sources` (TikTok, google, direct, or the other site's name). `?from=tiktok` on a link sets the source and is taken off the address. A day holds at most 60 pages and 40 sources, so junk can't pile up. Bots, and devices signed in to the edit page (or set to skip), aren't counted. Only editors can read the numbers, through `visitor_summary` on the **Visitors** screen; **Start the counts fresh** (`clear_visitor_counts`) empties them, for launch day.

## Checking the live site

`.github/workflows/check-site.yml` runs `tools/check-site.mjs` after every deploy: every page in the sitemap loads, link previews point at the site's address and their images load, preview mode is the same on every page, the edit page is hidden from search engines, missing pages get the 404 page, and the database answers. With a custom domain it also checks the domain's DNS records, HTTPS, the `www.` address and the old github.io links. A failure shows red on the Actions tab, and GitHub sends its usual failure email. Run it by hand from the Actions tab any time.

## Keeping the database awake

Free Supabase projects pause after about a week with very little use, and a paused project stops the live content and the edit page. `.github/workflows/keep-awake.yml` reads a little public data twice a day so that doesn't happen. If it ever finds the project paused, the run fails and GitHub sends a failure email: open the Supabase dashboard and choose **Resume project**. It can also be run by hand from the Actions tab (Keep database awake → Run workflow).

GitHub turns off scheduled workflows in a public repo after 60 days without a commit. It emails a warning first; the **Enable workflow** button on the Actions tab (or any commit) turns it back on.
