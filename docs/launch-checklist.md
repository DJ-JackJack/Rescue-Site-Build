# Launch day

Everything needed to move the site from `dj-jackjack.github.io/Rescue-Site-Build` to its own domain and open it to search engines. Set aside about 30 minutes; most of that is waiting for DNS and HTTPS.

In the steps below, `example.com` stands for the domain you buy.

## Before the day

- [ ] Read every page on your phone once, as a visitor would. Anything still hidden in the editor (help listings, wildlife contacts) stays hidden after launch until it's switched on.
- [ ] Buy the domain (Porkbun or Cloudflare). Domain only, no add-ons, with privacy protection on.

## 1. Prove the domain is yours (5 minutes)

This stops anyone else from pointing the domain at their own GitHub site.

- [ ] On GitHub: your profile picture → **Settings** → **Pages** (left side, under "Code, planning, and automation") → **Add a domain**. Type `example.com`.
- [ ] GitHub shows a TXT record. Add it at the registrar (step 2 shows where), then click **Verify**. It can take a few minutes to go through.

## 2. Point the domain at GitHub (5 minutes)

At the registrar's DNS settings. **Porkbun:** Domain Management → the domain → **DNS**. **Cloudflare:** the domain → **DNS** → **Records**.

- [ ] Delete the parking records the registrar added. On Porkbun these point to `pixie.porkbun.com`.
- [ ] Add these records. Leave TTL at the default.

| Type | Host / Name | Answer / Value |
|---|---|---|
| A | (blank, or `@`) | `185.199.108.153` |
| A | (blank, or `@`) | `185.199.109.153` |
| A | (blank, or `@`) | `185.199.110.153` |
| A | (blank, or `@`) | `185.199.111.153` |
| AAAA | (blank, or `@`) | `2606:50c0:8000::153` |
| AAAA | (blank, or `@`) | `2606:50c0:8001::153` |
| AAAA | (blank, or `@`) | `2606:50c0:8002::153` |
| AAAA | (blank, or `@`) | `2606:50c0:8003::153` |
| CNAME | `www` | `dj-jackjack.github.io` |

- [ ] **Cloudflare only:** set each record to **DNS only** (grey cloud), not Proxied. GitHub can't issue the HTTPS certificate through Cloudflare's proxy.

## 3. Tell GitHub Pages about the domain (2 minutes, then waiting)

- [ ] Repo → **Settings** → **Pages** → **Custom domain**: type `example.com` and **Save**. GitHub checks the DNS. That can take a few minutes, or up to a day if the records are slow to spread.
- [ ] When it says the DNS check passed, tick **Enforce HTTPS**. If the box is greyed out, the certificate is still being made; check back in 15 to 60 minutes.

## 4. Turn off preview mode (2 minutes)

- [ ] Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**. Name `SITE_PREVIEW`, value `0`.
- [ ] **Actions** → **Deploy site** → **Run workflow**. This rebuilds the site for the new address with preview mode off: no banner, open to search engines, and link previews, the sitemap and the edit page all use `example.com`.

## 5. Check it (5 minutes)

- [ ] **Actions** → **Check live site** → **Run workflow** (leave the address empty). It also runs by itself after every deploy. All green means: every page loads, link previews point at `example.com` and their pictures load, search engines are let in (but not to /edit/), `http://` and `www.` forward to `https://example.com`, and the old github.io links forward too.
- [ ] Open `https://example.com/edit/` and sign in again (sign-in is remembered per address). On phones, remove the old "Site editor" home screen icon and add the new one.
- [ ] Edit page → **Visitors** → **Start the counts fresh**, so the numbers only show real visitors from launch on.

## 6. Spread the word

- [ ] Update the links in her TikTok, Instagram, YouTube and Facebook bios. Add `?from=` so the Visitors screen knows where people came from: `https://example.com/?from=tiktok`, `?from=instagram`, `?from=youtube`, `?from=facebook`.
- [ ] Facebook may still show an old preview for a link it has seen before. Paste the link into Facebook's **Sharing Debugger** and click **Scrape Again**.
- [ ] **Google Search Console** (search.google.com/search-console): add a **Domain** property for `example.com`, verify it with the TXT record it gives you, then **Sitemaps** → submit `https://example.com/sitemap.xml`. Bing Webmaster Tools can import it from Google.

## Optional, any time after

- Free email forwarding (like `hello@example.com` to her Gmail): Porkbun → **Email** → Forwarding; Cloudflare → **Email Routing**.
- Message alerts by email can send from the domain once it's verified with the email service (a few more DNS records).

## What changes by itself

The deploy workflow takes the site's address from GitHub Pages, so once the custom domain is saved, every link, preview, the sitemap and the edit page follow it. Nothing in Supabase needs changing: the edit page signs in with a password, not email links.

## If something goes wrong

Clear the **Custom domain** box in Settings → Pages and the site goes back to the github.io address. Setting `SITE_PREVIEW` back to `1` (and running Deploy site) hides it from search engines again. Neither touches the content.
