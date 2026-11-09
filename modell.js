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

  const DATUM = /^\d{4}-\d{2}-\d{2}$/;
  const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
  const KENNUNG = /^[A-Za-z0-9]{8,40}(-\d+)?$/;
  const INST = /^[A-Za-z0-9]{8,40}$/;

  const ganzzahl = (w, min, max) => Number.isInteger(w) && w >= min && w <= max;
  const text = (w, max) => typeof w === "string" && w.trim().length > 0 && w.length <= max;
  const bool = (w) => typeof w === "boolean";
  const kennung = (w) => typeof w === "string" && KENNUNG.test(w);
  const instGueltig = (w) => typeof w === "string" && INST.test(w);
  const kennungOderNull = (w) => w === null || kennung(w);
  // "JJJJ-MM-TT" und ein echter Kalendertag (kein 30.02.)
  const datumGueltig = (w) => typeof w === "string" && DATUM.test(w) && isoAusTag(tagZahl(w)) === w;
  const mhdGueltig = (w) => w === null || (typeof w === "string" && MONAT.test(w)) || datumGueltig(w);

  // Erlaubte Felder je Art mit Pruefregel. Unbekanntes Feld = Fehler.
  const FELDER = {
    ort: {
      name: (w) => text(w, 60),
      reihen: (w) => ganzzahl(w, 1, 20),
      spalten: (w) => ganzzahl(w, 1, 20),
      farben: (w) => w === null || (Array.isArray(w) && w.length <= 400 && w.every((f) => typeof f === "string" && f.length <= 20)),
      reihenfolge: (w) => ganzzahl(w, 0, 999),
      geloescht: bool,
    },
    fach: {
      name: (w) => text(w, 60),
      ort: kennung,
      platz: (w) => w === null || ganzzahl(w, 0, 399),
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
  const PFLICHT_BEI_NEU = { ort: ["name", "reihen", "spalten"], fach: ["name", "ort"], eintrag: ["name"] };

  // Nur eigene Schluessel: "__proto__", "toString" usw. aus einer Datei duerfen nicht durchrutschen.
  function feldFehler(art, f, w) {
    if (typeof f !== "string" || !Object.hasOwn(FELDER[art], f)) return "unbekanntes Feld: " + String(f).slice(0, 20);
    return FELDER[art][f](w) ? null : "Wert ungueltig: " + f;
  }

  // Liefert null, wenn der Vorgang in Ordnung ist, sonst einen Fehlertext.
  function pruefeVorgang(v) {
    if (!v || typeof v !== "object") return "kein Objekt";
    if (!TYPEN.includes(v.typ)) return "unbekannter Vorgangstyp: " + String(v.typ).slice(0, 20);
    if (!ARTEN.includes(v.art)) return "unbekannte Art: " + String(v.art).slice(0, 20);
    if (!instGueltig(v.inst)) return "Installations-ID ungueltig";
    if (!ganzzahl(v.n, 1, Number.MAX_SAFE_INTEGER)) return "laufende Nummer ungueltig";
    if (v.id !== v.inst + "-" + v.n) return "Vorgangskennung passt nicht zu Installation und Nummer";
    if (!ganzzahl(v.uhr, 1, Number.MAX_SAFE_INTEGER)) return "logische Uhr ungueltig";
    if (!kennung(v.ziel)) return "Ziel ungueltig";
    if (v.zeit !== undefined && typeof v.zeit !== "string") return "Zeit ungueltig";

    if (v.typ === "neu") {
      if (v.ziel !== v.id) return "neues Objekt muss die Kennung seines Vorgangs tragen";
      if (!v.werte || typeof v.werte !== "object" || Array.isArray(v.werte)) return "Werte fehlen";
      for (const [f, w] of Object.entries(v.werte)) { const fe = feldFehler(v.art, f, w); if (fe) return fe; }
      for (const f of PFLICHT_BEI_NEU[v.art]) if (!Object.hasOwn(v.werte, f)) return "Pflichtfeld fehlt: " + f;
      if (v.art === "eintrag") return ganzzahl(v.menge, 1, 999) ? null : "Anfangsmenge ungueltig";
      return v.menge === undefined ? null : "Menge nur bei Eintraegen";
    }
    if (v.typ === "feld") return feldFehler(v.art, v.feld, v.wert);
    // menge
    if (v.art !== "eintrag") return "Menge nur bei Eintraegen";
    if (!GRUENDE.includes(v.grund)) return "Grund ungueltig";
    const grenze = v.grund === "korrektur" ? 9999 : 999; // Eingaben begrenzen; Korrektur gleicht auch eine stark negative Summe aus
    return ganzzahl(v.delta, -grenze, grenze) && v.delta !== 0 ? null : "Mengenaenderung ungueltig";
  }

  // Eine Vorgangsdatei eines Handys pruefen. Wirft nichts, liefert {ok, fehler}.
  function pruefeDatei(datei) {
    const nein = (fehler) => ({ ok: false, fehler });
    if (!datei || typeof datei !== "object") return nein("keine Vorgangsdatei");
    if (datei.schema !== SCHEMA) return nein("unbekannte Schema-Version " + String(datei.schema).slice(0, 10));
    if (!instGueltig(datei.inst)) return nein("Installations-ID der Datei ungueltig");
    if (!Array.isArray(datei.vorgaenge)) return nein("Vorgangsliste fehlt");
    for (let i = 0; i < datei.vorgaenge.length; i++) {
      const v = datei.vorgaenge[i];
      const f = pruefeVorgang(v);
      if (f) return nein("Vorgang " + (i + 1) + ": " + f);
      if (v.inst !== datei.inst) return nein("Vorgang " + (i + 1) + " stammt von einer fremden Installation");
    }
    // Nach Nummer sortiert: keine Nummer doppelt, die Uhr steigt mit der Nummer streng an.
    const nachNr = [...datei.vorgaenge].sort((a, b) => a.n - b.n);
    for (let i = 1; i < nachNr.length; i++) {
      if (nachNr[i].n === nachNr[i - 1].n) return nein("laufende Nummer " + nachNr[i].n + " doppelt");
      if (nachNr[i].uhr <= nachNr[i - 1].uhr) return nein("logische Uhr laeuft bei Nummer " + nachNr[i].n + " rueckwaerts");
    }
    return { ok: true, fehler: null };
  }

  // Stabile Textform fuer den Inhaltsvergleich (Schluessel sortiert).
  function kanonisch(w) {
    if (Array.isArray(w)) return "[" + w.map(kanonisch).join(",") + "]";
    if (w && typeof w === "object") return "{" + Object.keys(w).sort().map((k) => JSON.stringify(k) + ":" + kanonisch(w[k])).join(",") + "}";
    return JSON.stringify(w);
  }

  // Mehrere Vorgangslisten vereinigen. Gleiche Kennung mit anderem Inhalt -> anhalten (R2 #10).
  function vereinige(listen) {
    const nachId = new Map();
    for (const liste of listen) {
      for (const v of liste) {
        const alt = nachId.get(v.id);
        if (alt === undefined) { nachId.set(v.id, v); continue; }
        // Billiger Vergleich zuerst (gleicher Schreiber = gleiche Schluesselreihenfolge), kanonisch nur bei Abweichung.
        if (alt === v || JSON.stringify(alt) === JSON.stringify(v) || kanonisch(alt) === kanonisch(v)) continue;
        return { ok: false, fehler: "Vorgang " + v.id + " liegt zweimal mit verschiedenem Inhalt vor", vorgaenge: null };
      }
    }
    return { ok: true, fehler: null, vorgaenge: [...nachId.values()] };
  }

  function spaeter(a, b) { // ist Stempel a spaeter als b? Stempel = [uhr, inst]
    if (!b) return true;
    return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
  }

  // Aus allen Vorgaengen den Stand berechnen. Erwartet bereits gepruefte Vorgaenge.
  function berechne(vorgaenge) {
    // Die Art jedes Objekts steht in seinem "neu"-Vorgang (Kennungen sind ueber alle Arten eindeutig).
    const artVon = new Map();
    for (const v of vorgaenge) if (v.typ === "neu") artVon.set(v.ziel, v.art);

    const objekte = new Map();
    const widersprueche = [];
    let maxUhr = 0;
    for (const v of vorgaenge) {
      if (v.uhr > maxUhr) maxUhr = v.uhr;
      const art = artVon.get(v.ziel);
      if (art === undefined) continue; // Datei des Anlegers fehlt: Objekt wird nicht angezeigt
      if (art !== v.art) { widersprueche.push(v.id); continue; } // nicht anwenden, melden ("Daten pruefen")
      let o = objekte.get(v.ziel);
      if (!o) { o = { id: v.ziel, art, felder: {}, stempel: {}, summe: 0 }; objekte.set(v.ziel, o); }
      const st = [v.uhr, v.inst];
      const setze = (f, w) => { if (spaeter(st, o.stempel[f])) { o.felder[f] = w; o.stempel[f] = st; } };
      if (v.typ === "neu") { for (const [f, w] of Object.entries(v.werte)) setze(f, w); o.summe += v.menge || 0; }
      else if (v.typ === "feld") setze(v.feld, v.wert);
      else o.summe += v.delta;
    }

    // Feste Sortierung nach Kennung: gleiches Ergebnis, egal in welcher Reihenfolge die Vorgaenge kamen.
    const alle = [...objekte.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const flach = (art) => alle.filter((o) => o.art === art).map((o) => Object.assign({ id: o.id, geloescht: false }, o.felder));
    const orte = flach("ort");
    const faecher = flach("fach");
    const eintraege = flach("eintrag");

    const ortNach = new Map(orte.map((o) => [o.id, o]));
    const fachNach = new Map(faecher.map((f) => [f.id, f]));
    for (const f of faecher) {
      const o = ortNach.get(f.ort);
      f.ortKlaeren = !f.geloescht && (!o || o.geloescht || f.platz === null || f.platz === undefined || f.platz >= o.reihen * o.spalten);
    }
    // ponytail: zwei Faecher auf demselben Platz (gleichzeitig angelegt) werden beide gezeigt, keine Sonderregel.
    for (const e of eintraege) {
      const f = e.fach ? fachNach.get(e.fach) : null;
      e.summe = objekte.get(e.id).summe;
      e.menge = Math.max(0, e.summe);
      e.bestandPruefen = e.summe < 0;
      e.sichtbar = !e.geloescht && e.summe !== 0;
      e.ortKlaeren = e.sichtbar && (!f || f.geloescht || f.ortKlaeren);
      e.ablauf = e.sichtbar ? ablaufdatum(e) : null; // nach Jahren sind fast alle Eintraege leer
    }
    return { orte, faecher, eintraege, maxUhr, widersprueche: widersprueche.sort() };
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
  // Liefert { vorgang, zaehler } - beides muss der Aufrufer in EINEM Schritt speichern.
  // Wirft bei ungueltiger Eingabe, bevor irgendetwas entsteht.
  function erzeuge(zaehler, daten, jetzt) {
    const n = zaehler.nr;
    const id = zaehler.inst + "-" + n;
    // Systemfelder zuletzt: der Aufrufer kann Uhr, Nummer und Kennung nicht ueberschreiben.
    const v = Object.assign({}, daten, { id, inst: zaehler.inst, n, uhr: zaehler.uhr + 1, zeit: lokalIso(jetzt) });
    if (v.typ === "neu") v.ziel = id;
    const f = pruefeVorgang(v);
    if (f) throw new Error("Vorgang abgelehnt: " + f);
    return { vorgang: v, zaehler: { inst: zaehler.inst, nr: n + 1, uhr: v.uhr } };
  }

  // Nach dem Einlesen fremder Vorgaenge die eigene Uhr nachziehen.
  function uhrNachziehen(zaehler, maxUhr) {
    return maxUhr > zaehler.uhr ? Object.assign({}, zaehler, { uhr: maxUhr }) : zaehler;
  }

  // Zaehlbestand eingeben: Korrektur = gezaehlt minus bekannte Summe (R2 #3).
  // null = stimmt schon, kein Vorgang noetig. Wirft bei unmoeglicher Zaehlung.
  function korrekturDelta(gezaehlt, summe) {
    if (!ganzzahl(gezaehlt, 0, 999)) throw new Error("Gezaehlte Menge muss 0 bis 999 sein");
    const d = gezaehlt - summe;
    return d === 0 ? null : d;
  }

  // 32 Hexzeichen. getRandomValues gibt es auch in alten Browsern und ohne https (randomUUID nicht).
  function neueInstallationsId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const Modell = {
    SCHEMA, FELDER,
    pruefeVorgang, pruefeDatei, vereinige, berechne, kanonisch,
    ablaufdatum, plusMonate, tageBis, heuteIso, stufe, lokalIso,
    erzeuge, uhrNachziehen, korrekturDelta, neueInstallationsId,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Modell;
  else wurzel.Modell = Modell;
})(typeof window !== "undefined" ? window : globalThis);
