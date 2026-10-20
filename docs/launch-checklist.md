# Launch day

Everything needed to move the site from `dj-jackjack.github.io/Rescue-Site-Build` to its own domain and open it to search engines. Set aside about 30 minutes; most of that is waiting for DNS and HTTPS.

The domain is **terrortwinsflock.com**, registered at Porkbun.

## Before the day

- [ ] Read every page on your phone once, as a visitor would. Anything still hidden in the editor (help listings, wildlife contacts) stays hidden after launch until it's switched on.
- [x] Buy the domain. Domain only, no add-ons, with privacy protection on.

## 1. Prove the domain is yours (5 minutes)

This stops anyone else from pointing the domain at their own GitHub site.

- [ ] On GitHub: your profile picture → **Settings** → **Pages** (left side, under "Code, planning, and automation") → **Add a domain**. Type `terrortwinsflock.com`.
- [ ] GitHub shows a TXT record. Add it at Porkbun (step 2 shows where): Type **TXT**, Host `_github-pages-challenge-dj-jackjack`, Answer the code GitHub shows. Then click **Verify** on GitHub. It can take a few minutes to go through.

## 2. Point the domain at GitHub (5 minutes)

At Porkbun, sign in → **Domain Management** → next to terrortwinsflock.com, **DNS** (on a phone, tap the domain first). Each record is added at the top (Type, Host, Answer, then **Add**) and listed underneath, with a trash can to delete it.

- [ ] Delete Porkbun's two parking records, both pointing to `uixie.porkbun.com`: the **ALIAS** record with a blank host, and the **CNAME** record with host `*`.
- [ ] Add these records. Leave Host blank where it says so, and TTL at the default.

| Type | Host / Name | Answer / Value |
|---|---|---|
| A | (blank) | `185.199.108.153` |
| A | (blank) | `185.199.109.153` |
| A | (blank) | `185.199.110.153` |
| A | (blank) | `185.199.111.153` |
| AAAA | (blank) | `2606:50c0:8000::153` |
| AAAA | (blank) | `2606:50c0:8001::153` |
| AAAA | (blank) | `2606:50c0:8002::153` |
| AAAA | (blank) | `2606:50c0:8003::153` |
| CNAME | `www` | `dj-jackjack.github.io` |

- [ ] Once the domain is saved in step 3, the live check (step 5) checks these records too.

## 3. Tell GitHub Pages about the domain (2 minutes, then waiting)

- [ ] **First, turn off message notifications on the old address.** On every phone or computer that gets them, open the editor, go to **Messages** and tap **Turn off on this device**. Each phone ties its notifications to the address they were set up on, and once the next step is saved, the old address forwards to the new one, so this is the last chance to open it. Skipping this doesn't break anything: you'd just get every alert twice after you turn them on again in step 5.
- [ ] Repo → **Settings** → **Pages** → **Custom domain**: type `terrortwinsflock.com` and **Save**. GitHub checks the DNS. That can take a few minutes, or up to a day if the records are slow to spread.
- [ ] When it says the DNS check passed, tick **Enforce HTTPS**. If the box is greyed out, the certificate is still being made; check back in 15 to 60 minutes.

## 4. Turn off preview mode (2 minutes)

- [ ] Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**. Name `SITE_PREVIEW`, value `0`.
- [ ] **Actions** → **Deploy site** → **Run workflow**. This rebuilds the site for the new address with preview mode off: no banner, open to search engines, and link previews, the sitemap and the edit page all use `terrortwinsflock.com`.

## 5. Check it (5 minutes)

- [ ] **Actions** → **Check live site** → **Run workflow** (leave the address empty). It also runs by itself after every deploy. All green means: every page loads, link previews point at `terrortwinsflock.com` and their pictures load, search engines are let in (but not to /edit/), `http://` and `www.` forward to `https://terrortwinsflock.com`, and the old github.io links forward too.
- [ ] Open `https://terrortwinsflock.com/edit/` and sign in again (sign-in is remembered per address). On phones, remove the old "Site editor" home screen icon and add the new one.
- [ ] Turn message notifications back on, on each device: editor → **Messages** → **Turn on notifications** → **Allow**, then **Send a test**. On iPhone and iPad, do it from the new Home Screen icon. If alerts start arriving twice, a device missed the first part of step 3; Claude can clear the old sign-ups from the database.
- [ ] Edit page → **Visitors** → **Start the counts fresh**, so the numbers only show real visitors from launch on.

## 6. Spread the word

- [ ] Update the links in her TikTok, Instagram, YouTube and Facebook bios. Add `?from=` so the Visitors screen knows where people came from: `https://terrortwinsflock.com/?from=tiktok`, `?from=instagram`, `?from=youtube`, `?from=facebook`.
- [ ] Facebook may still show an old preview for a link it has seen before. Paste the link into Facebook's **Sharing Debugger** and click **Scrape Again**.
- [ ] **Google Search Console** (search.google.com/search-console): add a **Domain** property for `terrortwinsflock.com`, verify it with the TXT record it gives you, then **Sitemaps** → submit `https://terrortwinsflock.com/sitemap.xml`. Bing Webmaster Tools can import it from Google.

## Optional, any time after

- Free email forwarding (like `hello@terrortwinsflock.com` to her Gmail): Porkbun → **Email** → Forwarding.
- Message alerts by email can send from the domain once it's verified with the email service (a few more DNS records).

## What changes by itself

The deploy workflow takes the site's address from GitHub Pages, so once the custom domain is saved, every link, preview, the sitemap and the edit page follow it. Nothing in Supabase needs changing: the edit page signs in with a password, not email links, and message notifications, visitor counts, backups and the keep-awake job don't depend on the site's address. Only the notification setup on each device does (steps 3 and 5).

## If something goes wrong

Clear the **Custom domain** box in Settings → Pages and the site goes back to the github.io address. Setting `SITE_PREVIEW` back to `1` (and running Deploy site) hides it from search engines again. Neither touches the content.
