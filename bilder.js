// bilder.js - Produktbilder der Vorrats-App (v6, Bauplan Produktbilder Fassung 3, Abschnitt A). Nur Browser.
// Eigene IndexedDB "vorrat-bilder", getrennt von den Vorgaengen: ein Bildfehler gefaehrdet nie den Vorrat.
// Abschnitt A: Speicher "off" = Internetbild je Code (Zwischenspeicher, wiederbeschaffbar, hoechstens OFF_MAX).
// Abschnitt B: Speicher "fotos" = eigene Fotodatei je Zufallsname { blob, hochgeladen, zeit }, nie ueberschrieben.
// Jeder Fehler hier endet als "kein Bild" (null), nie als Ausnahme beim Aufrufer.
(function (wurzel) {
  "use strict";
  const H = wurzel.Hilfen;
  const DB = "vorrat-bilder";
  const OFF_MAX = 1000;
  const MAX_BYTES = 400 * 1024; // Download-Grenze, beim Lesen durchgesetzt (Codex #14)
  const MAX_KANTE = 8000;       // groessere Bilder gar nicht erst verarbeiten
  const ZIEL = 400;             // Entscheidung 1: 400 x 400
  const ZEIT_MS = 8000;

  let dbVersprechen = null;
  function oeffnen() {
    if (!dbVersprechen) dbVersprechen = new Promise((ok, nein) => {
      const r = indexedDB.open(DB, 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("off")) db.createObjectStore("off").createIndex("zeit", "zeit");
        if (!db.objectStoreNames.contains("fotos")) db.createObjectStore("fotos");
      };
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbVersprechen = null; }; ok(r.result); };
      r.onerror = () => { dbVersprechen = null; nein(r.error); };
      r.onblocked = () => { dbVersprechen = null; nein(new Error("Bild-Speicher belegt")); };
    });
    return dbVersprechen;
  }
  const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
  const fertig = (t) => new Promise((ok, nein) => { t.oncomplete = () => ok(); t.onerror = t.onabort = () => nein(t.error || new Error("abgebrochen")); });

  // Lesen frischt die Zeit auf (hoechstens einmal am Tag): rausgeworfen wird das am laengsten nicht Gezeigte.
  async function offLesen(code) {
    try {
      const db = await oeffnen();
      const s = db.transaction("off", "readwrite").objectStore("off");
      const x = await anfrage(s.get(code));
      if (!x || !(x.blob instanceof Blob)) return null;
      if (Date.now() - x.zeit > 864e5) s.put({ blob: x.blob, zeit: Date.now() }, code);
      return x.blob;
    } catch (_) { return null; }
  }
  // Speichern; bei mehr als OFF_MAX fliegen die am laengsten nicht gezeigten raus. Speicher voll = still verzichten (Bauplan).
  async function offSchreiben(code, blob) {
    try {
      const db = await oeffnen();
      const t = db.transaction("off", "readwrite"), s = t.objectStore("off");
      s.put({ blob, zeit: Date.now() }, code);
      s.count().onsuccess = (ev) => {
        let zuViel = ev.target.result - OFF_MAX;
        if (zuViel <= 0) return;
        s.index("zeit").openKeyCursor().onsuccess = (e) => {
          const c = e.target.result;
          if (!c || zuViel-- <= 0) return;
          s.delete(c.primaryKey);
          c.continue();
        };
      };
      await fertig(t);
      return true;
    } catch (_) { return false; }
  }
  // ---- eigene Fotos ----
  // add statt put: ein Dateiname wird nie ueberschrieben. false = nicht gespeichert (Speicher voll o. ae.).
  async function fotoSpeichern(datei, blob) {
    try {
      const db = await oeffnen();
      const t = db.transaction("fotos", "readwrite");
      t.objectStore("fotos").add({ blob, hochgeladen: false, zeit: Date.now() }, datei);
      await fertig(t);
      return true;
    } catch (_) { return false; }
  }
  async function fotoLesen(datei) {
    try {
      const x = await anfrage((await oeffnen()).transaction("fotos").objectStore("fotos").get(datei));
      return x && x.blob instanceof Blob ? x.blob : null;
    } catch (_) { return null; }
  }
  async function fotoLoeschen(datei) {
    try { const t = (await oeffnen()).transaction("fotos", "readwrite"); t.objectStore("fotos").delete(datei); await fertig(t); } catch (_) { /* Waise, harmlos */ }
  }
  // Fuer die Rueckfrage vor "Geraetedaten loeschen": nicht hochgeladene Fotos, die ein aktuelles Bild-Objekt
  // nennt (aktuell = Set der Dateinamen; null = Stand unbekannt -> alle zaehlen). Wirft bei Lesefehler.
  async function fotosOffen(aktuell) {
    const r = (await oeffnen()).transaction("fotos").objectStore("fotos").openCursor();
    let n = 0;
    return new Promise((ok, nein) => {
      r.onerror = () => nein(r.error);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return ok(n);
        if (!c.value.hochgeladen && (!aktuell || aktuell.has(c.key))) n++;
        c.continue();
      };
    });
  }

  async function leeren() {
    dbVersprechen = null;
    await new Promise((ok, nein) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = () => ok(); r.onerror = () => nein(r.error); r.onblocked = () => ok(); });
  }

  // Antwort lesen und dabei nach MAX_BYTES abbrechen (Content-Length kann fehlen oder luegen).
  async function begrenztLesen(r) {
    if (!r.body || !r.body.getReader) { const b = await r.blob(); return b.size <= MAX_BYTES ? b : null; }
    const leser = r.body.getReader(), teile = [];
    let n = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BYTES) { try { leser.cancel(); } catch (_) { /* egal */ } return null; }
      teile.push(value);
    }
    return new Blob(teile);
  }

  // Beliebiges Bild -> quadratischer Ausschnitt aus der Mitte, 400 x 400, neu als JPEG (Metadaten fallen weg).
  async function normalisieren(blob) {
    let bmp = null;
    try {
      // Erst die Masse aus dem Dateikopf, dann erst dekodieren. 1 MB: bei Handykameras stehen EXIF mit Vorschaubild,
      // MPF, XMP und ICC vor dem SOF-Marker, zusammen oft ueber 64 KB (Review v6 B #1).
      const m = H.bildMasse(new Uint8Array(await blob.slice(0, 1 << 20).arrayBuffer()));
      if (!m || m.w > MAX_KANTE || m.h > MAX_KANTE) return null;
      bmp = await createImageBitmap(blob);
      if (!bmp.width || !bmp.height || bmp.width > MAX_KANTE || bmp.height > MAX_KANTE) return null;
      const a = H.ausschnitt(bmp.width, bmp.height), k = Math.min(ZIEL, a.s);
      const lw = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(k, k) : Object.assign(document.createElement("canvas"), { width: k, height: k });
      const g = lw.getContext("2d");
      g.fillStyle = "#fff"; // transparente PNGs nicht schwarz werden lassen
      g.fillRect(0, 0, k, k);
      g.drawImage(bmp, a.sx, a.sy, a.s, a.s, 0, 0, k, k);
      const aus = lw.convertToBlob ? await lw.convertToBlob({ type: "image/jpeg", quality: 0.85 })
        : await new Promise((ok) => lw.toBlob(ok, "image/jpeg", 0.85));
      return aus && aus.size > 0 ? aus : null;
    } catch (_) { return null; } finally { if (bmp && bmp.close) bmp.close(); }
  }

  // Internetbild laden: nur gepruefte Adresse, keine Weiterleitung, keine Anmeldedaten, Zeitgrenze, Groessengrenze.
  async function offLaden(url) {
    const u = H.bildUrlOk(url);
    if (!u || navigator.onLine === false) return null;
    try {
      const r = await fetch(u, { redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(ZEIT_MS) });
      if (!r.ok || !/^image\//.test(r.headers.get("content-type") || "")) return null;
      const roh = await begrenztLesen(r);
      return roh ? await normalisieren(roh) : null;
    } catch (_) { return null; }
  }

  wurzel.Bilder = { offLesen, offSchreiben, offLaden, normalisieren, leeren, fotoSpeichern, fotoLesen, fotoLoeschen, fotosOffen, OFF_MAX };
})(window);
