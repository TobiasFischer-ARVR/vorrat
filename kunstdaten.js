// kunstdaten.js - erzeugt Vorgangsdateien fuer zwei simulierte Handys ueber mehrere Jahre.
// Fuer den Wachstumstest (Bauplan R2 #5/#6): Node-Pruefstand jetzt, spaeter versteckter Knopf in der App.
// Jedes Handy kennt bis zum taeglichen Abgleich nur seinen eigenen Stand (Codex 1a #14):
// gleichzeitige Entnahmen des letzten Stuecks, negative Summen, Korrekturen (auch doppelte) und
// Loeschungen kommen deshalb wirklich vor.
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
  // Liefert { dateien: [Vorgangsdatei A, B], statistik }.
  function kunstdaten(optionen) {
    const o = Object.assign({ tage: 1095, proTag: 15, saat: 42, start: "2026-11-10" }, optionen);
    const r = zufall(o.saat);
    const wahl = (a) => a[Math.floor(r() * a.length)];
    // ansicht = was dieses Handy seit dem letzten Abgleich fuer den Bestand haelt (id -> Summe)
    const handys = ["kunstA0000000001", "kunstB0000000002"].map((inst) => ({ zaehler: { inst, nr: 1, uhr: 0 }, liste: [], ansicht: new Map() }));
    const [A, B] = handys;
    const summe = new Map();     // wahre Summe je Eintrag (alle Vorgaenge zusammen)
    const koepfe = new Map();    // offene Korrekturen je Eintrag (fuer "kennt")
    const geloescht = new Set();
    const statistik = { korrekturen: 0, doppeltGezaehlt: 0, negativ: 0, geloescht: 0 };
    const tag0 = new Date(o.start + "T08:00:00");

    const schreibe = (h, daten, jetzt) => {
      const e = M.erzeuge(h.zaehler, daten, jetzt);
      h.zaehler = e.zaehler; h.liste.push(e.vorgang);
      return e.vorgang;
    };
    const aendere = (h, id, delta) => { summe.set(id, summe.get(id) + delta); h.ansicht.set(id, (h.ansicht.get(id) || 0) + delta); };

    // Grundausstattung (Handy A): 4 Orte, je Platz ein Fach.
    const faecher = [];
    for (const [name, reihen, spalten] of [["Gefrierschrank", 6, 1], ["Vorrats-Regal", 4, 2], ["Kuechenschublade", 1, 1], ["Medizinschrank", 3, 2]]) {
      const ort = schreibe(A, { typ: "neu", art: "ort", werte: { name, reihen, spalten } }, tag0);
      for (let reihe = 0; reihe < reihen; reihe++) for (let spalte = 0; spalte < spalten; spalte++) {
        faecher.push(schreibe(A, { typ: "neu", art: "fach", werte: { name: name + " " + (faecher.length + 1), lage: { ort: ort.id, reihe, spalte } } }, tag0).id);
      }
    }

    for (let tag = 0; tag < o.tage; tag++) {
      const jetztFuer = (i) => new Date(tag0.getTime() + tag * 864e5 + i * 60000);
      for (const h of handys) {
        const n = Math.max(1, Math.round(o.proTag * (0.5 + r())));
        for (let i = 0; i < n; i++) {
          const jetzt = jetztFuer(i);
          const bekannt = [...h.ansicht].filter(([, s]) => s > 0).map(([id]) => id);
          const x = r();
          if (x < 0.2 || bekannt.length < 5) {
            const ab = M.plusMonate(M.heuteIso(jetzt), 1 + Math.floor(r() * 24)).slice(0, 7);
            const menge = 1 + Math.floor(r() * 4);
            const v = schreibe(h, { typ: "neu", art: "eintrag", werte: { name: "Artikel " + h.liste.length, mhd: ab, fach: wahl(faecher) }, menge }, jetzt);
            summe.set(v.id, menge); h.ansicht.set(v.id, menge); koepfe.set(v.id, []);
          } else if (x < 0.84) {
            const id = wahl(bekannt);
            schreibe(h, { typ: "menge", art: "eintrag", ziel: id, delta: -1, grund: "entnahme" }, jetzt);
            aendere(h, id, -1);
          } else if (x < 0.99) {
            const ziel = wahl(bekannt);
            const [feld, wert] = x < 0.95 ? ["fach", wahl(faecher)] : ["name", "Umbenannt " + tag];
            schreibe(h, { typ: "feld", art: "eintrag", ziel, feld, wert }, jetzt);
          } else {
            const ziel = wahl(bekannt);
            schreibe(h, { typ: "feld", art: "eintrag", ziel, feld: "geloescht", wert: true }, jetzt);
            geloescht.add(ziel); h.ansicht.delete(ziel); statistik.geloescht++;
          }
        }
      }

      // Taeglicher Abgleich: Uhren auf den hoechsten Stand, beide Ansichten = wahrer Bestand.
      const max = Math.max(...handys.map((h) => h.zaehler.uhr));
      for (const h of handys) {
        h.zaehler = M.uhrNachziehen(h.zaehler, max);
        h.ansicht = new Map([...summe].filter(([id, s]) => s !== 0 && !geloescht.has(id)));
      }
      // Jedes Handy sieht bis zum naechsten Abgleich nur seine EIGENE Korrektur (aendere), nicht die fremde (Codex R2 #7).
      // "Bestand pruefen": A zaehlt nach (Ergebnis 0). Manchmal zaehlt B gleichzeitig -> doppelt gezaehlt,
      // das loest A beim naechsten Abgleich mit einer Korrektur, die beide kennt.
      const jetzt = jetztFuer(1000);
      for (const [id, s] of summe) {
        if (geloescht.has(id)) continue;
        const k = koepfe.get(id);
        if (s >= 0 && k.length < 2) continue;
        if (s < 0) statistik.negativ++;
        const zaehler = [A];
        if (s < 0 && r() < 0.1) { zaehler.push(B); statistik.doppeltGezaehlt++; }
        const neueKoepfe = [];
        for (const h of zaehler) {
          const v = schreibe(h, { typ: "menge", art: "eintrag", ziel: id, delta: -s, grund: "korrektur", kennt: k.slice() }, jetzt);
          aendere(h, id, -s);
          neueKoepfe.push(v.id); statistik.korrekturen++;
        }
        koepfe.set(id, neueKoepfe);
      }
    }
    return { dateien: handys.map((h) => ({ schema: M.SCHEMA, inst: h.zaehler.inst, vorgaenge: h.liste })), statistik };
  }

  kunstdaten.zufall = zufall;
  if (typeof module !== "undefined" && module.exports) module.exports = kunstdaten;
  else wurzel.kunstdaten = kunstdaten;
})(typeof window !== "undefined" ? window : globalThis);
