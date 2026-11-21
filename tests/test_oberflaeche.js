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

fall("v5 Multiscan: gleicher Code + MHD + Ziel = eine Zeile, sonst getrennt", () => {
  const z = H.paketeZeilen([
    { schluessel: "e4001", mhd: null }, { schluessel: "e4001", mhd: null },               // 2x Erbsen
    { schluessel: "e4001", mhd: "2027-03" },                                             // Erbsen, anderes MHD
    { schluessel: "p123", mhd: "2028-01-31" }, { schluessel: "p123", mhd: "2028-02-29" }, // Medikament, 2 Verfallsdaten
    { schluessel: "e4001", mhd: null, fach: "f9" },                                      // Erbsen, eigenes Ziel
  ]);
  assert.deepStrictEqual(z.map((x) => [x.schluessel, x.mhd, x.fach, x.menge]),
    [["e4001", null, undefined, 2], ["e4001", "2027-03", undefined, 1], ["p123", "2028-01-31", undefined, 1], ["p123", "2028-02-29", undefined, 1], ["e4001", null, "f9", 1]]);
  assert.deepStrictEqual(H.paketeZeilen([]), []);
});

fall("v5.2 Aufteilen + Zusammenlegen: ein Platz, zwei Faecher, Inhalt wandert, nichts zu klaeren", () => {
  const a = aufbau([["Pizza", { fach: "f1" }], ["Eis", { fach: "f1" }, 2]]);
  const lauf = (schritte) => { const fertig = []; for (const s of schritte) for (const d of [].concat(typeof s === "function" ? s(fertig) : s)) fertig.push(a.tu(d)); return fertig; };
  const s0 = a.stand(), f1 = s0.faecher.find((f) => f.name === "Schublade 1");
  lauf(H.aufteilenSchritte(f1, "Schublade 1 links", "Schublade 1 rechts", [a.ids.Eis]));
  const s1 = a.stand();
  const teile = s1.faecher.filter((f) => !f.geloescht && f.lage.reihe === 0);
  assert.deepStrictEqual(teile.map((f) => f.name).sort(), ["Schublade 1 links", "Schublade 1 rechts"]);
  const rechts = teile.find((f) => f.name.endsWith("rechts"));
  const e = (st, n) => st.eintraege.find((x) => x.name === n);
  assert.deepStrictEqual([e(s1, "Pizza").fach, e(s1, "Eis").fach, e(s1, "Eis").menge], [f1.id, rechts.id, 2]);
  assert.ok(!s1.faecher.some((f) => f.ortKlaeren) && !s1.eintraege.some((x) => x.ortKlaeren));
  assert.strictEqual(H.aufteilenSchritte(f1, f1.name, "B", []).length, 2, "gleicher Name = kein Umbenennen");
  lauf(H.zusammenSchritte(rechts.id, f1.id, [a.ids.Eis]));
  const s2 = a.stand();
  assert.deepStrictEqual([e(s2, "Eis").fach, e(s2, "Eis").ortKlaeren, s2.faecher.find((f) => f.id === rechts.id).geloescht], [f1.id, false, true]);
});

fall("v6 A: Feld code nur kanonisch mit Pruefziffer, alte Eintraege ohne code gueltig", () => {
  const ok = M.FELDER.eintrag.code;
  for (const w of [null, "gtin:4000417025005", "gtin:40170725", "gtin:0012345678905", "gtin:14000417025002", "pzn:01234562"]) assert.ok(ok(w), String(w));
  for (const w of ["gtin:4000417025006", "gtin:123456789", "gtin:012345678905", "gtin:04000417025005", "pzn:01234563", "pzn:1234562",
    "ean:4000417025005", "", undefined, 4000417025005, "gtin:4000417025005 "]) assert.ok(!ok(w), String(w));
  // Scanner und Modell sprechen dieselbe Sprache: jeder Scanner-Schluessel ist ein gueltiger code
  for (const [r, f] of [["4000417025005", "ean_13"], ["012345678905", "upc_a"], ["40170725", "ean_8"], ["01040004170250051727033110ABC", "data_matrix"]])
    assert.ok(ok(H.leseCode(r, f).schluessel), r);
  assert.ok(ok(H.codeAusEingabe("PZN 1234562").schluessel));
  const v = { typ: "neu", art: "eintrag", inst: "abcdefgh12", n: 1, id: "abcdefgh12-1", uhr: 1, ziel: "abcdefgh12-1", werte: { name: "X", code: "gtin:4000417025005" }, menge: 1 };
  assert.strictEqual(M.pruefeVorgang(v), null);
  assert.strictEqual(M.pruefeVorgang(Object.assign({}, v, { werte: { name: "X" } })), null, "ohne code (alt) bleibt gueltig");
  assert.match(M.pruefeVorgang(Object.assign({}, v, { werte: { name: "X", code: "gtin:123" } })), /code/);
  assert.deepStrictEqual(H.codesSauber({ "gtin:123456789": "X", "gtin:4000417025005": "Y" }), { "gtin:4000417025005": "Y" }, "Gedaechtnis: gleiche Regel");
});

fall("v6 A: Bild-Adresse nur von images.openfoodfacts.org, Ausschnitt, Code-Text", () => {
  assert.strictEqual(H.bildUrlOk("https://images.openfoodfacts.org/images/products/400/front_de.12.400.jpg"), "https://images.openfoodfacts.org/images/products/400/front_de.12.400.jpg");
  for (const u of ["http://images.openfoodfacts.org/a.jpg", "https://images.openfoodfacts.org.evil.com/a.jpg", "https://evil.com/images.openfoodfacts.org/a.jpg",
    "https://user:pw@images.openfoodfacts.org/a.jpg", "https://images.openfoodfacts.org:8443/a.jpg", "javascript:alert(1)", "", null, 42, "https://" + "x".repeat(600)])
    assert.strictEqual(H.bildUrlOk(u), null, String(u));
  assert.strictEqual(H.offBild({ status: 1, product: { image_front_url: "https://images.openfoodfacts.org/x.jpg" } }), "https://images.openfoodfacts.org/x.jpg");
  assert.strictEqual(H.offBild({ status: 1, product: { image_front_url: "https://evil.com/x.jpg" } }), null);
  assert.strictEqual(H.offBild({ status: 0 }), null);
  assert.strictEqual(H.offBild(null), null);
  assert.deepStrictEqual(H.ausschnitt(400, 300), { sx: 50, sy: 0, s: 300 });
  assert.deepStrictEqual(H.ausschnitt(300, 401), { sx: 0, sy: 50, s: 300 });
  assert.deepStrictEqual([H.codeText("gtin:4000417025005"), H.codeText("pzn:01234562"), H.codeText(null)], ["EAN 4000417025005", "PZN 01234562", ""]);
});

fall("v6 A: Bildmasse aus dem Dateikopf (PNG, JPEG), Unbekanntes = null", () => {
  const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); png.set([0, 0, 0x4e, 0x20, 0, 0, 0x01, 0x90], 16); // 20000 x 400
  assert.deepStrictEqual(H.bildMasse(png), { w: 20000, h: 400 });
  // JPEG: SOI, APP0 (Laenge 16), SOF0 mit Hoehe 450, Breite 600
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, 0x01, 0xc2, 0x02, 0x58, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(H.bildMasse(jpg), { w: 600, h: 450 });
  const sos = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 8, ...new Array(20).fill(0)]);
  assert.strictEqual(H.bildMasse(sos), null, "Bilddaten vor SOF");
  assert.strictEqual(H.bildMasse(new Uint8Array([0x47, 0x49, 0x46, 0x38, ...new Array(30).fill(0)])), null, "GIF/unbekannt");
  assert.strictEqual(H.bildMasse(new Uint8Array(5)), null);
  assert.strictEqual(H.bildMasse(null), null);
});

fall("v6 B: eigenesFoto (Code vor Name), fotoSchritt nimmt vorhandenes Objekt, fotoWegSchritte nullt alle", () => {
  const F1 = "foto-" + "a".repeat(32) + ".jpg", F2 = "foto-" + "b".repeat(32) + ".jpg";
  const fotoVon = new Map([["gtin:4000417025005", F1], ["n:gulasch", F2]]);
  assert.deepStrictEqual(H.eigenesFoto(fotoVon, "gtin:4000417025005", "Gulasch"), { schluessel: "gtin:4000417025005", datei: F1 });
  assert.deepStrictEqual(H.eigenesFoto(fotoVon, "gtin:96385074", " GULASCH "), { schluessel: "n:gulasch", datei: F2 }); // Code ohne Foto -> Name
  assert.strictEqual(H.eigenesFoto(fotoVon, null, "Pizza"), null);
  assert.strictEqual(H.eigenesFoto(null, null, "Gulasch"), null);
  const bilder = [{ id: "x1-1", schluessel: "n:gulasch", datei: F1 }, { id: "x2-1", schluessel: "n:gulasch", datei: null }, { id: "x2-2", schluessel: "n:pizza", datei: F2 }];
  assert.deepStrictEqual(H.fotoSchritt(bilder, "n:gulasch", F2), { typ: "feld", art: "bild", ziel: "x1-1", feld: "datei", wert: F2 });
  assert.deepStrictEqual(H.fotoSchritt(bilder, "n:suppe", F2), { typ: "neu", art: "bild", werte: { schluessel: "n:suppe", datei: F2 } });
  assert.deepStrictEqual(H.fotoWegSchritte(bilder, "n:gulasch"), [{ typ: "feld", art: "bild", ziel: "x1-1", feld: "datei", wert: null }]);
  assert.deepStrictEqual(H.fotoWegSchritte(bilder, "n:suppe"), []);
  // die erzeugten Schritte sind gueltige Vorgaenge (neu, feld datei, feld null)
  let z = { inst: "aaaaaaaa1", nr: 1, uhr: 0 };
  const neu = M.erzeuge(z, H.fotoSchritt([], "n:suppe", F1));
  z = neu.zaehler;
  const da = [{ id: neu.vorgang.id, schluessel: "n:suppe", datei: F1 }];
  for (const d of [H.fotoSchritt(da, "n:suppe", F2), ...H.fotoWegSchritte(da, "n:suppe")]) z = M.erzeuge(z, d).zaehler;
  assert.strictEqual(z.nr, 4);
});

fall("v6.1: offDetails - Allergene deutsch, E-Nummern, Naehrwerte deutsch formatiert, Unbrauchbares raus", () => {
  const d = H.offDetails({ status: 1, product: {
    ingredients_text_de: "  Weizenmehl, Zucker, Milch  ", ingredients_text: "wheat",
    allergens_tags: ["en:milk", "en:gluten", "de:hafer-x", "en:milk", 5], additives_tags: ["en:e330", "en:e150a", "en:quatsch", "en:e322i"],
    nutriscore_grade: "b", nutriments: { "energy-kcal_100g": 452.35, fat_100g: 17, sugars_100g: "viel", salt_100g: -1 } } });
  assert.strictEqual(d.zutaten, "Weizenmehl, Zucker, Milch");
  assert.deepStrictEqual(d.allergene, ["Milch", "Gluten", "hafer x"]);
  assert.deepStrictEqual(d.zusatz, ["E330", "E150a", "E322i"]);
  assert.deepStrictEqual(d.naehrwerte, [["Energie", "452,4 kcal"], ["Fett", "17 g"]]);
  assert.strictEqual(d.nutri, "B");
  assert.strictEqual(H.offDetails({ status: 1, product: { ingredients_text: "x", nutriscore_grade: "unknown" } }).nutri, null);
  // Zahl als Text, nur kJ, Spuren, Getraenk
  const g = H.offDetails({ status: 1, product: { product_quantity_unit: "ml", nutriments: { "energy-kj_100g": 180, salt_100g: "0.04", fat_100g: "1e5" } } });
  assert.deepStrictEqual(g.naehrwerte, [["Energie", "180 kJ"], ["Salz", "0,04 g"]]);
  assert.strictEqual(g.ml, true);
  assert.deepStrictEqual(H.offDetails({ status: 1, product: { nutriments: { "energy-kcal_100g": 100, "energy-kj_100g": 418 } } }).naehrwerte, [["Energie", "100 kcal"]]);
  assert.strictEqual(H.offDetails({ status: 1, product: {} }), null);
  assert.strictEqual(H.offDetails({ status: 0 }), null);
  assert.strictEqual(H.offDetails(null), null);
});

fall("v6 C: bilderNamen - aktuell (alle Objekte), tot nur an bekannten Objekten, Unbekanntes weder noch", () => {
  const F = (c) => "foto-" + c.repeat(32) + ".jpg";
  const A = "aaaaaaaa1", B = "bbbbbbbb1";
  let za = { inst: A, nr: 1, uhr: 0 }, zb = { inst: B, nr: 1, uhr: 0 };
  const vs = [];
  const a = (d) => { const e = M.erzeuge(za, d); za = e.zaehler; vs.push(e.vorgang); return e.vorgang; };
  const b = (d) => { const e = M.erzeuge(zb, d); zb = e.zaehler; vs.push(e.vorgang); return e.vorgang; };
  const x = a(H.fotoSchritt([], "n:gulasch", F("1")));                       // Objekt x: 1 ...
  a({ typ: "feld", art: "bild", ziel: x.id, feld: "datei", wert: F("2") });  // ... ersetzt durch 2 -> 1 tot
  b(H.fotoSchritt([], "n:gulasch", F("3")));                                 // zweites Objekt (offline zugleich): 3 aktuell
  const y = a(H.fotoSchritt([], "n:pizza", F("4")));
  a({ typ: "feld", art: "bild", ziel: y.id, feld: "datei", wert: null });    // entfernt -> 4 tot
  const fremd = b({ typ: "feld", art: "bild", ziel: "cccccccc1-1", feld: "datei", wert: F("5") }); // Objekt noch unbekannt
  const st = M.berechne(vs);
  assert.deepStrictEqual(st.verwaist, [fremd.id]);
  const n = H.bilderNamen(vs, st.bilder);
  assert.deepStrictEqual([...n.aktuell].sort(), [F("2"), F("3")]);
  assert.deepStrictEqual([...n.tot].sort(), [F("1"), F("4")]);
  assert.deepStrictEqual([...n.bekannt].sort(), [F("1"), F("2"), F("3"), F("4"), F("5")]);
});

fall("v6.16 Bearbeiten-Modus: Umbau-Knoepfe NUR im Modus, sonst keiner", () => {
  const regal = { name: "Vorrats-Regal", reihen: 4, spalten: 2 };
  const schub = { name: "Gefrierschrank", reihen: 6, spalten: 1 };
  const medAlt = { name: "Medizinschrank", reihen: 3, spalten: 2 };
  const med = { name: "Medizinschrank", reihen: 12, spalten: 8, stil: "sortierkasten", trenner: 4 };
  for (const o of [regal, schub, medAlt, med, { ...med, reihen: 11 }]) {
    assert.deepStrictEqual(H.umbauKnoepfe(o, false), [], "Normalmodus: " + o.name);
    assert.ok(H.umbauKnoepfe(o, true).length > 0, "Bearbeiten: " + o.name);
  }
  assert.deepStrictEqual(H.umbauKnoepfe(null, true), []);
  const t = (o) => H.umbauKnoepfe(o, true).map((k) => k.text);
  assert.deepStrictEqual(t(regal), ["+ Reihe", "− Reihe", "+ Spalte", "✎ Name und Größe …"], "Regal 4x2: kein − Spalte bei 2");
  assert.deepStrictEqual(t({ ...regal, spalten: 3, reihen: 1 }), ["+ Reihe", "+ Spalte", "− Spalte", "✎ Name und Größe …"]);
  assert.deepStrictEqual(t(schub), ["✎ Name und Größe …"], "Schubladen-Ort: kein Raster, nur Ort");
  assert.deepStrictEqual(t(medAlt), ["+ Reihe", "− Reihe", "+ Spalte", "🩹 Wie auf dem Foto einrichten (34 Schubladen)", "✎ Name und Größe …"]);
  assert.deepStrictEqual(t(med), ["+ Reihe", "− Reihe", "+ Spalte links", "− Spalte links", "+ Spalte rechts", "− Spalte rechts", "✎ Name und Größe …"],
    "Medizinschrank mit Trennwand: links/rechts, keine Vorlage mehr");
  assert.ok(t({ ...med, reihen: 11 }).includes("🩹 Schubladen-Größen wie auf dem Foto übernehmen"));
  assert.ok(!t({ ...med, trenner: 1 }).includes("− Spalte links"), "Trennwand nach Spalte 1: links nicht kleiner");
  assert.ok(!t({ ...med, spalten: 5 }).includes("− Spalte rechts"), "rechts nur eine Spalte: nicht kleiner");
  const gruppen = [...new Set(H.umbauKnoepfe(med, true).map((k) => k.gruppe))];
  assert.deepStrictEqual(gruppen, ["Reihen", "Linke Seite", "Rechte Seite", "Ort"], "sauber gruppiert, Gruppen zusammenhaengend");
  assert.ok(H.umbauKnoepfe(med, true).every((k) => k.aria && k.id), "jeder Knopf hat Kennung und Vorlese-Text");
});

fall("v6.16 Menue-Gliederung: nichts geht verloren, Bedingungen fallen weg, Loeschen zuletzt", () => {
  const a = ["−1", () => 1], b = ["Bearbeiten", () => 2], c = ["Foto", () => 3], d = ["🗑 Löschen", () => 4];
  const t = H.menueTeile({ oben: [a, false, b], liste: [null, c, undefined], gefahr: [d] });
  assert.deepStrictEqual(t, { oben: [a, b], reihe: [], liste: [c], gefahr: [d] });
  assert.deepStrictEqual(H.menueTeile({}), { oben: [], reihe: [], liste: [], gefahr: [] });
  assert.deepStrictEqual(H.menueTeile({ reihe: [a, null] }).reihe, [a], "v6.23 Reihe: falsch faellt weg");
});

fall("v6.21 woSchon: Code vor Name, je Fach summiert, Unsichtbares zaehlt nicht", () => {
  const e = (name, code, fach, menge, sichtbar = true) => ({ name, code, fach, menge, sichtbar });
  const es = [e("Müsli", "gtin:1", "f1", 2), e("Müsli", "gtin:1", "f1", 1), e("Müsli", "gtin:1", "f2", 1),
    e("Müsli", "gtin:9", "f3", 5),                 // gleicher Name, anderer Code -> nicht dasselbe
    e("müsli ", undefined, null, 1),               // ohne Code: ueber den Namen, ohne Fach
    e("Müsli", "gtin:1", "f4", 3, false)];         // geloescht/0
  assert.deepStrictEqual(H.woSchon(es, "gtin:1", "Müsli"), [{ fach: "f1", menge: 3 }, { fach: "f2", menge: 1 }, { fach: null, menge: 1 }]);
  assert.deepStrictEqual(H.woSchon(es, "gtin:7", ""), [], "ohne Name nur ueber Code");
  assert.deepStrictEqual(H.woSchon(es, "hand:x", "MÜSLI"), [{ fach: null, menge: 1 }], "von Hand: nur codelose Eintraege");
  const alt = [e("Reis", "gtin:2", "weg1", 1), e("Reis", "gtin:2", "weg2", 2), e("Reis", "gtin:2", "f1", 0)]; // zwei geloeschte Faecher, Menge 0
  assert.deepStrictEqual(H.woSchon(alt, "gtin:2", "Reis", (f) => f === "f1"), [{ fach: null, menge: 3 }], "ungueltige Faecher = eine Zeile, Menge 0 weg");
});

// ---- v6.23 Teilmengen ----
function teilHandy(inst = "teilgeraet1") {
  let z = { inst, nr: 1, uhr: 0 };
  const vs = [];
  const tu = (liste) => liste.map((d) => { const e = M.erzeuge(z, d); z = e.zaehler; vs.push(e.vorgang); return e.vorgang; });
  return { vs, tu, sieh: (andere) => { z = M.uhrNachziehen(z, Math.max(...andere.map((v) => v.uhr))); } };
}
const jetztMap = (vs) => new Map(M.berechne(vs).eintraege.map((x) => [x.id, x]));
const HEUTE = "2026-11-20";

fall("v6.23 anbrechenSchritte: Menge 1 = nur Feld, Menge >= 2 = abspalten mit gleichen Werten (ohne geloescht, code nur falls da), Rueckgaengig nur Mengen", () => {
  const h = teilHandy();
  const [o] = h.tu([{ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 1, spalten: 1 } }]);
  const [f] = h.tu([{ typ: "neu", art: "fach", werte: { name: "Backen", lage: { ort: o.id, reihe: 0, spalte: 0 } } }]);
  const [eins] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Zucker", fach: f.id }, menge: 1 }]);
  const [drei] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Mehl", symbol: null, mhd: "2027-03", fach: f.id, code: "gtin:4000417025005" }, menge: 3 }]);
  let j = jetztMap(h.vs);
  assert.deepStrictEqual(H.anbrechenSchritte(j.get(eins.id), 50, HEUTE),
    [{ typ: "feld", art: "eintrag", ziel: eins.id, feld: "anbruch", wert: { seit: HEUTE, rest: 50 } }]);
  const vorher = j.get(drei.id);
  const s = H.anbrechenSchritte(vorher, 75, HEUTE);
  assert.deepStrictEqual(s, [{ typ: "menge", art: "eintrag", ziel: drei.id, delta: -1, grund: "entnahme" },
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", mhd: "2027-03", fach: f.id, code: "gtin:4000417025005", anbruch: { seit: HEUTE, rest: 75 } }, menge: 1 }]);
  const ohneCode = H.anbrechenSchritte(Object.assign({}, vorher, { code: null }), 75, HEUTE)[1].werte;
  assert.ok(!("code" in ohneCode) && !("geloescht" in ohneCode) && !("summe" in ohneCode), "kein code: null, keine Rechenfelder");
  const fertig = h.tu(s);
  j = jetztMap(h.vs);
  const neu = j.get(fertig[1].id);
  assert.deepStrictEqual([j.get(drei.id).menge, neu.menge, neu.anbruch, neu.name, neu.fach, neu.code], [2, 1, { seit: HEUTE, rest: 75 }, "Mehl", f.id, "gtin:4000417025005"], "x2 zu + x1 offen");
  assert.strictEqual(j.get(drei.id).anbruch, undefined, "alter bleibt zu");
  // Rueckgaengig: nur Mengen (+1 alt, -1 neu), kein geloescht (Codex #1)
  const r = H.rueckSchritte(fertig, vorher, j);
  assert.deepStrictEqual(r, [{ typ: "menge", art: "eintrag", ziel: drei.id, delta: 1, grund: "zugang" },
    { typ: "menge", art: "eintrag", ziel: fertig[1].id, delta: -1, grund: "entnahme" }]);
  h.tu(r);
  j = jetztMap(h.vs);
  assert.deepStrictEqual([j.get(drei.id).menge, j.get(fertig[1].id).sichtbar, j.get(fertig[1].id).bestandPruefen], [3, false, false], "wieder x3, Abspaltung unsichtbar");
});

fall("v6.23 Rueckgaengig: Menge 1, fremder Fuellstand, geloescht, verschoben, Leer weg (x1/x2)", () => {
  const h = teilHandy();
  const [o] = h.tu([{ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 1, spalten: 2 } }]);
  const [f, g] = h.tu([{ typ: "neu", art: "fach", werte: { name: "A", lage: { ort: o.id, reihe: 0, spalte: 0 } } },
    { typ: "neu", art: "fach", werte: { name: "B", lage: { ort: o.id, reihe: 0, spalte: 1 } } }]);
  const [e] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Zucker", fach: f.id }, menge: 1 }]);
  let vorher = jetztMap(h.vs).get(e.id);
  const fertig = h.tu(H.anbrechenSchritte(vorher, 100, HEUTE));
  assert.deepStrictEqual(H.rueckSchritte(fertig, vorher, jetztMap(h.vs)), [{ typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: null }]);
  // Fuellstand inzwischen geaendert (anderes Handy): nichts ueberschreiben (R2 #5)
  const b = teilHandy("teilgeraet2"); b.sieh(h.vs);
  const fremd = b.tu([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: { seit: HEUTE, rest: 25 } }]);
  assert.match(H.rueckSchritte(fertig, vorher, jetztMap([...h.vs, ...fremd])), /geändert/);
  // geloescht -> nicht mehr moeglich
  const weg = b.tu([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert: true }]);
  assert.match(H.rueckSchritte(fertig, vorher, jetztMap([...h.vs, ...fremd, ...weg])), /gelöscht/);
  // Leer weg x1 -> Menge 0 (unsichtbar), Rueckgaengig trotzdem erlaubt
  vorher = jetztMap(h.vs).get(e.id);
  const leer1 = h.tu(H.leerSchritte(vorher));
  assert.deepStrictEqual(leer1.map((v) => [v.typ, v.delta]), [["menge", -1]], "x1: nur -1");
  let j = jetztMap(h.vs);
  assert.strictEqual(j.get(e.id).sichtbar, false);
  assert.deepStrictEqual(H.rueckSchritte(leer1, vorher, j), [{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" }]);
  h.tu(H.rueckSchritte(leer1, vorher, j));
  // Leer weg x2 (offen): -1 + anbruch null; Rueckgaengig +1 + alter Wert
  h.tu([{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" }]);
  vorher = jetztMap(h.vs).get(e.id);
  assert.deepStrictEqual([vorher.menge, vorher.anbruch.rest], [2, 100]);
  assert.strictEqual(H.anbruchText(vorher), "1 offen voll");
  const leer2 = h.tu(H.leerSchritte(vorher));
  j = jetztMap(h.vs);
  assert.deepStrictEqual([j.get(e.id).menge, j.get(e.id).anbruch], [1, null], "x2: Rest ist zu");
  assert.deepStrictEqual(H.rueckSchritte(leer2, vorher, j), [{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" },
    { typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: { seit: HEUTE, rest: 100 } }]);
  // Abspalten, danach alter Eintrag verschoben -> Hinweis (R2 #3)
  h.tu([{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" }, { typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: null }]);
  vorher = jetztMap(h.vs).get(e.id);
  const ab = h.tu(H.anbrechenSchritte(vorher, 50, HEUTE));
  h.tu([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: g.id }]);
  assert.match(H.rueckSchritte(ab, vorher, jetztMap(h.vs)), /verschoben/);
});

fall("v6.23 Review #3/#4: Rueckgaengig des Abspaltens nur, wenn die neue Packung unbenutzt und beide im alten Fach sind", () => {
  const a = teilHandy();
  const [o] = a.tu([{ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 1, spalten: 2 } }]);
  const [f, g] = a.tu([{ typ: "neu", art: "fach", werte: { name: "Backen", lage: { ort: o.id, reihe: 0, spalte: 0 } } },
    { typ: "neu", art: "fach", werte: { name: "Rest", lage: { ort: o.id, reihe: 0, spalte: 1 } } }]);
  const [e] = a.tu([{ typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: f.id }, menge: 3 }]);
  const vorher = jetztMap(a.vs).get(e.id);
  const fertig = a.tu(H.anbrechenSchritte(vorher, 50, HEUTE));
  const neuId = fertig[1].id;
  const b = teilHandy("teilgeraet2"); b.sieh(a.vs);
  // Codex #1 / Review #3: B verbraucht die offene Packung -> kein Rueckgaengig mehr, Bestand bleibt richtig (2)
  const fremd = b.tu([{ typ: "menge", art: "eintrag", ziel: neuId, delta: -1, grund: "entnahme" }]);
  assert.match(H.rueckSchritte(fertig, vorher, jetztMap([...a.vs, ...fremd])), /benutzt/);
  const s = M.berechne([...a.vs, ...fremd]);
  assert.deepStrictEqual(s.eintraege.filter((x) => x.sichtbar && !x.bestandPruefen).map((x) => x.menge), [2], "kein Minus, nichts zu pruefen");
  // auch nach +1 (Menge 2 statt 1) nicht
  assert.match(H.rueckSchritte(fertig, vorher, jetztMap([...a.vs, { ...fremd[0], delta: 1, grund: "zugang" }])), /benutzt/);
  // Review #4: neue Packung verschoben -> nicht mehr moeglich
  const weg = b.tu([{ typ: "feld", art: "eintrag", ziel: neuId, feld: "fach", wert: g.id }]);
  assert.match(H.rueckSchritte(fertig, vorher, jetztMap([...a.vs, ...weg])), /verschoben/);
  // unberuehrt -> geht
  assert.ok(Array.isArray(H.rueckSchritte(fertig, vorher, jetztMap(a.vs))));
});

fall("v6.23 Review #5: Laeuft bald ab und Fach sortieren gleich - offene vor gleichnamiger zu-Packung", () => {
  const e = (id, anbruch) => ({ id, name: "Mehl", sichtbar: true, menge: 1, ablauf: "2026-11-25", anbruch });
  const l = H.baldAb([e("a1", undefined), e("b2", { seit: HEUTE, rest: 50 })], HEUTE);
  assert.deepStrictEqual(l.map((x) => x.e.id), ["b2", "a1"]);
  assert.strictEqual(H.offenZuerst(e("x", null), e("y", { seit: HEUTE, rest: 10 })), 1);
  assert.strictEqual(H.offenZuerst(e("x"), e("y")), 0);
});

fall("v6.23 anbruchText: kurz/lang, Menge >= 2, zu = leer; Stufen = Modellwerte", () => {
  assert.strictEqual(H.anbruchText({ menge: 1, anbruch: { seit: HEUTE, rest: 50 } }), "offen ½");
  assert.strictEqual(H.anbruchText({ menge: 1, anbruch: { seit: HEUTE, rest: 50 } }, true), "angebrochen, halb voll");
  assert.strictEqual(H.anbruchText({ menge: 3, anbruch: { seit: HEUTE, rest: 10 } }), "1 offen fast leer");
  assert.strictEqual(H.anbruchText({ menge: 1 }), "");
  assert.strictEqual(H.anbruchText({ menge: 1, anbruch: null }, true), "");
  assert.deepStrictEqual(H.ANBRUCH_STUFEN.map((s) => s[0]), M.ANBRUCH_REST);
  assert.deepStrictEqual([H.stufeText(75), H.stufeText(10), H.stufeText(33), H.stufeText(0), H.stufeText(35.5), H.stufeText("50")], ["¾", "fast leer", "33 %", "", "", ""]);
  // v6.28: Werte ausserhalb der Stufen als Prozent, auch im aria-Text
  assert.strictEqual(H.anbruchText({ menge: 1, anbruch: { seit: HEUTE, rest: 35 } }), "offen 35 %");
  assert.strictEqual(H.anbruchText({ menge: 2, anbruch: { seit: HEUTE, rest: 35 } }, true), "1 angebrochen, 35 Prozent voll");
});

// ---- v6.28 Teil verschieben ----
function teilAufbau() {
  const h = teilHandy();
  const [o] = h.tu([{ typ: "neu", art: "ort", werte: { name: "Regal", reihen: 1, spalten: 2 } }]);
  const [f, g] = h.tu([{ typ: "neu", art: "fach", werte: { name: "Backen", lage: { ort: o.id, reihe: 0, spalte: 0 } } },
    { typ: "neu", art: "fach", werte: { name: "Dose", lage: { ort: o.id, reihe: 0, spalte: 1 } } }]);
  return { h, f, g };
}
const MEHL = "gtin:4000417025005";

fall("v6.28 teilSchritte: zu x1 / zu x3 / offen, ohne Ziel = neue offene Packung mit den Werten der Quelle", () => {
  const { h, f, g } = teilAufbau();
  const [eins, drei, offen] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Mehl", mhd: "2027-03", fach: f.id, code: MEHL }, menge: 1 },
    { typ: "neu", art: "eintrag", werte: { name: "Zucker", fach: f.id }, menge: 3 },
    { typ: "neu", art: "eintrag", werte: { name: "Reis", fach: f.id, anbruch: { seit: "2026-11-01", rest: 60 } }, menge: 1 }]);
  const j = jetztMap(h.vs);
  // zu x1, 1/4 -> Quelle offen 75, neu im Ziel 25 (alle belegten Felder, fach = Ziel, kein geloescht)
  let t = H.teilSchritte(j.get(eins.id), null, 25, g.id, HEUTE);
  assert.strictEqual(t.m, 25);
  assert.deepStrictEqual(t.schritte, [{ typ: "feld", art: "eintrag", ziel: eins.id, feld: "anbruch", wert: { seit: HEUTE, rest: 75 } },
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", mhd: "2027-03", fach: g.id, code: MEHL, anbruch: { seit: HEUTE, rest: 25 } }, menge: 1 }]);
  // zu x3, 1/2 -> abspalten mit 50 + neu im Ziel 50
  t = H.teilSchritte(j.get(drei.id), null, 50, g.id, HEUTE);
  assert.deepStrictEqual(t.schritte.map((v) => [v.typ, v.delta || v.werte.anbruch.rest, v.werte && v.werte.fach]),
    [["menge", -1, undefined], ["neu", 50, f.id], ["neu", 50, g.id]]);
  // offen 60, 3/4 -> nur 60 da: Quelle leer (-1), Ziel 60
  t = H.teilSchritte(j.get(offen.id), null, 75, g.id, HEUTE);
  assert.strictEqual(t.m, 60);
  assert.deepStrictEqual(t.schritte.map((v) => [v.typ, v.delta || v.werte.anbruch.rest]), [["menge", -1], ["neu", 60]]);
  // offen 60, 1/4 -> Quelle 35 (seit bleibt)
  t = H.teilSchritte(j.get(offen.id), null, 25, g.id, HEUTE);
  assert.deepStrictEqual(t.schritte[0], { typ: "feld", art: "eintrag", ziel: offen.id, feld: "anbruch", wert: { seit: "2026-11-01", rest: 35 } });
  // Ergebnis gueltig fuers Modell (35 ist erlaubt): Reis 35 in Backen, 25 in Dose
  h.tu(t.schritte);
  const s = jetztMap(h.vs);
  assert.deepStrictEqual([...s.values()].filter((x) => x.name === "Reis" && x.sichtbar).map((x) => x.fach + ":" + x.anbruch.rest).sort(), [f.id + ":35", g.id + ":25"].sort());
});

fall("v6.28 teilZiel + teilSchritte mit Ziel: dazuzaehlen bis voll, Rest bleibt in der Quelle, voll -> Hinweis", () => {
  const { h, f, g } = teilAufbau();
  const [q, z, , andersCode, ohneCode] = h.tu([
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: f.id, code: MEHL, anbruch: { seit: "2026-11-01", rest: 50 } }, menge: 1 },
    { typ: "neu", art: "eintrag", werte: { name: "Weizenmehl", fach: g.id, code: MEHL, anbruch: { seit: "2026-11-10", rest: 80 } }, menge: 1 }, // gleicher Code, anderer Name
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: g.id, code: MEHL }, menge: 2 },                         // zu -> kein Ziel
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: g.id, code: "gtin:4000000000013", anbruch: { seit: HEUTE, rest: 10 } }, menge: 1 }, // anderer Code
    { typ: "neu", art: "eintrag", werte: { name: " mehl ", fach: g.id, anbruch: { seit: HEUTE, rest: 10 } }, menge: 1 }]); // ohne Code, Name gleich
  const es = M.berechne(h.vs).eintraege, j = jetztMap(h.vs);
  assert.strictEqual(H.teilZiel(es, j.get(q.id), g.id).id, [z.id, ohneCode.id].sort()[0], "offen + gleiches Produkt (Code bzw. Name), erste nach Kennung");
  assert.ok(!H.gleichesProdukt(j.get(q.id), j.get(andersCode.id)), "beide mit Code: Code entscheidet");
  assert.ok(H.gleichesProdukt(j.get(q.id), j.get(ohneCode.id)), "einer ohne Code: Namensregel (klein, Leerraum)");
  assert.strictEqual(H.teilZiel(es, j.get(q.id), f.id), null, "eigenes Fach: kein Ziel");
  assert.strictEqual(H.teilZiel(es.map((x) => (x.id === z.id || x.id === ohneCode.id ? { ...x, bestandPruefen: true } : x)), j.get(q.id), g.id), null, "Bestand pruefen ist kein Ziel");
  // dazuzaehlen: Ziel 80 + min(50, 50, 20) = 100, Quelle 30
  const ziel = j.get(z.id);
  let t = H.teilSchritte(j.get(q.id), ziel, 50, g.id, HEUTE);
  assert.strictEqual(t.m, 20);
  assert.deepStrictEqual(t.schritte, [{ typ: "feld", art: "eintrag", ziel: q.id, feld: "anbruch", wert: { seit: "2026-11-01", rest: 30 } },
    { typ: "feld", art: "eintrag", ziel: z.id, feld: "anbruch", wert: { seit: "2026-11-10", rest: 100 } }]);
  assert.strictEqual(H.teilSchritte(j.get(q.id), { ...ziel, anbruch: { seit: HEUTE, rest: 100 } }, 25, g.id, HEUTE), "Am Ziel schon voll.");
  // Ziel nimmt alles, Quelle wird leer
  t = H.teilSchritte(j.get(q.id), { ...ziel, anbruch: { seit: "2026-11-10", rest: 10 } }, 75, g.id, HEUTE);
  assert.deepStrictEqual([t.m, t.schritte[0].delta, t.schritte[1].wert.rest], [50, -1, 60]);
});

fall("v6.28 rueckSchritte mit Map (Teil verschieben): beide zurueck, fremd geaendert/benutzt/verschoben, alte Aufrufer unveraendert", () => {
  const { h, f, g } = teilAufbau();
  const [q, z] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: f.id, anbruch: { seit: "2026-11-01", rest: 50 } }, menge: 1 },
    { typ: "neu", art: "eintrag", werte: { name: "Mehl", fach: g.id, anbruch: { seit: "2026-11-10", rest: 40 } }, menge: 1 }]);
  let j = jetztMap(h.vs);
  const vor = new Map([[q.id, j.get(q.id)], [z.id, j.get(z.id)]]);
  const fertig = h.tu(H.teilSchritte(j.get(q.id), j.get(z.id), 25, g.id, HEUTE).schritte);
  j = jetztMap(h.vs);
  assert.deepStrictEqual([j.get(q.id).anbruch.rest, j.get(z.id).anbruch.rest], [25, 65]);
  assert.deepStrictEqual(H.rueckSchritte(fertig, vor, j), [
    { typ: "feld", art: "eintrag", ziel: q.id, feld: "anbruch", wert: { seit: "2026-11-01", rest: 50 } },
    { typ: "feld", art: "eintrag", ziel: z.id, feld: "anbruch", wert: { seit: "2026-11-10", rest: 40 } }], "jeder Eintrag bekommt SEINEN alten Wert");
  // anderes Handy aendert den Ziel-Fuellstand: nur die Quelle zurueck (R2 #5)
  const b = teilHandy("teilgeraet2"); b.sieh(h.vs);
  const fremd = b.tu([{ typ: "feld", art: "eintrag", ziel: z.id, feld: "anbruch", wert: { seit: "2026-11-10", rest: 10 } }]);
  assert.deepStrictEqual(H.rueckSchritte(fertig, vor, jetztMap([...h.vs, ...fremd])).map((v) => v.ziel), [q.id]);
  // ohne Ziel: Quelle zu x3 -> abspalten + neu im Ziel, Rueckgaengig = nur Mengen, alle Kennungen geprueft
  const [drei] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Zucker", fach: f.id }, menge: 3 }]);
  const vor3 = new Map([[drei.id, jetztMap(h.vs).get(drei.id)]]);
  const f3 = h.tu(H.teilSchritte(vor3.get(drei.id), null, 25, g.id, HEUTE).schritte);
  j = jetztMap(h.vs);
  assert.deepStrictEqual([j.get(drei.id).menge, j.get(f3[1].id).anbruch.rest, j.get(f3[2].id).anbruch.rest, j.get(f3[2].id).fach], [2, 75, 25, g.id]);
  const r3 = H.rueckSchritte(f3, vor3, j);
  assert.deepStrictEqual(r3.map((v) => [v.ziel, v.delta]), [[drei.id, 1], [f3[1].id, -1], [f3[2].id, -1]]);
  assert.ok(!r3.some((v) => v.feld === "geloescht"));
  b.sieh(h.vs);
  // Teil am Ziel inzwischen benutzt -> kein Rueckgaengig; alter Eintrag verschoben -> kein Rueckgaengig
  const benutzt = b.tu([{ typ: "menge", art: "eintrag", ziel: f3[2].id, delta: -1, grund: "entnahme" }]);
  assert.match(H.rueckSchritte(f3, vor3, jetztMap([...h.vs, ...benutzt])), /benutzt/);
  const weg = b.tu([{ typ: "feld", art: "eintrag", ziel: drei.id, feld: "fach", wert: g.id }]);
  assert.match(H.rueckSchritte(f3, vor3, jetztMap([...h.vs, ...weg])), /verschoben/);
  h.tu(r3);
  j = jetztMap(h.vs);
  assert.deepStrictEqual([j.get(drei.id).menge, j.get(f3[1].id).sichtbar, j.get(f3[2].id).sichtbar], [3, false, false], "wieder x3, beide Teile unsichtbar");
  // alter Aufruf mit EINEM Eintrag geht weiter
  const [e1] = h.tu([{ typ: "neu", art: "eintrag", werte: { name: "Salz", fach: f.id }, menge: 1 }]);
  const v1 = jetztMap(h.vs).get(e1.id), fe1 = h.tu(H.anbrechenSchritte(v1, 50, HEUTE));
  assert.deepStrictEqual(H.rueckSchritte(fe1, v1, jetztMap(h.vs)), [{ typ: "feld", art: "eintrag", ziel: e1.id, feld: "anbruch", wert: null }]);
});

fall("v6.28 neue Orte: Haengeregal + Kuehlschrank in EINEM Schritt, alles Ablagen, Knopf nur solange der Name fehlt", () => {
  const h = teilHandy();
  // wie Speicher.ausfuehrenAlle: Funktionen bekommen die bisher erzeugten Vorgaenge
  const lauf = (schritte) => { const bisher = []; for (const s of schritte) for (const d of [].concat(typeof s === "function" ? s(bisher) : s)) bisher.push(...h.tu([d])); return bisher; };
  assert.deepStrictEqual(H.neueOrteFuer([]).map((d) => d.name), ["Hängeregal", "Kühlschrank"]);
  const k = lauf(H.neuerOrtSchritte(H.NEUE_ORTE[1], 4));
  const r = lauf(H.neuerOrtSchritte(H.NEUE_ORTE[0], 5));
  assert.deepStrictEqual([k.length, r.length], [7, 2], "Ort + 6 bzw. 1 Fach");
  const s = M.berechne(h.vs);
  const ort = (n) => s.orte.find((o) => o.name === n);
  assert.deepStrictEqual([ort("Kühlschrank").reihen, ort("Kühlschrank").spalten, ort("Kühlschrank").reihenfolge, ort("Kühlschrank").farben], [3, 2, 4, ["weiß", "weiß", "weiß"]]);
  const an = (n, r, c) => s.faecher.find((f) => f.lage.ort === ort(n).id && f.lage.reihe === r && f.lage.spalte === c);
  assert.deepStrictEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].map(([r, c]) => an("Kühlschrank", r, c).name),
    ["Oben", "Unten", "Gemüsefach", "Tür oben", "Tür Mitte", "Tür unten"]);
  assert.deepStrictEqual([ort("Hängeregal").reihen, ort("Hängeregal").spalten, an("Hängeregal", 0, 0).name], [1, 1, "Boden"]);
  assert.ok(s.faecher.every((f) => f.offen === true && !f.ortKlaeren), "alles Ablagen, alles auf gueltigem Platz");
  // Knoepfe: nur fehlende, geloeschter Ort zaehlt nicht
  assert.deepStrictEqual(H.neueOrteFuer(s.orte), []);
  assert.deepStrictEqual(H.neueOrteFuer([{ ...ort("Kühlschrank"), geloescht: true }]).map((d) => d.name), ["Hängeregal", "Kühlschrank"]);
  const o = { name: "Regal", reihen: 2, spalten: 1 };
  assert.deepStrictEqual(H.umbauKnoepfe(o, true, H.neueOrteFuer([])).filter((x) => x.gruppe === "Neuer Ort").map((x) => x.text), ["➕ Hängeregal anlegen", "➕ Kühlschrank anlegen"]);
  assert.deepStrictEqual(H.umbauKnoepfe(o, false, H.neueOrteFuer([])), [], "nur im Bearbeiten-Modus");
  assert.ok(!H.umbauKnoepfe(o, true).some((x) => x.gruppe === "Neuer Ort"), "ohne Freigabe (darfSchreiben) keine");
});

fall("v6.28 kochText: Prompt oben, je Ort/Fach, Menge/MHD/essen bis/offen/Markierung, nur Sichtbares, keine Codes/Kennungen", () => {
  const h = teilHandy();
  const [gf, med] = h.tu([{ typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 2, spalten: 1 } },
    { typ: "neu", art: "ort", werte: { name: "Medizinschrank", reihen: 1, spalten: 1, stil: "sortierkasten" } }]);
  const [s1, s2, m1] = h.tu([{ typ: "neu", art: "fach", werte: { name: "Schublade 1", lage: { ort: gf.id, reihe: 0, spalte: 0 } } },
    { typ: "neu", art: "fach", werte: { name: "Schublade 2", lage: { ort: gf.id, reihe: 1, spalte: 0 } } },
    { typ: "neu", art: "fach", werte: { name: "Pflaster", lage: { ort: med.id, reihe: 0, spalte: 0 } } }]);
  const [, , , , weg, minus] = h.tu([
    { typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: "2026-11-25", fach: s1.id, code: MEHL }, menge: 3 },     // rot
    { typ: "neu", art: "eintrag", werte: { name: "Pizza  Salami", mhd: "2027-03", fach: s1.id }, menge: 1 },           // ok, Leerraum
    { typ: "neu", art: "eintrag", werte: { name: "Gulasch", eingefroren: "2026-06-01", frist: 6, fach: s2.id, anbruch: { seit: HEUTE, rest: 35 } }, menge: 1 }, // essen bis 01.12., gelb
    { typ: "neu", art: "eintrag", werte: { name: "Eis", mhd: "2026-10", fach: s2.id }, menge: 2 },                     // abgelaufen
    { typ: "neu", art: "eintrag", werte: { name: "Weg", fach: s2.id }, menge: 1 },
    { typ: "neu", art: "eintrag", werte: { name: "Brot", fach: s2.id }, menge: 1 },
    { typ: "neu", art: "eintrag", werte: { name: "Ibuprofen", fach: m1.id }, menge: 1 }]);
  h.tu([{ typ: "feld", art: "eintrag", ziel: weg.id, feld: "geloescht", wert: true }, { typ: "menge", art: "eintrag", ziel: minus.id, delta: -3, grund: "entnahme" }]);
  const s = M.berechne(h.vs), oG = s.orte.find((o) => o.id === gf.id), oM = s.orte.find((o) => o.id === med.id);
  const t = H.kochText([oG], s.faecher, s.eintraege, HEUTE);
  assert.strictEqual(t.split("\n")[0], H.KOCH_PROMPT);
  assert.ok(/5 Gerichte/.test(H.KOCH_PROMPT) && /bald abläuft/.test(H.KOCH_PROMPT) && /fehlt/.test(H.KOCH_PROMPT) && /Salz, Pfeffer, Öl und Wasser/.test(H.KOCH_PROMPT));
  assert.deepStrictEqual(t.split("\n").slice(1), ["", "Mein Vorrat, Stand 20.11.2026:", "", "== Gefrierschrank ==",
    "Schublade 1:",
    "- Erbsen ×3 · MHD 25.11.2026 · läuft bald ab",
    "- Pizza Salami · MHD 03.2027",
    "Schublade 2:",
    "- Eis ×2 · MHD 10.2026 · ABGELAUFEN",
    "- Gulasch · essen bis 01.12.2026 · offen 35 % · läuft bald ab",
    "- Brot (Menge unklar)"]);
  assert.ok(!t.includes("gtin") && !t.includes(h.vs[0].inst) && !t.includes("Weg") && !t.includes("Ibuprofen"), "keine Codes/Kennungen, nichts Geloeschtes, Medizinschrank nicht gewaehlt");
  assert.ok(H.kochText([oG, oM], s.faecher, s.eintraege, HEUTE).endsWith("== Medizinschrank ==\nPflaster:\n- Ibuprofen"));
  assert.ok(!H.kochText([oM], s.faecher, s.eintraege.filter((e) => e.fach !== m1.id), HEUTE).includes("=="), "leerer Ort: keine Ueberschrift");
});

console.log("\n" + faelle + " Faelle bestanden.");
