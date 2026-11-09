// modell.js - Vorgangsmodell der Vorrats-App (Bauabschnitt 1a).
// Reine Rechenlogik: kein Speicher, kein Netz, keine Oberflaeche.
// Laeuft im Browser (window.Modell) und in Node (require).
//
// Grundsaetze (Bauplan): Gespeichert werden unveraenderliche Vorgaenge, nie Endstaende.
// Reihenfolge ueber die logische Uhr (uhr), Gleichstand -> Installations-ID.
// Stammdaten werden pro Feld abgeglichen, die Stueckzahl ist die Summe aller Mengenvorgaenge.
(function (wurzel) {
  "use strict";

  const SCHEMA = 1;
  const ARTEN = ["ort", "fach", "eintrag"];
  const TYPEN = ["neu", "feld", "menge"];
  const GRUENDE = ["entnahme", "zugang", "korrektur"];
  // Erlaubte Schluessel auf oberster Ebene je Typ. Alles andere wird abgelehnt (Codex 1a #7, #10).
  const BASIS = ["id", "inst", "n", "uhr", "zeit", "typ", "art", "ziel"];
  const SCHLUESSEL = {
    neu: new Set([...BASIS, "werte", "menge"]),
    feld: new Set([...BASIS, "feld", "wert"]),
    menge: new Set([...BASIS, "delta", "grund", "kennt"]),
  };

  // Jahre 2000-2199: schliesst die Date.UTC-Sonderregel fuer Jahre 0-99 und 6-stellige ISO-Jahre aus.
  const DATUM = /^2[01]\d\d-\d\d-\d\d$/;
  const MONAT = /^2[01]\d\d-(0[1-9]|1[0-2])$/;
  const KENNUNG = /^[A-Za-z0-9]{8,40}(-\d+)?$/;
  const INST = /^[A-Za-z0-9]{8,40}$/;

  const ganzzahl = (w, min, max) => Number.isInteger(w) && w >= min && w <= max;
  const text = (w, max) => typeof w === "string" && w.trim().length > 0 && w.length <= max;
  const bool = (w) => typeof w === "boolean";
  const objekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);
  const kennung = (w) => typeof w === "string" && KENNUNG.test(w);
  const instGueltig = (w) => typeof w === "string" && INST.test(w);
  const kennungOderNull = (w) => w === null || kennung(w);
  // Fuer Fehlertexte: nie String(w) auf fremde Objekte (deren toString kann werfen, Codex 1a #6).
  const kurz = (w) => (typeof w === "string" ? w.slice(0, 20) : typeof w);
  // "JJJJ-MM-TT" und ein echter Kalendertag (kein 30.02.)
  const datumGueltig = (w) => typeof w === "string" && DATUM.test(w) && isoAusTag(tagZahl(w)) === w;
  const mhdGueltig = (w) => w === null || (typeof w === "string" && MONAT.test(w)) || datumGueltig(w);
  // Lage eines Fachs: Ort + Reihe + Spalte als EIN Feld, damit gleichzeitiges Verschieben keine
  // Mischlage ergibt und eine geaenderte Spaltenzahl keinen Platz still umdeutet (Codex 1a #4, #11).
  // reihe/spalte beide null = noch kein Platz in der Zeichnung.
  const lageGueltig = (w) => objekt(w) && Object.keys(w).length === 3 && kennung(w.ort) &&
    ((w.reihe === null && w.spalte === null) || (ganzzahl(w.reihe, 0, 19) && ganzzahl(w.spalte, 0, 19)));

  // Erlaubte Felder je Art mit Pruefregel. Unbekanntes Feld = Fehler.
  const FELDER = {
    ort: {
      name: (w) => text(w, 60),
      reihen: (w) => ganzzahl(w, 1, 20),
      spalten: (w) => ganzzahl(w, 1, 20),
      farben: (w) => w === null || (Array.isArray(w) && w.length <= 20 && w.every((f) => typeof f === "string" && f.length <= 20)), // je Reihe
      reihenfolge: (w) => ganzzahl(w, 0, 999),
      geloescht: bool,
    },
    fach: {
      name: (w) => text(w, 60),
      lage: lageGueltig,
      geloescht: bool,
    },
    eintrag: {
      name: (w) => text(w, 100),
      symbol: (w) => w === null || (typeof w === "string" && w.length <= 16),
      mhd: mhdGueltig,
      eingefroren: (w) => w === null || datumGueltig(w),
      frist: (w) => w === null || ganzzahl(w, 1, 60), // Monate "essen bis" ab Einfrierdatum
      fach: kennungOderNull,
      geloescht: bool,
    },
  };
  const PFLICHT_BEI_NEU = { ort: ["name", "reihen", "spalten"], fach: ["name", "lage"], eintrag: ["name"] };

  // Nur eigene Schluessel: "__proto__", "toString" usw. aus einer Datei duerfen nicht durchrutschen.
  function feldFehler(art, f, w) {
    if (typeof f !== "string" || !Object.hasOwn(FELDER[art], f)) return "unbekanntes Feld: " + kurz(f);
    return FELDER[art][f](w) ? null : "Wert ungueltig: " + f;
  }

  // Liefert null, wenn der Vorgang in Ordnung ist, sonst einen Fehlertext.
  function pruefeVorgang(v) {
    if (!objekt(v)) return "kein Objekt";
    if (!TYPEN.includes(v.typ)) return "unbekannter Vorgangstyp: " + kurz(v.typ);
    if (!ARTEN.includes(v.art)) return "unbekannte Art: " + kurz(v.art);
    for (const k of Object.keys(v)) if (!SCHLUESSEL[v.typ].has(k)) return "unbekannte Angabe: " + kurz(k);
    if (!instGueltig(v.inst)) return "Installations-ID ungueltig";
    if (!ganzzahl(v.n, 1, Number.MAX_SAFE_INTEGER)) return "laufende Nummer ungueltig";
    if (v.id !== v.inst + "-" + v.n) return "Vorgangskennung passt nicht zu Installation und Nummer";
    if (!ganzzahl(v.uhr, 1, Number.MAX_SAFE_INTEGER)) return "logische Uhr ungueltig";
    if (!kennung(v.ziel)) return "Ziel ungueltig";
    if (v.zeit !== undefined && !(typeof v.zeit === "string" && v.zeit.length <= 30)) return "Zeit ungueltig";

    if (v.typ === "neu") {
      if (v.ziel !== v.id) return "neues Objekt muss die Kennung seines Vorgangs tragen";
      if (!objekt(v.werte)) return "Werte fehlen";
      for (const [f, w] of Object.entries(v.werte)) { const fe = feldFehler(v.art, f, w); if (fe) return fe; }
      for (const f of PFLICHT_BEI_NEU[v.art]) if (!Object.hasOwn(v.werte, f)) return "Pflichtfeld fehlt: " + f;
      if (v.art === "eintrag") return ganzzahl(v.menge, 1, 999) ? null : "Anfangsmenge ungueltig";
      return v.menge === undefined ? null : "Menge nur bei Eintraegen";
    }
    if (v.typ === "feld") return feldFehler(v.art, v.feld, v.wert);
    // menge
    if (v.art !== "eintrag") return "Menge nur bei Eintraegen";
    if (!GRUENDE.includes(v.grund)) return "Grund ungueltig";
    if (v.grund === "korrektur") {
      // kennt = die Korrekturen, die beim Zaehlen bekannt waren. Zwei Korrekturen, die sich nicht
      // kennen, heissen "gleichzeitig gezaehlt" -> Bestand pruefen (Codex 1a #2).
      if (!Array.isArray(v.kennt) || v.kennt.length > 1000 || !v.kennt.every(kennung)) return "Korrektur ohne gueltige Vorgaenger";
      // Ohne enge Grenze: eine Korrektur muss jede erreichbare Summe ausgleichen koennen (Codex 1a #12, R2 #6).
      return ganzzahl(v.delta, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) ? null : "Mengenaenderung ungueltig";
    }
    if (v.kennt !== undefined) return "Vorgaenger nur bei Korrekturen";
    return ganzzahl(v.delta, -999, 999) && v.delta !== 0 ? null : "Mengenaenderung ungueltig"; // Eingaben begrenzen (UGC #86)
  }

  // Innerhalb einer Installation: Nummern lueckenlos ab erwartetAb, Uhr steigt mit der Nummer streng an.
  function folgeFehler(liste, lueckenlos) {
    const nachNr = [...liste].sort((a, b) => a.n - b.n);
    for (let i = 0; i < nachNr.length; i++) {
      if (lueckenlos && nachNr[i].n !== i + 1) return "laufende Nummer " + (i + 1) + " fehlt oder ist doppelt";
      if (i > 0 && nachNr[i].uhr <= nachNr[i - 1].uhr) return "logische Uhr laeuft bei Nummer " + nachNr[i].n + " rueckwaerts";
    }
    return null;
  }

  // Eine Vorgangsdatei eines Handys pruefen. Wirft nichts, liefert {ok, fehler}.
  // ponytail: ein abgeschnittenes Dateiende ist hier nicht erkennbar; das deckt der Schrumpf-Schutz in Abschnitt 2 ab.
  function pruefeDatei(datei) {
    const nein = (fehler) => ({ ok: false, fehler });
    if (!objekt(datei)) return nein("keine Vorgangsdatei");
    if (datei.schema !== SCHEMA) return nein("unbekannte Schema-Version " + (typeof datei.schema === "number" ? datei.schema : kurz(datei.schema)));
    if (!instGueltig(datei.inst)) return nein("Installations-ID der Datei ungueltig");
    if (!Array.isArray(datei.vorgaenge)) return nein("Vorgangsliste fehlt");
    for (let i = 0; i < datei.vorgaenge.length; i++) {
      const v = datei.vorgaenge[i];
      const f = pruefeVorgang(v);
      if (f) return nein("Vorgang " + (i + 1) + ": " + f);
      if (v.inst !== datei.inst) return nein("Vorgang " + (i + 1) + " stammt von einer fremden Installation");
    }
    const f = folgeFehler(datei.vorgaenge, true); // keine Eindampfung: jede Datei beginnt bei Nummer 1 (Codex 1a #5)
    return f ? nein(f) : { ok: true, fehler: null };
  }

  // Stabile Textform fuer den Inhaltsvergleich (Schluessel sortiert).
  function kanonisch(w) {
    if (Array.isArray(w)) return "[" + w.map(kanonisch).join(",") + "]";
    if (w && typeof w === "object") return "{" + Object.keys(w).sort().map((k) => JSON.stringify(k) + ":" + kanonisch(w[k])).join(",") + "}";
    return JSON.stringify(w);
  }

  // Mehrere Vorgangslisten vereinigen. Gleiche Kennung mit anderem Inhalt -> anhalten (R2 #10).
  function vereinige(listen) {
    const nein = (fehler) => ({ ok: false, fehler, vorgaenge: null });
    const nachId = new Map();
    for (const liste of listen) {
      for (const v of liste) {
        const alt = nachId.get(v.id);
        if (alt === undefined) { nachId.set(v.id, v); continue; }
        // Billiger Vergleich zuerst (gleicher Schreiber = gleiche Schluesselreihenfolge), kanonisch nur bei Abweichung.
        if (alt === v || JSON.stringify(alt) === JSON.stringify(v) || kanonisch(alt) === kanonisch(v)) continue;
        return nein("Vorgang " + v.id + " liegt zweimal mit verschiedenem Inhalt vor");
      }
    }
    const vorgaenge = [...nachId.values()];
    // Zwei Fassungen derselben Installation koennen einzeln gueltig, zusammen aber widerspruechlich sein (Codex 1a #3).
    const nachInst = new Map();
    for (const v of vorgaenge) { if (!nachInst.has(v.inst)) nachInst.set(v.inst, []); nachInst.get(v.inst).push(v); }
    for (const [inst, liste] of nachInst) { const f = folgeFehler(liste, false); if (f) return nein("Installation " + inst + ": " + f); }
    return { ok: true, fehler: null, vorgaenge };
  }

  function spaeter(a, b) { // ist Stempel a spaeter als b? Stempel = [uhr, inst]
    if (!b) return true;
    return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
  }

  // Werte nach aussen kopieren, damit die Oberflaeche nie die Historie veraendert (Codex 1a #9).
  const kopie = (w) => (Array.isArray(w) ? w.slice() : objekt(w) ? Object.assign({}, w) : w);

  // Aus allen Vorgaengen den Stand berechnen. Erwartet bereits gepruefte Vorgaenge.
  function berechne(vorgaenge) {
    // Die Art jedes Objekts steht in seinem "neu"-Vorgang (Kennungen sind ueber alle Arten eindeutig).
    const artVon = new Map();
    for (const v of vorgaenge) if (v.typ === "neu") artVon.set(v.ziel, v.art);

    const objekte = new Map();
    const widersprueche = [];
    const verwaist = [];
    let maxUhr = 0;
    for (const v of vorgaenge) {
      if (v.uhr > maxUhr) maxUhr = v.uhr;
      const art = artVon.get(v.ziel);
      // Datei des Anlegers fehlt (noch): nicht anwenden, aber melden statt still schlucken (Codex 1a #1).
      if (art === undefined) { verwaist.push(v.id); continue; }
      if (art !== v.art) { widersprueche.push(v.id); continue; } // nicht anwenden, melden ("Daten pruefen")
      let o = objekte.get(v.ziel);
      if (!o) { o = { id: v.ziel, art, felder: {}, stempel: {}, summe: 0, korrekturen: [] }; objekte.set(v.ziel, o); }
      const st = [v.uhr, v.inst];
      const setze = (f, w) => { if (spaeter(st, o.stempel[f])) { o.felder[f] = w; o.stempel[f] = st; } };
      if (v.typ === "neu") { for (const [f, w] of Object.entries(v.werte)) setze(f, w); o.summe += v.menge || 0; }
      else if (v.typ === "feld") setze(v.feld, v.wert);
      else {
        o.summe += v.delta;
        if (v.grund === "korrektur") o.korrekturen.push(v);
      }
    }

    // Feste Sortierung nach Kennung: gleiches Ergebnis, egal in welcher Reihenfolge die Vorgaenge kamen.
    const alle = [...objekte.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const flach = (art) => alle.filter((o) => o.art === art).map((o) => {
      const x = { id: o.id, geloescht: false };
      for (const [f, w] of Object.entries(o.felder)) x[f] = kopie(w);
      return x;
    });
    const orte = flach("ort");
    const faecher = flach("fach");
    const eintraege = flach("eintrag");

    const ortNach = new Map(orte.map((o) => [o.id, o]));
    const fachNach = new Map(faecher.map((f) => [f.id, f]));
    for (const f of faecher) {
      const o = ortNach.get(f.lage.ort);
      f.ortKlaeren = !f.geloescht && (!o || o.geloescht || f.lage.reihe === null || f.lage.reihe >= o.reihen || f.lage.spalte >= o.spalten);
    }
    // ponytail: zwei Faecher auf demselben Platz (gleichzeitig angelegt) werden beide gezeigt, keine Sonderregel.
    for (const e of eintraege) {
      const o = objekte.get(e.id);
      const f = e.fach ? fachNach.get(e.fach) : null;
      e.summe = o.summe;
      // Koepfe = Korrekturen, die keine spaetere Korrektur kennt. Als "gekannt" zaehlt nur eine echte,
      // frueher gestempelte Korrektur DIESES Eintrags; Selbstbezug oder Fremdes verdeckt nichts (Codex R2 #1).
      const uhrVon = new Map(o.korrekturen.map((k) => [k.id, k.uhr]));
      const gekannt = new Set();
      for (const k of o.korrekturen) for (const id of k.kennt) if (uhrVon.has(id) && uhrVon.get(id) < k.uhr) gekannt.add(id);
      const koepfe = o.korrekturen.filter((k) => !gekannt.has(k.id));
      e.korrekturKoepfe = koepfe.map((k) => k.id).sort();
      // Gleichzeitige Korrekturen verfaelschen die Summe nur, wenn sie etwas veraendern; zwei "stimmt, 0"-Korrekturen nicht (R2 #4).
      e.doppeltGezaehlt = koepfe.length > 1 && koepfe.some((k) => k.delta !== 0);
      e.menge = Math.max(0, e.summe);
      e.bestandPruefen = !e.geloescht && (e.summe < 0 || e.doppeltGezaehlt); // Geloeschtes zeigt niemand
      e.sichtbar = !e.geloescht && (e.summe !== 0 || e.doppeltGezaehlt);
      e.ortKlaeren = e.sichtbar && (!f || f.geloescht || f.ortKlaeren);
      e.ablauf = e.sichtbar ? ablaufdatum(e) : null; // nach Jahren sind fast alle Eintraege leer
    }
    return { orte, faecher, eintraege, maxUhr, widersprueche: widersprueche.sort(), verwaist: verwaist.sort() };
  }

  // ---- Datumsrechnung (nur Kalendertage, keine Uhrzeit -> keine Zeitumstellungs-Falle) ----

  function tagZahl(iso) { const [j, m, t] = iso.split("-").map(Number); return Date.UTC(j, m - 1, t) / 864e5; }
  function isoAusTag(z) { return new Date(z * 864e5).toISOString().slice(0, 10); }
  function plusMonate(iso, monate) {
    const [j, m, t] = iso.split("-").map(Number);
    const letzter = new Date(Date.UTC(j, m + monate, 0)).getUTCDate(); // Monatsende im Zielmonat
    return isoAusTag(Date.UTC(j, m - 1 + monate, Math.min(t, letzter)) / 864e5);
  }

  // MHD "JJJJ-MM" gilt bis Monatsende. Ohne MHD: Einfrierdatum + Frist. Sonst null (MHD optional).
  function ablaufdatum(e) {
    if (e.mhd) {
      if (MONAT.test(e.mhd)) { const [j, m] = e.mhd.split("-").map(Number); return isoAusTag(Date.UTC(j, m, 0) / 864e5); }
      return e.mhd;
    }
    if (e.eingefroren && e.frist) return plusMonate(e.eingefroren, e.frist);
    return null;
  }

  function tageBis(iso, heute) { return tagZahl(iso) - tagZahl(heute); }

  // Farbstufe fuer die Kacheln: rot (abgelaufen oder <= rot Tage), gelb (<= gelb Tage), ok, oder null ohne Datum.
  function stufe(ablauf, heute, grenzen) {
    if (!ablauf) return null;
    const g = Object.assign({ rot: 7, gelb: 30 }, grenzen);
    const t = tageBis(ablauf, heute);
    return t <= g.rot ? "rot" : t <= g.gelb ? "gelb" : "ok";
  }

  // Lokalzeit mit Millisekunden (wie UGC lokalIso). heuteIso = nur das Datum.
  function lokalIso(d) { d = d || new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23); }
  function heuteIso(d) { return lokalIso(d).slice(0, 10); }

  // ---- Vorgaenge erzeugen ----

  // zaehler = { inst, nr (naechste Nummer), uhr (groesste bisher gesehene) }.
  // Vertrag fuer die Speicherschicht: Zaehler lesen, erzeuge() aufrufen und Vorgang + neuen Zaehler
  // schreiben ist EIN serialisierter Ablauf (eine Transaktion), sonst entstehen doppelte Kennungen (Codex 1a #13).
  // Wirft bei ungueltiger Eingabe, bevor irgendetwas entsteht.
  function erzeuge(zaehler, daten, jetzt) {
    const n = zaehler.nr;
    const id = zaehler.inst + "-" + n;
    // Eingabe als JSON kopieren: keine geteilten Referenzen mit dem Formular (Codex 1a #9).
    // Spread statt Object.assign: ein eigener Schluessel "__proto__" bleibt ein normales Feld
    // und wird von pruefeVorgang abgelehnt, statt den Prototyp zu setzen (Codex 1a #10).
    // Systemfelder zuletzt: der Aufrufer kann Uhr, Nummer und Kennung nicht ueberschreiben.
    const v = { ...JSON.parse(JSON.stringify(daten)), id, inst: zaehler.inst, n, uhr: zaehler.uhr + 1, zeit: lokalIso(jetzt) };
    if (v.typ === "neu") v.ziel = id;
    const f = pruefeVorgang(v);
    if (f) throw new Error("Vorgang abgelehnt: " + f);
    return { vorgang: v, zaehler: { inst: zaehler.inst, nr: n + 1, uhr: v.uhr } };
  }

  // Nach dem Einlesen fremder Vorgaenge die eigene Uhr nachziehen.
  function uhrNachziehen(zaehler, maxUhr) {
    if (!ganzzahl(maxUhr, 0, Number.MAX_SAFE_INTEGER)) throw new Error("Uhr muss eine ganze Zahl sein");
    return maxUhr > zaehler.uhr ? Object.assign({}, zaehler, { uhr: maxUhr }) : zaehler;
  }

  // Zaehlbestand eingeben (R2 #3): liefert die Daten fuer erzeuge() oder null, wenn alles stimmt.
  // Korrektur = gezaehlt minus bekannte Summe; kennt = alle offenen Korrekturen -> loest "doppelt gezaehlt" auf.
  function korrektur(eintrag, gezaehlt) {
    if (!ganzzahl(gezaehlt, 0, 999)) throw new Error("Gezaehlte Menge muss 0 bis 999 sein");
    const delta = gezaehlt - eintrag.summe;
    if (delta === 0 && !eintrag.doppeltGezaehlt) return null;
    return { typ: "menge", art: "eintrag", ziel: eintrag.id, delta, grund: "korrektur", kennt: eintrag.korrekturKoepfe.slice() };
  }

  // 32 Hexzeichen. getRandomValues gibt es auch in alten Browsern und ohne https (randomUUID nicht).
  function neueInstallationsId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const Modell = {
    SCHEMA, FELDER,
    pruefeVorgang, pruefeDatei, vereinige, berechne, kanonisch,
    ablaufdatum, plusMonate, tageBis, heuteIso, stufe, lokalIso,
    erzeuge, uhrNachziehen, korrektur, neueInstallationsId,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Modell;
  else wurzel.Modell = Modell;
})(typeof window !== "undefined" ? window : globalThis);
