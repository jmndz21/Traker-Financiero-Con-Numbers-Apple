const CACHE_NAME = "traker-financiero-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/parser.js",
  "./js/analytics.js",
  "./js/charts.js",
  "./js/app.js",
  "./js/vendor/papaparse.min.js",
  "./js/vendor/xlsx.full.min.js",
  "./js/vendor/chart.umd.min.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell: cache-first (works offline). Everything else (CDN libs): network
// first, falling back to cache so a stale CDN response beats a blank screen.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  } else {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
