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
  assert.strictEqual(H.fristKategorie("Unbekanntes"), null, "ohne Treffer keine Vorbelegung (Entscheidung Tobias)");
  assert.strictEqual(H.fristVorschlag("Unbekanntes"), null);
  assert.strictEqual(H.fristVorschlag(""), null);
  assert.strictEqual(H.fristVorschlag("Lammkeule"), 6);
  assert.deepStrictEqual(H.FRIST_SCHNELL, [1, 2, 3, 6, 9, 12]);
  assert.ok(H.FRIST_SCHNELL.every((m) => M.FELDER.eintrag.frist(m)));
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

// Hilfsaufbau: Ort + 2 Faecher + Eintraege -> berechneter Stand
function aufbau(eintraege) {
  let z = { inst: "testgeraet1", nr: 1, uhr: 0 };
  const vs = [];
  const tu = (d) => { const e = M.erzeuge(z, d); z = e.zaehler; vs.push(e.vorgang); return e.vorgang; };
  const o = tu({ typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 6, spalten: 1 } });
  const f1 = tu(H.fachNeu("Schublade 1", o.id, 0, 0)), f3 = tu(H.fachNeu("Schublade 3", o.id, 2, 0));
  const fach = { f1: f1.id, f3: f3.id, keins: null };
  const ids = {};
  for (const [name, werte, menge] of eintraege) ids[name] = tu({ typ: "neu", art: "eintrag", werte: Object.assign({ name }, werte, { fach: fach[werte.fach || "f1"] }), menge: menge || 1 }).id;
  return { tu, ids, stand: () => M.berechne(vs) };
}

fall("Laeuft bald ab: Filter, Sortierung abgelaufen -> rot -> gelb, ohne Datum nicht dabei", () => {
  const heute = "2026-11-11";
  const a = aufbau([
    ["Gelb spaet", { mhd: "2026-12-11" }],          // 30 Tage -> gelb
    ["Zu spaet", { mhd: "2026-12-12" }],            // 31 Tage -> nicht dabei
    ["Abgelaufen", { mhd: "2026-11-01" }],
    ["Rot", { mhd: "2026-11-18" }],                 // 7 Tage -> rot
    ["Gelb frueh", { mhd: "2026-11-19" }],          // 8 Tage -> gelb
    ["Ohne Datum", { mhd: null }],
    ["Monat", { mhd: "2026-11" }],                  // bis 30.11. -> 19 Tage -> gelb
    ["Essen bis", { eingefroren: "2026-08-15", frist: 3 }], // 15.11. -> rot
    ["Leer", { mhd: "2026-11-01" }],
  ]);
  a.tu({ typ: "menge", art: "eintrag", ziel: a.ids.Leer, delta: -1, grund: "entnahme" });
  const l = H.baldAb(a.stand().eintraege, heute);
  assert.deepStrictEqual(l.map((x) => [x.e.name, x.stufe]), [
    ["Abgelaufen", "abgelaufen"], ["Essen bis", "rot"], ["Rot", "rot"], ["Gelb frueh", "gelb"], ["Monat", "gelb"], ["Gelb spaet", "gelb"]]);
  assert.deepStrictEqual(l.map((x) => x.tage), [-10, 4, 7, 8, 19, 30]);
});

fall("Laeuft bald ab: Monats-MHD zaehlt bis Monatsende (auch Februar im Schaltjahr)", () => {
  const a = aufbau([["Nov", { mhd: "2026-11" }], ["Feb", { mhd: "2028-02" }]]);
  const st = a.stand().eintraege;
  const s = (name, heute) => H.baldStufe(st.find((e) => e.name === name).ablauf, heute);
  assert.strictEqual(s("Nov", "2026-11-30"), "rot", "letzter Tag des Monats gilt noch");
  assert.strictEqual(s("Nov", "2026-12-01"), "abgelaufen");
  assert.strictEqual(s("Nov", "2026-10-31"), "gelb", "genau 30 Tage vorher");
  assert.strictEqual(s("Nov", "2026-10-30"), null, "31 Tage vorher");
  assert.strictEqual(s("Feb", "2028-02-29"), "rot");
  assert.strictEqual(s("Feb", "2028-03-01"), "abgelaufen");
  assert.strictEqual(H.baldStufe(null, "2026-11-11"), null);
});

fall("Markierung je Fach: Zahl der Eintraege, rot schlaegt gelb, Ort klaeren zaehlt nicht", () => {
  const a = aufbau([
    ["A", { mhd: "2026-11-20", fach: "f1" }, 5], // gelb, 5 Stueck = 1 Eintrag
    ["B", { mhd: "2026-11-25", fach: "f1" }],    // gelb
    ["C", { mhd: "2026-11-12", fach: "f3" }],    // rot
    ["D", { mhd: "2026-11-30", fach: "f3" }],    // gelb
    ["E", { mhd: "2026-11-01", fach: "keins" }], // abgelaufen, aber ohne Fach
    ["F", { mhd: "2027-06", fach: "f1" }],       // spaet
  ]);
  const st = a.stand();
  const m = H.fachMarken(H.baldAb(st.eintraege, "2026-11-11"));
  const f = (name) => st.faecher.find((x) => x.name === name).id;
  assert.deepStrictEqual(m.get(f("Schublade 1")), { n: 2, farbe: "gelb" });
  assert.deepStrictEqual(m.get(f("Schublade 3")), { n: 2, farbe: "rot" });
  assert.strictEqual(m.size, 2);
  const e = st.eintraege.find((x) => x.name === "E");
  assert.strictEqual(H.fundort(e, st.orte, st.faecher), "Ort klären");
  assert.strictEqual(H.fundort(st.eintraege.find((x) => x.name === "C"), st.orte, st.faecher), "Gefrierschrank – Schublade 3");
  assert.deepStrictEqual([-3, -1, 0, 1, 12].map(H.baldText), ["abgelaufen seit 3 Tagen", "seit gestern abgelaufen", "läuft heute ab", "läuft morgen ab", "in 12 Tagen"]);
});

fall("Verschieben = EIN Vorgang (Feld fach), Markierung wandert mit, Rueckgaengig = Gegenvorgang", () => {
  const a = aufbau([["Pizza", { mhd: "2026-11-12", fach: "f1" }, 2]]);
  const st0 = a.stand();
  const f = (st, name) => st.faecher.find((x) => x.name === name).id;
  const vorher = H.fachMarken(H.baldAb(st0.eintraege, "2026-11-11"));
  assert.ok(vorher.has(f(st0, "Schublade 1")));
  a.tu({ typ: "feld", art: "eintrag", ziel: a.ids.Pizza, feld: "fach", wert: f(st0, "Schublade 3") });
  const st1 = a.stand();
  const p = st1.eintraege.find((e) => e.name === "Pizza");
  assert.deepStrictEqual([p.fach, p.menge, p.ortKlaeren], [f(st1, "Schublade 3"), 2, false]);
  const nachher = H.fachMarken(H.baldAb(st1.eintraege, "2026-11-11"));
  assert.deepStrictEqual([...nachher.keys()], [f(st1, "Schublade 3")]);
  a.tu({ typ: "feld", art: "eintrag", ziel: a.ids.Pizza, feld: "fach", wert: null }); // Rueckgaengig nach "kein Fach"
  assert.strictEqual(a.stand().eintraege.find((e) => e.name === "Pizza").ortKlaeren, true);
});

console.log("\n" + faelle + " Faelle bestanden.");
