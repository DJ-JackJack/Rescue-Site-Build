// The Twin Squawk posts that get a page of their own (/twin-squawk/<slug>/), so a shared link shows that post's
// headline, summary and photo. Only live posts: they're read with the public key, which sees what visitors see.
// Used by the build, and by tools/posts-changed.mjs, which checks every 10 minutes whether the published pages are
// out of date (a post went live, changed or came down) and rebuilds the site if they are.
import crypto from "node:crypto";

export const POST_COLUMNS = "slug,title,summary,body,photo_url,photo_alt,photos,publish_at,created_at";
export const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/; // as the database allows; anything else gets no page

export async function livePosts(api, key) {
  const r = await fetch(`${api}/rest/v1/articles?select=${POST_COLUMNS}&order=created_at.desc`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()).filter(p => SLUG.test(p.slug || ""));
}

// Everything the built pages show of the posts, in short: when it changes, the site needs building again.
export const postsStamp = posts => crypto.createHash("sha1")
  .update(JSON.stringify([...posts].sort((a, b) => (a.slug < b.slug ? -1 : 1)).map(p => POST_COLUMNS.split(",").map(k => p[k] ?? null))))
  .digest("hex");
