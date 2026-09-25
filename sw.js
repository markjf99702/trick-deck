// Offline support: keep a copy of the app so the clicker works at the park with no signal.
// Your dogs and progress live in localStorage, not here.
// Network first, so a new version shows up as soon as you're online.

const CACHE = 'trickdeck-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest',
  'fonts/fredoka.woff2', 'fonts/figtree.woff2',
  'js/app.js', 'js/tricks.js', 'js/coach.js', 'js/clicker.js', 'js/store.js', 'js/ui.js',
  'js/train.js', 'js/show.js', 'js/sample.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
