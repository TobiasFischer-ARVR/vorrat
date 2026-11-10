// Pruefstand Speicherschicht (Abschnitt 1b). Aufruf: node tests/test_speicher.js
// Braucht fake-indexeddb AUSSERHALB des Repos: npm install --prefix D:/tmp/vorrat-testdeps fake-indexeddb
// (anderer Ort: Umgebungsvariable VORRAT_TESTDEPS).
"use strict";
const assert = require("assert");
const deps = process.env.VORRAT_TESTDEPS || "D:/tmp/vorrat-testdeps";
try { require(require.resolve("fake-indexeddb/auto", { paths: [deps] })); } catch (e) {
  console.error("fake-indexeddb fehlt in " + deps + "\nEinmalig: npm install --prefix " + deps + " fake-indexeddb");
  process.exit(1);
}
const M = require("../modell.js");
const S = require("../speicher.js");

const ORT = { typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 6, spalten: 1 } };
const roh = () => new Promise((ok, nein) => { const r = indexedDB.open(S.DB); r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
const loeschen = () => anfrage(indexedDB.deleteDatabase(S.DB));
const gueltig = (sp, vs) => assert.deepStrictEqual(M.pruefeDatei({ schema: M.SCHEMA, inst: sp.inst, vorgaenge: vs }), { ok: true, fehler: null });

const faelle = [];
const fall = (name, fn) => faelle.push([name, fn]);

fall("Neue Installation bekommt ID, Nummern lueckenlos, Dateien gueltig", async () => {
  const sp = await S.oeffnen();
  assert.match(sp.inst, /^[0-9a-f]{32}$/);
  assert.strictEqual(sp.neu, true);
  assert.deepStrictEqual(await sp.zaehler(), { inst: sp.inst, nr: 1, uhr: 0 });
  const ort = await sp.ausfuehren(ORT);
  await sp.ausfuehren({ typ: "neu", art: "fach", werte: { name: "Schublade 1", lage: { ort: ort.id, reihe: 0, spalte: 0 } } });
  await sp.ausfuehren({ typ: "feld", art: "ort", ziel: ort.id, feld: "name", wert: "Truhe" });
  const vs = await sp.alleVorgaenge();
  assert.deepStrictEqual(vs.map((v) => v.n).sort(), [1, 2, 3]);
  gueltig(sp, vs);
  assert.deepStrictEqual(await sp.zaehler(), { inst: sp.inst, nr: 4, uhr: 3 });
  sp.schliessen();
  const wieder = await S.oeffnen(); // Neustart: gleiche ID, nicht neu
  assert.deepStrictEqual([wieder.inst, wieder.neu], [sp.inst, false]);
  wieder.schliessen();
});

fall("Zwei Tabs gleichzeitig: dieselbe ID, keine Nummer doppelt", async () => {
  const [a, b] = await Promise.all([S.oeffnen(), S.oeffnen()]);
  assert.strictEqual(a.inst, b.inst);
  const auftraege = [];
  for (let i = 0; i < 20; i++) auftraege.push((i % 2 ? a : b).ausfuehren(ORT));
  const erg = await Promise.all(auftraege);
  assert.strictEqual(new Set(erg.map((v) => v.n)).size, 20);
  const vs = await a.alleVorgaenge();
  assert.deepStrictEqual(vs.map((v) => v.n).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1));
  gueltig(a, vs);
  a.schliessen(); b.schliessen();
});

fall("Ungueltige Eingabe: abgelehnt, nichts gespeichert, Zaehler unveraendert", async () => {
  const sp = await S.oeffnen();
  await sp.ausfuehren(ORT);
  const vorher = await sp.zaehler();
  await assert.rejects(sp.ausfuehren({ typ: "loeschen", art: "eintrag", ziel: "x" }), /unbekannter Vorgangstyp/);
  await assert.rejects(sp.ausfuehren({ typ: "neu", art: "eintrag", werte: { name: "Erbsen" }, menge: 0 }), /Anfangsmenge/);
  assert.deepStrictEqual(await sp.zaehler(), vorher);
  assert.strictEqual((await sp.alleVorgaenge()).length, 1);
  sp.schliessen();
});

fall("Abgebrochene Transaktion: Promise abgelehnt, nichts gespeichert", async () => {
  const sp = await S.oeffnen();
  await sp.ausfuehren(ORT);
  const vorher = await sp.zaehler();
  // Kennung schon belegt (z. B. zerschossener Zaehler) -> add bricht ab, alter Vorgang bleibt unangetastet.
  const db = await roh();
  const fremd = { id: sp.inst + "-" + vorher.nr, marke: "vorher da" };
  await anfrage(db.transaction("vorgaenge", "readwrite").objectStore("vorgaenge").put(fremd));
  db.close();
  await assert.rejects(sp.ausfuehren(ORT), /ConstraintError|already exists/i);
  assert.deepStrictEqual(await sp.zaehler(), vorher);
  const vs = await sp.alleVorgaenge();
  assert.strictEqual(vs.length, 2);
  assert.deepStrictEqual(vs.find((v) => v.id === fremd.id), fremd);
  sp.schliessen();
});

fall("Nach Loeschen der DB: neue ID, Nummern beginnen bei 1", async () => {
  const alt = await S.oeffnen();
  await alt.ausfuehren(ORT);
  await loeschen(); // offene Verbindung gibt per onversionchange frei
  await assert.rejects(alt.ausfuehren(ORT)); // alte Verbindung arbeitet nicht still weiter
  const neu = await S.oeffnen();
  assert.notStrictEqual(neu.inst, alt.inst);
  assert.strictEqual(neu.neu, true);
  assert.strictEqual((await neu.ausfuehren(ORT)).id, neu.inst + "-1");
  neu.schliessen();
});

fall("Halber Zustand (Vorgaenge da, Zaehler weg): neue ID, Uhr dahinter, alte Vorgaenge bleiben", async () => {
  const alt = await S.oeffnen();
  for (let i = 0; i < 3; i++) await alt.ausfuehren(ORT);
  alt.schliessen();
  const db = await roh();
  await anfrage(db.transaction("meta", "readwrite").objectStore("meta").delete("zaehler"));
  db.close();
  const sp = await S.oeffnen();
  assert.notStrictEqual(sp.inst, alt.inst);
  assert.deepStrictEqual(await sp.zaehler(), { inst: sp.inst, nr: 1, uhr: 3 });
  const v = await sp.ausfuehren(ORT);
  assert.deepStrictEqual([v.n, v.uhr], [1, 4]);
  const vs = await sp.alleVorgaenge();
  assert.strictEqual(vs.filter((x) => x.inst === alt.inst).length, 3);
  gueltig(sp, vs.filter((x) => x.inst === sp.inst));
  sp.schliessen();
});

fall("Abgleich-Zustand: mit Uhr in einem Schritt, nur ganze Zahlen, loeschen gibt neue ID", async () => {
  const sp = await S.oeffnen();
  assert.strictEqual(await sp.abgleich(), null);
  await sp.ausfuehren(ORT);
  const z = { ordner: "x/y", gelesen: sp.inst, dateien: {} };
  assert.strictEqual((await sp.abgleichSpeichern(z, 40)).uhr, 40);
  assert.deepStrictEqual(await sp.abgleich(), z);
  await assert.rejects(sp.abgleichSpeichern({ kaputt: 1 }, "7"), /Uhr ungueltig/);
  assert.deepStrictEqual(await sp.abgleich(), z, "abgelehnt = nichts geschrieben");
  assert.strictEqual((await sp.ausfuehren(ORT)).uhr, 41);
  await S.leeren(() => null);
  const neu = await S.oeffnen();
  assert.notStrictEqual(neu.inst, sp.inst);
  assert.strictEqual(await neu.abgleich(), null);
  neu.schliessen();
});

fall("Codex R2 #2: Vorgaenge weg, Zaehler noch da -> neue ID, Uhr laeuft weiter", async () => {
  await loeschen();
  const alt = await S.oeffnen();
  for (let i = 0; i < 3; i++) await alt.ausfuehren(ORT);
  alt.schliessen();
  const db = await roh();
  await anfrage(db.transaction("vorgaenge", "readwrite").objectStore("vorgaenge").clear());
  db.close();
  const sp = await S.oeffnen();
  assert.notStrictEqual(sp.inst, alt.inst);
  assert.strictEqual(sp.neu, true);
  const v = await sp.ausfuehren(ORT);
  assert.deepStrictEqual([v.n, v.uhr], [1, 4]);
  gueltig(sp, await sp.alleVorgaenge());
  sp.schliessen();
});

fall("Codex R2 #3: offener Tab schreibt nach ID-Wechsel nicht unter fremder ID", async () => {
  await loeschen();
  const a = await S.oeffnen();
  await a.ausfuehren(ORT);
  const db = await roh();
  await anfrage(db.transaction("meta", "readwrite").objectStore("meta").delete("zaehler"));
  db.close();
  const b = await S.oeffnen(); // legt neue ID an
  assert.notStrictEqual(b.inst, a.inst);
  await assert.rejects(a.ausfuehren(ORT), /Installation gewechselt/);
  const v = await b.ausfuehren(ORT);
  assert.strictEqual(v.inst, b.inst);
  a.schliessen(); b.schliessen();
});

fall("Review #8: grosse Daten getrennt, ohne dateien bleiben sie stehen, anderer Ordner sieht sie nicht", async () => {
  const sp = await S.oeffnen();
  await sp.ausfuehren(ORT);
  const dateien = { "vorgaenge-x.json": { inst: "x", vorgaenge: [] } };
  await sp.abgleichSpeichern({ ordner: "a", gelesen: sp.inst, dateien }, 0);
  await sp.abgleichSpeichern({ ordner: "a", gelesen: sp.inst, letzter: { zeit: "t" } }, 0);
  assert.deepStrictEqual(await sp.abgleich(), { ordner: "a", gelesen: sp.inst, letzter: { zeit: "t" }, dateien });
  await sp.abgleichSpeichern({ ordner: "b", gelesen: null }, 0);
  assert.deepStrictEqual((await sp.abgleich()).dateien, {}, "Daten des alten Ordners nie unter dem neuen");
  sp.schliessen();
});

fall("Review #3: uebernehmen setzt Zaehler hinter die Uebernommenen, ID bleibt beim Neustart", async () => {
  const sp = await S.oeffnen();
  const v1 = await sp.ausfuehren(ORT);
  let z = { inst: sp.inst, nr: 2, uhr: v1.uhr };
  const fremd = [];
  for (let i = 0; i < 2; i++) { const e = M.erzeuge(z, ORT); z = e.zaehler; fremd.push(e.vorgang); }
  await assert.rejects(sp.uebernehmen([M.erzeuge({ inst: "andere00001", nr: 1, uhr: 0 }, ORT).vorgang]), /ungueltig/);
  const n = await sp.uebernehmen(fremd);
  assert.deepStrictEqual(n, { inst: sp.inst, nr: 4, uhr: 3 });
  assert.deepStrictEqual(await sp.zaehler(), n);
  assert.strictEqual((await sp.ausfuehren(ORT)).id, sp.inst + "-4");
  sp.schliessen();
  const wieder = await S.oeffnen();
  assert.deepStrictEqual([wieder.inst, wieder.neu], [sp.inst, false]);
  gueltig(wieder, await wieder.alleVorgaenge());
  wieder.schliessen();
});

fall("Codex #4: leeren prueft und loescht in einem Schritt - Schreiben eines anderen Tabs dazwischen geht nie verloren", async () => {
  const a = await S.oeffnen(), b = await S.oeffnen();
  const gezaehlt = (await a.alleVorgaenge()).length; // Oberflaeche von Tab A hat 0 gezaehlt
  const v = await b.ausfuehren(ORT);                 // Tab B speichert danach
  await assert.rejects(S.leeren((vs) => (vs.length !== gezaehlt ? "inzwischen geaendert" : null)), /inzwischen geaendert/);
  const neu = await S.oeffnen();
  assert.strictEqual(neu.inst, a.inst, "nichts geloescht, gleiche ID");
  assert.ok((await neu.alleVorgaenge()).some((x) => x.id === v.id));
  // ohne Einwand: alles weg, andere Verbindungen geschlossen, neue ID
  await S.leeren((vs, ab) => { assert.strictEqual(vs.length, 1); assert.strictEqual(ab, null); return null; });
  await assert.rejects(b.ausfuehren(ORT), "geschlossener Tab speichert nicht still weiter");
  const leer = await S.oeffnen();
  assert.notStrictEqual(leer.inst, a.inst);
  assert.deepStrictEqual([(await leer.alleVorgaenge()).length, await leer.abgleich()], [0, null]);
  leer.schliessen();
});

const zeit = (p, ms) => Promise.race([p, new Promise((_, nein) => setTimeout(() => nein(new Error("haengt")), ms))]);

fall("Codex2 #4: zwei leeren() gleichzeitig -> nur eines meldet Erfolg, keines ohne Pruefung", async () => {
  const sp = await S.oeffnen();
  await sp.ausfuehren(ORT);
  let geprueft = 0;
  const g = () => { geprueft++; return null; };
  const erg = await Promise.allSettled([S.leeren(g), S.leeren(g)]);
  const ok = erg.filter((e) => e.status === "fulfilled").length;
  assert.strictEqual(ok, geprueft, "jeder Erfolg hat geprueft");
  assert.ok(ok >= 1);
});

fall("Codex2 #5: blockierender Tab -> leeren endet mit Klartext statt zu haengen, nichts geloescht", async () => {
  const sp = await S.oeffnen();
  const v = await sp.ausfuehren(ORT);
  sp.schliessen();
  const stur = await anfrage(indexedDB.open(S.DB)); // reagiert nicht auf versionchange
  await assert.rejects(zeit(S.leeren(() => null, 200), 2000), /andere Fenster/);
  stur.close();
  await new Promise((ok) => setTimeout(ok, 100));
  const neu = await S.oeffnen();
  assert.ok((await neu.alleVorgaenge()).some((x) => x.id === v.id), "nichts geloescht");
  neu.schliessen();
});

fall("Codex2 Abdeckung: vorhandene DB ohne Speicher 'vorgaenge' wird repariert", async () => {
  const r = indexedDB.open(S.DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("meta");
  (await anfrage(r)).close();
  const sp = await zeit(S.oeffnen(), 2000);
  assert.strictEqual((await sp.ausfuehren(ORT)).n, 1);
  sp.schliessen();
});

fall("abgleichSpeichern zieht die Uhr: nur vorwaerts, nur ganze Zahlen", async () => {
  const sp = await S.oeffnen();
  await sp.ausfuehren(ORT);
  assert.strictEqual((await sp.abgleichSpeichern({ ordner: "a" }, 10)).uhr, 10);
  assert.strictEqual((await sp.abgleichSpeichern({ ordner: "a" }, 5)).uhr, 10);
  await assert.rejects(sp.abgleichSpeichern({ ordner: "a" }, "99"), /Uhr ungueltig/);
  assert.strictEqual((await sp.ausfuehren(ORT)).uhr, 11);
  gueltig(sp, await sp.alleVorgaenge());
  sp.schliessen();
});

fall("dauerhaft: ohne API null statt Fehler", async () => {
  assert.strictEqual(await S.dauerhaft(), null);
});

(async () => {
  let rot = 0;
  for (const [name, fn] of faelle) {
    try { await zeit(loeschen(), 3000); await zeit(fn(), 5000); console.log("ok  " + name); }
    catch (e) { rot++; console.log("ROT " + name + " -> " + String(e.message).split(String.fromCharCode(10))[0]); }
  }
  if (rot) { console.log(rot + " rot"); process.exit(1); }
  console.log(String.fromCharCode(10) + faelle.length + " Faelle bestanden.");
})().catch((e) => { console.error(e); process.exit(1); });
