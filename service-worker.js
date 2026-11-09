// Service Worker der Vorrats-App (Muster: UGC-App, schlanker)
const CACHE = "vorrat-v2"; // UGC #71: im Gleichschritt mit APP_VERSION in app.js ("v2")
// konto-test.html und msal-browser.min.js stehen bewusst NICHT hier: der fetch-Handler
// beantwortet nur Dateien aus DATEIEN, alles andere geht direkt ans Netz.
const DATEIEN = ["./", "index.html", "style.css", "app.js", "modell.js", "speicher.js", "kunstdaten.js", "hilfen.js",
                 "manifest.webmanifest",
                 "icons/icon-192.png", "icons/icon-512.png",
                 "icons/maskable-192.png", "icons/maskable-512.png"];

// #73: am Browser-Zwischenspeicher VORBEI laden (GitHub Pages: max-age=600).
// #79: fehlt eine Datei, scheitert addAll -> kein halbes Update.
// #72: kein skipWaiting hier, der neue Worker wartet auf die Nachricht der Seite.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" })))));
});

self.addEventListener("message", (e) => {
  if (e.data === "uebernehmen") self.skipWaiting();
});

// #74: alte eigene Caches wegraeumen. NUR Praefix "vorrat-": die KPI-App liegt auf derselben
// Origin (Caches "cockpit-...") und darf nicht angetastet werden.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("vorrat-") && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()));
});

// #78: nur GET und nur Dateien aus DATEIEN (absolute URLs; "./" und "index.html" sind getrennte
// Eintraege). Alles andere (Graph, Login, Open Food Facts, konto-test.html) geht ohne respondWith ans Netz.
const EIGENE = new Set(DATEIEN.map((d) => new URL(d, self.registration.scope).href));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  u.search = "";
  if (!EIGENE.has(u.href)) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true }))
    .then((hit) => hit || fetch(e.request)));
});
