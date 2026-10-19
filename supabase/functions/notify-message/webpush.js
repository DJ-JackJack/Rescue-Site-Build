// Web Push with nothing but WebCrypto, so it runs the same in Supabase Edge Functions (Deno) and in Node.
// Each notification is encrypted for the one device it goes to (RFC 8291, aes128gcm) and signed with the
// site's VAPID key (RFC 8292), so the push service in between (Apple, Google, Mozilla) can't read it.

const enc = new TextEncoder();
export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
const hmac = async (key, data) =>
  new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));

// A new key pair for the site: the public half goes to browsers when they sign up, the private half signs every push.
export async function makeVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}

// The Authorization header: a short-lived token, signed with the VAPID key, for the push service this endpoint belongs to.
export async function vapidHeader(endpoint, vapid, subject) {
  const part = obj => b64u(enc.encode(JSON.stringify(obj)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)); // raw r||s, as JWS wants
  return `vapid t=${unsigned}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// Encrypts the text for one device, using the keys it handed out when it signed up (p256dh and auth).
export async function encrypt(text, p256dh, authSecret) {
  const uaPublic = fromB64u(p256dh), auth = fromB64u(authSecret);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const theirs = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256));
  // HKDF, one block at a time (every output here is 32 bytes or less)
  const ikm = await hmac(await hmac(auth, shared), concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, Uint8Array.of(1)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(text), Uint8Array.of(2)))); // 2 = last record
  const head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096); // record size
  head[20] = asPublic.length;
  return concat(head, asPublic, sealed);
}

// Sends one notification. Returns the push service's status: 201 is sent; 404 or 410 means the device
// has turned notifications off (or the sign-up expired), so it can be forgotten.
export async function sendPush(sub, data, vapid, subject) {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400", // keep trying for a day if the phone is off
      Urgency: "high",
      Topic: "messages", // a newer notification replaces one still waiting
    },
    body: await encrypt(JSON.stringify(data), sub.p256dh, sub.auth),
  });
  return { status: r.status, text: await r.text().catch(() => "") };
}
