/* SwimIn — service worker: notifiche push e funzionamento senza rete. */
const VERSION = 'swimin-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo risorse dell'app: Appwrite e altri domini passano sempre dalla rete.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Pagine: prima la rete (versione sempre aggiornata), senza rete l'ultima copia o la pagina offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // File con hash nel nome, font, icone e anagrafica: dalla cache, poi dalla rete.
  if (/^\/(assets|icons|data)\//.test(url.pathname) || /\.(woff2?|png|svg|webp)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'SwimIn';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      lang: 'it',
      data: { url: data.url || '/notifiche' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        // L'app è già aperta: le chiediamo di cambiare pagina senza ricaricarsi.
        open.postMessage({ type: 'swimin:navigate', url: path });
        return open.focus();
      }
      return self.clients.openWindow(new URL(path, self.location.origin).href);
    })
  );
});

// Il browser ha rinnovato la sottoscrizione: l'app la registrerà di nuovo alla prossima apertura.
self.addEventListener('pushsubscriptionchange', () => {});
