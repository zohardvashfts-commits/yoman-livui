// מאפשר לפתוח את האפליקציה גם בלי חיבור לאינטרנט.
// קודם מנסים להביא את הגרסה העדכנית מהרשת (כך עדכונים מגיעים מיד),
// ואם אין חיבור — משתמשים בעותק השמור.
const CACHE = 'yoman-livui-v1';
const CACHE_HOSTS = [self.location.host, 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || !CACHE_HOSTS.includes(url.host)) return; // Firestore והכניסה — תמיד ישירות לרשת
  if (url.host === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: url.host === self.location.host }))
  );
});
