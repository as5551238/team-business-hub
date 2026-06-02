// Notification handler for Service Worker
// Imported via workbox.importScripts in the generated SW

// PUSH_NOTIFICATION message -> show browser notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PUSH_NOTIFICATION') {
    const { title, body, url } = event.data.payload || {};
    if (!title) return;
    self.registration.showNotification(title, {
      body: body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: url || '/' },
    });
  }
});

// Deep link: notification click -> focus existing window AND navigate to URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('team-business-hub') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
