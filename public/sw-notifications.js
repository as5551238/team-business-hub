// Notification handler for Service Worker
// Imported via workbox.importScripts in the generated SW
//
// Capabilities:
// 1. PUSH_NOTIFICATION message -> show browser notification (client-side push)
// 2. push event -> show browser notification (server-side push via Web Push)
// 3. notificationclick with action buttons -> quick task actions
// 4. Deep link navigation on notification click

// ── Client-side push (postMessage from app) ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PUSH_NOTIFICATION') {
    const { title, body, url, actions } = event.data.payload || {};
    if (!title) return;
    const opts = {
      body: body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: url || '/', actions: actions || [] },
    };
    // Add action buttons for task notifications
    if (actions && actions.length > 0) {
      (opts as any).actions = actions.slice(0, 2).map((a: any) => ({
        action: a.action || 'open',
        title: a.title || '查看',
      }));
    }
    self.registration.showNotification(title, opts);
  }
});

// ── Server-side push (Web Push protocol) ──
self.addEventListener('push', (event) => {
  let data = { title: '团队业务中台', body: '您有一条新消息', url: '/', actions: [] };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {}

  const opts = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || '/', actions: data.actions || [] },
    vibrate: [100, 50, 100],
  } as any;

  // Add action buttons for quick interactions
  if (data.actions && data.actions.length > 0) {
    opts.actions = data.actions.slice(0, 2).map((a: any) => ({
      action: a.action || 'open',
      title: a.title || '查看',
    }));
  }

  event.waitUntil(
    self.registration.showNotification(data.title, opts)
  );
});

// ── Notification click with action handling ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const url = event.notification.data?.url || '/';
  const actions = event.notification.data?.actions || [];

  // Handle quick actions (complete / snooze)
  if (action && action !== 'open') {
    // Find the matching action definition
    const actionDef = actions.find((a: any) => a.action === action);
    if (actionDef) {
      // Post action to the app for processing
      event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          if (clientList.length > 0) {
            clientList[0].postMessage({
              type: 'NOTIFICATION_ACTION',
              action: action,
              url: url,
            });
            return clientList[0].focus();
          }
          return self.clients.openWindow(url);
        })
      );
      return;
    }
  }

  // Default: navigate to URL in existing window
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
