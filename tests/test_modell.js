// Pruefstand Datenmodell (Abschnitt 1a). Aufruf: node tests/test_modell.js
"use strict";
const assert = require("assert");
const M = require("../modell.js");
const kunstdaten = require("../kunstdaten.js");

let faelle = 0;
function fall(name, fn) { fn(); faelle++; console.log("ok  " + name); }

// Kleines Werkzeug: Handys, die Vorgaenge erzeugen.
function handy(inst) {
  const h = { zaehler: { inst, nr: 1, uhr: 0 }, liste: [] };
  h.tu = (daten) => { const e = M.erzeuge(h.zaehler, daten); h.zaehler = e.zaehler; h.liste.push(e.vorgang); return e.vorgang; };
  h.sieht = (andere) => { h.zaehler = M.uhrNachziehen(h.zaehler, Math.max(...andere.liste.map((v) => v.uhr))); };
  return h;
}
const stand = (...hs) => M.berechne(hs.flatMap((h) => h.liste));
const eintrag = (s, id) => s.eintraege.find((e) => e.id === id);
const lage = (ort, reihe, spalte) => ({ ort, reihe, spalte });
function grund(h) {
  const ort = h.tu({ typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 6, spalten: 1 } });
  const fach = h.tu({ typ: "neu", art: "fach", werte: { name: "Schublade 1", lage: lage(ort.id, 0, 0) } });
  return { ort: ort.id, fach: fach.id };
}
const datei = (inst, vorgaenge, schema) => ({ schema: schema || M.SCHEMA, inst, vorgaenge });

fall("erzeuge: Nummer und Uhr steigen, ungueltige Eingabe wirft ohne Zaehler zu aendern", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  assert.deepStrictEqual([a.zaehler.nr, a.zaehler.uhr], [3, 2]);
  const vorher = { ...a.zaehler };
  assert.throws(() => a.tu({ typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: "2027-13" }, menge: 1 }), /Wert ungueltig: mhd/);
  assert.throws(() => a.tu({ typ: "menge", art: "eintrag", ziel: g.fach, delta: 5000, grund: "zugang" }), /Mengenaenderung/);
  assert.throws(() => a.tu({ typ: "loeschen", art: "eintrag", ziel: g.fach }), /unbekannter Vorgangstyp/);
  assert.throws(() => a.tu({ typ: "neu", art: "eintrag", werte: { name: "Leer" }, menge: 0 }), /Anfangsmenge/);
  assert.deepStrictEqual(a.zaehler, vorher);
});

fall("erzeuge: Aufrufer kann Uhr, Nummer und Kennung nicht ueberschreiben; Zusatzangaben abgelehnt", () => {
  const a = handy("aaaaaaaa1");
  grund(a);
  const v = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Brot" }, menge: 1, uhr: 1, n: 99, id: "x", inst: "fremd" });
  assert.deepStrictEqual([v.uhr, v.n, v.id, v.inst], [3, 3, "aaaaaaaa1-3", "aaaaaaaa1"]);
  assert.throws(() => a.tu({ typ: "neu", art: "eintrag", werte: { name: "Brot" }, menge: 1, extra: { tief: 1 } }), /unbekannte Angabe: extra/);
});

fall("Codex #9/#10: keine geteilten Referenzen, __proto__ in der Eingabe wird abgelehnt", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const daten = { typ: "neu", art: "ort", werte: { name: "Regal", reihen: 4, spalten: 2, farben: ["braun"] } };
  const v = a.tu(daten);
  daten.werte.farben[0] = "weiss";
  assert.strictEqual(v.werte.farben[0], "braun");
  const s = stand(a);
  s.orte.find((o) => o.id === v.id).farben[0] = "rot";
  s.faecher[0].lage.reihe = 5;
  assert.strictEqual(v.werte.farben[0], "braun");
  assert.strictEqual(a.liste[1].werte.lage.reihe, 0);
  const boese = JSON.parse('{"__proto__":{"typ":"neu","art":"eintrag","werte":{"name":"A"},"menge":1}}');
  assert.throws(() => a.tu(boese), /abgelehnt/);
  assert.ok(g);
});

fall("Feld gleichzeitig geaendert: spaetere Uhr gewinnt, Gleichstand -> Installations-ID, Reihenfolge egal", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: "2027-05", fach: g.fach }, menge: 2 });
  b.sieht(a);
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "name", wert: "Erbsen A" });
  b.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "name", wert: "Erbsen B" });
  a.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "mhd", wert: "2027-08" });
  const vor = stand(a, b), rueck = M.berechne([...b.liste, ...a.liste].reverse());
  assert.strictEqual(eintrag(vor, e.id).name, "Erbsen B");
  assert.strictEqual(eintrag(vor, e.id).mhd, "2027-08");
  assert.deepStrictEqual(rueck, vor);
});

fall("Codex #4: gleichzeitiges Verschieben einer Kiste ergibt eine der beiden Lagen, nie eine Mischung", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const o1 = a.tu({ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 4, spalten: 2 } });
  const o2 = a.tu({ typ: "neu", art: "ort", werte: { name: "Keller", reihen: 4, spalten: 2 } });
  const k = a.tu({ typ: "neu", art: "fach", werte: { name: "Nudeln", lage: lage(o1.id, 0, 0) } });
  b.sieht(a);
  a.tu({ typ: "feld", art: "fach", ziel: k.id, feld: "lage", wert: lage(o2.id, 1, 0) });
  a.tu({ typ: "feld", art: "ort", ziel: o1.id, feld: "name", wert: "Regal neu" }); // A tickt weiter
  b.tu({ typ: "feld", art: "fach", ziel: k.id, feld: "lage", wert: lage(o1.id, 3, 1) });
  const l = stand(a, b).faecher[0].lage;
  assert.ok([kanon(lage(o2.id, 1, 0)), kanon(lage(o1.id, 3, 1))].includes(kanon(l)), "Mischlage: " + kanon(l));
  function kanon(x) { return M.kanonisch(x); }
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
  a.sieht(b);
  a.tu(M.korrektur(x, 2)); // gezaehlt: 2 Stueck in der Schublade
  x = eintrag(stand(a, b), e.id);
  assert.deepStrictEqual([x.menge, x.bestandPruefen], [2, false]);
  b.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }); // spaete Entnahme zaehlt weiter
  assert.strictEqual(eintrag(stand(a, b), e.id).menge, 1);
});

fall("Codex #2: beide zaehlen gleichzeitig nach -> doppelt gezaehlt markiert, naechste Korrektur loest es", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Erbsen" }, menge: 5 });
  b.sieht(a);
  const gesehen = eintrag(stand(a), e.id);
  a.tu(M.korrektur(gesehen, 3));
  b.tu(M.korrektur(gesehen, 3));
  let x = eintrag(stand(a, b), e.id);
  assert.deepStrictEqual([x.menge, x.doppeltGezaehlt, x.bestandPruefen, x.korrekturKoepfe.length], [1, true, true, 2]);
  a.sieht(b);
  a.tu(M.korrektur(x, 3)); // nochmal gezaehlt: wirklich 3
  x = eintrag(stand(a, b), e.id);
  assert.deepStrictEqual([x.menge, x.doppeltGezaehlt, x.bestandPruefen, x.korrekturKoepfe.length], [3, false, false, 1]);
  // Doppelt gezaehlt mit Summe 0 bleibt sichtbar, sonst sieht niemand die Markierung.
  const c = handy("cccccccc3"), d = handy("dddddddd4");
  const f = c.tu({ typ: "neu", art: "eintrag", werte: { name: "Mais" }, menge: 2 });
  d.sieht(c);
  const g = eintrag(stand(c), f.id);
  c.tu(M.korrektur(g, 1)); d.tu(M.korrektur(g, 3)); // -1 und +1
  x = eintrag(stand(c, d), f.id);
  assert.deepStrictEqual([x.summe, x.sichtbar, x.bestandPruefen], [2, true, true]);
});

fall("Korrektur: stimmt schon -> null, unmoegliche Zaehlung wirft, sehr grosse Korrektur geht durch (Codex #12)", () => {
  const a = handy("aaaaaaaa1");
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Nudeln" }, menge: 3 });
  assert.strictEqual(M.korrektur(eintrag(stand(a), e.id), 3), null);
  assert.throws(() => M.korrektur(eintrag(stand(a), e.id), -1), /0 bis 999/);
  assert.throws(() => M.korrektur(eintrag(stand(a), e.id), 2.5), /0 bis 999/);
  for (let i = 0; i < 11; i++) a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -999, grund: "entnahme" });
  a.tu(M.korrektur(eintrag(stand(a), e.id), 0)); // delta 10986
  assert.strictEqual(eintrag(stand(a), e.id).summe, 0);
  assert.throws(() => a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "korrektur" }), /Vorgaenger/);
  assert.throws(() => a.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme", kennt: [] }), /nur bei Korrekturen/);
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

fall("Ort klaeren: aus dem Endstand berechnet (Reihen/Spalten verkleinert, Fach geloescht, Verschieben loest)", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const f6 = a.tu({ typ: "neu", art: "fach", werte: { name: "Schublade 6", lage: lage(g.ort, 5, 0) } });
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Fisch", fach: f6.id }, menge: 1 });
  assert.strictEqual(eintrag(stand(a), e.id).ortKlaeren, false);
  b.sieht(a);
  a.tu({ typ: "feld", art: "ort", ziel: g.ort, feld: "reihen", wert: 4 });
  let s = stand(a, b);
  assert.strictEqual(s.faecher.find((f) => f.id === f6.id).ortKlaeren, true);
  assert.strictEqual(eintrag(s, e.id).ortKlaeren, true);
  b.tu({ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: g.fach });
  assert.strictEqual(eintrag(stand(a, b), e.id).ortKlaeren, false);
  a.sieht(b);
  a.tu({ typ: "feld", art: "fach", ziel: g.fach, feld: "geloescht", wert: true });
  assert.strictEqual(eintrag(stand(a, b), e.id).ortKlaeren, true);
});

fall("Codex #11: Spaltenzahl verkleinert -> rechte Kiste wird 'Ort klaeren', linke bleibt auf ihrem Platz", () => {
  const a = handy("aaaaaaaa1");
  const o = a.tu({ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 2, spalten: 2 } });
  const rechts = a.tu({ typ: "neu", art: "fach", werte: { name: "oben rechts", lage: lage(o.id, 0, 1) } });
  const links = a.tu({ typ: "neu", art: "fach", werte: { name: "unten links", lage: lage(o.id, 1, 0) } });
  a.tu({ typ: "feld", art: "ort", ziel: o.id, feld: "spalten", wert: 1 });
  const s = stand(a);
  assert.strictEqual(s.faecher.find((f) => f.id === rechts.id).ortKlaeren, true);
  const l = s.faecher.find((f) => f.id === links.id);
  assert.deepStrictEqual([l.ortKlaeren, l.lage.reihe, l.lage.spalte], [false, 1, 0]);
});

fall("Codex #1: Vorgaenge ohne Anlege-Vorgang werden nicht angewendet, aber als verwaist gemeldet", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  const g = grund(a);
  const e = a.tu({ typ: "neu", art: "eintrag", werte: { name: "Eis", fach: g.fach }, menge: 1 });
  b.sieht(a);
  const weg = b.tu({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" });
  const s = stand(b);
  assert.deepStrictEqual([s.eintraege.length, s.orte.length, s.verwaist], [0, 0, [weg.id]]);
  assert.deepStrictEqual(stand(a, b).verwaist, []);
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

fall("pruefeDatei: Schema, fremde Installation, doppelte Nummer, Luecke (Codex #5), Uhr rueckwaerts, Typen", () => {
  const a = handy("aaaaaaaa1"), b = handy("bbbbbbbb2");
  grund(a); grund(b);
  a.tu({ typ: "feld", art: "ort", ziel: "aaaaaaaa1-1", feld: "name", wert: "X" });
  assert.deepStrictEqual(M.pruefeDatei(datei("aaaaaaaa1", a.liste)), { ok: true, fehler: null });
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", a.liste, 2)).fehler, /Schema-Version 2/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [...a.liste, b.liste[0]])).fehler, /fremden Installation/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [...a.liste, a.liste[0]])).fehler, /fehlt oder ist doppelt/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [a.liste[0], a.liste[2]])).fehler, /Nummer 2 fehlt/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [a.liste[0], { ...a.liste[1], uhr: 1 }])).fehler, /rueckwaerts/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [{ ...a.liste[0], typ: "teleport" }])).fehler, /unbekannter Vorgangstyp/);
  assert.match(M.pruefeDatei(datei("aaaaaaaa1", [{ ...a.liste[0], id: "aaaaaaaa1-99" }])).fehler, /Vorgangskennung/);
  assert.match(M.pruefeDatei(null).fehler, /keine Vorgangsdatei/);
});

fall("Codex #6/#7/#10: praeparierte Datei -> Fehlermeldung statt Absturz", () => {
  const a = handy("aaaaaaaa1");
  const g = grund(a);
  const roh = JSON.stringify(datei("aaaaaaaa1", a.liste));
  const faelle = [
    [roh.replace('"name":"Schublade 1"', '"__proto__":1'), /unbekanntes Feld/],
    [roh.replace('"name":"Schublade 1"', '"toString":"x"'), /unbekanntes Feld/],
    ['{"schema":{"toString":null}}', /Schema-Version object/],
    [roh.replace('"typ":"neu"', '"typ":{"toString":null}'), /Vorgangstyp: object/],
    [roh.replace('"id":"aaaaaaaa1-1",', '"id":"aaaaaaaa1-1","__proto__":{"x":1},'), /unbekannte Angabe: __proto__/],
    [roh.replace('"id":"aaaaaaaa1-1",', '"id":"aaaaaaaa1-1","tief":' + "[".repeat(5000) + "]".repeat(5000) + ","), /unbekannte Angabe: tief/],
  ];
  for (const [text, muster] of faelle) {
    const r = M.pruefeDatei(JSON.parse(text));
    assert.strictEqual(r.ok, false);
    assert.match(r.fehler, muster);
  }
  const feld = { id: "aaaaaaaa1-3", inst: "aaaaaaaa1", n: 3, uhr: 3, typ: "feld", art: "fach", ziel: g.fach, feld: { toString: null }, wert: "x" };
  assert.match(M.pruefeVorgang(feld), /unbekanntes Feld: object/);
  assert.match(M.pruefeVorgang({ ...feld, feld: "constructor" }), /unbekanntes Feld/);
});

fall("vereinige: gleiche Kennung + gleicher Inhalt ok, anderer Inhalt -> anhalten; Fassungen derselben Installation (Codex #3)", () => {
  const a = handy("aaaaaaaa1");
  grund(a);
  const umsortiert = a.liste.map((v) => Object.fromEntries(Object.entries(v).reverse()));
  const r = M.vereinige([a.liste, umsortiert]);
  assert.deepStrictEqual([r.ok, r.vorgaenge.length], [true, 2]);
  const k = M.vereinige([a.liste, [{ ...a.liste[0], werte: { ...a.liste[0].werte, name: "Anders" } }]]);
  assert.deepStrictEqual([k.ok, k.vorgaenge], [false, null]);
  assert.match(k.fehler, /zweimal mit verschiedenem Inhalt/);
  const n1 = a.liste[0];
  const f = (n, wert) => ({ id: "aaaaaaaa1-" + n, inst: "aaaaaaaa1", n, uhr: 2, typ: "feld", art: "ort", ziel: n1.id, feld: "name", wert });
  const x = M.vereinige([[n1, f(2, "A")], [n1, f(3, "B")]]);
  assert.strictEqual(x.ok, false);
  assert.match(x.fehler, /Installation aaaaaaaa1: logische Uhr/);
});

fall("Datum: MHD-Monat bis Monatsende, Einfrieren + Frist, Zeitumstellung, Farbstufe, Jahresgrenzen (Codex #8)", () => {
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
  const v = { id: "aaaaaaaa1-1", inst: "aaaaaaaa1", n: 1, uhr: 1, typ: "feld", art: "eintrag", ziel: "aaaaaaaa1-1" };
  for (const [feld, wert] of [["eingefroren", "2027-02-30"], ["mhd", "0000-02"], ["mhd", "1999-12"], ["eingefroren", "9999-12-31"], ["mhd", "2200-01"]]) {
    assert.strictEqual(M.pruefeVorgang({ ...v, feld, wert }), "Wert ungueltig: " + feld, feld + " " + wert);
  }
  assert.strictEqual(M.pruefeVorgang({ ...v, feld: "mhd", wert: "2199-12-31" }), null);
  assert.strictEqual(M.heuteIso(new Date(2027, 2, 28, 0, 30)), "2027-03-28");
});

fall("uhrNachziehen und Installations-ID", () => {
  const z = { inst: "aaaaaaaa1", nr: 1, uhr: 10 };
  assert.strictEqual(M.uhrNachziehen(z, 5), z);
  assert.strictEqual(M.uhrNachziehen(z, 12).uhr, 12);
  assert.throws(() => M.uhrNachziehen(z, "99"), /ganze Zahl/);
  const i1 = M.neueInstallationsId(), i2 = M.neueInstallationsId();
  assert.notStrictEqual(i1, i2);
  assert.match(i1, /^[0-9a-f]{32}$/);
});

fall("Drei Jahre Kunstdaten, zwei Handys offline bis zum Abgleich: gueltig, reihenfolgeunabhaengig, Laufzeit", () => {
  let t = Date.now();
  const { dateien, statistik } = kunstdaten({ tage: 1095, proTag: 15 });
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
  // kanonisch statt deepStrictEqual: bei einem Fehlschlag sprengt dessen Unterschiedsliste den Speicher.
  assert.ok(M.kanonisch(M.berechne(gemischt)) === M.kanonisch(s), "Ergebnis haengt von der Reihenfolge ab (Saat 7)");
  assert.deepStrictEqual([s.widersprueche, s.verwaist], [[], []]);
  // Die Konfliktfaelle kommen wirklich vor, und am Ende ist alles aufgeloest bis auf den letzten Tag.
  assert.ok(statistik.negativ > 10 && statistik.doppeltGezaehlt > 0 && statistik.geloescht > 10, JSON.stringify(statistik));
  assert.ok(s.eintraege.filter((e) => e.bestandPruefen).length <= 3, "zu viele offene 'Bestand pruefen'");

  // Realismus: kein Vorgang darf frueher gestempelt sein als das Anlegen seines Ziels.
  const anlage = new Map(v.vorgaenge.filter((x) => x.typ === "neu").map((x) => [x.ziel, x.uhr]));
  assert.strictEqual(v.vorgaenge.filter((x) => x.typ !== "neu" && x.uhr <= anlage.get(x.ziel)).length, 0);

  console.log("    Vorgaenge: " + v.vorgaenge.length + " · Dateien: " + groesse.map((g) => (g / 1048576).toFixed(1) + " MB").join(" + ") +
    " · sichtbar: " + s.eintraege.filter((e) => e.sichtbar).length + " · " + JSON.stringify(statistik) +
    "\n    Lesen+Pruefen+Berechnen am PC: " + gesamtMs + " ms (Erzeugen " + erzeugtMs + " ms)");
});

console.log("\n" + faelle + " Faelle bestanden.");
