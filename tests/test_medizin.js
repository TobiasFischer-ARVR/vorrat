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
const st = H.medizinSchritte("abcdefgh12-3", (r, c) => !(r === 11 && c === 0)); // ein Platz belegt (Sonderpflaster unten links)
assert.strictEqual(st.length, 4 + p.length - 1, "belegter Platz wird uebersprungen");
for (const v of st) {
  const werte = v.typ === "neu" ? v.werte : { [v.feld]: v.wert };
  assert.strictEqual(H.pruefe(v.art, werte), null, "gueltig: " + JSON.stringify(werte));
}
assert.strictEqual(st.filter((v) => v.werte && v.werte.offen).length, 2, "2 Ablagen");
assert.notStrictEqual(H.pruefe("ort", { stil: "quatsch" }), null, "falscher Stil abgelehnt");
console.log("Medizin-Vorlage ok:", p.length, "Plaetze,", st.length, "Schritte");

// v6.7 Hoehe: Vorlage ohne Ueberlappung (auch verdeckte Plaetze), Waermepflaster/Schmerzen doppelt hoch
const zellen = p.flatMap((x) => Array.from({ length: x.hoch }, (_, i) => (x.reihe + i) + "," + x.spalte));
assert.strictEqual(new Set(zellen).size, zellen.length, "keine Ueberlappung");
assert(zellen.every((z) => Number(z.split(",")[0]) < H.MEDIZIN.reihen), "nichts ragt unten heraus");
assert.strictEqual(p.find((x) => x.name === "Wärmepflaster").hoch, 5, "Waermepflaster 5 Reihen");
assert(p.filter((x) => x.name.startsWith("Baby") && x.spalte === 7).every((x) => x.hoch === 2) && p.filter((x) => x.spalte === 6).every((x) => x.hoch === 3), "Baby klein (2) neben Baby gross (3)");
for (let s = 0; s < 8; s++) assert.strictEqual(p.filter((x) => x.spalte === s && !x.offen).reduce((n, x) => Math.max(n, x.reihe + x.hoch), 0), H.MEDIZIN.reihen, "Turm " + s + " unten buendig");
// Vorhandene Schublade wird umgesetzt statt neu angelegt
const um = H.medizinSchritte("abcdefgh12-3", () => true, [{ id: "fachaaaa1-1", name: "Wärmepflaster", lage: { ort: "abcdefgh12-3", reihe: 5, spalte: 1 }, hoch: 2 }]);
assert(!um.some((v) => v.typ === "neu" && v.werte.name === "Wärmepflaster") && um.filter((v) => v.ziel === "fachaaaa1-1").map((v) => v.feld).join() === "lage,hoch", "umsetzen statt neu");
assert.strictEqual(H.pruefe("fach", { hoch: 2 }), null, "hoch 2 gueltig");
assert.notStrictEqual(H.pruefe("fach", { hoch: 1 }), null, "hoch 1 wird nicht gespeichert (fehlt = 1)");
assert.notStrictEqual(H.pruefe("fach", { hoch: 7 }), null, "hoch 7 ungueltig");
const vb = H.verbindenSchritte("obenaaaa1-1", 2, "untenaaa1-1", ["eintragaa1-1"]);
assert.deepStrictEqual(vb.map((v) => v.feld), ["fach", "geloescht", "hoch"], "Verbinden: Inhalt umziehen, unteres loeschen, oberes hoeher");
console.log("Hoehe ok");
// Review v6.10: Zielplatz belegt (eigenes Fach) -> vorhandene Schublade wird NICHT umgesetzt
const blockiert = H.medizinSchritte("abcdefgh12-3", (r, c) => !(c === 1 && r === 4), [{ id: "fachaaaa1-1", name: "Salben", lage: { ort: "abcdefgh12-3", reihe: 0, spalte: 0 } }]);
assert(!blockiert.some((v) => v.ziel === "fachaaaa1-1"), "belegter Zielplatz: nicht umsetzen");
console.log("Umsetzen ok");
