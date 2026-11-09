// Gerueest-Test: node tests/test_geruest.js (kein Framework)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const app = path.join(__dirname, "..");
const lies = (d) => fs.readFileSync(path.join(app, d), "utf8");

// UGC #71: Version in app.js und service-worker.js gleich
const appVersion = lies("app.js").match(/const APP_VERSION = "([^"]+)"/)[1];
const sw = lies("service-worker.js");
assert.strictEqual(sw.match(/const CACHE = "([^"]+)"/)[1], "vorrat-" + appVersion, "CACHE passt nicht zu APP_VERSION");

// #74: Aufraeumen nur fuer eigene Caches (Praefix), nie fremde derselben Origin (KPI-App "cockpit-...")
assert.match(sw, /keys\.filter\(\(k\) => k\.startsWith\("vorrat-"\) && k !== CACHE\)/, "activate loescht nicht nur vorrat-Caches");

// #79: jede Datei aus DATEIEN existiert (speicher.js baut ein anderer Agent, daher mitgezaehlt)
const dateien = JSON.parse(sw.match(/const DATEIEN = (\[[^\]]*\])/)[1]);
for (const d of dateien) if (d !== "./") assert.ok(fs.existsSync(path.join(app, d)), "fehlt: " + d);
for (const muss of ["index.html", "app.js", "modell.js", "speicher.js", "manifest.webmanifest"])
  assert.ok(dateien.includes(muss), "nicht in DATEIEN: " + muss);
assert.ok(!dateien.includes("konto-test.html"), "konto-test.html darf nicht gecacht werden");

// #80: CSP und keine Inline-Skripte
const html = lies("index.html");
assert.match(html, /Content-Security-Policy[^>]*script-src 'self'/);
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  assert.match(m[1], /\bsrc="/, "Inline-Skript gefunden");
  assert.strictEqual(m[2].trim(), "", "Skript mit src darf keinen Inhalt haben");
}
assert.ok(!/\son\w+="/.test(html), "Inline-Eventhandler gefunden");
const reihe = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(reihe, ["modell.js", "speicher.js", "app.js"]);

// Manifest + Icons (Groesse aus dem PNG-Kopf: Breite/Hoehe ab Byte 16)
const mf = JSON.parse(lies("manifest.webmanifest"));
assert.strictEqual(mf.start_url, "./");
assert.strictEqual(mf.scope, "./");
assert.strictEqual(mf.display, "standalone");
assert.ok(mf.icons.some((i) => i.purpose === "maskable") && mf.icons.some((i) => i.purpose === "any"));
for (const i of mf.icons) {
  const b = fs.readFileSync(path.join(app, i.src));
  assert.strictEqual(b.subarray(1, 4).toString(), "PNG", i.src);
  const [w, h] = i.sizes.split("x").map(Number);
  assert.deepStrictEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], "Groesse falsch: " + i.src);
  assert.ok(dateien.includes(i.src), "Icon nicht in DATEIEN: " + i.src);
}
assert.ok(dateien.includes("manifest.webmanifest"));

console.log("test_geruest: alles ok (" + appVersion + ")");
