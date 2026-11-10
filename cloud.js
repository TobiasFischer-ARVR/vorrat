// cloud.js - OneDrive-Abgleich der Vorrats-App (Bauabschnitt 2). Kein DOM, kein MSAL:
// Graph-Zugang kommt als g = { fetch, token } herein (Browser: echtes fetch + MSAL, Node: Attrappe).
// Browser (window.Cloud) und Node (require).
//
// Ablauf abgleichen(): Ordner Ordner fuer Ordner finden -> Datenordner auflisten (fremde Datei = STOPP)
// -> alle vorgaenge-*.json lesen und pruefen (jeder Fehler = Abbruch, nie "leer") -> mit lokalen
// Vorgaengen auf Widerspruch pruefen -> eigene Datei(en) mit If-Match hochladen -> Zustand + Uhr in
// EINER Transaktion speichern -> einmal am Tag Sicherung. Quittiert ist, was in der hochgeladenen
// Fassung stand (Zustand.dateien[...].vorgaenge), alles andere bleibt "noch nicht abgeglichen".
(function (wurzel) {
  "use strict";
  const Modell = typeof module !== "undefined" && module.exports ? require("./modell.js") : wurzel.Modell;

  const G = "https://graph.microsoft.com/v1.0";
  const ID = "[A-Za-z0-9]{8,40}"; // = Installations-ID im Modell
  const VORGANGSDATEI = new RegExp("^vorgaenge-(" + ID + ")\\.json$");
  // Eigene Dateien, die nicht gelesen werden: Schreibprobe aus "Pruefen", Kontentest (konto-test.html).
  const NEBENDATEI = new RegExp("^(schreibprobe-" + ID + "|test-[a-z0-9-]+)\\.json$", "i");
  // Version im Dateinamen nur aus [A-Za-z0-9_] ("v3.1" -> "v3_1"), sonst saehe die eigene Sicherung fremd aus (Review #6).
  const verTeil = (v) => String(v).replace(/[^A-Za-z0-9]+/g, "_");
  const SICHERUNG = new RegExp("^sicherung-" + ID + "-(vor-[A-Za-z0-9_]+-)?\\d{4}-\\d{2}-\\d{2}\\.json$");
  const ETAG = /^(W\/)?"/; // echter eTag steht in Anfuehrungszeichen (UGC Audit A4)
  const ZEIT_MS = 120000; // Zeitgrenze je Anfrage: ein haengender Upload haengt nicht den ganzen Abgleich (Luecke 12)
  const LEBENSZEICHEN_MS = 20 * 3600e3; // eigene Datei mind. taeglich neu schreiben, sonst stimmt "zuletzt abgeglichen" nicht
  const ALT_MS = 7 * 864e5; // ab einer Woche ohne Abgleich deutlich markieren (Bauplan)
  const SICHERUNGEN_MAX = 4;

  const stoppText = (n, wo) => "Im " + wo + " liegen " + n + " Datei(en), die nicht zur App gehören – vermutlich nicht der " +
    (wo === "Datenordner" ? "App-Ordner" : "Sicherungsordner") + ". Es wurde nichts gelesen und nichts geschrieben. " +
    "Bitte den Pfad bis zum App-Ordner eintragen (z. B. Gemeinschaftsordner/Vorrats App).";
  const kurzId = (inst) => String(inst).slice(0, 8) + "…";
  // Fremddatei-Stopp (Kontentest 08.11.): null = nur App-Dateien, sonst der Text (ohne Dateinamen).
  function fremdStopp(items, istSicherung) {
    const muster = istSicherung ? SICHERUNG : VORGANGSDATEI;
    const n = items.filter((x) => !muster.test(x.name) && !NEBENDATEI.test(x.name)).length;
    return n ? stoppText(n, istSicherung ? "Sicherungsordner" : "Datenordner") : null;
  }

  // Windows-Pfad aus dem Explorer erlaubt: "C:\...\OneDrive\" oder "C:\...\OneDrive - Firma\" vorne weg, \ -> /.
  // Nur bei Laufwerksbuchstabe vorn; "Mein OneDrive/Vorrat" bleibt, wie es ist (Review #7).
  const WINDOWS = /^[a-z]:\/(?:[^/]*\/)*?onedrive(?: - [^/]+)?\//i;
  function pfadNormal(eingabe) {
    const p = String(eingabe || "").trim().replace(/\\/g, "/").replace(WINDOWS, "");
    return p.split("/").map((t) => t.trim()).filter(Boolean).join("/");
  }
  const ordnerSchluessel = (p) => pfadNormal(p).toLowerCase();

  function fehlerText(status, was) {
    if (status === 0) return "keine Verbindung zu OneDrive (offline?)";
    if (status === 401) return "Anmeldung abgelaufen – bitte neu anmelden";
    if (status === 403) return "keine Berechtigung für " + was + " (403)";
    if (status === 404) return was + " nicht gefunden (404)";
    if (status === 429) return "OneDrive bremst gerade (429) – später erneut";
    if (status >= 500) return "OneDrive-Störung (" + status + ") – später erneut";
    return "OneDrive-Fehler " + status + " bei " + was;
  }

  // Netzfehler und Zeitueberschreitung -> Status 0 (nie still null, UGC-Falle v70). token() wirft mit Klartext.
  async function graph(g, pfad, opt) {
    opt = opt || {};
    const token = await g.token();
    try {
      return await g.fetch(G + pfad, Object.assign({}, opt, {
        signal: AbortSignal.timeout(ZEIT_MS),
        headers: Object.assign({ Authorization: "Bearer " + token }, opt.headers),
      }));
    } catch (_) { return { ok: false, status: 0 }; }
  }
  async function graphJson(g, pfad, was) {
    const r = await graph(g, pfad);
    if (!r.ok) throw new Error(fehlerText(r.status, was));
    try { return await r.json(); } catch (_) { throw new Error("Antwort von OneDrive unlesbar (" + was + ")"); }
  }

  // Alle Eintraege eines Ordners, Seite fuer Seite (@odata.nextLink, Codex #9). Ohne value-Array ist die
  // Antwort kaputt -> Fehler, nie "leerer Ordner" (Codex #8). Folgeseiten nur auf Graph (sonst ginge das Token fremd).
  async function eintraege(g, pfad, wo) {
    const alle = [];
    for (let seite = 1; ; seite++) {
      const r = await graphJson(g, pfad, wo);
      if (!r || !Array.isArray(r.value)) throw new Error(wo + ": Antwort von OneDrive unvollständig – nichts geändert");
      alle.push(...r.value);
      const weiter = r["@odata.nextLink"];
      if (weiter === undefined || weiter === null) return alle;
      if (typeof weiter !== "string" || !weiter.startsWith(G + "/")) throw new Error(wo + ": Folgeseite zeigt nicht auf Microsoft Graph – abgebrochen");
      if (seite >= 50) throw new Error(wo + ": zu viele Einträge – Pfad prüfen");
      pfad = weiter.slice(G.length);
    }
  }

  // ---- Ordner finden: Pfad Ordner fuer Ordner abgehen, Verknuepfung ueber remoteItem (kein Pfad-Zugriff, HTTP 422) ----
  async function wurzelOrt(g) {
    const d = await graphJson(g, "/me/drive?$select=id", "eigenes OneDrive");
    const w = await graphJson(g, "/me/drive/root?$select=id", "eigenes OneDrive");
    return { driveId: d.id, id: w.id, verknuepfung: false };
  }
  const istOrdner = (x) => !!(x.folder || (x.remoteItem && !x.remoteItem.file));
  // Nur Ordner (Namen von Ordnern duerfen angezeigt werden, Dateinamen nie).
  async function unterordner(g, ort) {
    const liste = await eintraege(g, `/drives/${ort.driveId}/items/${ort.id}/children?$select=id,name,folder,remoteItem,file&$top=999`, "Ordner");
    return liste.filter(istOrdner).map((x) => x.remoteItem
      ? x.remoteItem.parentReference && { name: x.name, driveId: x.remoteItem.parentReference.driveId, id: x.remoteItem.id, verknuepfung: true }
      : { name: x.name, driveId: ort.driveId, id: x.id, verknuepfung: ort.verknuepfung })
      .filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
  async function ordnerFinden(g, pfad) {
    const key = ordnerSchluessel(pfad);
    if (!key) throw new Error("Kein Ordner eingestellt");
    g.orte = g.orte || new Map(); // gefundene IDs fuer diese Sitzung merken
    if (g.orte.has(key)) return g.orte.get(key);
    let ort = await wurzelOrt(g), bisher = "OneDrive";
    for (const teil of pfadNormal(pfad).split("/")) {
      const liste = await unterordner(g, ort);
      const x = liste.find((e) => e.name.toLowerCase() === teil.toLowerCase());
      if (!x) throw Object.assign(new Error("„" + teil + "“ nicht gefunden in " + bisher), { ordner: liste.map((e) => e.name) });
      ort = x;
      bisher += "/" + x.name;
    }
    g.orte.set(key, ort);
    return ort;
  }

  // Dateien (keine Ordner) eines Ordners, mit Metadaten. eTag kommt von hier, nie aus /content (UGC-Falle).
  async function dateienListen(g, ort, wo) {
    const liste = await eintraege(g, `/drives/${ort.driveId}/items/${ort.id}/children?$select=id,name,eTag,lastModifiedDateTime,lastModifiedBy,file,folder,remoteItem&$top=999`, wo);
    return liste.filter((x) => !istOrdner(x));
  }

  async function dateiLesen(g, ort, x, inst) {
    const was = "Datei " + kurzId(inst);
    const r = await graph(g, `/drives/${ort.driveId}/items/${x.id}/content`);
    if (!r.ok) throw new Error(was + " nicht lesbar: " + fehlerText(r.status, was));
    let text, d;
    try { text = await r.text(); } catch (_) { throw new Error(was + " nicht vollständig geladen (Verbindung abgebrochen)"); }
    try { d = JSON.parse(text); } catch (_) { throw new Error(was + " ist kein gültiges JSON"); }
    const p = Modell.pruefeDatei(d);
    if (!p.ok) throw new Error(was + ": " + p.fehler);
    if (d.inst !== inst) throw new Error(was + ": Dateiname und Inhalt passen nicht zusammen");
    return d.vorgaenge;
  }

  // Alle Vorgangsdateien lesen. Jeder Fehler wirft: ein Lesefehler ist nie ein leerer Vorrat (Bauplan R2 #10).
  async function allesLesen(g, ort, cache, sp) {
    const items = await dateienListen(g, ort, "Datenordner");
    const stopp = fremdStopp(items, false);
    if (stopp) throw new Error(stopp);
    const lokal = await sp.alleVorgaenge();
    const dateien = {};
    for (const x of items) {
      const m = VORGANGSDATEI.exec(x.name);
      if (!m) continue;
      if (!ETAG.test(String(x.eTag || ""))) throw new Error("Datei " + kurzId(m[1]) + ": OneDrive liefert keinen eTag");
      const c = cache[x.name];
      // Gleicher eTag = gleicher Inhalt: spart das Herunterladen (bis 3,4 MB je Datei nach 3 Jahren).
      const gleich = c && !c.fehlt && c.eTag === x.eTag;
      let vorgaenge = gleich ? c.vorgaenge : await dateiLesen(g, ort, x, m[1]);
      let zurueck = !!(gleich && c.zurueckgesetzt);
      // Datei kuerzer als bekannt (Versionsverlauf, abgeschnitten): nie weniger uebernehmen, Bekanntes behalten
      // und markieren (Review #4). Gilt fuer ALLE Dateien, auch halb lokal vorhandene (Codex #2); eigene
      // laedt hochladen() danach vollstaendig neu hoch.
      if (c && !gleich) {
        const da = new Set(vorgaenge.map((v) => v.id));
        const fehlen = c.vorgaenge.filter((v) => !da.has(v.id));
        if (fehlen.length) { vorgaenge = vorgaenge.concat(fehlen).sort((a, b) => a.n - b.n); zurueck = true; }
      }
      dateien[x.name] = { inst: m[1], eTag: x.eTag, geaendert: x.lastModifiedDateTime || null,
        von: (x.lastModifiedBy && x.lastModifiedBy.user && x.lastModifiedBy.user.displayName) || null, vorgaenge };
      if (zurueck) dateien[x.name].zurueckgesetzt = true;
    }
    // Frueher gesehene Datei fehlt: letzten Stand behalten und markieren, nichts verwerfen (Codex #2).
    // Eigene laedt hochladen() mit allem Bekannten neu hoch, fremde bleiben markiert.
    for (const [n, c] of Object.entries(cache)) if (!dateien[n]) dateien[n] = Object.assign({}, c, { fehlt: true });
    // Der fruehere Stand geht mit in den Vergleich: dieselbe Kennung mit neuem Inhalt ist ein Widerspruch (Codex #1).
    const v = Modell.vereinige([lokal, ...Object.values(cache).map((c) => c.vorgaenge), ...Object.values(dateien).map((d) => d.vorgaenge)]);
    if (!v.ok) throw new Error("Widerspruch gefunden: " + v.fehler + " – nichts geändert");
    const maxUhr = v.vorgaenge.reduce((m, x) => (x.uhr > m ? x.uhr : m), 0);
    return { ort, dateien, lokal, maxUhr };
  }

  // Eigene Datei(en) hochladen: laufende ID + alte IDs dieses Geraets (halber Zustand, jede unter IHRER Datei).
  // Liefert "nochmal", wenn eine Datei sich zwischen Lesen und Schreiben geaendert hat (412) -> neu lesen.
  async function hochladen(g, sp, st, jetzt) {
    const inst = sp.inst;
    const nachInst = new Map();
    // Laufende ID immer dabei, auch ohne lokale Vorgaenge (z. B. wiederhergestellter Geraetestand, Codex #3).
    nachInst.set(inst, []);
    for (const v of st.lokal) { if (!nachInst.has(v.inst)) nachInst.set(v.inst, []); nachInst.get(v.inst).push(v); }
    for (const [i, eigene] of nachInst) {
      const name = "vorgaenge-" + i + ".json";
      const c = st.dateien[name];
      const da = c && !c.fehlt; // liegt in OneDrive (sonst neu anlegen)
      const wolke = c ? c.vorgaenge : []; // alles Bekannte, auch aus einer verschwundenen/verkuerzten Fassung
      const inWolke = new Set(wolke.map((v) => v.id));
      if (i === inst) {
        // Die OneDrive-Datei kennt mehr als das Geraet: uebernehmen und Zaehler dahinter setzen, sonst vergaebe
        // das Geraet eine vorhandene Kennung neu (Review #3). Inhaltsgleichheit hat allesLesen schon geprueft.
        // ponytail: ein Vorgang, der genau zwischen Lesen und Uebernehmen entsteht, kann kollidieren -> Abbruch, kein Verlust.
        const ids = new Set(eigene.map((v) => v.id));
        const fehlen = wolke.filter((v) => !ids.has(v.id));
        if (fehlen.length) { await sp.uebernehmen(fehlen); eigene.push(...fehlen); st.lokal.push(...fehlen); }
      }
      const neu = eigene.filter((v) => !inWolke.has(v.id));
      const lebenszeichen = i === inst && da && !(jetzt - Date.parse(c.geaendert) < LEBENSZEICHEN_MS);
      const reparieren = c && (c.fehlt || c.zurueckgesetzt); // OneDrive-Fassung kuerzer als bekannt (Codex #2)
      if (!neu.length && !lebenszeichen && !reparieren) continue;
      // Nie weniger hochladen, als in OneDrive steht (Schrumpf-Schutz, Luecke 3): Wolke + Neues.
      const alle = wolke.concat(neu).sort((a, b) => a.n - b.n);
      const p = Modell.pruefeDatei({ schema: Modell.SCHEMA, inst: i, vorgaenge: alle });
      if (!p.ok) throw new Error("Eigene Datei " + kurzId(i) + " wäre ungültig (" + p.fehler + ") – nichts geschrieben");
      // Text steht VOR dem Hochladen fest: was waehrenddessen dazukommt, ist nicht drin und bleibt offen (UGC #3/#68).
      const text = JSON.stringify({ schema: Modell.SCHEMA, inst: i, geschrieben: Modell.lokalIso(jetzt), vorgaenge: alle });
      const kopf = { "Content-Type": "application/json" };
      const pfad = `/drives/${st.ort.driveId}/items/${st.ort.id}:/${name}`;
      if (da) kopf["If-Match"] = c.eTag;
      else {
        // If-None-Match beachtet OneDrive nicht (Kontentest 08.11.): direkt vorher per Metadaten pruefen.
        // ponytail: Pruefen + PUT sind nicht atomar (Codex #7). Zwei Tabs derselben Installation schliesst die
        // Web-Lock-Sperre in app.js aus (Chrome Android hat sie); ohne Sperre kann ein Tab die neue Datei kurz
        // mit einer aelteren Fassung ueberschreiben - die lokalen Vorgaenge laden beim naechsten Abgleich nach.
        const m = await graph(g, pfad + "?$select=id");
        if (m.ok) return "nochmal";
        if (m.status !== 404) throw new Error(fehlerText(m.status, "Datenordner"));
      }
      const r = await graph(g, pfad + ":/content", { method: "PUT", headers: kopf, body: text });
      if (r.status === 412) return "nochmal";
      if (!r.ok) throw new Error("Hochladen fehlgeschlagen: " + fehlerText(r.status, "eigene Datei"));
      let d = {};
      try { d = (await r.json()) || {}; } catch (_) { /* steht trotzdem in OneDrive (2xx) */ }
      st.dateien[name] = { inst: i, eTag: d.eTag || null, geaendert: d.lastModifiedDateTime || new Date(jetzt).toISOString(),
        von: (d.lastModifiedBy && d.lastModifiedBy.user && d.lastModifiedBy.user.displayName) || null, vorgaenge: alle };
    }
    return "fertig";
  }

  // Gesamtbestand fuer Sicherung und "Backup herunterladen": je Installation Wolke + lokale Vorgaenge.
  function sicherungsInhalt(dateien, lokal, inst, jetzt) {
    const nach = new Map();
    const dazu = (v) => { if (!nach.has(v.inst)) nach.set(v.inst, new Map()); nach.get(v.inst).set(v.id, v); };
    for (const d of Object.values(dateien || {})) d.vorgaenge.forEach(dazu);
    lokal.forEach(dazu);
    return { art: "vorrat-sicherung", schema: Modell.SCHEMA, erstellt: Modell.lokalIso(jetzt), von: inst,
      dateien: [...nach].map(([i, m]) => ({ schema: Modell.SCHEMA, inst: i, vorgaenge: [...m.values()].sort((a, b) => a.n - b.n) })) };
  }

  // Welche EIGENEN Sicherungen fliegen raus (UGC #30/#31, pur fuer den Pruefstand)? Nur exakt eigene Namen;
  // die Versionssicherung der laufenden Version bleibt immer; 4 neueste + je Woche eine fuer 4 Wochen davor.
  // Datum aus dem Namen, nicht aus lastModifiedDateTime (verschiebt OneDrive beim Kopieren).
  function sicherungenAussortieren(dateien, inst, version, max) {
    max = max || SICHERUNGEN_MAX;
    const tagNamen = new RegExp("^sicherung-" + inst + "-(\\d{4})-(\\d{2})-(\\d{2})\\.json$");
    const vorNamen = new RegExp("^sicherung-" + inst + "-vor-([A-Za-z0-9_]+)-\\d{4}-\\d{2}-\\d{2}\\.json$");
    const datum = (d) => String(d.name).slice(-15, -5);
    const rest = (dateien || []).filter((d) => {
      const v = vorNamen.exec(String(d.name || ""));
      return v ? v[1] !== verTeil(version) : tagNamen.test(String(d.name || ""));
    }).sort((a, b) => datum(b).localeCompare(datum(a)) || String(b.name).localeCompare(String(a.name)));
    const woche = (d) => {
      const m = tagNamen.exec(String(d.name));
      if (!m) return null;
      const tag = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5;
      return tag - ((new Date(tag * 864e5).getUTCDay() + 6) % 7); // Montag
    };
    const neueste = new Set(rest.slice(0, max).map(woche));
    const juengste = Math.max(...[...neueste].filter((w) => w !== null), -Infinity);
    const behalten = new Set(), wochen = new Set();
    for (const d of rest.slice(max)) {
      const w = woche(d);
      if (w === null || neueste.has(w) || wochen.has(w) || wochen.size >= 4 || w < juengste - 5 * 7) continue;
      wochen.add(w);
      behalten.add(d);
    }
    return rest.slice(max).filter((d) => !behalten.has(d));
  }

  // Sicherung in den Sicherungsordner. Ordner wird nie still angelegt, Fehler sind laut (UGC #32).
  // Jede Datei wird fuer sich gebucht (Review #5). Liefert { geschafft: [Namen], fehler, weg }.
  async function sichern(g, pfad, inhalt, namen, inst, version) {
    const ort = await ordnerFinden(g, pfad);
    const items = await dateienListen(g, ort, "Sicherungsordner");
    const stopp = fremdStopp(items, true);
    if (stopp) throw new Error(stopp);
    const text = JSON.stringify(inhalt);
    const art = (name) => (name.includes("-vor-") ? "Versionssicherung" : "Tagessicherung");
    const geschafft = [];
    let fehler = null;
    for (const name of namen) {
      const r = await graph(g, `/drives/${ort.driveId}/items/${ort.id}:/${name}:/content?@microsoft.graph.conflictBehavior=replace`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: text });
      if (r.ok) geschafft.push(name);
      else fehler = art(name) + " fehlgeschlagen: " + fehlerText(r.status, "Sicherungsordner");
    }
    if (fehler) fehler += geschafft.length ? " (die " + art(geschafft[0]) + " liegt)" : " – es wurde NICHTS gesichert";
    if (!geschafft.length) return { geschafft, fehler, weg: 0 };
    // Aufraeumen: leise, nur eigene Namen, DELETE landet im OneDrive-Papierkorb.
    const liste = items.filter((x) => !geschafft.includes(x.name)).concat(geschafft.map((name) => ({ name })));
    let weg = 0;
    for (const d of sicherungenAussortieren(liste, inst, version).filter((x) => x.id)) {
      const r = await graph(g, `/drives/${ort.driveId}/items/${d.id}`, { method: "DELETE" });
      if (r.ok) weg++;
    }
    return { geschafft, fehler, weg };
  }

  // Der ganze Abgleich. Wirft nur, wenn nicht einmal der Zustand gespeichert werden konnte.
  // Liefert { ok, fehler, zustand }.
  async function abgleichen(o) {
    const { g, sp } = o;
    const jetzt = o.jetzt || new Date();
    const heute = Modell.heuteIso(jetzt);
    const ordner = ordnerSchluessel(o.datenPfad);
    const alt = await sp.abgleich();
    const ab = alt && alt.ordner === ordner ? alt : { ordner, gelesen: null, dateien: {} };
    let st = null, fehler = null;
    try {
      if (o.sicherPfad && ordnerSchluessel(o.sicherPfad) === ordner) throw new Error("Daten- und Sicherungsordner müssen verschieden sein");
      for (let runde = 1; ; runde++) {
        const ort = await ordnerFinden(g, o.datenPfad);
        // Gleicher Pfad, anderer Ordner (umbenannt + neu angelegt, anderes Konto): wie ein Ordnerwechsel -> Stopp (Codex #6).
        if (ab.ort && (ab.ort.driveId !== ort.driveId || ab.ort.id !== ort.id)) {
          throw new Error("Unter diesem Pfad liegt jetzt ein anderer Ordner als beim letzten Abgleich (umbenannt, neu angelegt oder anderes Konto). " +
            "Es wurde nichts gelesen und nichts geschrieben. Ist das so gewollt: ☰ → Prüfen → 7× auf die Version → Gerätedaten löschen.");
        }
        st = await allesLesen(g, ort, st ? st.dateien : ab.dateien, sp);
        if ((await hochladen(g, sp, st, jetzt)) === "fertig") break;
        if (runde >= 3) throw new Error("Eigene Datei hat sich beim Schreiben mehrfach geändert (412) – später erneut");
      }
    } catch (x) {
      fehler = (x && x.message) || String(x);
      if (g.orte) g.orte.clear(); // Ordner beim naechsten Mal frisch suchen (umbenannt, verschoben)
    }
    const neu = { ordner, ort: st ? { driveId: st.ort.driveId, id: st.ort.id } : ab.ort || null,
      gelesen: st ? sp.inst : ab.gelesen, dateien: st ? st.dateien : ab.dateien,
      letzter: { zeit: Modell.lokalIso(jetzt), fehler }, gesichert: ab.gesichert || null, appStand: ab.appStand || null,
      sicherung: ab.sicherung || null };
    // Sicherung erst, wenn alles gelesen ist (sonst saehe sie wie ein Bestand aus, der keiner ist).
    if (st && o.sicherPfad) {
      const tag = "sicherung-" + sp.inst + "-" + heute + ".json";
      const vor = o.version ? "sicherung-" + sp.inst + "-vor-" + verTeil(o.version) + "-" + heute + ".json" : null;
      const namen = [];
      if (neu.gesichert !== heute) namen.push(tag);
      if (vor && neu.appStand !== o.version) namen.push(vor);
      if (namen.length) {
        try {
          const lokal = await sp.alleVorgaenge();
          const e = await sichern(g, o.sicherPfad, sicherungsInhalt(neu.dateien, lokal, sp.inst, jetzt), namen, sp.inst, o.version);
          if (e.geschafft.includes(tag)) neu.gesichert = heute;
          if (vor && e.geschafft.includes(vor)) neu.appStand = o.version;
          neu.sicherung = { zeit: Modell.lokalIso(jetzt), fehler: e.fehler, weg: e.weg };
        } catch (x) {
          neu.sicherung = { zeit: Modell.lokalIso(jetzt), fehler: (x && x.message) || String(x), weg: 0 };
        }
      }
    }
    // Grosse Daten (bis einige MB) nur schreiben, wenn sich eine Datei geaendert hat oder der Ordner neu ist (Review #8).
    const sig = (ds) => JSON.stringify(Object.keys(ds).sort().map((n) => [n, ds[n].eTag, ds[n].vorgaenge.length, !!ds[n].fehlt, !!ds[n].zurueckgesetzt]));
    const { dateien, ...klein } = neu;
    const geaendert = !alt || alt.ordner !== ordner || sig(dateien) !== sig(alt.dateien);
    await sp.abgleichSpeichern(geaendert ? neu : klein, st ? st.maxUhr : 0);
    return { ok: !fehler, fehler, zustand: neu };
  }

  // "Pruefen" in den Einstellungen: Ordner gefunden? Lesen ok? Schreiben ok? Liefert [[ok, text], ...].
  async function pruefen(g, pfad, istSicherung, inst) {
    const z = [];
    try {
      if (g.orte) g.orte.delete(ordnerSchluessel(pfad));
      const ort = await ordnerFinden(g, pfad);
      z.push([true, "Ordner gefunden" + (ort.verknuepfung ? " (Verknüpfung auf einen geteilten Ordner)" : "")]);
      const items = await dateienListen(g, ort, istSicherung ? "Sicherungsordner" : "Datenordner");
      const muster = istSicherung ? SICHERUNG : VORGANGSDATEI;
      const stopp = fremdStopp(items, istSicherung);
      if (stopp) { z.push([false, stopp]); return z; }
      z.push([true, "Lesen ok · " + items.filter((x) => muster.test(x.name)).length + (istSicherung ? " Sicherungen" : " Vorgangsdateien")]);
      const r = await graph(g, `/drives/${ort.driveId}/items/${ort.id}:/schreibprobe-${inst}.json:/content?@microsoft.graph.conflictBehavior=replace`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schreibprobe: Modell.lokalIso() }) });
      if (!r.ok) { z.push([false, "Schreiben fehlgeschlagen: " + fehlerText(r.status, "Schreibprobe")]); return z; }
      let d = {};
      try { d = (await r.json()) || {}; } catch (_) { /* egal */ }
      const weg = d.id ? await graph(g, `/drives/${ort.driveId}/items/${d.id}`, { method: "DELETE" }) : null;
      z.push([true, "Schreiben ok" + (weg && weg.ok ? "" : " (Probedatei blieb liegen, stört nicht)")]);
    } catch (x) {
      z.push([false, ((x && x.message) || String(x)) + (x && x.ordner ? ". Vorhandene Ordner dort: " + (x.ordner.join(", ") || "keine") : "")]);
    }
    return z;
  }

  // ---- reine Helfer fuer die Oberflaeche ----
  // Lokale Vorgaenge + OneDrive-Stand zum Gesamtstand. Lokale Installationen werden ZUSAMMEN mit ihrer
  // OneDrive-Datei auf Lueckenlosigkeit geprueft (halber Zustand: lokal nur X-3, OneDrive 1..3, Review #2).
  // Reine OneDrive-Dateien hat allesLesen schon geprueft, die werden nicht erneut geprueft (Review #8).
  function zusammenfuehren(lokal, dateien) {
    const wolke = Object.values(dateien || {});
    const nachInst = new Map();
    for (const v of lokal) { const k = v && v.inst; if (!nachInst.has(k)) nachInst.set(k, new Map()); nachInst.get(k).set(v && v.id, v); }
    for (const d of wolke) if (nachInst.has(d.inst)) for (const v of d.vorgaenge) if (!nachInst.get(d.inst).has(v.id)) nachInst.get(d.inst).set(v.id, v);
    for (const [inst, m] of nachInst) {
      const p = Modell.pruefeDatei({ schema: Modell.SCHEMA, inst, vorgaenge: [...m.values()] });
      if (!p.ok) return { ok: false, fehler: p.fehler, vorgaenge: null };
    }
    return Modell.vereinige([lokal, ...wolke.map((d) => d.vorgaenge)]);
  }
  const darfSchreiben = (ab, inst, datenPfad) => !!ab && ab.gelesen === inst && ab.ordner === ordnerSchluessel(datenPfad);
  // Lokale Vorgaenge, die in keiner (zuletzt gelesenen oder hochgeladenen) OneDrive-Fassung stehen.
  function offene(ab, lokal) {
    const da = new Set();
    for (const d of Object.values(ab ? ab.dateien : {})) for (const v of d.vorgaenge) da.add(v.id);
    return lokal.filter((v) => !da.has(v.id)).length;
  }
  function vorText(ms) {
    if (!(ms >= 0)) return "unbekannt";
    if (ms < 3600e3) return "vor " + Math.max(1, Math.round(ms / 60e3)) + " Min.";
    if (ms < 48 * 3600e3) return "vor " + Math.round(ms / 3600e3) + " Std.";
    return "vor " + Math.floor(ms / 864e5) + " Tagen";
  }
  // "Zuletzt abgeglichen" je Datei. alt = laenger als eine Woche (fruehere Installationen dieses Geraets nie).
  function zuletzt(ab, inst, eigeneInst, jetzt) {
    jetzt = jetzt || new Date();
    return Object.values(ab ? ab.dateien : {}).map((d) => {
      const ms = jetzt - Date.parse(d.geaendert);
      const eigen = d.inst === inst, frueher = !eigen && eigeneInst.has(d.inst);
      return { inst: d.inst, wer: eigen ? "dieses Gerät" : frueher ? "dieses Gerät (frühere Installation)" : d.von || "unbekannt",
        wann: vorText(ms), alt: !frueher && !(ms < ALT_MS), fehlt: !!d.fehlt, zurueck: !!d.zurueckgesetzt };
    }).sort((a, b) => (a.wer === "dieses Gerät" ? -1 : b.wer === "dieses Gerät" ? 1 : a.wer.localeCompare(b.wer, "de")));
  }

  const Cloud = { pfadNormal, ordnerSchluessel, ordnerFinden, wurzelOrt, unterordner, abgleichen, pruefen,
    sicherungenAussortieren, sicherungsInhalt, darfSchreiben, offene, zuletzt, vorText, zusammenfuehren };
  if (typeof module !== "undefined" && module.exports) module.exports = Cloud;
  else wurzel.Cloud = Cloud;
})(typeof window !== "undefined" ? window : globalThis);
