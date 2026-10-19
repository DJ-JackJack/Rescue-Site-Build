/* The site editor's notifications (served as /edit/sw.js, so it only looks after the edit page).
   Shows a notification when the notify-message function sends one, puts the number of new messages on the
   app icon where the phone supports it, and opens Messages when the notification is tapped.
   It doesn't cache pages or touch anything else. */
const ICON = "{{asset:icon-192.png}}";
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  const shown = self.registration.showNotification(d.title || "New message on the site", {
    body: d.body || "", icon: ICON, tag: "messages", renotify: true, data: { url: d.url || "./#/messages" },
  });
  const badge = typeof d.count === "number" && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.count).catch(() => {}) : null;
  e.waitUntil(Promise.all([shown, badge]));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#/messages", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    const open = wins.find(w => w.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ go: "#/messages" }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
