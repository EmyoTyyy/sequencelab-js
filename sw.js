// SequenceLab service worker — caches the static app shell so the hosted app
// loads instantly and works fully offline. Data lives in IndexedDB (untouched
// here). Bump CACHE on every release so old shells are cleared on activate.
const CACHE = "sequencelab-v5.2.1";

// The shell. sql-asm.js is intentionally omitted: it is only used on file://,
// where service workers never run. The .wasm is the heavyweight that makes
// offline worthwhile.
const ASSETS = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "static/css/styles.css",
  "static/js/icons.js",
  "static/js/xlsx.js",
  "static/js/i18n.dict.js",
  "static/js/i18n.js",
  "static/js/api.js",
  "static/js/editor.js",
  "static/js/diagram.js",
  "static/js/syntax.js",
  "static/js/app.js",
  "static/vendor/sql-wasm.js",
  "static/vendor/sql-wasm.wasm",
  "static/fonts/BricolageGrotesque-Bold.ttf",
  "static/fonts/InstrumentSans-Regular.ttf",
  "static/fonts/InstrumentSans-Bold.ttf",
  "static/fonts/InstrumentSans-Italic.ttf",
  "static/fonts/JetBrainsMono-Regular.ttf",
  "static/fonts/JetBrainsMono-Bold.ttf",
  "static/img/logo-128.png",
  "static/img/logo-dark-128.png",
  "static/img/logo-dark.png",
  "static/img/icon-192.png",
  "static/img/icon-512.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" bypasses the HTTP cache so a version bump always pulls fresh.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs only. Everything else (writes, cross-origin,
// the File System Access live-link path — which isn't fetch at all) passes straight
// through and is never intercepted.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).catch(() => {
        if (req.mode === "navigate") return caches.match("index.html");
      })
    )
  );
});
