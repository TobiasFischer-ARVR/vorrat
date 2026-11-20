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
  // Index in FRISTEN, ohne Treffer null. Entscheidung Tobias (Abschnitt 3): ohne passendes Stichwort KEINE
  // Vorbelegung mehr (bisher 3 Monate) -> die Frist ist dann Pflicht und wird per Schnellauswahl gewaehlt.
  const fristKategorie = (name) => finde(name, FRIST_WOERTER);
  const FRIST_SCHNELL = [1, 2, 3, 6, 9, 12]; // Monate
  const fristVorschlag = (name) => { const k = fristKategorie(name); return k === null ? null : FRISTEN[k].monate; };

  // ---- Abschnitt 3: "Laeuft bald ab" ----
  // Grenzen fest (Entscheidung Tobias, keine Einstellung): rot <= 7 Tage, gelb <= 30 Tage, davor abgelaufen.
  const BALD = { rot: 7, gelb: 30 };
  // "abgelaufen" (gestern oder frueher), "rot", "gelb" oder null (spaeter / ohne Datum).
  function baldStufe(ablauf, heute) {
    if (!ablauf) return null;
    const t = Modell.tageBis(ablauf, heute);
    return t < 0 ? "abgelaufen" : t <= BALD.rot ? "rot" : t <= BALD.gelb ? "gelb" : null;
  }
  // Alle Eintraege mit Stueckzahl > 0 und Datum (MHD bzw. "essen bis", Monats-MHD bis Monatsende = e.ablauf
  // aus Modell.berechne), die abgelaufen sind oder in <= 30 Tagen ablaufen. Sortiert nach Datum (damit
  // automatisch abgelaufen -> rot -> gelb), bei Gleichstand nach Name, dann Kennung (feste Reihenfolge).
  function baldAb(eintraege, heute) {
    return eintraege.filter((e) => e.sichtbar && e.menge > 0 && e.ablauf)
      .map((e) => ({ e, stufe: baldStufe(e.ablauf, heute), tage: Modell.tageBis(e.ablauf, heute) }))
      .filter((x) => x.stufe)
      .sort((a, b) => a.e.ablauf.localeCompare(b.e.ablauf) || a.e.name.localeCompare(b.e.name, "de") || offenZuerst(a.e, b.e) || (a.e.id < b.e.id ? -1 : 1));
  }
  // v6.23: bei gleichem Datum und Namen die offene Packung zuerst (erst die offene aufbrauchen). Fach, Suche, Laeuft bald ab.
  const offenZuerst = (a, b) => !!b.anbruch - !!a.anbruch;
  // Markierung je Fach fuer die Zeichnung: Map fachId -> { n, farbe }. n = Zahl der bald ablaufenden Eintraege
  // (nicht Stueck), farbe "rot", wenn mindestens einer abgelaufen/rot ist, sonst "gelb".
  // Eintraege mit "Ort klaeren" zaehlen nicht (ihr Fach ist weg oder hat keinen Platz).
  function fachMarken(liste) {
    const m = new Map();
    for (const x of liste) {
      if (!x.e.fach || x.e.ortKlaeren) continue;
      const alt = m.get(x.e.fach) || { n: 0, farbe: "gelb" };
      m.set(x.e.fach, { n: alt.n + 1, farbe: alt.farbe === "rot" || x.stufe !== "gelb" ? "rot" : "gelb" });
    }
    return m;
  }
  // "Gefrierschrank – Schublade 3"; ohne gueltigen Platz "Ort klären".
  function fundort(e, orte, faecher) {
    const f = e.fach ? faecher.find((x) => x.id === e.fach) : null;
    const o = f ? orte.find((x) => x.id === f.lage.ort) : null;
    if (e.ortKlaeren || !f || !o) return "Ort klären";
    return o.name + " – " + f.name;
  }
  // Text fuer die Liste: "abgelaufen seit 3 Tagen", "heute", "morgen", "in 5 Tagen".
  function baldText(tage) {
    if (tage < -1) return "abgelaufen seit " + -tage + " Tagen";
    if (tage === -1) return "seit gestern abgelaufen";
    if (tage === 0) return "läuft heute ab";
    if (tage === 1) return "läuft morgen ab";
    return "in " + tage + " Tagen";
  }

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

  // ---- v6.7 Hoehe (Tobias 16.11.: Waermepflaster/Schmerzen sind doppelt hohe Schubladen) ----
  // Verbinden: Inhalt des Fachs darunter wandert nach oben, das untere verschwindet, das obere wird entsprechend hoeher.
  const verbindenSchritte = (obenId, hochNeu, untenId, eintragIds) => [
    ...zusammenSchritte(untenId, obenId, eintragIds),
    { typ: "feld", art: "fach", ziel: obenId, feld: "hoch", wert: hochNeu },
  ];

  // ---- v6.5 Vorlage Medizinschrank (Tobias 16.11., Fotos) ----
  // Haengeschrank, 2 Faecher nebeneinander (Spalten 0-3 links, 4-7 rechts), je 4 Tuerme durchsichtiger Schubladen,
  // unten buendig wie im Schrank (Turm mit n Schubladen = die unteren n Reihen). Oben auf Turm 1 je eine Ablage.
  // Gleiche Etiketten bekommen eine Nummer (sonst beim Verschieben nicht unterscheidbar); kurz wie auf den Etiketten,
  // damit der Unterschied in der Zeichnung nicht abgeschnitten wird.
  // v6.10 (Tobias 16.11., Fotos nachgemessen): feines Raster mit 12 Reihen. Kleine Schublade = 2 Reihen (ca. 120 px auf
  // dem Foto), grosse = 3 (ca. 185 px), im breiten Turm 3 + 2 + 5 (Waermepflaster/Schmerzen doppelt). Tuerme unten buendig.
  const MEDIZIN = { reihen: 12, spalten: 8, trenner: 4, tuerme: [
    [["Klebeband", 2], ["Mullbinden", 3], ["Pflaster", 2], ["Sonderpflaster", 3]],
    [["Salben", 3], ["Kompressen", 2], ["Wärmepflaster", 5]],
    [["Ohren", 2], ["Augen", 2], ["Desinfektion", 2], ["Verband selbsthaftend", 3], ["Verband", 3]],
    [["Kochsalzlsg 1", 2], ["Kochsalzlsg 2", 2], ["Fingerlinge", 2], ["Thermometer & Sonstiges", 3], ["Tape & Schere", 3]],
    [["Magendarm 1", 2], ["Magendarm 2", 3], ["Lactose", 2], ["Kühlpack", 3]],
    [["Erkältung 1", 3], ["Erkältung 2", 2], ["Schmerzen", 5]],
    [["Baby Kochsalz", 3], ["Baby Bauch 1", 3], ["Baby Pflaster", 3], ["Baby Schmerzen", 3]],
    [["Baby Nasenspülung", 2], ["Baby Nase", 2], ["Baby Bauch 2", 2], ["Baby Erkältung", 2], ["Baby Zahnen", 2], ["Baby Salben", 2]],
  ], ablagen: [["Oben links", 0, 2], ["Oben rechts", 4, 2]] };
  // Turm-Eintrag: "Name" oder ["Name", Hoehe in Reihen].
  const turmTeil = (x) => (Array.isArray(x) ? { name: x[0], hoch: x[1] } : { name: x, hoch: 1 });
  const turmHoehe = (t) => t.reduce((s, x) => s + turmTeil(x).hoch, 0);
  const medizinPlaetze = () => [
    ...MEDIZIN.tuerme.flatMap((t, spalte) => {
      let reihe = MEDIZIN.reihen - turmHoehe(t);
      return t.map((x) => { const { name, hoch } = turmTeil(x); const p = { name, reihe, spalte, hoch }; reihe += hoch; return p; });
    }),
    ...MEDIZIN.ablagen.map(([name, spalte, hoch]) => ({ name, reihe: MEDIZIN.reihen - turmHoehe(MEDIZIN.tuerme[spalte]) - hoch, spalte, hoch, offen: true })),
  ];
  // Schritte: Raster + Aussehen setzen. Schubladen mit Vorlagen-Namen, die es im Ort schon gibt (vorhanden), werden nur
  // umgesetzt (Platz/Hoehe, Inhalt bleibt); fehlende werden angelegt, wenn ihre Plaetze frei sind (frei(reihe, spalte)).
  const medizinSchritte = (ortId, frei, vorhanden = []) => [
    ...[["reihen", MEDIZIN.reihen], ["spalten", MEDIZIN.spalten], ["stil", "sortierkasten"], ["trenner", MEDIZIN.trenner]]
      .map(([feld, wert]) => ({ typ: "feld", art: "ort", ziel: ortId, feld, wert })),
    ...medizinPlaetze().flatMap((p) => {
      const da = vorhanden.find((f) => f.name === p.name);
      const platz = Array.from({ length: p.hoch }, (_, i) => frei(p.reihe + i, p.spalte)).every(Boolean);
      if (da && !platz) return []; // Review: Zielplatz von einem eigenen Fach belegt -> vorhandene Schublade bleibt, wo sie ist
      if (da) {
        const lage = { ort: ortId, reihe: p.reihe, spalte: p.spalte }, alt = da.lage || {};
        return [
          ...(alt.ort !== ortId || alt.reihe !== p.reihe || alt.spalte !== p.spalte ? [{ typ: "feld", art: "fach", ziel: da.id, feld: "lage", wert: lage }] : []),
          ...((da.hoch || 1) !== p.hoch ? [{ typ: "feld", art: "fach", ziel: da.id, feld: "hoch", wert: p.hoch > 1 ? p.hoch : null }] : []),
        ];
      }
      if (!platz) return [];
      const v = fachNeu(p.name, ortId, p.reihe, p.spalte);
      if (p.offen) v.werte.offen = true;
      if (p.hoch > 1) v.werte.hoch = p.hoch;
      return [v];
    }),
  ];

  // ---- v5.2 Fach-Menue (Tobias 15.11.) ----
  // Aufteilen: Fach umbenennen, zweites Fach auf DEMSELBEN Platz (Zeichnung zeigt beide nebeneinander),
  // angekreuzte Eintraege hinein. Die Kennung des neuen Fachs entsteht erst beim Speichern -> Folgeschritt.
  const aufteilenSchritte = (f, name1, name2, eintragIds) => [
    ...(name1 !== f.name ? [{ typ: "feld", art: "fach", ziel: f.id, feld: "name", wert: name1 }] : []),
    (() => { const v = fachNeu(name2, f.lage.ort, f.lage.reihe, f.lage.spalte); if (f.hoch) v.werte.hoch = f.hoch; return v; })(), // v6.7: Teil so hoch wie das Fach
    (bisher) => {
      const neu = bisher.find((v) => v.typ === "neu" && v.art === "fach");
      return eintragIds.map((id) => ({ typ: "feld", art: "eintrag", ziel: id, feld: "fach", wert: neu.id }));
    },
  ];
  // Zusammenlegen: Inhalt von "von" nach "nach", dann "von" loeschen.
  const zusammenSchritte = (von, nach, eintragIds) => [
    ...eintragIds.map((id) => ({ typ: "feld", art: "eintrag", ziel: id, feld: "fach", wert: nach })),
    { typ: "feld", art: "fach", ziel: von, feld: "geloescht", wert: true },
  ];

  // ---- Abschnitt 4: Codes lesen (reine Funktionen, keine Kamera) ----
  // Ergebnis von leseCode/codeAusEingabe: { art: "ean"|"gs1"|"ifa"|"pzn", schluessel, ean, pzn, mhd, anzeige }.
  //   schluessel = "gtin:<8/13/14 Ziffern>" oder "pzn:<8 Ziffern>" (fuer "Code -> Name merken"),
  //   ean = Code fuer Open Food Facts (nur Lebensmittel-GTIN, nie bei PZN), mhd = "JJJJ-MM" / "JJJJ-MM-TT" / null.
  // Charge und Seriennummer werden NIE zurueckgegeben (Seriennummer darf nirgends gespeichert werden).
  const GS = "\x1d", RS = "\x1e", EOT = "\x04";
  const gtinOk = Modell.gtinOk, pznOk = Modell.pznOk; // v6: eine Regel fuer Scanner und Modell (Codex #7)
  // GTIN vereinheitlichen: UPC-A (12) -> 13 Stellen, GTIN-14 mit fuehrender 0 -> 13 Stellen.
  function gtinNorm(z) {
    if (z.length === 14 && z[0] === "0") z = z.slice(1);
    if (z.length === 12) z = "0" + z;
    return z;
  }
  // Arzneimittel-GTIN (NTIN) "4150" + PZN8 + Pruefziffer -> PZN, sonst null.
  const pznAusGtin = (g) => (g.length === 13 && g.startsWith("4150") && pznOk(g.slice(4, 12)) ? g.slice(4, 12) : null);
  // "JJMMTT" -> MHD. Tag 00 = nur Monat (gilt bis Monatsende). Ungueltig -> null.
  function verfallAus(x) {
    if (typeof x !== "string" || !/^\d{6}$/.test(x)) return null;
    const mhd = "20" + x.slice(0, 2) + "-" + x.slice(2, 4) + (x.slice(4) === "00" ? "" : "-" + x.slice(4));
    return Modell.FELDER.eintrag.mhd(mhd) ? mhd : null;
  }
  function ergebnis(art, gtin, pzn, mhd) {
    if (pzn) return { art, schluessel: "pzn:" + pzn, ean: null, pzn, mhd: mhd || null, anzeige: "PZN " + pzn };
    if (gtin) return { art, schluessel: "gtin:" + gtin, ean: gtin, pzn: null, mhd: mhd || null, anzeige: (art === "ean" ? "EAN " : "GTIN ") + gtin };
    return null;
  }

  // GS1 (AI 01 GTIN, 17 Verfall, 10 Charge, 21 Seriennummer ...). Feste Laengen laut GS1; variable Felder enden
  // am GS-Zeichen (FNC1) oder am Ende. Auch die Klammerform "(01)...(17)..." geht. Unbekannter AI -> Ende.
  const AI_FEST = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2, "7003": 10 };
  const AI_VAR = ["10", "21", "22", "30", "37", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99",
    "240", "241", "250", "251", "400", "710", "711", "712", "713", "714", "715"];
  function gs1Felder(t) {
    const f = {};
    if (/^\(\d{2,4}\)/.test(t)) { // Klarschrift-Form
      for (const m of t.matchAll(/\((\d{2,4})\)([^(]*)/g)) if (!Object.hasOwn(f, m[1])) f[m[1]] = m[2].replace(/\x1d/g, "");
      return f;
    }
    let i = 0;
    while (i < t.length) {
      if (t[i] === GS) { i++; continue; }
      let ai = null;
      let fest = null;
      for (const n of [2, 3, 4]) {
        const k = t.slice(i, i + n);
        if (Object.hasOwn(AI_FEST, k) || AI_VAR.includes(k)) { ai = k; break; }
      }
      // Masse/Gewicht 310n-369n (z. B. Nettogewicht bei Fleisch/Kaese): 4-stelliger AI, 6 Ziffern (Review E #5)
      if (!ai && /^3[1-6]\d\d$/.test(t.slice(i, i + 4))) { ai = t.slice(i, i + 4); fest = 6; }
      if (!ai) break; // unbekannt: lieber aufhoeren als falsch zerlegen
      i += ai.length;
      let wert;
      if (fest) { wert = t.slice(i, i + fest); i += fest; }
      else if (Object.hasOwn(AI_FEST, ai)) { wert = t.slice(i, i + AI_FEST[ai]); i += AI_FEST[ai]; }
      else { const ende = t.indexOf(GS, i); wert = t.slice(i, ende < 0 ? t.length : ende); i = ende < 0 ? t.length : ende + 1; }
      if (!Object.hasOwn(f, ai)) f[ai] = wert;
    }
    return f;
  }
  function leseGs1(t) {
    const f = gs1Felder(t);
    const g = f["01"] && /^\d{14}$/.test(f["01"]) && gtinOk(f["01"]) ? gtinNorm(f["01"]) : null;
    // AI 710 = deutsche Nationalnummer (PZN), sonst PZN aus der NTIN
    const pzn710 = f["710"] && /^\d{8}$/.test(f["710"]) && pznOk(f["710"]) ? f["710"] : null;
    const pzn = pzn710 || (g && pznAusGtin(g));
    // 17 = Verfall (Arznei), sonst 15 = Mindesthaltbarkeit (Lebensmittel, Review E #5)
    return ergebnis("gs1", g, pzn, verfallAus(f["17"]) || verfallAus(f["15"]));
  }
  // IFA/PPN (MH10.8.2): "[)>" RS "06" GS "9N<PPN>" GS "1T<Charge>" GS "D<JJMMTT>" GS "S<Seriennr>" RS EOT.
  // PPN = "11" + PZN8 + 2 Pruefziffern.
  function leseIfa(t) {
    let pzn = null, gtin = null, mhd = null;
    for (const teil of t.replace(/^\[\)>/, "").split(new RegExp("[" + GS + RS + EOT + "]"))) {
      if (teil.startsWith("9N")) { const p = teil.slice(2); if (/^11\d{10}$/.test(p) && pznOk(p.slice(2, 10))) pzn = p.slice(2, 10); }
      else if (teil.startsWith("8P")) { const z = teil.slice(2); if (gtinOk(z)) gtin = gtinNorm(z); }
      else if (/^D\d{6}$/.test(teil)) mhd = verfallAus(teil.slice(1));
      // "1T" Charge, "S" Seriennummer, alles andere: bewusst ignoriert
    }
    return ergebnis("ifa", gtin, pzn || (gtin && pznAusGtin(gtin)), mhd);
  }
  // Rohwert vom Scanner (BarcodeDetector: rawValue + format) -> Ergebnis oder null.
  function leseCode(roh, format) {
    if (typeof roh !== "string" || !roh.length || roh.length > 500) return null;
    let t = roh.trim().replace(/^\][A-Za-z]\d/, ""); // Symbologie-Kennung "]d2", "]C1" ...
    if (/^\d{8}$|^\d{12,14}$/.test(t) && format !== "data_matrix") {
      if (!gtinOk(t)) return null;
      const g = gtinNorm(t);
      return ergebnis("ean", g, pznAusGtin(g), null);
    }
    if (t.startsWith("[)>")) return leseIfa(t);
    t = t.replace(/^\x1d+/, ""); // fuehrendes FNC1
    // GS1: Reihenfolge der AIs ist frei (17 kann vor 01 stehen) -> bei DataMatrix immer versuchen.
    if (format === "data_matrix" || /^\(?01\)?\d{14}/.test(t) || t.startsWith("(")) return leseGs1(t);
    return null;
  }
  // Von Hand eingetippt: EAN/GTIN (mit Pruefziffer) oder PZN ("PZN 1234567", "-12345678", 7/8 Ziffern).
  function codeAusEingabe(text) {
    const roh = String(text || "").trim();
    const istPzn = /^(pzn|-)/i.test(roh);
    const z = roh.replace(/^pzn/i, "").replace(/[\s-]/g, "");
    if (!/^\d+$/.test(z)) return null;
    const pzn = z.length === 7 ? "0" + z : z;
    if (istPzn) return pznOk(pzn) ? ergebnis("pzn", null, pzn, null) : null;
    // 7/8 Ziffern: zuerst PZN (Eintippen braucht man vor allem bei Medikamenten; ~10 % der PZN sind
    // zugleich gueltige EAN-8, Review E #6). Eine EAN-8, die auch eine gueltige PZN ist, wird so zur PZN.
    if ((z.length === 7 || z.length === 8) && pznOk(pzn)) return ergebnis("pzn", null, pzn, null);
    if (gtinOk(z)) { const g = gtinNorm(z); return ergebnis("ean", g, pznAusGtin(g), null); }
    return null;
  }
  // Antwort von Open Food Facts (api/v2/product/<code>.json?fields=product_name,product_name_de,brands) -> Name oder null.
  // v6.1 (Tobias 16.11.): Zusatzinfos fuers Produkt-Fenster. Nur Texte und Zahlen, alles andere fliegt raus.
  // Liefert { zutaten, allergene[], zusatz[], naehrwerte[[name, wert]], nutri } oder null (keine Angaben).
  const ALLERGENE = { gluten: "Gluten", crustaceans: "Krebstiere", eggs: "Eier", fish: "Fisch", peanuts: "Erdnüsse", soybeans: "Soja",
    milk: "Milch", nuts: "Schalenfrüchte", celery: "Sellerie", mustard: "Senf", "sesame-seeds": "Sesam",
    "sulphur-dioxide-and-sulphites": "Sulfite", lupin: "Lupinen", molluscs: "Weichtiere" };
  const NAEHR = [["energy-kcal_100g", "Energie", " kcal"], ["energy-kj_100g", "Energie", " kJ"], ["fat_100g", "Fett", " g"],
    ["saturated-fat_100g", "davon gesättigt", " g"], ["sugars_100g", "Zucker", " g"], ["salt_100g", "Salz", " g"]];
  function offDetails(j) {
    const p = j && typeof j === "object" && j.status === 1 && j.product && typeof j.product === "object" ? j.product : null;
    if (!p) return null;
    const txt = (w) => (typeof w === "string" && w.trim() ? w.trim().slice(0, 2000) : null);
    const tags = (a) => (Array.isArray(a) ? a.filter((t) => typeof t === "string" && t.length <= 80) : []);
    const ohneSprache = (t) => t.replace(/^[a-z]{2}:/, "");
    const allergene = [...new Set(tags(p.allergens_tags).map((t) => (t.startsWith("en:") && ALLERGENE[t.slice(3)]) || ohneSprache(t).replace(/-/g, " ")))];
    const zusatz = [...new Set(tags(p.additives_tags).map(ohneSprache).filter((t) => /^e\d{3,4}[a-z]?$/i.test(t)).map((t) => "E" + t.slice(1)))];
    const n = p.nutriments && typeof p.nutriments === "object" ? p.nutriments : {};
    // OFF schickt Zahlen manchmal als Text ("0.8"); unter 1 zwei Nachkommastellen, sonst wird 0,04 g Salz zu "0 g"
    const zahl = (w) => {
      if (typeof w === "string" && /^\d{1,5}(\.\d+)?$/.test(w)) w = Number(w);
      return typeof w === "number" && Number.isFinite(w) && w >= 0 && w < 1e5 ? w.toLocaleString("de-DE", { maximumFractionDigits: w < 1 ? 2 : 1 }) : null;
    };
    const naehrwerte = NAEHR.map(([k, name, einheit]) => { const z = zahl(n[k]); return z && [name, z + einheit]; }).filter(Boolean)
      .filter((x, i, a) => x[0] !== "Energie" || a.findIndex((y) => y[0] === "Energie") === i); // kcal vor kJ, nur eine Zeile
    const nutri = typeof p.nutriscore_grade === "string" && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade.toUpperCase() : null;
    const zutaten = txt(p.ingredients_text_de) || txt(p.ingredients_text);
    const ml = typeof p.product_quantity_unit === "string" && p.product_quantity_unit.toLowerCase() === "ml";
    return zutaten || allergene.length || zusatz.length || naehrwerte.length || nutri ? { zutaten, allergene, zusatz, naehrwerte, nutri, ml } : null;
  }

  function offName(j) {
    if (!j || typeof j !== "object" || j.status !== 1 || !j.product || typeof j.product !== "object") return null;
    const p = j.product;
    const text = (w) => (typeof w === "string" ? w.replace(/\s+/g, " ").trim() : "");
    const name = text(p.product_name_de) || text(p.product_name);
    if (!name) return null;
    const marke = text(p.brands).split(",")[0].trim();
    const voll = marke && !name.toLowerCase().includes(marke.toLowerCase()) ? name + " (" + marke + ")" : name;
    return voll.slice(0, 100);
  }
  // ---- v6 Abschnitt A: Produktbild von Open Food Facts ----
  // Nur https://images.openfoodfacts.org/..., ohne Anmeldedaten/Port (Codex #14). Liefert die Adresse oder null.
  function bildUrlOk(u) {
    if (typeof u !== "string" || u.length > 500) return null;
    let x;
    try { x = new URL(u); } catch (_) { return null; }
    return x.protocol === "https:" && x.hostname === "images.openfoodfacts.org" && !x.port && !x.username && !x.password ? x.href : null;
  }
  // Bild-Adresse aus der Produkt-Antwort (400 px, Entscheidung 1), sonst null.
  const offBild = (j) => (j && typeof j === "object" && j.status === 1 && j.product && typeof j.product === "object" ? bildUrlOk(j.product.image_front_url) : null);
  // Quadratischer Ausschnitt aus der Mitte: { sx, sy, s } (Quelle), Kantenlaenge = kuerzere Seite.
  const ausschnitt = (w, h) => { const s = Math.min(w, h); return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s }; };
  // Breite/Hoehe aus dem Dateikopf (Uint8Array), ohne zu dekodieren: PNG (IHDR) und JPEG (SOF-Marker).
  // Unbekanntes Format oder kaputter Kopf -> null (= nicht verarbeiten). Schuetzt vor "klein, aber riesig" (Review v6 A #5).
  function bildMasse(b) {
    if (!b || b.length < 24) return null;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
      return w && h ? { w, h } : null;
    }
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; } // Fuellbytes
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; } // ohne Laenge
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { // SOFn
        const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
        return w && h ? { w, h } : null;
      }
      if (m === 0xd9 || m === 0xda) return null; // Bildende/Bilddaten vor SOF
      i += 2 + len;
    }
    return null;
  }
  // Lesbarer Code fuer die Oberflaeche: "gtin:4000417025005" -> "EAN 4000417025005", "pzn:…" -> "PZN …".
  const codeText = (k) => (typeof k !== "string" ? "" : k.startsWith("pzn:") ? "PZN " + k.slice(4) : k.startsWith("gtin:") ? "EAN " + k.slice(5) : "");

  // "Code -> Name merken" (nur auf diesem Geraet, siehe PRUEFNOTIZEN Verdachtsstellen C):
  // nur gueltige Schluessel, hoechstens 1000, der zuletzt gemerkte steht hinten.
  const codeOk = (k) => Modell.codeGueltig(k); // v6: wie das Modell, mit Pruefziffer (Codex #7)
  function codesSauber(m) {
    const aus = {};
    if (!m || typeof m !== "object" || Array.isArray(m)) return aus;
    for (const [k, n] of Object.entries(m)) if (codeOk(k) && typeof n === "string" && n.trim() && n.length <= 100) aus[k] = n;
    return aus;
  }
  function codesMerken(m, schluessel, name, max) {
    const alt = codesSauber(m);
    if (!codeOk(schluessel) || typeof name !== "string" || !name.trim() || name.length > 100) return alt;
    delete alt[schluessel];
    alt[schluessel] = name.trim();
    const k = Object.keys(alt);
    for (const weg of k.slice(0, Math.max(0, k.length - (max || 1000)))) delete alt[weg];
    return alt;
  }

  // Eingaben VOR dem Vorgang pruefen (UGC #86), mit den Regeln aus Modell.FELDER.
  const FEHLERTEXT = {
    name: "Name fehlt oder ist zu lang", symbol: "Bildchen ist zu lang", mhd: "MHD ungültig (Jahr 2000–2199)",
    eingefroren: "Einfrierdatum ungültig", frist: "Frist muss 1 bis 60 Monate sein", fach: "Kiste ungültig",
    reihen: "Reihen: 1 bis 20", spalten: "Spalten: 1 bis 20", reihenfolge: "Reihenfolge: 0 bis 999", lage: "Platz ungültig",
  };
  // Multiscan: gescannte Packungen -> Zeilen. Gleicher Code + gleiches MHD + gleiches Ziel = eine Zeile mit Menge
  // (Regel "ein Eintrag pro MHD"). p.fach undefined = Ziel der ganzen Liste.
  // v6.21 (Tobias 20.11.): wo liegt dasselbe Produkt schon? Eintraege mit Code nur ueber den Code, ohne Code
  // (alt oder von Hand) ueber den Namen. Je Fach (null = ohne gueltiges Fach) die Stueckzahl. Nur Hinweis, nichts zusammenlegen.
  // gilt(fach) optional: ungueltige Faecher zaehlen als null (eine Zeile "Ort klaeren"). Menge 0 zeigt nichts.
  function woSchon(eintraege, schluessel, name, gilt = () => true) {
    const n = String(name || "").trim().toLowerCase(), m = new Map();
    for (const e of eintraege) {
      if (!e.sichtbar || !(e.menge > 0) || !(e.code ? e.code === schluessel : n && e.name.trim().toLowerCase() === n)) continue;
      const f = e.fach && gilt(e.fach) ? e.fach : null;
      m.set(f, (m.get(f) || 0) + e.menge);
    }
    return [...m].map(([fach, menge]) => ({ fach, menge }));
  }
  function paketeZeilen(pakete) {
    const m = new Map();
    for (const p of pakete) {
      const k = JSON.stringify([p.schluessel, p.mhd || null, p.fach || null]);
      const z = m.get(k);
      if (z) { z.menge++; z.pakete.push(p); } else m.set(k, { schluessel: p.schluessel, mhd: p.mhd || null, fach: p.fach || undefined, menge: 1, pakete: [p] });
    }
    return [...m.values()];
  }

  // ---- v6 B: eigene Fotos (Bauplan Produktbilder Fassung 3) ----
  // Anzeige-Reihenfolge: eigenes Foto je Code, dann je Name (R2 #7). Liefert { schluessel, datei } oder null.
  function eigenesFoto(fotoVon, code, name) {
    for (const s of [code, Modell.namensSchluessel(name)]) if (s && fotoVon && fotoVon.has(s)) return { schluessel: s, datei: fotoVon.get(s) };
    return null;
  }
  // Foto setzen: vorhandenes Objekt des Schluessels nehmen, nur ohne eins ein neues anlegen.
  function fotoSchritt(bilder, schluessel, datei) {
    const da = bilder.find((b) => b.schluessel === schluessel);
    return da ? { typ: "feld", art: "bild", ziel: da.id, feld: "datei", wert: datei }
      : { typ: "neu", art: "bild", werte: { schluessel, datei } };
  }
  // Entfernen: ALLE bekannten Objekte des Schluessels auf null (R2 #3), keine automatische Bereinigung (R2 #2).
  const fotoWegSchritte = (bilder, schluessel) => bilder.filter((b) => b.schluessel === schluessel && b.datei !== null)
    .map((b) => ({ typ: "feld", art: "bild", ziel: b.id, feld: "datei", wert: null }));

  // v6 C: Dateinamen fuer den OneDrive-Abgleich der Fotos. aktuell = was ein Bild-Objekt jetzt nennt (alle Objekte,
  // nicht nur der angezeigte Gewinner); tot = was je in einem Vorgang an einem BEKANNTEN Bild-Objekt stand und jetzt
  // nicht mehr (Namen werden nie wiederverwendet, also bleibt tot tot); bekannt = jeder Name aus irgendeinem Vorgang.
  // Namen aus Vorgaengen an noch unbekannten Objekten sind weder aktuell noch tot: nie hochladen, nie loeschen.
  function bilderNamen(vorgaenge, bilder) {
    const ids = new Set(bilder.map((b) => b.id));
    const aktuell = new Set(bilder.map((b) => b.datei).filter(Boolean)), tot = new Set(), bekannt = new Set();
    for (const v of vorgaenge) {
      if (v.art !== "bild") continue;
      const d = v.typ === "neu" ? v.werte.datei : v.feld === "datei" ? v.wert : null;
      if (!d) continue;
      bekannt.add(d);
      if (ids.has(v.ziel) && !aktuell.has(d)) tot.add(d);
    }
    return { aktuell, tot, bekannt };
  }

  // v6.16 (Tobias 18.11.): Menue-Gliederung. Falsche Eintraege (Bedingung nicht erfuellt) fallen weg, die Reihenfolge
  // bleibt; Gefahr (Loeschen) steht immer zuletzt. Kein DOM, damit testbar.
  // v6.23: reihe = kleine Knoepfe nebeneinander unter "oben" (Fuellstand-Stufen).
  function menueTeile(teile) {
    const t = (l) => (l || []).filter(Boolean);
    return { oben: t(teile.oben), reihe: t(teile.reihe), liste: t(teile.liste), gefahr: t(teile.gefahr) };
  }

  // ---- v6.23 Teilmengen (Bauplan Teilmengen Fassung 3) ----
  // Stufen in Anzeige-Reihenfolge: [rest, kurz, lang]. Werte = Modell.ANBRUCH_REST.
  const ANBRUCH_STUFEN = [[100, "voll", "noch voll"], [75, "¾", "dreiviertel voll"], [50, "½", "halb voll"], [25, "¼", "ein Viertel voll"], [10, "fast leer", "fast leer"]];
  // Gemeinsamer Text fuer Kachel, Suche, Laeuft bald ab. "" = zu. Ein offener Eintrag ist genau EINE offene Packung
  // (Codex #4): bei Menge >= 2 "1 offen". lang = fuers aria-label.
  const stufe = (rest) => ANBRUCH_STUFEN.find((x) => x[0] === rest);
  const stufeText = (rest) => (stufe(rest) || [0, ""])[1]; // "½"; unbekannt -> ""
  function anbruchText(e, lang) {
    const s = e && e.anbruch && stufe(e.anbruch.rest);
    if (!s) return "";
    const eine = e.menge >= 2 ? "1 " : "";
    return lang ? eine + "angebrochen, " + s[2] : eine + "offen " + s[1];
  }
  const anbruchGleich = (a, b) => Modell.kanonisch(a ?? null) === Modell.kanonisch(b ?? null);
  // Packung oeffnen, EIN Schritt (e = frischer Eintrag aus berechne, zu, Menge >= 1). Menge 1: nur das Feld.
  // Menge >= 2: abspalten (T3) = -1 am alten + neuer Eintrag Menge 1 mit denselben Werten (ohne geloescht, nur belegte
  // Felder, also code nur falls vorhanden) und anbruch.
  function anbrechenSchritte(e, rest, heute) {
    const anbruch = { seit: heute, rest };
    if (e.menge < 2) return [{ typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: anbruch }];
    const werte = {};
    for (const f of Object.keys(Modell.FELDER.eintrag)) if (f !== "geloescht" && f !== "anbruch" && e[f] != null) werte[f] = e[f];
    werte.anbruch = anbruch;
    return [{ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }, { typ: "neu", art: "eintrag", werte, menge: 1 }];
  }
  // "Leer, weg": -1; bei Menge >= 2 ist die offene leer und der Rest zu (Codex #4).
  const leerSchritte = (e) => [{ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" },
    ...(e.anbruch && e.menge >= 2 ? [{ typ: "feld", art: "eintrag", ziel: e.id, feld: "anbruch", wert: null }] : [])];
  // Rueckgaengig fuer Anbrechen und "Leer, weg". fertig = die gespeicherten Vorgaenge, vorher = Eintrag vor dem Schreiben,
  // jetzt = Map Kennung -> frischer Eintrag (auch unsichtbar). Mengen kehren sich immer um, nie ueber geloescht (Codex #1);
  // anbruch nur, wenn dort noch der eben geschriebene Wert steht (R2 #5). Liefert Vorgangsdaten oder einen Hinweistext.
  function rueckSchritte(fertig, vorher, jetzt) {
    const ids = [...new Set(fertig.map((v) => v.ziel))];
    if (ids.some((id) => !jetzt.get(id) || jetzt.get(id).geloescht)) return "Inzwischen gelöscht – Rückgängig nicht mehr möglich.";
    // Review v6.23 #4: alter UND neuer Eintrag noch im Fach von damals
    if (fertig.some((v) => v.typ === "neu" && (jetzt.get(vorher.id).fach !== vorher.fach || jetzt.get(v.ziel).fach !== v.werte.fach)))
      return "Inzwischen verschoben – Rückgängig nicht mehr möglich.";
    // Review v6.23 #3: die abgespaltene Packung muss noch genau die angelegte Menge haben (sonst ginge sie ins Minus)
    if (fertig.some((v) => v.typ === "neu" && jetzt.get(v.ziel).summe !== v.menge)) return "Inzwischen benutzt – Rückgängig nicht mehr möglich.";
    const aus = [];
    for (const v of fertig) {
      if (v.typ === "neu") aus.push({ typ: "menge", art: "eintrag", ziel: v.ziel, delta: -v.menge, grund: "entnahme" });
      else if (v.typ === "menge") aus.push({ typ: "menge", art: "eintrag", ziel: v.ziel, delta: -v.delta, grund: v.delta < 0 ? "zugang" : "entnahme" });
      else if (v.feld === "anbruch" && anbruchGleich(jetzt.get(v.ziel).anbruch, v.wert)) aus.push({ typ: "feld", art: "eintrag", ziel: v.ziel, feld: "anbruch", wert: vorher.anbruch ?? null });
    }
    return aus.length ? aus : "Inzwischen geändert – Rückgängig nicht mehr möglich.";
  }

  // v6.16: Umbau-Knoepfe unter der Zeichnung - NUR im Bearbeiten-Modus. Liefert { id, gruppe, text, aria } in Anzeige-
  // Reihenfolge; dieselben Bedingungen wie bisher (Raster nur bei mehreren Spalten, "−" nur wenn moeglich,
  // Spalte links/rechts bei Trennwand, Vorlage solange der Medizinschrank nicht das 12er-Raster hat).
  function umbauKnoepfe(o, bearbeiten) {
    if (!bearbeiten || !o) return [];
    const k = [], dazu = (id, gruppe, text, aria) => k.push({ id, gruppe, text, aria: aria || text });
    if (o.spalten >= 2) {
      const zwei = !!o.trenner && o.trenner < o.spalten;
      dazu("reihe+", "Reihen", "+ Reihe", "Reihe unten anfügen");
      if (o.reihen > 1) dazu("reihe-", "Reihen", "− Reihe", "Unterste Reihe entfernen");
      if (zwei) {
        dazu("links+", "Linke Seite", "+ Spalte links", "Spalte auf der linken Seite anfügen");
        if (o.trenner > 1) dazu("links-", "Linke Seite", "− Spalte links", "Äußere Spalte der linken Seite entfernen");
      }
      dazu("spalte+", zwei ? "Rechte Seite" : "Spalten", zwei ? "+ Spalte rechts" : "+ Spalte", "Spalte rechts anfügen");
      if (o.spalten > (zwei ? o.trenner + 1 : 2)) dazu("spalte-", zwei ? "Rechte Seite" : "Spalten", zwei ? "− Spalte rechts" : "− Spalte", "Rechte Spalte entfernen");
    }
    if (o.name === "Medizinschrank" && o.reihen !== MEDIZIN.reihen)
      dazu("vorlage", "Vorlage", o.stil ? "🩹 Schubladen-Größen wie auf dem Foto übernehmen" : "🩹 Wie auf dem Foto einrichten (34 Schubladen)");
    dazu("ort", "Ort", "✎ Name und Größe …", "Ort " + o.name + " bearbeiten: Name, Reihen, Spalten");
    return k;
  }

  function pruefe(art, werte) {
    for (const [f, w] of Object.entries(werte)) if (!Modell.FELDER[art][f](w)) return FEHLERTEXT[f] || "Ungültig: " + f;
    return null;
  }

  const Hilfen = { bildchen, FRISTEN, FRIST_SCHNELL, fristKategorie, fristVorschlag, BALD, baldStufe, baldAb, fachMarken, fundort, baldText,
    gtinOk, pznOk, verfallAus, leseCode, codeAusEingabe, offName, codesSauber, codesMerken, mhdMonat, mhdJahr, mhdTeile, deDatum, kurzDatum, fachNeu, grundausstattung, grundSchritte, pruefe, paketeZeilen, woSchon, aufteilenSchritte, zusammenSchritte, verbindenSchritte, MEDIZIN, medizinPlaetze, medizinSchritte, bildUrlOk, offBild, ausschnitt, codeText, bildMasse,
    eigenesFoto, fotoSchritt, fotoWegSchritte, bilderNamen, offDetails, menueTeile, umbauKnoepfe,
    ANBRUCH_STUFEN, stufeText, offenZuerst, anbruchText, anbrechenSchritte, leerSchritte, rueckSchritte };
  if (typeof module !== "undefined" && module.exports) module.exports = Hilfen;
  else wurzel.Hilfen = Hilfen;
})(typeof window !== "undefined" ? window : globalThis);
