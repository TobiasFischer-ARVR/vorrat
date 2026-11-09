// kunstdaten.js - erzeugt Vorgangsdateien fuer zwei simulierte Handys ueber mehrere Jahre.
// Fuer den Wachstumstest (Bauplan R2 #5/#6): Node-Pruefstand jetzt, spaeter versteckter Knopf in der App.
(function (wurzel) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./modell.js") : wurzel.Modell;

  function zufall(saat) { // mulberry32, reproduzierbar
    return function () {
      saat |= 0; saat = (saat + 0x6d2b79f5) | 0;
      let t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // tage: Laufzeit, proTag: Vorgaenge je Handy und Tag (ungefaehr).
  function kunstdaten(optionen) {
    const o = Object.assign({ tage: 1095, proTag: 15, saat: 42, start: "2026-11-10" }, optionen);
    const r = zufall(o.saat);
    const wahl = (a) => a[Math.floor(r() * a.length)];
    const handys = ["kunstA0000000001", "kunstB0000000002"].map((inst) => ({ zaehler: { inst, nr: 1, uhr: 0 }, liste: [] }));
    const tag0 = new Date(o.start + "T08:00:00");

    const schreibe = (h, daten, jetzt) => {
      const e = M.erzeuge(h.zaehler, daten, jetzt);
      h.zaehler = e.zaehler; h.liste.push(e.vorgang);
      return e.vorgang;
    };

    // Grundausstattung (Handy A): 4 Orte, je Platz ein Fach.
    const A = handys[0];
    const faecher = [];
    for (const [name, reihen, spalten] of [["Gefrierschrank", 6, 1], ["Vorrats-Regal", 4, 2], ["Kuechenschublade", 1, 1], ["Medizinschrank", 3, 2]]) {
      const ort = schreibe(A, { typ: "neu", art: "ort", werte: { name, reihen, spalten } }, tag0);
      for (let p = 0; p < reihen * spalten; p++) faecher.push(schreibe(A, { typ: "neu", art: "fach", werte: { name: name + " " + (p + 1), ort: ort.id, platz: p } }, tag0).id);
    }

    const offen = []; // Eintraege mit Bestand: {id, menge, von, tag}
    for (let tag = 0; tag < o.tage; tag++) {
      for (const h of handys) {
        const n = Math.max(1, Math.round(o.proTag * (0.5 + r())));
        for (let i = 0; i < n; i++) {
          const jetzt = new Date(tag0.getTime() + tag * 864e5 + i * 60000);
          // Ein Handy kennt nur eigene Eintraege und die des anderen bis zum letzten Abgleich (Vortag).
          const bekannt = offen.filter((e) => e.von === h.zaehler.inst || e.tag < tag);
          const x = r();
          if (x < 0.2 || bekannt.length < 5) {
            const ab = M.plusMonate(M.heuteIso(jetzt), 1 + Math.floor(r() * 24)).slice(0, 7);
            const menge = 1 + Math.floor(r() * 4);
            const v = schreibe(h, { typ: "neu", art: "eintrag", werte: { name: "Artikel " + h.liste.length, mhd: ab, fach: wahl(faecher) }, menge }, jetzt);
            offen.push({ id: v.id, menge, von: h.zaehler.inst, tag });
          } else if (x < 0.85) {
            const e = wahl(bekannt);
            schreibe(h, { typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }, jetzt);
            if (--e.menge <= 0) offen.splice(offen.indexOf(e), 1);
          } else {
            const ziel = wahl(bekannt).id; // zuerst ziehen: gleiche Zufallsfolge wie bisher
            const [feld, wert] = x < 0.95 ? ["fach", wahl(faecher)] : ["name", "Umbenannt " + tag];
            schreibe(h, { typ: "feld", art: "eintrag", ziel, feld, wert }, jetzt);
          }
        }
      }
      // Taeglicher Abgleich: beide ziehen die Uhr auf den hoechsten Stand.
      const max = Math.max(...handys.map((h) => h.zaehler.uhr));
      for (const h of handys) h.zaehler = M.uhrNachziehen(h.zaehler, max);
    }
    return handys.map((h) => ({ schema: M.SCHEMA, inst: h.zaehler.inst, vorgaenge: h.liste }));
  }

  kunstdaten.zufall = zufall;
  if (typeof module !== "undefined" && module.exports) module.exports = kunstdaten;
  else wurzel.kunstdaten = kunstdaten;
})(typeof window !== "undefined" ? window : globalThis);
