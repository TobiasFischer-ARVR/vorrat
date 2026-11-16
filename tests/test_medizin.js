// Kurzpruefung der Medizinschrank-Vorlage (v6.5): eindeutige Plaetze/Namen, im Raster, Schritte gueltig laut Modell.
const assert = require("assert");
const app = "../";
const Modell = require(require("path").join(__dirname, "../modell.js"));
globalThis.Modell = Modell;
const H = require(require("path").join(__dirname, "../hilfen.js"));
const p = H.medizinPlaetze();
assert.strictEqual(p.length, 34 + 2, "34 Schubladen + 2 Ablagen");
assert.strictEqual(new Set(p.map((x) => x.reihe + "," + x.spalte)).size, p.length, "Plaetze eindeutig");
assert.strictEqual(new Set(p.map((x) => x.name)).size, p.length, "Namen eindeutig");
assert(p.every((x) => x.reihe >= 0 && x.reihe < H.MEDIZIN.reihen && x.spalte >= 0 && x.spalte < H.MEDIZIN.spalten), "im Raster");
const st = H.medizinSchritte("abcdefgh12-3", (r, c) => !(r === 5 && c === 0)); // ein Platz belegt
assert.strictEqual(st.length, 4 + p.length - 1, "belegter Platz wird uebersprungen");
for (const v of st) {
  const werte = v.typ === "neu" ? v.werte : { [v.feld]: v.wert };
  assert.strictEqual(H.pruefe(v.art, werte), null, "gueltig: " + JSON.stringify(werte));
}
assert.strictEqual(st.filter((v) => v.werte && v.werte.offen).length, 2, "2 Ablagen");
assert.notStrictEqual(H.pruefe("ort", { stil: "quatsch" }), null, "falscher Stil abgelehnt");
console.log("Medizin-Vorlage ok:", p.length, "Plaetze,", st.length, "Schritte");
