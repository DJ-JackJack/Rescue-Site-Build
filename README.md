# Rescue-Site-Build

The website for TheTerr0rTw!ns (tae): rescue features, shelter goals, dog day outs and education around Hampton Roads, Virginia.

## How it fits together

- **`site/`** is the website. `node site/build.mjs` turns it into `_site/` (git-ignored). No packages to install.
  - `site/pages/` has one file per page. The first line is a small JSON header (title, description, menu key, URL path).
  - `site/layout.html` is the shared header, menu and footer.
  - `site/assets/site.css` holds the styles; `site/assets/site.js` runs the menu, forms, the hanging photo wall and the live content.
- **Live content** (shelter goals, the proof wall of animals and their stories, the Animal Story Spotlight, rescues with their events, collaborations and extra links, Sniffari programs, day outs, day-out videos and dog-friendly places, foster programs, the local help list, and the help for people on Caring for Yourself) comes from the Supabase project **rescue-site**. The page reads it with the public key, which can only see published, approved rows. The tables and their rules are in `supabase/migrations/`.
- **Forms** send to a private inbox (the `messages` table) through one checked, rate-limited function. The public can't read it.
- **The edit page** (`site/edit.html`, `site/assets/edit.js`) signs in with Supabase Auth. Only emails in the `admins` table can change anything; the database enforces it with row-level security. Photos upload to the public `photos` storage bucket after being shrunk and stripped of hidden data in the browser.
- **Link previews and icons:** each page gets a title, description and share image for Facebook, texts and TikTok links (`site/assets/share/<page>.jpg`, else `default.jpg`). The paw icon is `site/assets/icon.svg`, with PNG sizes beside it. A sitemap is written for search engines, and listed in `robots.txt` once the site launches.
- **Publishing:** every push to `main`, and a nightly run, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy-site.yml`).
- **Editable wording:** the build gives every piece of text a key (`site/wording.mjs`) and builds in wording saved from the edit page; `site.js` applies anything saved since. See `docs/updating-content.md`.
- **Safety nets:** the database keeps 90 days of copies of anything edited or deleted (the edit page's "Recently deleted"), and `.github/workflows/backup.yml` saves the public content and uploaded photos every week. After every deploy, `.github/workflows/check-site.yml` checks the live site from the outside.
- **Message notifications:** editors can turn on phone notifications for new messages from the edit page. A database trigger calls the Edge Function in `supabase/functions/notify-message/`, which sends an encrypted Web Push to each signed-up device.
- **Visitor counts:** the site counts page views and where visits come from in its own database, with no cookies. Editors see them on the edit page.
- **Keeping the database awake:** `.github/workflows/keep-awake.yml` reads a little public data twice a day so the free Supabase project doesn't pause. See `docs/updating-content.md`.
- **Launched** at https://terrortwinsflock.com. Preview mode (hidden from search engines, with a preview banner) is off: the repository variable `SITE_PREVIEW` is `0`. How the launch went, step by step: `docs/launch-checklist.md`.
- **Database address and public key** are in `site/supabase.json`, read by the build, the weekly backup and the keep-awake job.

**Editing:** the private edit page at `/edit/` (sign-in required) updates animals, goals, events, rescues, Sniffari programs, the local help list, any wording on the site, and photos, restores recent deletes, shows visitor counts, and turns on notifications for new messages. Plain-language guide: `docs/editing-guide.md`. What each setting does underneath: `docs/updating-content.md`.

## Rules the site is built around

- Donations always go to the shelter's own page, and the site never handles money. The Buy Me a Coffee link on Shelter Goals and her Patreon are the things that aren't for a shelter: they're labeled as going to her, and they're paid on those sites.
- The help page's credit cards and loans are labeled as credit, with a "we don't endorse these" note, and stay hidden until Taea switches on the ones that have helped her.
- The Animal Guardian Alliance page shares only what's decided. Its draft mission statement and anything still being worked out stay off the site until Taea approves them. Children's names and details never appear on the site.
- No private addresses or locations: not her home, not wildlife rehab or release sites, nothing that could lead to a private residence or person. The region (Hampton Roads) is fine; her city is not. Public buildings (like a city shelter) can show their address.
- A rescue or shelter appears once it has OK'd being featured (`feature_ok`). Animals are only filmed with their owner's or caretaker's consent, so an organization whose animals she has filmed counts as OK'd. A plain link to an organization's public website never needs permission.
- Rescues on Sniffari lists publicly advertised day-out programs; no shelter OK is needed.
- Her published name is a pen name, set once in `site/build.mjs` (`OWNER`). Her Patreon address is set there too (`LINKS.patreon`); every Patreon link stays hidden while it's empty.
- Photos have their hidden data (like GPS location) stripped before they're added, and nothing in the background can point to a private home. See `docs/updating-content.md`.
- The Privacy page (`site/pages/privacy.html`) says exactly what the site keeps. If the forms, the visit counts or the services behind the site change, update it to match.
- Numbers are never invented. The adoption stat appears only once there are enough real records, and goals show "coming soon" until the shelter reports figures.

## Planning material

- The planning questionnaire and its tools were removed once the site launched; they're in the git history. Her answers stay in the `questionnaire_responses` table.
- `responses/` (git-ignored, never committed) holds working copies of her answers, the brief, the mockup and the review. This repo is public.
