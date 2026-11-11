// speicher.js - lokale Speicherschicht der Vorrats-App (Bauabschnitt 1b), IndexedDB.
// Laeuft im Browser (window.Speicher, braucht window.Modell) und in Node (require, IndexedDB von aussen).
//
// DB "vorrat": Speicher "vorgaenge" (Schluessel id) und "meta" (Schluessel "zaehler" = {inst, nr, uhr},
// "abgleich" + "wolke" = Zustand aus cloud.js).
// Grundsatz: Vorgang und Zaehler stehen immer zusammen in EINER Transaktion (Bauplan R2 #2, UGC #45).
(function (wurzel) {
  "use strict";

  const Modell = typeof module !== "undefined" && module.exports ? require("./modell.js") : wurzel.Modell;
  const DB = "vorrat";

  const BLOCKIERT = "Die Datenbank ist von einem anderen Fenster der Vorrats-App belegt – bitte andere Fenster/Tabs der App schließen und erneut versuchen";
  const WARTEN_MS = 10000;
  const anlegen = (db) => {
    if (!db.objectStoreNames.contains("vorgaenge")) db.createObjectStore("vorgaenge", { keyPath: "id" });
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  };
  const vollstaendig = (db) => db.objectStoreNames.contains("vorgaenge") && db.objectStoreNames.contains("meta");

  // DB oeffnen (version 0 = aktuelle). upgrade(r, stopp) laeuft nur bei Versionswechsel; lief sagt, OB er lief.
  // Haengt die Anfrage (anderer Tab gibt nicht frei), endet sie nach wartenMs mit Klartext; laeuft der
  // Wechsel spaeter doch noch an, wird er abgebrochen, damit nach der Fehlermeldung nichts mehr passiert (Codex2 #5).
  function oeffnenAuf(version, upgrade, wartenMs) {
    return new Promise((ok, nein) => {
      let lief = false, aufgegeben = false, abbruch = null;
      const r = version ? indexedDB.open(DB, version) : indexedDB.open(DB);
      const uhr = setTimeout(() => { if (!lief) { aufgegeben = true; nein(new Error(BLOCKIERT)); } }, wartenMs || WARTEN_MS);
      r.onupgradeneeded = () => {
        if (aufgegeben) return r.transaction.abort();
        lief = true;
        const stopp = (text) => { abbruch = text; r.transaction.abort(); };
        try { upgrade(r, stopp); } catch (x) { stopp((x && x.message) || String(x)); }
      };
      // Loescht ein anderer Tab die DB, geben wir sie frei; danach lehnt jeder Aufruf hier ab (nie still weiter).
      r.onsuccess = () => {
        clearTimeout(uhr);
        if (aufgegeben) return r.result.close();
        r.result.onversionchange = () => r.result.close();
        ok({ db: r.result, lief });
      };
      r.onerror = () => { clearTimeout(uhr); if (!aufgegeben) nein(new Error(abbruch || (r.error && r.error.message) || "Datenbank nicht zu öffnen")); };
    });
  }

  // Ohne Versionsnummer: leeren() hebt die Version bei jedem Loeschen an, geoeffnet wird immer die aktuelle.
  // Fehlt einer DB ein Speicher, wird er einmal mit Version + 1 nachgelegt (Codex2, Abdeckung).
  async function verbinden(wartenMs) {
    let { db } = await oeffnenAuf(0, (r) => anlegen(r.result), wartenMs);
    if (!vollstaendig(db)) {
      const v = db.version;
      db.close();
      ({ db } = await oeffnenAuf(v + 1, (r) => anlegen(r.result), wartenMs));
      if (!vollstaendig(db)) { db.close(); throw new Error("Datenbank unvollständig – bitte App neu laden"); }
    }
    return db;
  }

  // Eine Transaktion ueber beide Speicher. arbeit(vorgaenge, meta, lauf) darf NUR mit Request-Callbacks
  // arbeiten (jedes fremde await schliesst die Transaktion). Callbacks in lauf(fn) einpacken: was fn
  // zurueckgibt, wird das Ergebnis; wirft fn, wird abgebrochen.
  // Loest erst bei oncomplete auf (= steht auf dem Geraet; durability "strict" bei readwrite, ohne Browser-Support ignoriert). Fehler/Abbruch -> abgelehnt, nichts gespeichert (UGC #5).
  function schritt(db, modus, arbeit) {
    return new Promise((ok, nein) => {
      let t, ergebnis, grund;
      const lauf = (fn) => (e) => {
        try { const w = fn(e && e.target.result); if (w !== undefined) ergebnis = w; }
        catch (x) { grund = x; try { t.abort(); } catch (_) { /* schon beendet */ } }
      };
      try { t = db.transaction(["vorgaenge", "meta"], modus, modus === "readwrite" ? { durability: "strict" } : undefined); } catch (x) { return nein(x); }
      t.oncomplete = () => ok(ergebnis);
      t.onabort = () => nein(grund || t.error || new Error("Speichern abgebrochen"));
      lauf(() => arbeit(t.objectStore("vorgaenge"), t.objectStore("meta"), lauf))();
    });
  }

  // Liefert ein Speicher-Objekt fuer diese Verbindung (jeder Tab hat seine eigene).
  async function oeffnen() {
    const db = await verbinden();
    // Lesen-oder-Anlegen in EINER Transaktion: zwei gleichzeitig startende Tabs bekommen dieselbe ID.
    const start = await schritt(db, "readwrite", (vs, meta, lauf) => {
      vs.getAll().onsuccess = lauf((alle) => {
        meta.get("zaehler").onsuccess = lauf((z) => {
          // Zaehler passt nur, wenn genau die Nummern 1..nr-1 dieser ID vorliegen. Sonst ist etwas verloren
          // (Zaehler weg ODER Vorgaenge weg, Codex R2 #2) -> immer eine NEUE ID, nie die alte (R2 #2, Luecke 4).
          if (z && alle.filter((v) => v.inst === z.inst).length === z.nr - 1) return { zaehler: z, neu: false };
          // Halber Zustand: die alten Vorgaenge bleiben unangetastet liegen (Abschnitt 2 laedt sie unter ihrer alten ID hoch).
          // Die neue ID kann keine Nummer doppelt vergeben; die Uhr startet hinter dem groessten bekannten Stempel.
          const uhr = alle.reduce((m, v) => (Number.isSafeInteger(v.uhr) && v.uhr > m ? v.uhr : m), z && Number.isSafeInteger(z.uhr) ? z.uhr : 0);
          const neu = { inst: Modell.neueInstallationsId(), nr: 1, uhr };
          meta.put(neu, "zaehler");
          return { zaehler: neu, neu: true };
        });
      });
    });
    const inst = start.zaehler.inst;
    // Hat ein anderer Tab inzwischen eine neue ID angelegt, schreibt dieser Tab nicht unter fremder ID (Codex R2 #3).
    const zaehlerLesen = (meta, lauf, fn) => {
      meta.get("zaehler").onsuccess = lauf((z) => {
        if (!z) throw new Error("Zaehler fehlt");
        if (z.inst !== inst) throw new Error("Installation gewechselt - bitte App neu laden");
        return fn(z);
      });
    };

    const MAX_SCHRITT = 500; // Schutz gegen versehentlich riesige Listen in einer Transaktion
    const alle = (schritte, jetzt) => {
      if (!Array.isArray(schritte) || !schritte.length) return Promise.reject(new Error("Keine Vorgänge zum Speichern"));
      return schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z0) => {
        let z = z0;
        const fertig = [];
        for (const s of schritte) {
          // Kopien: ein Schritt kann nichts Gespeichertes verbiegen.
          const daten = typeof s === "function" ? s(fertig.map((v) => JSON.parse(JSON.stringify(v)))) : s;
          for (const d of Array.isArray(daten) ? daten : [daten]) {
            if (fertig.length >= MAX_SCHRITT) throw new Error("Zu viele Vorgänge in einem Schritt");
            const e = Modell.erzeuge(z, d, jetzt);
            vs.add(e.vorgang); // add statt put: ein vorhandener Vorgang wird nie ueberschrieben
            z = e.zaehler;
            fertig.push(e.vorgang);
          }
        }
        if (!fertig.length) throw new Error("Keine Vorgänge zum Speichern");
        meta.put(z, "zaehler"); // einmal, am Ende
        return fertig;
      }));
    };

    return {
      inst,
      neu: start.neu, // true = diese Installation wurde gerade neu angelegt (auch nach Datenverlust)

      // Vorgang erzeugen und mit dem neuen Zaehler speichern. Promise = der gespeicherte Vorgang.
      // Ungueltige Eingabe oder Speicherfehler -> abgelehnt, nichts gespeichert, Zaehler unveraendert.
      ausfuehren: (daten, jetzt) => alle([daten], jetzt).then((a) => a[0]),

      // Mehrere Vorgaenge in EINEM Schritt (Abschnitt 3-5, Aufgabe A): ganz oder gar nicht, eine Transaktion,
      // Zaehler einmal gelesen und einmal geschrieben. Ein Schritt ist Vorgangsdaten ODER eine Funktion
      // (bisher) -> Daten | [Daten], die die schon erzeugten Vorgaenge dieses Aufrufs sieht (Grundausstattung:
      // Faecher brauchen die Kennung ihres Orts). Wirft ein Schritt oder ist einer ungueltig: nichts gespeichert.
      ausfuehrenAlle: (schritte, jetzt) => alle(schritte, jetzt),

      // Alle lokal gespeicherten Vorgaenge (laufende ID, im halben Zustand auch fruehere IDs dieses Geraets).

      // Fremde Vorgaenge (anderes Handy) liegen nie hier, sondern im Abgleich-Zustand.
      alleVorgaenge: () => schritt(db, "readonly", (vs, meta, lauf) => { vs.getAll().onsuccess = lauf((a) => a); }),

      zaehler: () => schritt(db, "readonly", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => z)),

      // Abgleich-Zustand (cloud.js): Ordner, "gelesen" = diese Installation hat alle Dateien gelesen, dazu die
      // zuletzt gelesenen Dateien. Klein ("abgleich") und gross ("wolke", bis einige MB) getrennt gespeichert,
      // damit nicht jeder Abgleich die grossen Daten neu schreibt. null = noch nie abgeglichen.
      abgleich: () => schritt(db, "readonly", (vs, meta, lauf) => {
        meta.get("abgleich").onsuccess = lauf((a) => {
          if (!a) return null;
          meta.get("wolke").onsuccess = lauf((w) => abgleichZusammen(a, w));
        });
      }),
      // Zustand + Uhr nachziehen in EINER Transaktion: "gelesen" gilt nie ohne nachgezogene Uhr (Abschnitt 2).
      // Steht zustand.dateien drin, werden auch die grossen Daten geschrieben, sonst bleiben sie stehen.
      abgleichSpeichern: (zustand, maxUhr) => Number.isSafeInteger(maxUhr)
        ? schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => {
          const n = Modell.uhrNachziehen(z, maxUhr);
          if (n !== z) meta.put(n, "zaehler");
          const { dateien, ...klein } = zustand;
          meta.put(klein, "abgleich");
          if (dateien !== undefined) meta.put({ ordner: zustand.ordner, dateien }, "wolke");
          return n;
        }))
        : Promise.reject(new Error("Uhr ungueltig")),

      // Vorgaenge der LAUFENDEN ID, die nur in OneDrive stehen, uebernehmen (Code-Review #3): zusammen mit
      // Zaehler (Nummer + Uhr dahinter) in einer Transaktion, damit keine Kennung doppelt vergeben wird.
      uebernehmen: (liste) => schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => {
        let nr = z.nr, uhr = z.uhr;
        for (const v of liste) {
          if (Modell.pruefeVorgang(v) || v.inst !== inst) throw new Error("Vorgang zum Uebernehmen ungueltig");
          vs.add(v); // vorhandene Kennung -> Abbruch, nichts uebernommen
          if (v.n >= nr) nr = v.n + 1;
          if (v.uhr > uhr) uhr = v.uhr;
        }
        const n = { inst, nr, uhr };
        meta.put(n, "zaehler");
        return n;
      })),

      schliessen: () => db.close(),
    };
  }

  // Dauerhaften Speicher anfordern (UGC #26). true/false = Zustand laut Browser, null = nicht feststellbar.
  async function dauerhaft() {
    const s = typeof navigator !== "undefined" && navigator.storage;
    if (!s || !s.persist || !s.persisted) return null;
    try { await s.persist(); return await s.persisted(); } catch (_) { return null; }
  }

  const abgleichZusammen = (a, w) => (a ? Object.assign({}, a, { dateien: w && w.ordner === a.ordner ? w.dateien : {} }) : null);

  // Alle lokalen Daten loeschen (Testdaten weg / Ordnerwechsel), aber nur, wenn grund(vorgaenge, abgleich) null
  // liefert; sonst Abbruch mit diesem Text, nichts geloescht. Pruefen und Leeren laufen in EINER
  // Versionswechsel-Transaktion: die beginnt erst, wenn alle anderen Tabs ihre Verbindung geschlossen haben
  // (onversionchange), also kann zwischen Pruefen und Loeschen nichts mehr gespeichert werden (Codex #4).
  // Danach legt oeffnen() eine NEUE ID an. Die geschlossenen Tabs muessen neu laden (ihr Speichern scheitert laut).
  async function leeren(grund, wartenMs) {
    const db = await verbinden(wartenMs);
    const version = db.version;
    db.close();
    const { db: neu, lief } = await oeffnenAuf(version + 1, (r, stopp) => {
      const t = r.transaction, vs = t.objectStore("vorgaenge"), meta = t.objectStore("meta");
      vs.getAll().onsuccess = (e1) => { meta.get("abgleich").onsuccess = (e2) => { meta.get("wolke").onsuccess = (e3) => {
        let g;
        try { g = grund(e1.target.result, abgleichZusammen(e2.target.result, e3.target.result)); } catch (x) { g = (x && x.message) || String(x); }
        if (g) return stopp(g);
        vs.clear();
        meta.clear();
      }; }; };
    }, wartenMs);
    neu.close();
    // Hat ein anderer Tab gleichzeitig die Version angehoben, lief hier weder Pruefung noch Leeren (Codex2 #4).
    if (!lief) throw new Error("Nicht gelöscht: ein anderes Fenster hat gleichzeitig gelöscht – bitte App neu laden");
  }

  const Speicher = { DB, oeffnen, dauerhaft, leeren };
  if (typeof module !== "undefined" && module.exports) module.exports = Speicher;
  else wurzel.Speicher = Speicher;
})(typeof window !== "undefined" ? window : globalThis);
