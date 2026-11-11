const tablePath = /^\/staff\/tables\/[0-9a-f-]{36}$/i;
const icon = "/staff/icon-192.png";

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    // A push still needs a visible notification.
  }
  const url = tablePath.test(data?.url) ? data.url : "/staff";
  event.waitUntil(self.registration.showNotification(data?.title || "Maasii", {
    body: data?.body,
    tag: data?.tag,
    icon,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  const requested = event.notification.data?.url;
  const url = tablePath.test(requested) ? requested : "/staff";
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const staff = windows.find((client) => client.url === self.location.origin + url) ??
      windows.find((client) => {
        const { origin, pathname } = new URL(client.url);
        return origin === self.location.origin && (pathname === "/staff" || pathname.startsWith("/staff/"));
      });
    if (staff) {
      const target = staff.url === self.location.origin + url ? staff : await staff.navigate(url);
      if (target) return target.focus().catch(() => {});
    }
    return self.clients.openWindow(url);
  })());
});
