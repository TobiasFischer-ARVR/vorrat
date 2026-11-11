// hilfen.js - reine Hilfsfunktionen der Oberflaeche (Abschnitt 1d): Bildchen, Grundausstattung,
// MHD-Schnellauswahl, Fristen, Eingabepruefung. Kein DOM. Browser (window.Hilfen) und Node (require).
(function (wurzel) {
  "use strict";
  const Modell = typeof module !== "undefined" && module.exports ? require("./modell.js") : wurzel.Modell;

  const norm = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const tabelle = (o) => Object.entries(o).map(([k, w]) => [norm(k), w]);

  // Teilwort-Suche, Wort fuer Wort von vorn ("Pizza Salami" -> Pizza). Innerhalb eines Worts gewinnt der
  // Treffer, der am weitesten hinten endet, weil das deutsche Grundwort hinten steht
  // ("Salamipizza" -> Pizza, "Erdbeereis" -> Eis); bei gleichem Ende der laengere ("Reis" vor "Eis").
  function finde(name, tab) {
    for (const wort of norm(name).split(/[^a-z0-9]+/)) {
      let best = null;
      for (const [k, w] of tab) {
        const i = wort.lastIndexOf(k);
        if (i < 0) continue;
        const ende = i + k.length;
        if (!best || ende > best[0] || (ende === best[0] && k.length > best[1])) best = [ende, k.length, w];
      }
      if (best) return best[2];
    }
    return null;
  }

  // Entscheidung 10: Bildchen automatisch nach Stichwort, von Hand aenderbar.
  const BILDCHEN = tabelle({
    pizza: "🍕", teig: "🌾", nudel: "🍝", spaghetti: "🍝", pasta: "🍝", lasagne: "🍝", spätzle: "🍝",
    reis: "🍚", eis: "🍦", eiscreme: "🍦", beereis: "🍦", eisbein: "🥩", // Erdbeereis enthaelt "reis"
    erbse: "🫛", bohne: "🫘", mais: "🌽", karotte: "🥕", möhre: "🥕", kartoffel: "🥔", pommes: "🍟",
    brokkoli: "🥦", gemüse: "🥦", spinat: "🥬", salat: "🥬", tomate: "🍅", zwiebel: "🧅", knoblauch: "🧄", pilz: "🍄",
    obst: "🍎", apfel: "🍎", birne: "🍐", banane: "🍌", beere: "🍓", erdbeer: "🍓", kirsch: "🍒", zitrone: "🍋",
    fisch: "🐟", lachs: "🐟", garnele: "🦐",
    fleisch: "🥩", rind: "🥩", schwein: "🥩", steak: "🥩", hack: "🥩", gulasch: "🥩",
    hähnchen: "🍗", huhn: "🍗", geflügel: "🍗", pute: "🍗", chicken: "🍗",
    wurst: "🌭", salami: "🌭", schinken: "🥓", speck: "🥓",
    brot: "🍞", toast: "🍞", brötchen: "🥖", baguette: "🥖", brezel: "🥨",
    kuchen: "🍰", torte: "🍰", keks: "🍪", snack: "🍪", waffel: "🧇", schoko: "🍫", chips: "🍿", popcorn: "🍿",
    müsli: "🥣", hafer: "🥣", flocken: "🥣", brei: "🍼", baby: "🍼",
    milch: "🥛", joghurt: "🥛", sahne: "🥛", käse: "🧀", butter: "🧈", eier: "🥚",
    suppe: "🍲", eintopf: "🍲", brühe: "🍲", soße: "🥫", sauce: "🥫", ketchup: "🥫", dose: "🥫", konserve: "🥫",
    mehl: "🌾", back: "🌾", zucker: "🍬", bonbon: "🍬", honig: "🍯", marmelade: "🍯",
    kaffee: "☕", tee: "🍵", saft: "🧃", wasser: "💧", öl: "🫒", salz: "🧂", pfeffer: "🧂", gewürz: "🧂",
    medikament: "💊", tablette: "💊", kapsel: "💊", ibuprofen: "💊", paracetamol: "💊", aspirin: "💊",
    pflaster: "🩹", verband: "🩹", salbe: "🧴", creme: "🧴", spray: "🧴", tropfen: "💧", fieber: "🌡️", thermometer: "🌡️",
  });
  const bildchen = (name) => finde(name, BILDCHEN) || "📦";

  // "essen bis" fuer Selbstgemachtes (Aufdruck Gefrierschubladen, Vorrats-App.md).
  const FRISTEN = [
    { name: "Fisch, Eintopf, Kuchen, Wurst", monate: 3 },
    { name: "Geflügel, Schwein, Lamm, Fertiggerichte", monate: 6 },
    { name: "Rind, Wild, Obst, Gemüse", monate: 9 },
  ];
  const FRIST_WOERTER = tabelle({
    fisch: 0, lachs: 0, eintopf: 0, suppe: 0, kuchen: 0, torte: 0, wurst: 0,
    geflügel: 1, hähnchen: 1, huhn: 1, pute: 1, schwein: 1, lamm: 1, fertig: 1, pizza: 1, lasagne: 1,
    rind: 2, wild: 2, obst: 2, gemüse: 2, beere: 2, erbse: 2, bohne: 2, apfel: 2,
  });
  // Index in FRISTEN; ohne Treffer die kuerzeste Frist (vorsichtig, nur Vorbelegung).
  const fristKategorie = (name) => finde(name, FRIST_WOERTER) ?? 0;

  // MHD-Schnellauswahl Monat/Jahr -> "JJJJ-MM" (gilt bis Monatsende, siehe Modell.ablaufdatum).
  const mhdMonat = (jahr, monat) => jahr + "-" + String(monat).padStart(2, "0");
  // Vorschlag fuer die Schnellauswahl: naechstes Vorkommen des Monats (laufender Monat zaehlt noch).
  const mhdJahr = (monat, heute) => Number(heute.slice(0, 4)) + (monat < Number(heute.slice(5, 7)) ? 1 : 0);
  const mhdTeile = (mhd) => (mhd ? { jahr: Number(mhd.slice(0, 4)), monat: Number(mhd.slice(5, 7)) } : null);
  const deDatum = (iso) => iso.split("-").reverse().join("."); // "2027-03" -> "03.2027"

  // Kurzform fuer die Kachel: "03/27" (MHD Monat), "15.03.27" (MHD Tag), "❄ 03/27" (essen bis).
  function kurzDatum(e) {
    const mj = (iso) => iso.slice(5, 7) + "/" + iso.slice(2, 4);
    if (e.mhd) return e.mhd.length === 7 ? mj(e.mhd) : e.mhd.slice(8, 10) + "." + mj(e.mhd).replace("/", ".");
    const ab = Modell.ablaufdatum(e);
    return ab ? "❄ " + mj(ab) : "";
  }

  // Grundausstattung (Vorrats-App.md, Orte und Aufteilung). Reihe 0 = oben.
  const fachNeu = (name, ort, reihe, spalte) => ({ typ: "neu", art: "fach", werte: { name, lage: { ort, reihe, spalte } } });
  const GRUND = [
    ["Gefrierschrank", 6, 1, ["braun", "braun", "weiß", "weiß", "weiß", "weiß"], [1, 2, 3, 4, 5, 6].map((i) => "Schublade " + i)],
    ["Vorrats-Regal", 4, 2, null, ["Müsli", "Snacks (Baby)", "Snacks", "Baby Essen", "Soßen", "Alles andere", "Nudeln & Reis", "Backen"]],
    ["Küchenschublade", 1, 1, null, ["Schublade"]],
    ["Medizinschrank", 3, 2, null, []], // Platzhalter, Aufteilung folgt (Offen-Punkt 1)
  ];
  // Je Ort: Vorgangsdaten des Orts + Funktion, die mit der Ort-Kennung die Faecher liefert
  // (die Kennung entsteht erst beim Speichern).
  const grundausstattung = () => GRUND.map(([name, reihen, spalten, farben, faecher], i) => ({
    ort: { typ: "neu", art: "ort", werte: { name, reihen, spalten, farben, reihenfolge: i } },
    faecher: (ort) => faecher.map((n, k) => fachNeu(n, ort, Math.floor(k / spalten), k % spalten)),
  }));
  // Dieselbe Grundausstattung als Schrittliste fuer Speicher.ausfuehrenAlle (Aufgabe A: alles in EINEM Schritt).
  // Je Ort: erst der Ort, dann eine Funktion, die den eben erzeugten Ort-Vorgang sucht und seine Faecher liefert.
  const grundSchritte = () => grundausstattung().flatMap((g) => [g.ort, (bisher) => {
    const o = bisher.find((v) => v.typ === "neu" && v.art === "ort" && v.werte.name === g.ort.werte.name && v.werte.reihenfolge === g.ort.werte.reihenfolge);
    if (!o) throw new Error("Grundausstattung: Ort fehlt");
    return g.faecher(o.id);
  }]);

  // Eingaben VOR dem Vorgang pruefen (UGC #86), mit den Regeln aus Modell.FELDER.
  const FEHLERTEXT = {
    name: "Name fehlt oder ist zu lang", symbol: "Bildchen ist zu lang", mhd: "MHD ungültig (Jahr 2000–2199)",
    eingefroren: "Einfrierdatum ungültig", frist: "Frist muss 1 bis 60 Monate sein", fach: "Kiste ungültig",
    reihen: "Reihen: 1 bis 20", spalten: "Spalten: 1 bis 20", reihenfolge: "Reihenfolge: 0 bis 999", lage: "Platz ungültig",
  };
  function pruefe(art, werte) {
    for (const [f, w] of Object.entries(werte)) if (!Modell.FELDER[art][f](w)) return FEHLERTEXT[f] || "Ungültig: " + f;
    return null;
  }

  const Hilfen = { bildchen, FRISTEN, fristKategorie, mhdMonat, mhdJahr, mhdTeile, deDatum, kurzDatum, fachNeu, grundausstattung, grundSchritte, pruefe };
  if (typeof module !== "undefined" && module.exports) module.exports = Hilfen;
  else wurzel.Hilfen = Hilfen;
})(typeof window !== "undefined" ? window : globalThis);
