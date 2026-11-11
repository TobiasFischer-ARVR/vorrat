// Pruefstand Abschnitt 4: Code-Parser (EAN, GS1-DataMatrix, IFA/PPN), Eingabe, Open Food Facts, Code-Gedaechtnis.
// Alle Codes sind erfunden; Pruefziffern werden hier ausgerechnet. Aufruf: node tests/test_codes.js
"use strict";
const assert = require("assert");
const M = require("../modell.js");
const H = require("../hilfen.js");

let faelle = 0;
function fall(name, fn) { fn(); faelle++; console.log("ok  " + name); }

const GS = "\x1d", RS = "\x1e", EOT = "\x04";
function gtinZiffer(ohne) { let s = 0; for (let i = 0; i < ohne.length; i++) s += Number(ohne[ohne.length - 1 - i]) * (i % 2 === 0 ? 3 : 1); return String((10 - (s % 10)) % 10); }
const gtin = (ohne) => ohne + gtinZiffer(ohne);
function pzn(sieben) { let s = 0; for (let i = 0; i < 7; i++) s += Number(sieben[i]) * (i + 1); if (s % 11 === 10) throw new Error("PZN-Stamm ungueltig"); return sieben + (s % 11); }
const PZN = pzn("1234567");             // Pruefziffer ausgerechnet
const NTIN = gtin("4150" + PZN);         // 13 Stellen
const EAN = gtin("400638133393");        // 13 Stellen, Lebensmittel
const SERIE = "GEHEIM7Q2X9";

fall("Pruefziffern: EAN-13, EAN-8, UPC-A, GTIN-14, PZN", () => {
  assert.ok(H.gtinOk(EAN));
  assert.ok(!H.gtinOk(EAN.slice(0, 12) + ((Number(EAN[12]) + 1) % 10)));
  assert.ok(H.gtinOk(gtin("9638507")), "EAN-8");
  assert.ok(H.gtinOk(gtin("03600029145")), "UPC-A");
  assert.ok(H.gtinOk("0" + NTIN), "GTIN-14");
  assert.ok(!H.gtinOk("123"));
  assert.ok(!H.gtinOk(12345678));
  assert.ok(H.pznOk(PZN));
  assert.ok(!H.pznOk(PZN.slice(0, 7) + ((Number(PZN[7]) + 1) % 10)));
  assert.ok(!H.pznOk("1234567"), "nur 8 Stellen");
});

fall("EAN/UPC vom Scanner: Schluessel, OFF-Code, vereinheitlicht, falsche Pruefziffer -> null", () => {
  assert.deepStrictEqual(H.leseCode(EAN, "ean_13"), { art: "ean", schluessel: "gtin:" + EAN, ean: EAN, pzn: null, mhd: null, anzeige: "EAN " + EAN });
  const upc = gtin("03600029145");
  assert.strictEqual(H.leseCode(upc, "upc_a").ean, "0" + upc, "UPC-A -> 13 Stellen");
  const e8 = gtin("9638507");
  assert.strictEqual(H.leseCode(e8, "ean_8").schluessel, "gtin:" + e8);
  assert.strictEqual(H.leseCode(EAN.slice(0, 12) + ((Number(EAN[12]) + 1) % 10), "ean_13"), null);
  assert.strictEqual(H.leseCode("", "ean_13"), null);
  assert.strictEqual(H.leseCode(null), null);
  assert.strictEqual(H.leseCode("x".repeat(600)), null);
  // EAN-13 eines Arzneimittels (NTIN) -> PZN, nicht an Open Food Facts
  assert.deepStrictEqual(H.leseCode(NTIN, "ean_13"), { art: "ean", schluessel: "pzn:" + PZN, ean: null, pzn: PZN, mhd: null, anzeige: "PZN " + PZN });
});

fall("GS1-DataMatrix: GTIN + Verfall, Seriennummer und Charge nie im Ergebnis", () => {
  const varianten = [
    "01" + "0" + NTIN + "17" + "280331" + "10" + "CH42" + GS + "21" + SERIE,      // ohne fuehrendes FNC1
    GS + "01" + "0" + NTIN + "21" + SERIE + GS + "17" + "280331" + "10" + "CH42",  // andere Reihenfolge
    "]d2" + GS + "01" + "0" + NTIN + "17" + "280331" + "21" + SERIE + GS + "10CH42", // mit Symbologie-Kennung
    "(01)0" + NTIN + "(17)280331(10)CH42(21)" + SERIE,                              // Klarschrift-Form
    "17" + "280331" + "01" + "0" + NTIN + "21" + SERIE + GS + "10CH42",               // Verfall zuerst
    "710" + PZN + GS + "17" + "280331" + "21" + SERIE,                                // nur AI 710 (ohne GTIN)
  ];
  for (const v of varianten) {
    const r = H.leseCode(v, "data_matrix");
    assert.deepStrictEqual(r, { art: "gs1", schluessel: "pzn:" + PZN, ean: null, pzn: PZN, mhd: "2028-03-31", anzeige: "PZN " + PZN }, JSON.stringify(v));
    assert.ok(!JSON.stringify(r).includes(SERIE), "Seriennummer darf nie im Ergebnis stehen");
    assert.ok(!JSON.stringify(r).includes("CH42"), "Charge wird nicht uebernommen");
  }
});

fall("GS1: Tag 00 = nur Monat, ungueltiges Datum -> kein MHD, Lebensmittel-GTIN -> OFF, AI 710 = PZN", () => {
  assert.strictEqual(H.leseCode("01" + "0" + NTIN + "17" + "271200", "data_matrix").mhd, "2027-12");
  assert.strictEqual(H.leseCode("01" + "0" + NTIN + "17" + "270230", "data_matrix").mhd, null, "30. Februar");
  assert.strictEqual(H.leseCode("01" + "0" + NTIN + "17" + "271300", "data_matrix").mhd, null, "Monat 13");
  const essen = H.leseCode("01" + "0" + EAN + "17" + "270615", "data_matrix");
  assert.deepStrictEqual([essen.schluessel, essen.ean, essen.mhd], ["gtin:" + EAN, EAN, "2027-06-15"]);
  const mit710 = H.leseCode("01" + "0" + EAN + "17" + "270615" + "710" + PZN + GS + "21" + SERIE, "data_matrix");
  assert.strictEqual(mit710.schluessel, "pzn:" + PZN);
  assert.strictEqual(H.leseCode("01" + "0" + NTIN.slice(0, 12) + "0" + "17280331", "data_matrix"), null, "falsche GTIN-Pruefziffer, nichts anderes da");
  assert.strictEqual(H.leseCode("hallo welt", "data_matrix"), null);
  assert.strictEqual(H.leseCode("https://example.org/x", "qr_code"), null);
});

fall("IFA/PPN: 9N + D, Seriennummer S und Charge 1T ignoriert", () => {
  const ppn = "11" + PZN + "42"; // Pruefziffern der PPN werden nicht geprueft (nur die PZN darin)
  const code = "[)>" + RS + "06" + GS + "9N" + ppn + GS + "1T" + "CH42" + GS + "D" + "290600" + GS + "S" + SERIE + RS + EOT;
  const r = H.leseCode(code, "data_matrix");
  assert.deepStrictEqual(r, { art: "ifa", schluessel: "pzn:" + PZN, ean: null, pzn: PZN, mhd: "2029-06", anzeige: "PZN " + PZN });
  assert.ok(!JSON.stringify(r).includes(SERIE));
  const tag = H.leseCode("]d2[)>" + RS + "06" + GS + "S" + SERIE + GS + "D" + "290615" + GS + "9N" + ppn + RS + EOT, "data_matrix");
  assert.deepStrictEqual([tag.pzn, tag.mhd], [PZN, "2029-06-15"]);
  assert.strictEqual(H.leseCode("[)>" + RS + "06" + GS + "9N11" + "00000001" + "42" + GS + "D290600", "data_matrix"), null, "PZN-Pruefziffer falsch");
  assert.strictEqual(H.leseCode("[)>" + RS + "06" + GS + "S" + SERIE + RS + EOT, "data_matrix"), null, "nur Seriennummer -> nichts");
});

fall("Eintippen: EAN, PZN mit Praefix, 7-stellige PZN, Leerzeichen", () => {
  assert.strictEqual(H.codeAusEingabe(" " + EAN.slice(0, 4) + " " + EAN.slice(4) + " ").schluessel, "gtin:" + EAN);
  assert.strictEqual(H.codeAusEingabe("PZN " + PZN).schluessel, "pzn:" + PZN);
  assert.strictEqual(H.codeAusEingabe("-" + PZN).schluessel, "pzn:" + PZN);
  const p7 = pzn("0765432").slice(1); // alte 7-stellige PZN = 8-stellige mit fuehrender 0
  assert.strictEqual(H.codeAusEingabe("PZN " + p7).schluessel, "pzn:0" + p7);
  assert.strictEqual(H.codeAusEingabe(PZN).schluessel, H.gtinOk(PZN) ? "gtin:" + PZN : "pzn:" + PZN, "8 Ziffern ohne Praefix: erst EAN-8, dann PZN");
  assert.strictEqual(H.codeAusEingabe("PZN " + PZN.slice(0, 7) + ((Number(PZN[7]) + 1) % 10)), null, "PZN mit falscher Pruefziffer");
  assert.strictEqual(H.codeAusEingabe("abc"), null);
  assert.strictEqual(H.codeAusEingabe(""), null);
  assert.strictEqual(H.codeAusEingabe("123"), null);
});

fall("Open Food Facts: deutscher Name zuerst, Marke angehaengt, Unbrauchbares -> null", () => {
  assert.strictEqual(H.offName({ status: 1, product: { product_name_de: "Erbsen fein", product_name: "Petits pois", brands: "Gartenglück, Foo" } }), "Erbsen fein (Gartenglück)");
  assert.strictEqual(H.offName({ status: 1, product: { product_name: "Gartenglück Erbsen", brands: "Gartenglück" } }), "Gartenglück Erbsen");
  assert.strictEqual(H.offName({ status: 1, product: { product_name_de: "  ", product_name: "Pasta\n Nr. 5" } }), "Pasta Nr. 5");
  assert.strictEqual(H.offName({ status: 1, product: { brands: "Nur Marke" } }), null);
  assert.strictEqual(H.offName({ status: 0, status_verbose: "product not found" }), null);
  assert.strictEqual(H.offName(null), null);
  assert.strictEqual(H.offName({ status: 1, product: { product_name: 42 } }), null);
  assert.strictEqual(H.offName({ status: 1, product: { product_name: "x".repeat(300) } }).length, 100);
  assert.ok(M.FELDER.eintrag.name(H.offName({ status: 1, product: { product_name: "x".repeat(300) } })));
});

fall("Code -> Name merken: nur gueltige Schluessel, zuletzt gemerkt hinten, Obergrenze, fremde Schluessel fliegen raus", () => {
  let m = H.codesMerken({}, "gtin:" + EAN, " Erbsen ");
  assert.deepStrictEqual(m, { ["gtin:" + EAN]: "Erbsen" });
  m = H.codesMerken(m, "pzn:" + PZN, "Ibuprofen 400");
  m = H.codesMerken(m, "gtin:" + EAN, "Erbsen fein");
  assert.deepStrictEqual(Object.keys(m), ["pzn:" + PZN, "gtin:" + EAN]);
  assert.deepStrictEqual(H.codesMerken(m, "seriennr:123", "x"), m, "ungueltiger Schluessel wird nicht gemerkt");
  assert.deepStrictEqual(H.codesMerken(m, "pzn:" + PZN, ""), m);
  const voll = H.codesMerken({ "gtin:11111111": "a", "gtin:22222222": "b", "gtin:33333333": "c" }, "gtin:44444444", "d", 3);
  assert.deepStrictEqual(Object.keys(voll), ["gtin:22222222", "gtin:33333333", "gtin:44444444"]);
  assert.deepStrictEqual(H.codesSauber(JSON.parse('{"__proto__": "x", "gtin:12345678": "ok", "pzn:1": "kurz", "gtin:87654321": 5}')), { "gtin:12345678": "ok" });
  assert.deepStrictEqual(H.codesSauber("kaputt"), {});
  assert.deepStrictEqual(H.codesSauber([1, 2]), {});
});

fall("Schema: v3 stoppt bei unbekanntem Vorgangstyp/Feld -> Codes NICHT in die gemeinsamen Dateien", () => {
  // Diese Pruefung steht unveraendert in v3 (modell.js) und laeuft dort auf JEDE gelesene Datei (cloud.js dateiLesen).
  const basis = { id: "testgeraet1-1", inst: "testgeraet1", n: 1, uhr: 1, ziel: "testgeraet1-1" };
  assert.match(M.pruefeVorgang(Object.assign({}, basis, { typ: "code", art: "eintrag", werte: { code: "gtin:" + EAN, name: "Erbsen" } })), /unbekannter Vorgangstyp/);
  assert.match(M.pruefeVorgang(Object.assign({}, basis, { typ: "neu", art: "eintrag", werte: { name: "Erbsen", code: "gtin:" + EAN }, menge: 1 })), /unbekanntes Feld/);
  assert.match(M.pruefeVorgang(Object.assign({}, basis, { typ: "neu", art: "code", werte: { name: "Erbsen" } })), /unbekannte Art/);
  assert.strictEqual(M.pruefeDatei({ schema: 2, inst: "testgeraet1", vorgaenge: [] }).ok, false, "neue Schema-Nummer waere fuer v3 ebenfalls ein Stopp");
  // Ein gescannter Eintrag (Name + MHD aus dem Code) ist ein ganz normaler v3-Vorgang
  const v = M.erzeuge({ inst: "testgeraet1", nr: 1, uhr: 0 }, { typ: "neu", art: "eintrag", werte: { name: "Ibuprofen 400", mhd: H.leseCode("01" + "0" + NTIN + "17280300", "data_matrix").mhd, fach: null }, menge: 1 }).vorgang;
  assert.deepStrictEqual(M.pruefeDatei({ schema: M.SCHEMA, inst: "testgeraet1", vorgaenge: [v] }), { ok: true, fehler: null });
  assert.strictEqual(M.SCHEMA, 1, "Schema bleibt 1: v3- und v4-Dateien sind gleich aufgebaut");
});

console.log("\n" + faelle + " Faelle bestanden.");
