// Pruefstand Datenmodell (Abschnitt 1a). Aufruf: node tests/test_modell.js
"use strict";
const assert = require("assert");
const M = require("../modell.js");
const kunstdaten = require("../kunstdaten.js");

let faelle = 0;
function fall(name, fn) { fn(); faelle++; console.log("ok  " + name); }

// Kleines Werkzeug: zwei Handys, die Vorgaenge erzeugen.
function handy(inst) {
  const h = { zaehler: { inst, nr: 1, uhr: 0 }, liste: [] };
  h.tu = (daten) => { const e = M.erzeuge(h.zaehler, daten); h.zaehler = e.zaehler; h.liste.push(e.vorgang); return e.vorgang; };
  h.sieht = (andere) => { h.zaehler = M.uhrNachziehen(h.zaehler, Math.max(...andere.liste.map((v) => v.uhr))); };
  return h;
}
const stand = (...hs) => M.berechne(hs.flatMap((h) => h.liste));
const eintrag = (s, id) => s.eintraege.find((e) => e.id === id);
function grund(h) {
  const ort = h.tu({ typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 6, spalten: 1 } });
  const fach = h.tu({ typ: "neu", art: "fach", werte: { name: "Schublade 1", ort: ort.id, platz: 0 } });
  return { ort: ort.id, fach: fach.id };
}

fall("erzeuge: Nummer und Uhr steigen, ungueltige Eingabe wirft ohne Zaehler zu aendern", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  assert.strictEqual(a.zaehler.nr, 3);
  assert.strictEqual(a.zaehler.uhr, 2);
  const vorher = { ...a.zaehler };
  assert.throws(() => a.tu({ typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: "2027-13" }, menge: 1 }), /Wert ungueltig: mhd/);
  assert.throws(() => a.tu({ typ: "menge", art: "eintrag", ziel: g.fach, delta: 5000, grund: "zugang" }), /Mengenaenderung/);
  assert.throws(() => a.tu({ typ: "loeschen", art: "eintrag", ziel: g.fach }), /unbekannter Vorgangstyp/);
  assert.deepStrictEqual(a.zaehler, vorher);
});

fall("Feld gleichzeitig geaendert: spaetere Uhr gewinnt, Gleichstand -> Installations-ID, Reihenfolge egal", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: "2027-05", fach: g.fach }, menge: 2 });
  b.sieht(a);
  // Beide aendern den Namen auf derselben Uhr-Stufe -> "bbbbbbbb2" > "aaaaaaaa1" gewinnt.
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "name", wert: "Erbsen A" });
  b.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "name", wert: "Erbsen B" });
  // Pro Feld: A aendert gleichzeitig das MHD, das bleibt erhalten.
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "mhd", wert: "2027-08" });
  const vor = stand(a, b), rueck = M.berechne([...b.liste, ...a.liste].reverse());
  assert.strictEqual(eintrag(vor, e.id).name, "Erbsen B");
  assert.strictEqual(eintrag(vor, e.id).mhd, "2027-08");
  assert.deepStrictEqual(rueck, vor);
});

fall("Stueckzahl: gleichzeitige Entnahmen zaehlen beide, negativ -> Anzeige 0 + Bestand pruefen, Korrektur loest", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Pizza", fach: g.fach }, menge: 1 });
  b.sieht(a);
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  b.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  let x = eintrag(stand(a, b), e.id);
  assert.deepStrictEqual([x.summe, x.menge, x.bestandPruefen, x.sichtbar], [-1, 0, true, true]);
  // Gezaehlt: 2 Stueck in der Schublade.
  a.sieht(b);
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: M.korrekturDelta(2, x.summe), grund: "korrektur" });
  x = eintrag(stand(a, b), e.id);
  assert.deepStrictEqual([x.menge, x.bestandPruefen], [2, false]);
  // Eine spaeter eintreffende Entnahme zaehlt normal weiter.
  b.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  assert.strictEqual(eintrag(stand(a, b), e.id).menge, 1);
});

fall("Stueckzahl 0 = ausgeblendet, nicht geloescht; Loeschen und Zurueckholen", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Mais", fach: g.fach }, menge: 1 });
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  let x = eintrag(stand(a), e.id);
  assert.deepStrictEqual([x.sichtbar, x.geloescht], [false, false]);
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: 3, grund: "zugang" });
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert: true });
  x = eintrag(stand(a), e.id);
  assert.deepStrictEqual([x.sichtbar, x.geloescht, x.menge], [false, true, 3]);
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert: false });
  assert.strictEqual(eintrag(stand(a), e.id).sichtbar, true);
});

fall("Ort klaeren: wird aus dem Endstand berechnet (Fach geloescht, Ort verkleinert, Verschieben loest)", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const f6 = a.tu({ typ: "neu", art: "fach", werte: { name: "Schublade 6", ort: g.ort, platz: 5 } });
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Fisch", fach: f6.id }, menge: 1 });
  assert.strictEqual(eintrag(stand(a), e.id).ortKlaeren, false);
  b.sieht(a);
  // A verkleinert den Ort auf 4 Schubladen, B verschiebt gleichzeitig nichts -> Fach 6 hat keinen Platz mehr.
  a.tu({ typ: "feld", art: "ort", ziel: g.ort, feld: "reihen", wert: 4 });
  let s = stand(a, b);
  assert.strictEqual(s.faecher.find((f) => f.id === f6.id).ortKlaeren, true);
  assert.strictEqual(eintrag(s, e.id).ortKlaeren, true);
  b.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: g.fach });
  assert.strictEqual(eintrag(stand(a, b), e.id).ortKlaeren, false);
  // Fach geloescht -> Eintrag ohne gueltigen Ort.
  a.sieht(b);
  a.tu({ typ: "feld", art: "fach", ziel: g.fach, feld: "geloescht", wert: true });
  assert.strictEqual(eintrag(stand(a, b), e.id).ortKlaeren, true);
});

fall("Objekt ohne Anlege-Vorgang (Datei des Anlegers fehlt) wird nicht angezeigt", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Eis", fach: g.fach }, menge: 1 });
  b.sieht(a);
  b.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  const s = stand(b);
  assert.strictEqual(s.eintraege.length, 0);
  assert.strictEqual(s.orte.length, 0);
});

fall("pruefeDatei: Schema, fremde Installation, doppelte Nummer, Uhr rueckwaerts, unbekannter Typ", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  grund(a); grund(b);
  const datei = (inst, vorgaenge, schema) => ({ schema: schema || M.SCHEMA, inst, vorgaenge });
  assert.deepStrictEqual(M.pruefeDatei(datei("aaaaaaaa1", a.liste)), { ok: true, fehler: null });
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", a.liste, 2)).fehler, /Schema-Version/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [...a.liste, b.liste[0]])).fehler, /fremden Installation/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [...a.liste, a.liste[0]])).fehler, /doppelt/);
  const zurueck = { ...a.liste[1], uhr: 1 };
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [a.liste[0], zurueck])).fehler, /rueckwaerts/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [{ ...a.liste[0], typ: "teleport" }])).fehler, /unbekannter Vorgangstyp/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [{ ...a.liste[0], id: "aaaaaaaa1-99" }])).fehler, /Vorgangskennung/);
  assert.match(M.pruefeDatei(null).fehler, /keine Vorgangsdatei/);
});

fall("vereinige: gleiche Kennung + gleicher Inhalt ok (Schluesselreihenfolge egal), anderer Inhalt -> anhalten", () => {
  const a = handy("aaaaaaaa1");
  grund(a);
  const umsortiert = a.liste.map((v) => Object.fromEntries(Object.entries(v).reverse()));
  const r = M.vereinige([a.liste, umsortiert]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.vorgaenge.length, 2);
  const faelschung = [{ ...a.liste[0], werte: { ...a.liste[0].werte, name: "Anders" } }];
  const k = M.vereinige([a.liste, faelschung]);
  assert.deepStrictEqual([k.ok, k.vorgaenge], [false, null]);
  assert.match(k.fehler, /zweimal mit verschiedenem Inhalt/);
});

fall("Datum: MHD-Monat bis Monatsende, Einfrieren + Frist, Zeitumstellung, Farbstufe", () => {
  assert.strictEqual(M.ablaufdatum({ mhd: "2028-02" }), "2028-02-29");
  assert.strictEqual(M.ablaufdatum({ mhd: "2027-02" }), "2027-02-28");
  assert.strictEqual(M.ablaufdatum({ mhd: "2027-06-15", eingefroren: "2026-01-01", frist: 3 }), "2027-06-15");
  assert.strictEqual(M.ablaufdatum({ eingefroren: "2026-08-31", frist: 6 }), "2027-02-28");
  assert.strictEqual(M.ablaufdatum({ eingefroren: "2026-11-09", frist: 3 }), "2027-02-09");
  assert.strictEqual(M.ablaufdatum({ name: "Reis" }), null);
  assert.strictEqual(M.tageBis("2027-03-29", "2027-03-27"), 2); // ueber die Zeitumstellung 28.03.2027
  assert.strictEqual(M.tageBis("2027-10-31", "2027-10-30"), 1);
  assert.strictEqual(M.stufe("2026-11-01", "2026-11-09"), "rot");
  assert.strictEqual(M.stufe("2026-11-16", "2026-11-09"), "rot");
  assert.strictEqual(M.stufe("2026-11-17", "2026-11-09"), "gelb");
  assert.strictEqual(M.stufe("2026-12-10", "2026-11-09"), "ok");
  assert.strictEqual(M.stufe(null, "2026-11-09"), null);
  assert.strictEqual(M.pruefeVorgang({ id: "aaaaaaaa1-1", inst: "aaaaaaaa1", n: 1, uhr: 1, typ: "feld", art: "eintrag", ziel: "aaaaaaaa1-1", feld: "eingefroren", wert: "2027-02-30" }), "Wert ungueltig: eingefroren");
});

fall("Praeparierte Datei: __proto__/toString als Feld -> Fehlermeldung statt Absturz", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const roh = JSON.stringify({ schema: 1, inst: "aaaaaaaa1", vorgaenge: a.liste });
  for (const boese of [
    roh.replace('"name":"Schublade 1"', '"__proto__":1'),
    roh.replace('"name":"Schublade 1"', '"toString":"x"'),
  ]) {
    const r = M.pruefeDatei(JSON.parse(boese));
    assert.strictEqual(r.ok, false);
    assert.match(r.fehler, /unbekanntes Feld/);
  }
  const feld = { id: "aaaaaaaa1-3", inst: "aaaaaaaa1", n: 3, uhr: 3, typ: "feld", art: "fach", ziel: g.fach, feld: "constructor", wert: "x" };
  assert.match(M.pruefeVorgang(feld), /unbekanntes Feld/);
  assert.match(M.pruefeVorgang({ ...feld, feld: "__proto__" }), /unbekanntes Feld/);
});

fall("erzeuge: Aufrufer kann Uhr, Nummer und Kennung nicht ueberschreiben", () => {
  const a = handy("aaaaaaaa1");
  grund(a);
  const v = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Brot" }, menge: 1, uhr: 1, n: 99, id: "x", inst: "fremd" });
  assert.deepStrictEqual([v.uhr, v.n, v.id, v.inst], [3, 3, "aaaaaaaa1-3", "aaaaaaaa1"]);
});

fall("Korrektur: stimmt schon -> null, unmoegliche Zaehlung wirft, grosse Korrektur geht durch", () => {
  assert.strictEqual(M.korrekturDelta(3, 3), null);
  assert.throws(() => M.korrekturDelta(-1, 3), /0 bis 999/);
  assert.throws(() => M.korrekturDelta(2.5, 3), /0 bis 999/);
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Nudeln", fach: g.fach }, menge: 1 });
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -6, grund: "entnahme" });
  assert.strictEqual(eintrag(stand(a), e.id).summe, -5);
  a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: M.korrekturDelta(999, -5), grund: "korrektur" }); // 1004 > 999
  assert.strictEqual(eintrag(stand(a), e.id).menge, 999);
  assert.throws(() => a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: 1004, grund: "zugang" }), /Mengenaenderung/);
  assert.throws(() => a.tu({ typ: "neu", art: "eintrag", werte: { name: "Leer" }, menge: 0 }), /Anfangsmenge/);
});

fall("Vorgang mit falscher Art auf ein Ziel -> nicht angewendet, als Widerspruch gemeldet", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Kaese", fach: g.fach }, menge: 1 });
  const falsch = a.tu({ typ: "feld", art: "fach", ziel: e.id, feld: "name", wert: "Kiste" });
  const s = stand(a);
  assert.deepStrictEqual(s.widersprueche, [falsch.id]);
  assert.strictEqual(eintrag(s, e.id).name, "Kaese");
  assert.strictEqual(s.faecher.length, 1);
});

fall("Installations-ID: zufaellig, passt ins Muster", () => {
  const i1 = M.neueInstallationsId(), i2 = M.neueInstallationsId();
  assert.notStrictEqual(i1, i2);
  assert.match(i1, /^[A-Za-z0-9]{32}$/);
});

fall("Drei Jahre Kunstdaten, zwei Handys: Dateien gueltig, Ergebnis unabhaengig von der Reihenfolge, Laufzeit", () => {
  let t = Date.now();
  const dateien = kunstdaten({ tage: 1095, proTag: 15 });
  const erzeugtMs = Date.now() - t;
  for (const d of dateien) assert.deepStrictEqual(M.pruefeDatei(d), { ok: true, fehler: null });
  const groesse = dateien.map((d) => JSON.stringify(d).length);

  t = Date.now();
  const lesen = dateien.map((d) => JSON.parse(JSON.stringify(d)));
  const pruefen = lesen.every((d) => M.pruefeDatei(d).ok);
  const v = M.vereinige(lesen.map((d) => d.vorgaenge));
  const s = M.berechne(v.vorgaenge);
  const gesamtMs = Date.now() - t;
  assert.ok(pruefen && v.ok);

  // Reproduzierbar mischen (Fisher-Yates mit fester Saat).
  const r = kunstdaten.zufall(7);
  const gemischt = [...v.vorgaenge];
  for (let i = gemischt.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]]; }
  assert.ok(M.kanonisch(M.berechne(gemischt)) === M.kanonisch(s), "Ergebnis haengt von der Reihenfolge ab (Saat 7)");
  assert.ok(s.eintraege.every((e) => e.summe >= 0), "Kunstdaten entnehmen nie mehr als da ist");
  assert.deepStrictEqual(s.widersprueche, []);

  // Realismus: kein Vorgang darf frueher gestempelt sein als das Anlegen seines Ziels.
  const anlage = new Map(v.vorgaenge.filter((x) => x.typ === "neu").map((x) => [x.ziel, x.uhr]));
  const zuFrueh = v.vorgaenge.filter((x) => x.typ !== "neu" && x.uhr <= anlage.get(x.ziel)).length;
  assert.strictEqual(zuFrueh, 0, zuFrueh + " Vorgaenge vor dem Anlegen ihres Ziels");

  console.log("    Vorgaenge: " + v.vorgaenge.length + " · Dateien: " + groesse.map((g) => (g / 1048576).toFixed(1) + " MB").join(" + ") +
    " · sichtbare Eintraege: " + s.eintraege.filter((e) => e.sichtbar).length +
    " · Lesen+Pruefen+Berechnen am PC: " + gesamtMs + " ms (Erzeugen " + erzeugtMs + " ms)");
});

console.log("\n" + faelle + " Faelle bestanden.");
