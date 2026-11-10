// speicher.js - lokale Speicherschicht der Vorrats-App (Bauabschnitt 1b), IndexedDB.
// Laeuft im Browser (window.Speicher, braucht window.Modell) und in Node (require, IndexedDB von aussen).
//
// DB "vorrat": Speicher "vorgaenge" (Schluessel id) und "meta" (Schluessel "zaehler" = {inst, nr, uhr},
// "abgleich" = Zustand aus cloud.js).
// Grundsatz: Vorgang und Zaehler stehen immer zusammen in EINER Transaktion (Bauplan R2 #2, UGC #45).
(function (wurzel) {
  "use strict";

  const Modell = typeof module !== "undefined" && module.exports ? require("./modell.js") : wurzel.Modell;
  const DB = "vorrat";

  function verbinden() {
    return new Promise((ok, nein) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("vorgaenge", { keyPath: "id" }); r.result.createObjectStore("meta"); };
      // Loescht ein anderer Tab die DB, geben wir sie frei; danach lehnt jeder Aufruf hier ab (nie still weiter).
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); ok(r.result); };
      r.onerror = () => nein(r.error);
    });
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

    return {
      inst,
      neu: start.neu, // true = diese Installation wurde gerade neu angelegt (auch nach Datenverlust)

      // Vorgang erzeugen und mit dem neuen Zaehler speichern. Promise = der gespeicherte Vorgang.
      // Ungueltige Eingabe oder Speicherfehler -> abgelehnt, nichts gespeichert, Zaehler unveraendert.
      ausfuehren: (daten, jetzt) => schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => {
        const e = Modell.erzeuge(z, daten, jetzt);
        vs.add(e.vorgang); // add statt put: ein vorhandener Vorgang wird nie ueberschrieben
        meta.put(e.zaehler, "zaehler");
        return e.vorgang;
      })),

      // Alle lokal erzeugten Vorgaenge, im halben Zustand auch die einer frueheren ID dieses Geraets.
      // Fremde Vorgaenge (anderes Handy) liegen nie hier, sondern im Abgleich-Zustand (meta "abgleich").
      alleVorgaenge: () => schritt(db, "readonly", (vs, meta, lauf) => { vs.getAll().onsuccess = lauf((a) => a); }),
      // Nur die der laufenden Installation (Bauplan Abschnitt 2: nach inst filtern).
      eigeneVorgaenge: () => schritt(db, "readonly", (vs, meta, lauf) => { vs.getAll().onsuccess = lauf((a) => a.filter((v) => v && v.inst === inst)); }),

      zaehler: () => schritt(db, "readonly", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => z)),

      // Abgleich-Zustand (cloud.js): Ordner, zuletzt gelesene Dateien, "gelesen" = diese Installation hat
      // alle Dateien gelesen. null = noch nie abgeglichen.
      abgleich: () => schritt(db, "readonly", (vs, meta, lauf) => { meta.get("abgleich").onsuccess = lauf((a) => a || null); }),
      // Zustand + Uhr nachziehen in EINER Transaktion: "gelesen" gilt nie ohne nachgezogene Uhr (Abschnitt 2).
      abgleichSpeichern: (zustand, maxUhr) => Number.isSafeInteger(maxUhr)
        ? schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => {
          const n = Modell.uhrNachziehen(z, maxUhr);
          if (n !== z) meta.put(n, "zaehler");
          meta.put(zustand, "abgleich");
          return n;
        }))
        : Promise.reject(new Error("Uhr ungueltig")),

      // Nach dem Einlesen fremder Dateien. Nur ganze Zahlen: ein Text als Uhr wuerde jeden weiteren Vorgang sperren.
      uhrNachziehen: (maxUhr) => Number.isSafeInteger(maxUhr)
        ? schritt(db, "readwrite", (vs, meta, lauf) => zaehlerLesen(meta, lauf, (z) => {
          const n = Modell.uhrNachziehen(z, maxUhr);
          if (n !== z) meta.put(n, "zaehler");
          return n;
        }))
        : Promise.reject(new Error("Uhr ungueltig")),

      schliessen: () => db.close(),
    };
  }

  // Dauerhaften Speicher anfordern (UGC #26). true/false = Zustand laut Browser, null = nicht feststellbar.
  async function dauerhaft() {
    const s = typeof navigator !== "undefined" && navigator.storage;
    if (!s || !s.persist || !s.persisted) return null;
    try { await s.persist(); return await s.persisted(); } catch (_) { return null; }
  }

  // Ganze lokale DB loeschen (Testdaten weg / Ordnerwechsel). Danach bekommt das Geraet eine NEUE ID.
  // Offene Verbindungen anderer Tabs geben per onversionchange frei.
  const loeschen = () => new Promise((ok, nein) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = () => ok();
    r.onerror = () => nein(r.error);
  });

  const Speicher = { DB, oeffnen, dauerhaft, loeschen };
  if (typeof module !== "undefined" && module.exports) module.exports = Speicher;
  else wurzel.Speicher = Speicher;
})(typeof window !== "undefined" ? window : globalThis);
