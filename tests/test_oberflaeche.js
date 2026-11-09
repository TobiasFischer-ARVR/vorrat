// Pruefstand reine Oberflaechen-Logik (Abschnitt 1d). Aufruf: node tests/test_oberflaeche.js
"use strict";
const assert = require("assert");
const M = require("../modell.js");
const H = require("../hilfen.js");

let faelle = 0;
function fall(name, fn) { fn(); faelle++; console.log("ok  " + name); }

fall("Bildchen: Stichwort, Teilwort, Gross/Klein, Umlaute, Grundwort hinten, Standard", () => {
  const soll = {
    "Pizza": "🍕", "Salamipizza": "🍕", "Pizza Salami": "🍕", "TK Erbsen": "🫛", "Fischstäbchen": "🐟",
    "Weißbrot": "🍞", "Erdbeereis": "🍦", "Reis": "🍚", "Milchreis": "🍚", "HÄHNCHENBRUST": "🍗", "haehnchen": "🍗",
    "Müsli": "🥣", "Tomatensoße": "🥫", "Eiscreme": "🍦", "Eisbein": "🥩", "Reiswaffel": "🧇", "Ibuprofen 400": "💊",
    "Wundsalbe": "🧴", "Pflaster": "🩹", "Kräutertee": "🍵", "Kartoffelsuppe": "🍲", "Babybrei": "🍼",
    "Xyz": "📦", "": "📦",
  };
  for (const [name, bild] of Object.entries(soll)) assert.strictEqual(H.bildchen(name), bild, name);
});

fall("Bildchen passen in das Modellfeld symbol", () => {
  for (const n of ["Pizza", "Thermometer", "Fieber", "Xyz"]) assert.ok(M.FELDER.eintrag.symbol(H.bildchen(n)), n);
});

fall("Grundausstattung: gueltige Vorgaenge, 4 Orte, 15 Faecher auf festen Plaetzen, nichts zu klaeren", () => {
  let zaehler = { inst: "testgeraet1", nr: 1, uhr: 0 };
  const vs = [];
  const tu = (d) => { const e = M.erzeuge(zaehler, d); zaehler = e.zaehler; vs.push(e.vorgang); return e.vorgang; };
  for (const g of H.grundausstattung()) { const o = tu(g.ort); g.faecher(o.id).forEach(tu); }
  assert.deepStrictEqual(M.pruefeDatei({ schema: M.SCHEMA, inst: "testgeraet1", vorgaenge: vs }), { ok: true, fehler: null });
  const s = M.berechne(vs);
  s.orte.sort((a, b) => a.reihenfolge - b.reihenfolge); // berechne sortiert nach Kennung (Text)
  assert.deepStrictEqual(s.orte.map((o) => [o.name, o.reihen, o.spalten, o.reihenfolge]),
    [["Gefrierschrank", 6, 1, 0], ["Vorrats-Regal", 4, 2, 1], ["Küchenschublade", 1, 1, 2], ["Medizinschrank", 3, 2, 3]]);
  assert.deepStrictEqual(s.orte[0].farben, ["braun", "braun", "weiß", "weiß", "weiß", "weiß"]);
  assert.strictEqual(s.faecher.length, 15);
  assert.ok(s.faecher.every((f) => !f.ortKlaeren));
  const an = (ortName, r, c) => s.faecher.find((f) => f.lage.ort === s.orte.find((o) => o.name === ortName).id && f.lage.reihe === r && f.lage.spalte === c).name;
  assert.strictEqual(an("Gefrierschrank", 5, 0), "Schublade 6");
  assert.deepStrictEqual([an("Vorrats-Regal", 0, 0), an("Vorrats-Regal", 0, 1), an("Vorrats-Regal", 3, 1)], ["Müsli", "Snacks (Baby)", "Backen"]);
  assert.strictEqual(an("Küchenschublade", 0, 0), "Schublade");
  assert.ok(!s.faecher.some((f) => f.lage.ort === s.orte[3].id), "Medizinschrank bleibt ohne Faecher");
});

fall("MHD-Schnellauswahl Monat/Jahr -> JJJJ-MM, gilt bis Monatsende", () => {
  assert.strictEqual(H.mhdMonat(2027, 3), "2027-03");
  assert.strictEqual(H.mhdMonat(2028, 12), "2028-12");
  assert.ok(M.FELDER.eintrag.mhd(H.mhdMonat(2027, 3)));
  assert.ok(!M.FELDER.eintrag.mhd(H.mhdMonat(2200, 1)), "Jahr ausserhalb wird vom Modell abgelehnt");
  assert.strictEqual(H.mhdJahr(3, "2026-11-09"), 2027, "Maerz ist vorbei -> naechstes Jahr");
  assert.strictEqual(H.mhdJahr(11, "2026-11-09"), 2026, "laufender Monat gilt noch");
  assert.strictEqual(H.mhdJahr(12, "2026-11-09"), 2026);
  assert.deepStrictEqual(H.mhdTeile("2027-03"), { jahr: 2027, monat: 3 });
  assert.deepStrictEqual(H.mhdTeile("2027-03-15"), { jahr: 2027, monat: 3 });
  assert.strictEqual(H.mhdTeile(null), null);
  assert.strictEqual(M.ablaufdatum({ mhd: H.mhdMonat(2028, 2) }), "2028-02-29");
});

fall("Frist-Kategorien laut Aufdruck, Vorschlag nach Name, essen bis", () => {
  assert.deepStrictEqual(H.FRISTEN.map((f) => f.monate), [3, 6, 9]);
  const k = (n) => H.FRISTEN[H.fristKategorie(n)].monate;
  assert.strictEqual(k("Gulaschsuppe"), 3);
  assert.strictEqual(k("Hähnchenschenkel"), 6);
  assert.strictEqual(k("Rinderbraten"), 9);
  assert.strictEqual(k("Erbsen aus dem Garten"), 9);
  assert.strictEqual(k("Unbekanntes"), 3, "ohne Treffer die kuerzeste Frist");
  assert.strictEqual(M.ablaufdatum({ eingefroren: "2026-11-09", frist: k("Schweinebraten") }), "2027-05-09");
});

fall("Kurzdatum fuer Kacheln und deutsches Datum", () => {
  assert.strictEqual(H.kurzDatum({ mhd: "2027-03" }), "03/27");
  assert.strictEqual(H.kurzDatum({ mhd: "2027-03-15" }), "15.03.27");
  assert.strictEqual(H.kurzDatum({ mhd: null, eingefroren: "2026-11-09", frist: 3 }), "❄ 02/27");
  assert.strictEqual(H.kurzDatum({ mhd: null, eingefroren: null, frist: null }), "");
  assert.strictEqual(H.deDatum("2027-03-15"), "15.03.2027");
  assert.strictEqual(H.deDatum("2027-03"), "03.2027");
});

fall("Eingabepruefung nutzt Modell.FELDER und meldet verstaendlich", () => {
  assert.strictEqual(H.pruefe("eintrag", { name: "Pizza", symbol: "🍕", mhd: "2027-03", eingefroren: null, frist: null, fach: null }), null);
  assert.match(H.pruefe("eintrag", { name: "   " }), /Name/);
  assert.match(H.pruefe("eintrag", { name: "x".repeat(101) }), /Name/);
  assert.match(H.pruefe("eintrag", { name: "A", eingefroren: "2026-11-09", frist: 0 }), /Frist/);
  assert.match(H.pruefe("eintrag", { name: "A", mhd: "2027-13" }), /MHD/);
  assert.match(H.pruefe("ort", { name: "Truhe", reihen: 21, spalten: 1 }), /Reihen/);
  assert.match(H.pruefe("ort", { name: "Truhe", reihen: 2, spalten: 2.5 }), /Spalten/);
  assert.strictEqual(H.pruefe("fach", { name: "Kiste", lage: { ort: "testgeraet1-1", reihe: 0, spalte: 1 } }), null);
});

console.log("\n" + faelle + " Faelle bestanden.");
