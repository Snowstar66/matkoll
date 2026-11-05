// Livskoll's service worker (Story 23.3): shows a push notification and opens
// the app on tap. No caching and no fetch handler: the app is not offline.
// The payload is { title, body, url, tag } as the server sends it (pushMessageFor).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = { title: "Livskoll", body: "", url: "/", tag: "livskoll" };
  try {
    if (event.data) message = { ...message, ...event.data.json() };
  } catch {
    // Not our JSON: show the title alone, since a push must show something.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      renotify: true,
      icon: "/icon/192",
      badge: "/icon/192",
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client && "navigate" in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
