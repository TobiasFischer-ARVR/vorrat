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
      .sort((a, b) => a.e.ablauf.localeCompare(b.e.ablauf) || a.e.name.localeCompare(b.e.name, "de") || (a.e.id < b.e.id ? -1 : 1));
  }
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

  // ---- Abschnitt 4: Codes lesen (reine Funktionen, keine Kamera) ----
  // Ergebnis von leseCode/codeAusEingabe: { art: "ean"|"gs1"|"ifa"|"pzn", schluessel, ean, pzn, mhd, anzeige }.
  //   schluessel = "gtin:<8/13/14 Ziffern>" oder "pzn:<8 Ziffern>" (fuer "Code -> Name merken"),
  //   ean = Code fuer Open Food Facts (nur Lebensmittel-GTIN, nie bei PZN), mhd = "JJJJ-MM" / "JJJJ-MM-TT" / null.
  // Charge und Seriennummer werden NIE zurueckgegeben (Seriennummer darf nirgends gespeichert werden).
  const GS = "\x1d", RS = "\x1e", EOT = "\x04";
  function gtinOk(z) { // Pruefziffer EAN-8, UPC-A (12), EAN-13, GTIN-14
    if (typeof z !== "string" || !/^(\d{8}|\d{12,14})$/.test(z)) return false;
    let summe = 0;
    for (let i = 0; i < z.length - 1; i++) summe += Number(z[z.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (summe % 10)) % 10 === Number(z[z.length - 1]);
  }
  function pznOk(p) { // PZN8: Ziffern 1-7 mal 1..7, Summe mod 11 = Pruefziffer (10 = ungueltig)
    if (typeof p !== "string" || !/^\d{8}$/.test(p)) return false;
    let summe = 0;
    for (let i = 0; i < 7; i++) summe += Number(p[i]) * (i + 1);
    return summe % 11 !== 10 && summe % 11 === Number(p[7]);
  }
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
      for (const n of [2, 3, 4]) {
        const k = t.slice(i, i + n);
        if (Object.hasOwn(AI_FEST, k) || AI_VAR.includes(k)) { ai = k; break; }
      }
      if (!ai) break; // unbekannt: lieber aufhoeren als falsch zerlegen
      i += ai.length;
      let wert;
      if (Object.hasOwn(AI_FEST, ai)) { wert = t.slice(i, i + AI_FEST[ai]); i += AI_FEST[ai]; }
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
    return ergebnis("gs1", g, pzn, verfallAus(f["17"]));
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
    if (/^(\(?01\)?\d{14}|\(?710\)?\d{8})/.test(t) || t.startsWith("(")) return leseGs1(t);
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
    if (gtinOk(z)) { const g = gtinNorm(z); return ergebnis("ean", g, pznAusGtin(g), null); }
    if ((z.length === 7 || z.length === 8) && pznOk(pzn)) return ergebnis("pzn", null, pzn, null);
    return null;
  }
  // Antwort von Open Food Facts (api/v2/product/<code>.json?fields=product_name,product_name_de,brands) -> Name oder null.
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
  // "Code -> Name merken" (nur auf diesem Geraet, siehe PRUEFNOTIZEN Verdachtsstellen C):
  // nur gueltige Schluessel, hoechstens 1000, der zuletzt gemerkte steht hinten.
  const CODE_SCHLUESSEL = /^(gtin:\d{8,14}|pzn:\d{8})$/;
  function codesSauber(m) {
    const aus = {};
    if (!m || typeof m !== "object" || Array.isArray(m)) return aus;
    for (const [k, n] of Object.entries(m)) if (CODE_SCHLUESSEL.test(k) && typeof n === "string" && n.trim() && n.length <= 100) aus[k] = n;
    return aus;
  }
  function codesMerken(m, schluessel, name, max) {
    const alt = codesSauber(m);
    if (!CODE_SCHLUESSEL.test(schluessel) || typeof name !== "string" || !name.trim() || name.length > 100) return alt;
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
  function pruefe(art, werte) {
    for (const [f, w] of Object.entries(werte)) if (!Modell.FELDER[art][f](w)) return FEHLERTEXT[f] || "Ungültig: " + f;
    return null;
  }

  const Hilfen = { bildchen, FRISTEN, FRIST_SCHNELL, fristKategorie, fristVorschlag, BALD, baldStufe, baldAb, fachMarken, fundort, baldText,
    gtinOk, pznOk, verfallAus, leseCode, codeAusEingabe, offName, codesSauber, codesMerken, mhdMonat, mhdJahr, mhdTeile, deDatum, kurzDatum, fachNeu, grundausstattung, grundSchritte, pruefe };
  if (typeof module !== "undefined" && module.exports) module.exports = Hilfen;
  else wurzel.Hilfen = Hilfen;
})(typeof window !== "undefined" ? window : globalThis);
