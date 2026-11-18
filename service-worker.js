// Service Worker der Vorrats-App (Muster: UGC-App, schlanker)
const CACHE = "vorrat-v6.20"; // UGC #71: im Gleichschritt mit APP_VERSION in app.js ("v6.20")
// konto-test.html steht bewusst NICHT hier: der fetch-Handler beantwortet nur Dateien aus
// DATEIEN, alles andere geht direkt ans Netz. msal-browser.min.js seit v3 (Login in der App).
const DATEIEN = ["./", "index.html", "style.css", "app.js", "modell.js", "speicher.js", "kunstdaten.js", "hilfen.js", "erinnerung.js", "bilder.js",
                 "msal-browser.min.js", "cloud.js",
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
  if (e.data === "erinnerung-pruefen") e.waitUntil(erinnern()); // Browsertest; im Alltag weckt Chrome per periodicsync
});

// v6.20 (Tobias 18.11.): Erinnerung bei Ablauf, Logik in erinnerung.js (nutzt hilfen.js/modell.js wie die Seite).
importScripts("modell.js", "hilfen.js", "erinnerung.js");
async function erinnern() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const heute = Modell.heuteIso(); // einmal: ueber Mitternacht sonst falscher Tag gemerkt
  const m = await Erinnerung.pruefen(heute);
  if (!m) return;
  await self.registration.showNotification(m.titel, { body: m.text, tag: "erinnerung", icon: "icons/icon-192.png" });
  await Erinnerung.schreiben("gemeldet", heute);
}
self.addEventListener("periodicsync", (e) => { if (e.tag === "erinnerung") e.waitUntil(erinnern()); });
// Antippen: offene Vorrats-App nach vorn (nicht die KPI-App auf derselben Origin), sonst neu starten.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const start = new URL(self.registration.scope).pathname; // Codex v6.20 #7: nur ./ oder ./index.html
    const c = cs.find((x) => { const p = new URL(x.url).pathname; return p === start || p === start + "index.html"; });
    if (c) { c.postMessage("bald"); return c.focus(); }
    return self.clients.openWindow("./?bald");
  }));
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
