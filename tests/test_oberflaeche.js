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

console.log("\n" + faelle + " Faelle bestanden.");
