// v6.24 Kuechenschublade (Bauplan Kuechenschublade Fassung 2): Vorlage H.KUECHE, verallgemeinerte vorlageSchritte,
// Codex R1 #3 (nur echte Umzuegler sind kein Hindernis) fuer beide Vorlagen, Deckelfarben, Etikett. Aufruf: node tests/test_kueche.js
"use strict";
const assert = require("assert");
const path = require("path");
const M = require(path.join(__dirname, "../modell.js"));
globalThis.Modell = M;
const H = require(path.join(__dirname, "../hilfen.js"));

let faelle = 0;
function fall(name, fn) { fn(); faelle++; console.log("ok  " + name); }

const ORT = "kuecheaaa1-1";
const KUECHE = H.VORLAGEN.find((v) => v.ortName === "Küchenschublade");
const MEDIZIN = H.VORLAGEN.find((v) => v.ortName === "Medizinschrank");
const zellen = (f) => Array.from({ length: f.hoch || 1 }, (_, i) => (f.lage.reihe + i) + "," + f.lage.spalte);
// frei() wie in app.js; ohne umzug (alter Aufrufer) gelten ALLE vorhandenen als Umzuegler - so rief es v6.23 auf.
const freiAus = (faecher, vorhanden) => (r, c, umzug = new Set(vorhanden.map((f) => f.id))) =>
  !faecher.some((f) => !umzug.has(f.id) && f.lage.spalte === c && f.lage.reihe <= r && r < f.lage.reihe + (f.hoch || 1));
// Schritte auf eine Kopie anwenden und den Endstand liefern (nur lage/hoch/farbe/neu - mehr schreibt die Vorlage nicht).
function nachher(faecher, schritte) {
  const neu = faecher.map((f) => ({ ...f, lage: { ...f.lage } }));
  let n = 0;
  for (const v of schritte) {
    if (v.art !== "fach") continue;
    if (v.typ === "neu") neu.push({ id: "neu" + n++, ...v.werte });
    else Object.assign(neu.find((f) => f.id === v.ziel), { [v.feld]: v.wert });
  }
  return neu;
}
const ueberlappung = (faecher) => { const z = faecher.flatMap(zellen); return z.length - new Set(z).size; };
const fach = (id, name, reihe, spalte, mehr) => ({ id, name, lage: { ort: ORT, reihe, spalte }, ...mehr });

fall("H.KUECHE v6.26: 4 x 5, Dosen alle 1 Platz, nur Platz 2/0 frei, keine Ueberlappung, Namen eindeutig, Farben bekannt", () => {
  const p = H.kuechePlaetze();
  assert.deepStrictEqual([H.KUECHE.reihen, H.KUECHE.spalten], [4, 5]);
  assert.strictEqual(p.length, 17, "14 Dosen + 2 Ablagen + alte Schublade");
  assert.ok(p.every((x) => x.offen || x.hoch === 1), "Tobias 20.11.: alle Dosen gleich gross");
  assert.deepStrictEqual(p.filter((x) => x.hoch > 1).map((x) => [x.name, x.hoch]), [["Tüten", 2], ["Dr. Oetker", 2]]);
  const z = p.flatMap((x) => Array.from({ length: x.hoch }, (_, i) => (x.reihe + i) + "," + x.spalte));
  assert.strictEqual(new Set(z).size, z.length, "keine Ueberlappung");
  assert.strictEqual(z.length, 19, "20 Plaetze, einer frei");
  assert.ok(!z.includes("2,0"), "Reihe 3 links frei (Foto)");
  assert.ok(p.every((x) => x.reihe >= 0 && x.reihe + x.hoch <= 4 && x.spalte >= 0 && x.spalte < 5), "im Raster");
  assert.strictEqual(new Set(p.map((x) => x.name)).size, p.length, "Namen eindeutig");
  assert.ok(p.filter((x) => x.farbe).every((x) => Object.hasOwn(H.DECKEL, x.farbe)), "Farben aus der Liste");
  assert.deepStrictEqual(p.filter((x) => x.offen).map((x) => x.name), ["Tüten", "Dr. Oetker"]);
  assert.deepStrictEqual(p.filter((x) => x.nurUmsetzen).map((x) => [x.name, x.reihe, x.spalte, x.hoch]), [["Schublade", 3, 0, 1]], "R10: alte Schublade vorne links");
  assert.ok(!p.some((x) => x.farbe === "weiss" || x.farbe === "durchsichtig"), "weiss/durchsichtig nicht in der Vorlage");
  assert.strictEqual(p.find((x) => x.name === "Pudding").farbe, "rot");
});

fall("vorlageFuer + Umbau-Knopf: Kuechenschublade bis stil dosen in 4 Reihen, alte 8er-Fassung bekommt den Umstell-Knopf, R2", () => {
  const k = { name: "Küchenschublade", reihen: 1, spalten: 1 };
  assert.strictEqual(H.vorlageFuer(k), KUECHE);
  assert.strictEqual(H.vorlageFuer({ ...k, stil: "dosen", reihen: 4, spalten: 5 }), null);
  assert.strictEqual(H.vorlageFuer({ ...k, stil: "dosen", reihen: 5, spalten: 6 }), null, "R2: eingerichtet = kein Knopf mehr, auch nach eigenem Umbau");
  assert.strictEqual(H.vorlageFuer({ ...k, stil: "dosen", reihen: 8, spalten: 5 }), KUECHE, "v6.26: alte Fassung 8 x 5 -> umstellen");
  assert.strictEqual(KUECHE.knopf({ ...k, stil: "dosen", reihen: 8, spalten: 5 }), "🫙 Gleich große Dosen übernehmen (4 × 5)");
  assert.strictEqual(KUECHE.dialogKnopf({ ...k, stil: "dosen", reihen: 8, spalten: 5 }), "🫙 Gleich große Dosen übernehmen");
  assert.strictEqual(H.vorlageFuer({ name: "Gefrierschrank", reihen: 6, spalten: 1 }), null);
  assert.strictEqual(H.vorlageFuer({ name: "Hängeregal", reihen: 1, spalten: 1, stil: "sortierkasten" }), null);
  assert.strictEqual(H.vorlageFuer({ name: "Medizinschrank", reihen: 3, spalten: 2 }), MEDIZIN);
  assert.strictEqual(H.vorlageFuer({ name: "Medizinschrank", reihen: 12, spalten: 8, stil: "sortierkasten" }), null);
  assert.strictEqual(H.vorlageFuer(null), null);
  assert.deepStrictEqual(H.umbauKnoepfe(k, true).map((x) => x.text), ["🫙 Wie auf dem Foto einrichten (14 Dosen, 2 Ablagen)", "✎ Name und Größe …"]);
  assert.deepStrictEqual(H.umbauKnoepfe(k, false), []);
  assert.ok(!H.umbauKnoepfe({ ...k, stil: "dosen", reihen: 4, spalten: 5 }, true).some((x) => x.id === "vorlage"));
});

fall("vorlageSchritte Kueche, alles frei: Ort-Felder + 16 neue Faecher, gueltig laut Modell", () => {
  const { schritte, bleiben, leer } = H.vorlageSchritte(ORT, KUECHE, () => true);
  assert.deepStrictEqual(schritte.filter((v) => v.art === "ort").map((v) => [v.feld, v.wert]), [["reihen", 4], ["spalten", 5], ["stil", "dosen"]]);
  const neu = schritte.filter((v) => v.typ === "neu");
  assert.strictEqual(neu.length, 16, "14 Dosen + 2 Ablagen (Schublade wird nie neu angelegt)");
  assert.deepStrictEqual([bleiben, leer], [[], []]);
  for (const v of schritte) assert.strictEqual(H.pruefe(v.art, v.typ === "neu" ? v.werte : { [v.feld]: v.wert }), null, JSON.stringify(v));
  const reis = neu.find((v) => v.werte.name === "Reis").werte;
  assert.deepStrictEqual([reis.lage, reis.hoch, reis.farbe, reis.offen], [{ ort: ORT, reihe: 0, spalte: 0 }, undefined, "pink", undefined]);
  const tueten = neu.find((v) => v.werte.name === "Tüten").werte;
  assert.deepStrictEqual([tueten.offen, tueten.hoch, tueten.farbe], [true, 2, undefined]);
  assert.ok(!Object.hasOwn(neu.find((v) => v.werte.name === "Backpulver/Vanillezucker").werte, "hoch"), "hoch 1 wird nicht geschrieben");
  assert.strictEqual(ueberlappung(nachher([], schritte)), 0);
});

fall("Grundausstattung: Schublade auf 0/0 wird nach vorne links umgesetzt, Reis angelegt, Inhalt bleibt (Kennung gleich)", () => {
  const alt = [fach("schubaaa1-1", "Schublade", 0, 0)];
  const { schritte } = H.vorlageSchritte(ORT, KUECHE, freiAus(alt, alt), alt);
  assert.deepStrictEqual(schritte.filter((v) => v.ziel === "schubaaa1-1").map((v) => [v.feld, v.wert]),
    [["lage", { ort: ORT, reihe: 3, spalte: 0 }]], "nur lage, keine Farbe, hoch bleibt 1");
  assert.ok(schritte.some((v) => v.typ === "neu" && v.werte.name === "Reis"));
  assert.strictEqual(ueberlappung(nachher(alt, schritte)), 0);
});

fall("Vorhandene Dosen: Lage gesetzt, eigene Farbe bleibt, fehlende Farbe kommt dazu", () => {
  const alt = [fach("mehlaaaa1-1", "Mehl", 0, 0, { farbe: "weiss" }), fach("zuckeraa1-1", "Zucker", 0, 1)];
  const { schritte } = H.vorlageSchritte(ORT, KUECHE, freiAus(alt, alt), alt);
  assert.deepStrictEqual(schritte.filter((v) => v.ziel === "mehlaaaa1-1").map((v) => v.feld), ["lage"], "Mehl: Farbe weiss NICHT ueberschrieben");
  assert.deepStrictEqual(schritte.filter((v) => v.ziel === "zuckeraa1-1").map((v) => [v.feld, v.wert]).slice(-1), [["farbe", "pink"]]);
  assert.ok(!schritte.some((v) => v.typ === "neu" && (v.werte.name === "Mehl" || v.werte.name === "Zucker")));
  assert.strictEqual(ueberlappung(nachher(alt, schritte)), 0);
});

fall("Codex R1 #3 Kueche: vorhandenes Fach mit belegtem Ziel bleibt stehen, auf seinem Platz entsteht KEIN neues Fach", () => {
  // Mehl steht auf dem Platz von Reis, das Ziel von Mehl (2/4) belegt ein fremdes Fach -> Mehl bleibt, Reis wird nicht angelegt
  const alt = [fach("mehlaaaa1-1", "Mehl", 0, 0), fach("fremdaaa1-1", "Fremd", 2, 4)];
  const vorhanden = [alt[0]];
  const r = H.vorlageSchritte(ORT, KUECHE, freiAus(alt, vorhanden), vorhanden);
  assert.ok(!r.schritte.some((v) => v.ziel === "mehlaaaa1-1"), "Mehl bleibt");
  assert.ok(!r.schritte.some((v) => v.typ === "neu" && v.werte.name === "Reis"), "kein Reis auf Mehl");
  assert.deepStrictEqual([r.bleiben, r.leer], [["Mehl"], ["Reis"]], "Rueckfrage nennt beides");
  assert.strictEqual(ueberlappung(nachher(alt, r.schritte)), 0);
  // Kette (Fixpunkt): Reis steht auf dem Platz von Zucker, sein Ziel blockiert das stehenbleibende Mehl -> Reis bleibt
  // auch, und Zucker wird nicht auf Reis angelegt. Reihenfolge der Plaetze darf keine Rolle spielen.
  const alt2 = [...alt, fach("reisaaaa1-1", "Reis", 1, 4)];
  const v2 = [alt2[0], alt2[2]];
  const r2 = H.vorlageSchritte(ORT, KUECHE, freiAus(alt2, v2), v2);
  assert.deepStrictEqual([r2.bleiben, r2.leer], [["Reis", "Mehl"], ["Zucker"]]);
  assert.strictEqual(ueberlappung(nachher(alt2, r2.schritte)), 0);
});

fall("v6.26 Umstellung der alten Fassung 8 x 5 (Tobias Handy): alles umgesetzt, nichts neu, Hoehen weg, keine Ueberlappung", () => {
  // Stand v6.24/v6.25 nach der Vorlage; Inhalt haengt an der Kennung (die Vorlage fasst Eintraege nie an)
  const ALT = [["Reis", 0, 0, 3, "pink"], ["Woknudeln", 3, 0, 3, "dunkelblau"], ["Schublade", 6, 0, 2],
    ["Risottoreis", 0, 1, 2, "pink"], ["Tüten", 2, 1, 4, null, true], ["Croutons", 6, 1, 2, "dunkelblau"],
    ["Grieß", 0, 2, 3, "dunkelblau"], ["Dr. Oetker", 3, 2, 2, null, true], ["Schokoguss", 5, 2, 3, "schwarz"],
    ["Pudding", 0, 3, 3, "rot"], ["Backpulver/Vanillezucker", 3, 3, 1, "dunkelblau"], ["Schokostückchen", 4, 3, 2, "dunkelblau"], ["Kakaopulver", 6, 3, 2, "hellgruen"],
    ["Puderzucker", 0, 4, 2, "dunkelblau"], ["Zucker", 2, 4, 2, "pink"], ["Mehl", 4, 4, 2, "pink"], ["Speisestärke", 6, 4, 2, "petrol"]];
  const alt = ALT.map(([name, r, c, hoch, farbe, offen], i) => fach("altfach" + i + "-1", name, r, c, { ...(hoch > 1 ? { hoch } : {}), ...(farbe ? { farbe } : {}), ...(offen ? { offen } : {}) }));
  const { schritte, bleiben, leer } = H.vorlageSchritte(ORT, KUECHE, freiAus(alt, alt), alt);
  assert.deepStrictEqual([bleiben, leer], [[], []], "niemand bleibt stehen (alle sind Umzuegler)");
  assert.ok(!schritte.some((v) => v.typ === "neu"), "nichts neu angelegt");
  assert.ok(!schritte.some((v) => v.feld === "farbe" || v.feld === "offen" || v.feld === "name" || v.feld === "geloescht"), "nur lage/hoch, Farben bleiben");
  assert.deepStrictEqual(schritte.filter((v) => v.art === "ort").map((v) => [v.feld, v.wert]), [["reihen", 4], ["spalten", 5], ["stil", "dosen"]]);
  for (const v of schritte) assert.strictEqual(H.pruefe(v.art, v.typ === "neu" ? v.werte : { [v.feld]: v.wert }), null, JSON.stringify(v));
  const end = nachher(alt, schritte);
  assert.strictEqual(ueberlappung(end), 0);
  assert.ok(end.every((f) => f.lage.reihe + (f.hoch || 1) <= 4), "alles im 4er-Raster");
  assert.deepStrictEqual(end.filter((f) => (f.hoch || 1) > 1).map((f) => f.name).sort(), ["Dr. Oetker", "Tüten"]);
  const reis = end.find((f) => f.name === "Reis"), schub = end.find((f) => f.name === "Schublade");
  assert.deepStrictEqual([reis.lage.reihe, reis.lage.spalte, reis.hoch, schub.lage.reihe, schub.lage.spalte, schub.hoch], [0, 0, null, 3, 0, null]);
  assert.deepStrictEqual(end.map((f) => f.id).sort(), alt.map((f) => f.id).sort(), "dieselben Kennungen -> Inhalt bleibt");
});

fall("Codex R1 #3 Medizin (vorher rot, nachher gruen): Salben auf dem Platz von Klebeband, Ziel von Salben belegt", () => {
  const ORTM = "medizinaa1-1";
  const alt = [{ id: "salbenaa1-1", name: "Salben", lage: { ort: ORTM, reihe: 2, spalte: 0 } }, { id: "fremdaaa1-1", name: "Fremd", lage: { ort: ORTM, reihe: 3, spalte: 1 } }];
  const vorhanden = [alt[0]];
  const st = H.medizinSchritte(ORTM, freiAus(alt, vorhanden), vorhanden); // derselbe Aufruf wie in v6.23
  assert.ok(!st.some((v) => v.ziel === "salbenaa1-1"), "Salben bleibt stehen");
  assert.ok(!st.some((v) => v.typ === "neu" && v.werte.name === "Klebeband"), "kein Klebeband auf Salben");
  assert.strictEqual(ueberlappung(nachher(alt, st)), 0, "keine zwei Faecher uebereinander");
  assert.deepStrictEqual(H.medizinSchritte(ORTM, () => true), H.vorlageSchritte(ORTM, MEDIZIN, () => true).schritte, "Medizin = vorlageSchritte");
});

fall("Deckel: nur feste Tabelle (hasOwn), unbekannt/constructor/kein Text -> grau ohne Farbangabe", () => {
  assert.deepStrictEqual(Object.keys(H.DECKEL), ["pink", "rot", "dunkelblau", "schwarz", "hellgruen", "petrol", "weiss", "durchsichtig"]);
  assert.strictEqual(H.deckel("petrol").aria, "petrolfarbener Deckel");
  assert.strictEqual(H.deckel("petrol").fill, "#12706a");
  for (const k of ["constructor", "__proto__", "toString", "lila", null, undefined, true, ["pink"]]) {
    const d = H.deckel(k);
    assert.deepStrictEqual([d.schluessel, d.fill, d.aria], [null, "#9a9da0", "ohne Farbangabe"], String(k));
  }
  for (const k of Object.keys(H.DECKEL)) {
    assert.ok(M.FELDER.fach.farbe(k), "Modell nimmt " + k);
    assert.match(H.deckel(k).fill, /^#[0-9a-f]{6}$/);
  }
});

fall("Etikett zweizeilig: Umbruch an /, Leerzeichen, -, sonst in der Mitte", () => {
  assert.deepStrictEqual(H.etikettZeilen("Reis", 13), ["Reis"]);
  assert.deepStrictEqual(H.etikettZeilen("Speisestärke", 13), ["Speisestärke"]);
  assert.deepStrictEqual(H.etikettZeilen("Backpulver/Vanillezucker", 13), ["Backpulver/", "Vanillezucker"]);
  assert.deepStrictEqual(H.etikettZeilen("Schokostückchen", 13), ["Schokost-", "ückchen"]);
  assert.deepStrictEqual(H.etikettZeilen("Reis Basmati lang", 13), ["Reis", "Basmati lang"]);
  assert.deepStrictEqual(H.etikettZeilen("Vollkorn-Spaghetti", 13), ["Vollkorn-", "Spaghetti"]);
});

console.log("\n" + faelle + " Faelle bestanden.");
