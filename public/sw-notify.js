// Carregado pelo service worker gerado pelo vite-plugin-pwa (workbox.importScripts):
// ao tocar numa notificação (ex.: meta diária pendente), abre/foca o app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || "/");
    })
  );
});
