# Rescue-Site-Build

The website for TheTerr0rTw!ns (tae): rescue features, shelter goals, dog day outs and education around Hampton Roads, Virginia.

## How it fits together

- **`site/`** is the website. `node site/build.mjs` turns it into `_site/` (git-ignored). No packages to install.
  - `site/pages/` has one file per page. The first line is a small JSON header (title, description, menu key, URL path).
  - `site/layout.html` is the shared header, menu and footer.
  - `site/assets/site.css` holds the styles; `site/assets/site.js` runs the menu, forms, the hanging photo wall and the live content.
- **Live content** (shelter goals, the proof wall of animals, rescues, Sniffari programs) comes from the Supabase project **rescue-site**. The page reads it with the public key, which can only see published, approved rows. The tables and their rules are in `supabase/migrations/`.
- **Forms** send to a private inbox (the `messages` table) through one checked, rate-limited function. The public can't read it.
- **Publishing:** every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy-site.yml`).
- **Preview mode** is on until launch: the site is hidden from search engines and shows a preview banner. To launch, set the repository variable `SITE_PREVIEW` to `0`.
- **`questionnaire/`** is the original planning questionnaire. It still works at `/questionnaire/`, and its answers stay in the `questionnaire_responses` table.

Updating goals, animals, rescues and programs: see `docs/updating-content.md`.

## Rules the site is built around

- Donations always go to the shelter's own page. The site never handles money.
- No private addresses or locations: not her home, not wildlife rehab or release sites, nothing that could lead to a private residence or person. The region (Hampton Roads) is fine; her city is not. Public buildings (like a city shelter) can show their address.
- A rescue or shelter appears once it has OK'd being featured (`feature_ok`). Animals are only filmed with their owner's or caretaker's consent, so an organization whose animals she has filmed counts as OK'd. A plain link to an organization's public website never needs permission.
- Rescues on Sniffari lists publicly advertised day-out programs; no shelter OK is needed.
- Her published name is a pen name, set once in `site/build.mjs` (`OWNER`).
- Numbers are never invented. The adoption stat appears only once there are enough real records, and goals show "coming soon" until the shelter reports figures.

## Planning material

- `docs/site-brief-template.md`, `docs/pulling-answers.md` and `tools/render-answers.mjs` came from the planning stage.
- `responses/` (git-ignored, never committed) holds her answers, the brief, the mockup and the review. This repo is public.
