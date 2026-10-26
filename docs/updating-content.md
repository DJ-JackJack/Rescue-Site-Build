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

- `name`, `species` (dog, cat, horse, bird, other) and `status` (adopted, foster, sanctuary, looking, placed, unknown). "unknown" is for an animal she has lost touch with: the site says their status is unknown. They still count in the adoption stat, as not known to be home.
- Horses: `herd` (for example "Herd One") groups them on the Willow Woods page, and `sort` sets their order.
- `featured_on`: the date of the video. `adopted_on`: the adoption date. These two dates drive the adoption numbers.
- `transport`: tick it for transport runs like the puppy relay, so they don't count in the adoption stat.
- For a dog still looking: `listing_url` (the rescue's live listing) and `checked_on` (the date you last confirmed it's still available). If `checked_on` is more than 4 weeks old, the dog hides itself until it's re-checked.
- `people_ok`: untick it if a person shown or named hasn't agreed yet. The animal stays hidden until it's ticked.
- `published`: tick it to show the animal.
- `section`: `helped` (the default) shows them on Animals We've Helped: Happy Tails, the counts and the adoption stat. `spotlight` shows them on the Animal Story Spotlight page instead, grouped by where they live and then by herd. It's for animals in a forever home or a sanctuary, like the Willow Woods horses, which aren't up for adoption unless they're marked "looking".
- `story`: her story of the animal (up to 6,000 characters), shown first when someone taps them. A blank line starts a new paragraph.
- `journey`: the steps shown when someone taps the animal, in order, as a list like `[{"date": "2026-08-25", "label": "Featured", "detail": "Video posted"}]` (`date` and `detail` can be left out). Leave it `[]` and the site builds the steps from `featured_on` and `adopted_on`.
- `updates`: dated updates and notes, shown under the journey, newest first, as a list like `[{"date": "2026-10-19", "text": "Settling in at home"}]`.

The homepage stat ("X of Y dogs I featured were home within 3 months") appears by itself once at least 5 dogs were featured 3 or more months ago. Until then the site uses her own words.

## Rescues and shelters

In `partners`, an organization appears when both `feature_ok` and `published` are ticked. Filming an organization's animals (always done with consent) counts as OK to feature. Use the organization's proper full name. Add `website_url`, `adopt_url` and `donate_url` when you have them; `mission` only in their own words with their permission. `links` is a list of extra links (`[{"url": "https://…", "label": "Wish list"}]`) shown on their card under "More from them".

Each rescue's card on the Rescues page also shows its upcoming `events` and its `collabs` (collaborations): `partner_id`, `title`, `kind` (like "Portraits"), `starts_on`, and either `ends_on` or `ongoing`, plus optional `description`, `link_url` and `photo_url`. Whether one is coming up, happening now or done comes from its dates. Collaborations show while their rescue is shown. The Willow Woods page shows its own collaborations and links too. Isle of Wight County Animal Services and Portsmouth Humane Society are in the table, hidden for now. Frankie's Friends Animal Rescue is in the table too, hidden for good: they're no longer a partner.

## Rescues on Sniffari

Add a row to `sniffari_programs` with the shelter, program, city, the shelter's public address, sign-up link, extra `links` (same shape as a rescue's), facts (like "Free", "Full day") and tags (`free`, `half`, `kids`, `first`, `sleepover`). A program tagged `sleepover` also shows in the page's Sleepovers part, which is hidden while no program has the tag. It shows once `published` is ticked; no shelter OK is needed for publicly advertised programs. Set `checked_on` whenever you confirm the details. Filter buttons only appear for tags at least one program has.

The same page has three more parts, each hidden until it has a published row:

- `adventures` ("Our day outs"): `title`, `went_on`, `dogs`, `partner_id`, `story`, `videos` (`[{"url", "title"}]`), `photos` (a list of photo links, the first is the cover, up to 40) and `businesses` (`[{"url", "name"}]`, the places they went). YouTube videos play in the pop-up from youtube-nocookie.com, and only after play is tapped; other videos are links. `#day-out-<id>` on the page's address opens one.
- `videos`: videos of the dogs' day outs. `title`, `url` (an `https://` link to the post on TikTok, Instagram, YouTube or Facebook), and optionally `posted_on`, `note` and a cover `photo_url`. They're links, not embeds, so no outside scripts or cookies load on the page. They show by `sort`, then newest first.
- `places`: her dog-friendly places. `name`, `area` (a city or the public place, never a private address), `why`, and optionally `link_url` and `photo_url`.

## Foster programs

`foster_programs`, shown on the Foster page: `shelter_name`, `program_name`, `city`, `signup_url`, `facts`, `links`, `tags` (`free`, `dogs`, `cats`, `kittens`, `puppies`, `medical`, `short`, `sleepover`, `adopt`), `checked_on`, `sort`, `published`. `free` means the program says the animal's care is covered at no cost to the foster; the page counts them ("4 of the 9 programs listed here are free to foster"). Like day-out programs, publicly advertised programs need no shelter OK.

## Events

Add a row to `events` with the organization, `title`, `starts_on` (date), and optionally `time_text`, `place` and `link_url`. Tick `published`. Each event disappears by itself the day after it happens.

## Messages

Every form on the site lands in `messages`, tagged by topic (`partner`, `help`, `dog`, `sniffari`, `request`, `other`). `request` comes from the Requests and Questions page (/ask/): asking her to cover a topic, react to a video or answer a question, with what kind, a video link, how they would like an answer, and whether their name can be said in a video. Tick `handled` once it's dealt with. Only signed-in admins can read this table; the public site can't.

## Photos

Photos live in `site/assets/photos/` and go live with a push to `main`. Before adding one:

- **Strip the hidden data.** Phone photos can carry GPS location. Run it through `convert in.jpg -auto-orient -strip -resize 1000x1000 -quality 80 out.jpg` (ImageMagick), or any tool that removes location data.
- **Check the background.** No house, street, house number, license plate, mail or anything that points to a private home.
- **Crop out phone screens.** Screenshots often have player buttons or menus over them; crop those off, or ask for the original.
- Size: about 640×640 for animal cards, 480×600 (4:5) for the homepage wall, up to 1000 px for page photos.

Where they show up:

- **Framing:** `photo_frame` beside `photo_url` (animals, goals, collabs, videos, places), `frames` on `adventures` (by photo link), and `x`, `y`, `z` inside each photo of `page_photos`: `{"x": 0 to 100, "y": 0 to 100, "z": 1 to 4}`, the point of the photo that stays put (from its left and top, in percent) and how far it's zoomed in. Empty is centered. The site frames the photo with these numbers wherever it shows (`site/assets/pagephotos.js`), in any shape, and never cuts the photo itself. The edit page sets them by dragging and pinching.
- **An animal's photo:** set `photo_url` on the row in `animals` to the path, for example `assets/photos/dog-zazu.jpg`. It shows on Happy Tails, the rescue cards and the journey popup. A full `https://` link to a photo elsewhere works too.
- **A goal's photo:** set `photo_url` on the row in `goals` the same way.
- **Homepage wall:** set the photo's `data-img` in `site/pages/index.html`, for example `assets/photos/wall-willow-woods.jpg`, cropped to 4:5.
- **Other pages** (the book, Meet the Flock, the Spice litter, Sniffari) have their photos written into the page files in `site/pages/`.

If a photo can't load, the emoji placeholder shows instead.

The original files from the shared Drive folder are kept in `responses/drive-photos/` (private, never committed).

## Local help list

`help_resources`: `category` (food, vet, behavior, housing, rehoming, birds; financing for credit cards, loans and payment plans; abuse for where to report cruelty; wildlife for who to call about a wild animal; wildgroups for wildlife groups and sanctuaries; rescues for small local rescues; tnr for spay/neuter and community cat (TNR) help; breedhousing for apartments with no breed restrictions; and for people, on the Caring for Yourself page: crisis for crisis lines, dv for help when someone at home is hurting you, mental for mental health support, grief for pet loss support), `kind` and `best_for` (for financing: shown as a label like "Credit card", and as "Best for: …"), `name`, `description` (line breaks are kept), `link_url`, `phone` (extra words are fine; the call button dials the first number), `email`, `more_url` and `more_label` (a second link, like a free resource library), `caution` (shown in a yellow box, like "This is a credit card, not financial assistance"), `area` (a city, "All of Hampton Roads", or a public building's address; never a private home or a wildlife rehab or release site), `checked_on`, `sort`, `published`. Published rows show on the help page under their category; a category with none keeps its short description. The financing, small rescues, spay/neuter and breed-friendly apartment sections, and their links at the top of the page, each stay hidden until one of their rows is published. Wildlife rows show on both the help page and the Wildlife page.

## Photos on the pages

`page_photos`: photos added to any page from the edit page (Photos on the pages, or **📷 Photos on this page** on the site while signed in), and photos that came with the site that have been changed or hidden.

- `page`: the page, like `help` or `home`.
- `spot`: where it goes. The build marks every spot (`site/photospots.mjs`): `before:b.help.1a2b3c4d` is just above one part of the page, `after:…` just below the last part of a section or box. The key is a fingerprint of that part's own words, like a wording key, so a photo stays put when other parts move or the wording is changed from the edit page. If the words are rewritten in the code, the spot is gone: the photo stops showing and the edit page asks for a new spot. A photo that came with the site has a key like `i.stories.fa087f83`: every photo from `assets/photos` in a page (also inside a decorative frame, like the relay card on the home page), and each photo on the home page photo wall, which site.js draws from `data-img` (keyed by file name, or by its label when it has none, like Wildlife).
- `layout`: `full`, `banner`, `left` or `right` (two columns, the photo beside the part of the page just below its spot, with the text under it when that part is a heading), `small`, `row` (up to 12 photos; tapped ones open bigger), or `swap` for a photo that came with the site (its one photo takes the original's place, in the original's shape; no photo hides the original). That photo can be the original itself (`assets/photos/…`), reframed.
- `photos`: `[{"url": "https://…", "alt": "…", "w": 1600, "h": 1200}]`. Uploads go to `pages/<page>/` in the photos bucket.
- `shape`: for `full`, `small`, `left` and `right`, the shape it's cut to: `original` (the photo's own), `square`, `wide` (16:9) or `tall` (4:5). Each photo's framing (`x`, `y`, `z`) chooses what shows in it.
- `caption`, `sort` (photos in the same spot, lower first), `published`.

The build puts saved photos into the pages, the same way as saved wording, and site.js puts in anything saved since (both use `site/assets/pagephotos.js`). Deleted ones can be restored from Recently deleted.

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

- **In the database:** every change or delete to the site's content keeps a copy of the row as it was, for 90 days, in `content_history` (only editors can read it). Deleted messages are kept the same way. The edit page's **Recently deleted** screen restores deleted rows (`restore_deleted`), together with anything deleted at the same time, like a goal's lines. **Remove for good** deletes every saved copy of it. Earlier versions of an edited row aren't on the edit page; they can be put back with SQL from `content_history` (`op = 'update'`). A nightly database job (`clear-old-history`, pg_cron, `20261024_privacy.sql`) deletes copies older than 90 days, so the Privacy page's 90 days always holds.
- **Photo files:** a photo uploaded from the edit page stays at its address until its file is deleted. The edit page deletes files nothing uses any more (not on any row, shown or hidden, and not on anything in Recently deleted) once a day when an editor opens the start screen, and straight after a save that replaces or removes a photo. Files uploaded in the last 2 days are left alone, in case a form with them hasn't been saved yet.
- **Off-site, weekly:** `.github/workflows/backup.yml` runs `tools/backup-content.mjs` every Monday. It saves the public content (every table the site shows) and the photos uploaded from the edit page, and keeps each copy for 90 days: Actions tab → **Back up site content** → a run → the `site-content-...` file under Artifacts. It uses the public key, so hidden rows and messages aren't in it; that's what makes it safe in a public repo. It can also be run by hand (Run workflow).

## Message notifications

Editors can get a phone notification for each new message (Web Push, no app or extra account):

- **Signing up a device:** edit page → Messages → **Turn on notifications**. The browser signs up with its push service (Google, Apple, Mozilla or Microsoft) and the sign-up is saved in `push_subscriptions` (editors only). iPhones and iPads only allow this for web apps on the Home Screen. `site/edit-sw.js`, published as `/edit/sw.js`, shows the notifications and opens Messages when one is tapped.
- **Sending:** after each new message, the trigger `messages_notify` asks the Edge Function `notify-message` (`supabase/functions/notify-message/`) to announce it, through `pg_net`, so the form never waits and a problem there can't lose a message. The function trusts nothing in the call: `push_claim` marks the messages not yet announced (`messages.notified_at`) and returns only their topic and name. Each notification is encrypted for the device it goes to, and says the topic and who it's from, never the message. Devices that turned notifications off are forgotten automatically.
- **Keys:** the function makes its VAPID keys on first use and keeps them in `push_state`, which only the server can read. Nobody has to handle them.
- **If notifications stop:** open Messages on that device and tap **Send a test**. If the test doesn't arrive, turn them off and on again there. The function's logs are in the Supabase dashboard under Edge Functions → notify-message → Logs.
- **Updating the function:** it's deployed with `verify_jwt` off, because it checks callers itself. Redeploy it from `supabase/functions/notify-message/` with the same setting.

## Visitor counts

The site counts page views itself, with no cookies and nothing about the visitor: `count_view` adds 1 to today's row in `page_views` (page + day) and, when someone arrives from outside the site, to `visit_sources` (TikTok, google, direct, or the other site's name). `?from=tiktok` on a link sets the source and is taken off the address. On the "Page not found" page it also adds 1 to the address that was tried in `missed_pages` (just the path, like `/happy-tails`, never anything after a `?` or `#`), so a mistyped or old link that people keep using shows up. A day holds at most 60 pages, 40 sources and 30 addresses not found, so junk can't pile up. Bots, and devices signed in to the edit page (or set to skip), aren't counted. Only editors can read the numbers, through `visitor_summary` on the **Visitors** screen; **Start the counts fresh** (`clear_visitor_counts`) empties them, for launch day.

## Checking the live site

`.github/workflows/check-site.yml` runs `tools/check-site.mjs` after every deploy: every page in the sitemap loads, link previews point at the site's address and their images load, preview mode is the same on every page, the edit page is hidden from search engines, missing pages get the 404 page, and the database answers. With a custom domain it also checks the domain's DNS records, HTTPS, the `www.` address and the old github.io links. A failure shows red on the Actions tab, and GitHub sends its usual failure email. Run it by hand from the Actions tab any time.

## Keeping the database awake

Free Supabase projects pause after about a week with very little use, and a paused project stops the live content and the edit page. `.github/workflows/keep-awake.yml` reads a little public data twice a day so that doesn't happen. If it ever finds the project paused, the run fails and GitHub sends a failure email: open the Supabase dashboard and choose **Resume project**. It can also be run by hand from the Actions tab (Keep database awake → Run workflow).

GitHub turns off scheduled workflows in a public repo after 60 days without a commit. It emails a warning first; the **Enable workflow** button on the Actions tab (or any commit) turns it back on.
