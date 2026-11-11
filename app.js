// Vorrats-App: Geruest (Abschnitt 1c) und Oberflaeche (Abschnitt 1d).
"use strict";
const APP_VERSION = "v4"; // UGC #71: im Gleichschritt mit CACHE in service-worker.js pflegen

const haupt = document.getElementById("haupt");
const leiste = document.getElementById("updateleiste");
let swRegistrierung = null;
let wartenderWorker = null;

function hinweis(text) { // kurzer Hinweis oben im Hauptbereich
  const d = document.createElement("div");
  d.className = "hinweis";
  d.textContent = text;
  haupt.before(d);
  setTimeout(() => d.remove(), 4000);
}

// UGC #72/#75: Leiste anbieten. "Später" setzt wartenderWorker zurueck, damit
// die naechste Rueckkehr in die App erneut fragt ("Später" heisst nicht "nie").
function updateBereit(sw) {
  if (!sw || sw === wartenderWorker) return;
  wartenderWorker = sw;
  leiste.firstElementChild.textContent = "Neue Version bereit";
  leiste.hidden = false;
}
let selbstAusgeloest = false; // nur der Tab, in dem "Jetzt laden" geklickt wurde, laedt sofort neu
document.getElementById("update-jetzt").onclick = () => {
  // Kein eigener reload: der Worker uebernimmt, controllerchange laedt neu (eine Stelle).
  // Ohne wartenden Worker (anderer Tab hat schon uebernommen): direkt neu laden.
  if (wartenderWorker) { selbstAusgeloest = true; wartenderWorker.postMessage("uebernehmen"); }
  else location.reload();
};
document.getElementById("update-spaeter").onclick = () => {
  leiste.hidden = true;
  wartenderWorker = null;
};

// UGC #76: Handbetrieb, wartet die Installation ab und meldet offline ehrlich
async function updateSuchen() {
  if (!swRegistrierung) return hinweis("Update-Prüfung nicht verfügbar");
  let fehler = false;
  try { await swRegistrierung.update(); } catch { fehler = true; }
  const neu = swRegistrierung.installing; // update() kehrt zurueck, bevor die Installation fertig ist
  if (neu) await new Promise((f) => neu.addEventListener("statechange", () => { if (neu.state !== "installing") f(); }));
  // "redundant" = Installation gescheitert (z. B. addAll offline): ehrlich melden, nicht "Kein Update bereit"
  if (neu && neu.state === "redundant") hinweis("Update fehlgeschlagen · " + APP_VERSION);
  else if (swRegistrierung.waiting) { wartenderWorker = null; updateBereit(swRegistrierung.waiting); }
  else hinweis((fehler ? "Update-Prüfung fehlgeschlagen (offline?) · " : "Kein Update bereit · ") + APP_VERSION);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then((reg) => {
    swRegistrierung = reg;
    reg.update().catch(() => {});
    // UGC #75: Android weckt PWAs oft nur auf -> auch bei jeder Rueckkehr suchen
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      reg.update().catch(() => {});
      updateBereit(reg.waiting); // reg.update() loest kein "updatefound" aus, wenn schon eins wartet
    });
    updateBereit(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const neu = reg.installing;
      if (!neu) return;
      neu.addEventListener("statechange", () => {
        // "installed" MIT controller = Update; ohne controller = Erstinstallation, nichts zu fragen
        if (neu.state === "installed" && navigator.serviceWorker.controller) updateBereit(reg.waiting || neu);
      });
    });
  }).catch(() => {}); // ohne Service Worker (z. B. http) laeuft die App trotzdem

  // UGC #77: einmal neu laden, Schleifenschutz + Hinweis nach dem Neuladen
  let neuGeladen = false;
  let hatteController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (neuGeladen) return;
    // Erstinstallation (clients.claim ohne vorherigen Controller): nichts neu laden, nichts melden
    if (!hatteController) { hatteController = true; return; }
    if (!selbstAusgeloest) { // anderer Tab hat uebernommen: Formular hier nicht wegwerfen, nur anbieten
      wartenderWorker = null;
      leiste.firstElementChild.textContent = "Neue Version aktiv";
      leiste.hidden = false;
      return;
    }
    neuGeladen = true;
    sessionStorage.setItem("vorrat-update", "1");
    location.reload();
  });
  if (sessionStorage.getItem("vorrat-update")) {
    sessionStorage.removeItem("vorrat-update");
    hinweis("App aktualisiert auf " + APP_VERSION);
  }
}


// ==== Abschnitt 1d: Oberflaeche ====
// Datenfluss: Speicher (eigene) + Abgleich-Zustand (OneDrive-Dateien) -> vereinige -> berechne -> zeichnen.
// Jede Aktion: ausfuehren (loest erst nach dem Schreiben auf) -> neu berechnen -> neu zeichnen -> bald abgleichen.
const H = window.Hilfen;
let sp = null;          // Speicher-Verbindung
let liste = [];         // alle Vorgaenge: eigene + zuletzt aus OneDrive gelesene
let lokal = [];         // nur die auf diesem Geraet erzeugten (auch fruehere IDs dieses Geraets)
let ab = null;          // Abgleich-Zustand fuer den eingestellten Datenordner, null = dort noch nie abgeglichen
let aenderungen = 0;    // zaehlt gespeicherte Vorgaenge (laden() erkennt so ein tun() dazwischen)
let nachladen = false;  // laden() wartet, bis kein Dialog offen ist und nichts schreibt (UGC #15)
let stand = null;       // Ergebnis von Modell.berechne; null = nicht geladen (nie "leerer Vorrat")
let ladeFehler = null;
let ortWahl = null;     // gewaehlter Reiter
let laeuft = false;     // eine Aktion schreibt gerade
const dauerhaftP = Speicher.dauerhaft(); // UGC #26, Ergebnis in "Pruefen"
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const FARBE = { braun: ["#8a5a32", "#fff"], "weiß": ["#fdfdfb", "#1d2b24"] }; // Ort.farben je Reihe

// Element bauen: on...-Eintraege werden Ereignisse; null/false/"" als Kind fallen weg.
const weg = (x) => x != null && x !== false && x !== "";
function el(tag, eig, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eig || {})) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kinder.flat(Infinity).filter(weg));
  return e;
}
function sv(tag, attr, ...kinder) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  e.append(...kinder.filter(weg));
  return e;
}
const feld = (text, ...inhalt) => el("label", { className: "feld" }, el("span", null, text), ...inhalt);
const kuerze = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---- Ebenen (UGC #87): jede Ansicht und jeder Dialog bekommt einen Verlaufseintrag,
// Android-Zurueck schliesst die oberste. history.state = Stapeltiefe.
const stapel = [{ art: "start" }];
history.replaceState(1, "");
function oeffne(ebene) {
  stapel.push(ebene);
  history.pushState(stapel.length, "");
  if (ebene.el) document.body.append(ebene.el); else zeichnen();
}
const zurueck = (n) => history.go(-(n || 1));
addEventListener("popstate", () => {
  const ziel = Math.max(1, Number(history.state) || 1);
  // weg() = Aufraeumen beim Schliessen (z. B. Kamera stoppen), egal ob per Knopf oder Android-Zurueck.
  while (stapel.length > ziel) { const e = stapel.pop(); if (e.el) e.el.remove(); if (e.weg) try { e.weg(); } catch (_) { /* weiter schliessen */ } }
  zeichnen(); // UGC #15: nach dem Schliessen nachholen
  // Folgedialog VOR dem Nachladen oeffnen: laden() prueft die Dialog-Sperre nur beim Start und wuerde sonst
  // den Stand unter dem frisch geoeffneten Dialog austauschen (Review E #2). So wartet es bis nach dem Dialog.
  if (nachZurueck) { const f = nachZurueck; nachZurueck = null; f(); } // Dialog, der einen anderen ersetzt
  if (nachladen) laden();
});
let nachZurueck = null; // laeuft nach dem naechsten Zurueck (erst schliessen, dann den Folgedialog oeffnen)
const dialogOffen = () => stapel.some((e) => e.el);

// ---- Meldungen ----
// UGC #5/#89: Speicherfehler ist nicht wegklickbar; die Ursache behebt man durch Neuladen.
const fehlerLeiste = el("div", { id: "fehler", hidden: true });
const untenLeiste = el("div", { id: "unten", hidden: true });
haupt.before(el("header", { className: "kopf" }, el("h1", null, "Vorrat"),
  el("button", { "aria-label": "Menü", onclick: () => { if (stapel[stapel.length - 1].art !== "menue") oeffne({ art: "menue" }); } }, "☰")),
fehlerLeiste);
document.body.append(untenLeiste);
function fehlerZeigen(text) {
  fehlerLeiste.replaceChildren(el("b", null, "⚠ " + text), el("button", { onclick: () => location.reload() }, "App neu laden"));
  fehlerLeiste.hidden = false;
}
let untenUhr = null;
function untenZeigen(text, knopf, fn) {
  clearTimeout(untenUhr);
  untenLeiste.replaceChildren(...[el("span", null, text), knopf && el("button", { onclick: () => { untenLeiste.hidden = true; fn(); } }, knopf)].filter(weg));
  untenLeiste.hidden = false;
  untenUhr = setTimeout(() => { untenLeiste.hidden = true; }, 5000);
}

// ---- Daten ----
async function laden() {
  // Kein Standtausch unter offenem Dialog oder laufendem Schreiben (UGC #15): der Dialog rechnet
  // mit dem alten Stand (z. B. Nachzaehlen = gezaehlt minus bekannte Summe). Danach nachholen.
  if (laeuft || dialogOffen() || zieht) { nachladen = true; return; }
  nachladen = false;
  try {
    sp = sp || (await Speicher.oeffnen());
    let vs, a, z;
    do { z = aenderungen; vs = await sp.alleVorgaenge(); a = await sp.abgleich(); } while (z !== aenderungen);
    // Lesefehler nie als leeren Vorrat behandeln (Bauplan R2 #10). OneDrive-Stand nur fuer den eingestellten
    // Ordner (nach Ordnerwechsel nie den alten mischen).
    const neuAb = a && a.ordner === Cloud.ordnerSchluessel(einst.datenPfad) ? a : null;
    const r = Cloud.zusammenfuehren(vs, neuAb ? neuAb.dateien : {});
    if (!r.ok) throw new Error(r.fehler);
    ab = neuAb;
    lokal = vs;
    liste = r.vorgaenge;
    stand = Modell.berechne(liste);
    ladeFehler = null;
  } catch (x) {
    stand = null;
    ladeFehler = "Daten konnten nicht gelesen werden: " + ((x && x.message) || x) + ". Es wurde nichts verändert.";
  }
  zeichnen();
}

// Vorgaenge in EINEM Schritt ausfuehren (Aufgabe A: ganz oder gar nicht). Liefert die gespeicherten Vorgaenge
// oder null; bei Fehler steht die Fehlerleiste und NICHTS gilt als erledigt (UGC #5, Bauplan Warteschlange).
// Eintraege der Liste: Vorgangsdaten oder Funktion (bisher) -> Daten, siehe Speicher.ausfuehrenAlle.
async function tun(datenListe) {
  if (!stand) return null;
  if (laeuft) { hinweis("Moment – die letzte Änderung wird noch gespeichert. Bitte nochmal."); return null; } // nie stumm schlucken
  // Bauplan Abschnitt 2: erst alle Dateien gelesen und die Uhr nachgezogen, sonst verliert eine
  // frische Aenderung gegen aeltere aus OneDrive.
  if (!darfSchreiben()) { hinweis("Erst mit OneDrive abgleichen (☰ → Einstellungen). Vorher nimmt dieses Gerät nichts an."); return null; }
  laeuft = true;
  let fertig = null;
  try {
    fertig = await sp.ausfuehrenAlle(datenListe);
    for (const v of fertig) { liste.push(v); lokal.push(v); }
    aenderungen++;
    return fertig;
  } catch (x) {
    fertig = null;
    fehlerZeigen("Speichern fehlgeschlagen: " + ((x && x.message) || x) + ". Diese Änderung ist NICHT gespeichert.");
    return null;
  } finally {
    laeuft = false;
    stand = Modell.berechne(liste);
    zeichnen();
    if (fertig) abgleichBald();
    if (nachladen) laden();
  }
}

// ==== Abschnitt 2: OneDrive (Logik in cloud.js) ====
const CLIENT_ID = "d95d99d1-c6b1-47ce-b533-86ae39816199"; // Entra "Vorrats-App", kein Geheimnis
const SCOPES = ["User.Read", "Files.ReadWrite"];
const EINST_KEY = "vorrat-einst";
// Offen-Punkt 10 = (a): Sicherungen als Unterordner des Datenordners.
const STANDARD = { datenPfad: "Gemeinschaftsordner/Vorrats App", sicherPfad: "Gemeinschaftsordner/Vorrats App/Sicherungen" };
// UGC #42: Ordner stehen im Geraet (localStorage), nie im Datenbestand.
const einst = (() => {
  try { return Object.assign({}, STANDARD, JSON.parse(localStorage.getItem(EINST_KEY) || "{}")); } catch { return Object.assign({}, STANDARD); }
})();
// Abgeglichen wird erst, wenn die Ordner einmal per "Übernehmen" bestaetigt sind: ein schon angemeldetes
// Konto (konto-test.html teilt den Login) wuerde sonst sofort die Testdaten aus v2 hochladen.
const eingerichtet = () => localStorage.getItem(EINST_KEY) !== null;
function einstSpeichern(neu) { // UGC #45: erst die Kopie schreiben, dann uebernehmen
  const kopie = Object.assign({}, einst, neu);
  localStorage.setItem(EINST_KEY, JSON.stringify(kopie));
  Object.assign(einst, kopie);
}

// Login wie konto-test.html / UGC (#53-#58): Umleitung nur auf Knopfdruck, im Hintergrund nie.
let kontoBereit = false, kontoFehler = null;
const konto = (() => {
  try {
    const app = new msal.PublicClientApplication({
      auth: { clientId: CLIENT_ID, authority: "https://login.microsoftonline.com/consumers", redirectUri: new URL("index.html", location.href).href },
      cache: { cacheLocation: "localStorage" },
    });
    const bereit = app.initialize().then(() => app.handleRedirectPromise()).then((a) => {
      if (a) app.setActiveAccount(a.account);
      else if (!app.getActiveAccount() && app.getAllAccounts().length) app.setActiveAccount(app.getAllAccounts()[0]);
    }).catch((x) => { kontoFehler = (x && x.message) || String(x); }).finally(() => { kontoBereit = true; });
    return {
      bereit,
      name: () => { const k = kontoBereit && !kontoFehler && app.getActiveAccount(); return k ? k.name || k.username : null; },
      anmelden: () => app.loginRedirect({ scopes: SCOPES, prompt: "select_account" }),
      // Kein "Abmelden": MSAL 4.30 entfernt beim Logout ALLE localStorage-Eintraege mit der homeAccountId,
      // auch die der UGC-App auf derselben Domain (geprueft im Bibliothekscode, Codex-Frage 7).
      // Konto wechseln geht ueber anmelden() mit Kontoauswahl.
      async token() { // Luecke 11: abgelaufenes Token laut melden, nicht still "offline"
        const k = kontoBereit && !kontoFehler && app.getActiveAccount();
        if (!k) throw new Error("nicht bei Microsoft angemeldet");
        try { return (await app.acquireTokenSilent({ scopes: SCOPES, account: k })).accessToken; } catch (x) {
          throw new Error(x instanceof msal.InteractionRequiredAuthError ? "Anmeldung abgelaufen – bitte neu anmelden (☰ → Einstellungen)" : "Anmeldung nicht erreichbar (offline?)");
        }
      },
    };
  } catch (x) { kontoFehler = (x && x.message) || String(x); return null; }
})();
const g = { fetch: (u, o) => fetch(u, o), token: () => konto.token() };

const darfSchreiben = () => !!sp && Cloud.darfSchreiben(ab, sp.inst, einst.datenPfad);
const offen = () => Cloud.offene(ab, lokal); // nur fuer Anzeigen
// Vor dem Loeschen: frisch aus dem Speicher, nie aus dem Arbeitsspeicher (der kann nach einem Ladefehler
// leer oder veraltet sein, Review #1). Wirft bei Lesefehler.
const mitOrdner = (a) => (a && a.ordner === Cloud.ordnerSchluessel(einst.datenPfad) ? a : null);
const offenIn = (vs, a) => Cloud.offene(mitOrdner(a), vs);
const sperreIn = (vs, a) => Cloud.loeschSperre(mitOrdner(a), vs); // Widerspruch / Datei fehlt (Codex2 #1/#2)
async function offenFrisch() {
  const vs = await sp.alleVorgaenge(), a = await sp.abgleich();
  return { n: offenIn(vs, a), gesamt: vs.length, sperre: sperreIn(vs, a) };
}
// Ist das Geraet nicht lesbar, wird nicht geloescht; stattdessen das Backup aus dem Arbeitsspeicher anbieten.
function nichtLoeschen(x) {
  if (confirm("Gerätedaten nicht lesbar (" + ((x && x.message) || x) + ") – es wird NICHTS gelöscht.\n\nBackup des angezeigten Stands herunterladen?")) backupHerunterladen();
}
const fruehereIds = () => new Set(lokal.map((v) => v.inst).filter((i) => !sp || i !== sp.inst));
const zeitText = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + ". " + iso.slice(11, 16) : "–");

// UGC #20-#22: bei Start, Rueckkehr, nach jeder Aenderung; nie zwei gleichzeitig (auch nicht in zwei Tabs).
let abLaeuft = false, abNochmal = false, abUhr = null, abFehler; // abFehler undefined = in dieser Sitzung noch kein Versuch
let abFrisch = false; // beim naechsten Lauf den Pfad neu aufloesen (Start, Rueckkehr; Codex2 #7)
async function abgleich(frisch) {
  if (frisch === true) abFrisch = true;
  if (!sp || !konto || !konto.name() || !eingerichtet()) return;
  if (abLaeuft) { abNochmal = true; return; }
  abLaeuft = true;
  const neuAufloesen = abFrisch;
  abFrisch = false;
  abNochmal = false;
  zeichnen();
  try {
    const lauf = () => Cloud.abgleichen({ g, sp, datenPfad: einst.datenPfad, sicherPfad: einst.sicherPfad, version: APP_VERSION, frisch: neuAufloesen });
    const r = navigator.locks ? await navigator.locks.request("vorrat-abgleich", lauf) : await lauf();
    abFehler = r.ok ? null : r.fehler;
  } catch (x) { abFehler = (x && x.message) || String(x); }
  abLaeuft = false;
  await laden();
  if (abNochmal) abgleich();
}
function abgleichBald() { clearTimeout(abUhr); abUhr = setTimeout(abgleich, 3000); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") abgleich(true); });

const fehlerJetzt = () => (abFehler !== undefined ? abFehler : ab && ab.letzter ? ab.letzter.fehler : null);
// [Text, gut?]. gut = still anzeigen, sonst Warnkarte (UGC #8/#89: nicht wegklickbar).
function abgleichStand() {
  if (!konto) return ["OneDrive-Anmeldung nicht geladen: " + (kontoFehler || "unbekannt"), false];
  if (!kontoBereit) return ["Anmeldung wird geprüft …", true];
  if (kontoFehler) return ["Anmeldung gestört: " + kontoFehler + " – App neu laden, sonst ☰ → Einstellungen → anmelden.", false];
  if (!konto.name()) return ["Nicht bei Microsoft angemeldet – Änderungen bleiben auf diesem Gerät.", false];
  if (!eingerichtet()) return ["OneDrive-Ordner noch nicht bestätigt: ☰ → Einstellungen → Übernehmen.", false];
  const n = offen(), fe = fehlerJetzt();
  if (abLaeuft) return ["Abgleich läuft …" + (n ? " · " + n + " Änderungen warten" : ""), true];
  if (fe) return ["⚠ Abgleich fehlgeschlagen: " + fe + (n ? " · " + n + " Änderungen nur auf diesem Gerät" : ""), false];
  if (!darfSchreiben()) return ["Noch nicht mit OneDrive abgeglichen.", false];
  if (n) return [n + " Änderungen noch nicht abgeglichen.", true];
  return ["✓ Gespeichert · zuletzt abgeglichen " + zeitText(ab.letzter && ab.letzter.zeit), true];
}
function abgleichKarte() {
  const [text, gut] = abgleichStand();
  const alt = sp ? Cloud.zuletzt(ab, sp.inst, fruehereIds()).filter((r) => r.inst !== sp.inst && (r.alt || r.fehlt || r.zurueck))
    .map((r) => r.wer + ": " + (r.fehlt ? "Datei fehlt in OneDrive" : r.zurueck ? "Datei kürzer als bekannt (zurückgesetzt?)" : "zuletzt abgeglichen " + r.wann)) : [];
  if (ab && ab.sicherung && ab.sicherung.fehler) alt.push(ab.sicherung.fehler); // UGC #32: Sicherungsfehler laut
  const einrichten = !konto || !konto.name() || !eingerichtet() || !darfSchreiben();
  return el("div", { className: "karte " + (gut && !alt.length ? "still" : "warnung") },
    el("div", null, text),
    alt.map((t) => el("div", null, "⚠ " + t)),
    (!gut || alt.length > 0) && el("div", { className: "knoepfe" },
      einrichten && konto && el("button", { onclick: einstellungenDialog }, "Einstellungen"),
      konto && konto.name() && eingerichtet() && !abLaeuft && el("button", { onclick: () => abgleich() }, "Jetzt abgleichen"),
      alt.length > 0 && el("button", { onclick: () => oeffne({ art: "sicherung" }) }, "Details")));
}

// Datei-Kopie aller Vorgaenge (UGC #35): Name mit Lokalzeit.
// Geht auch ohne berechneten Stand (Ladefehler, Widerspruch): Daten frisch aus dem Speicher, sonst aus dem
// Arbeitsspeicher. Passt nicht alles zusammen, kommen die Rohdaten mit BEIDEN Varianten hinein (Codex2 #3).
async function backupHerunterladen() {
  let vs = lokal, a = ab;
  if (sp) { try { vs = await sp.alleVorgaenge(); a = await sp.abgleich(); } catch (_) { /* Arbeitsspeicher nehmen */ } }
  const dateien = a ? a.dateien : {};
  if (!vs.length && !Object.keys(dateien).length) { hinweis("Keine Daten zum Sichern."); return false; }
  let inhalt;
  try { inhalt = Cloud.sicherungsInhalt(dateien, vs, sp && sp.inst, new Date()); }
  catch (_) { inhalt = { art: "vorrat-rohdaten", schema: Modell.SCHEMA, erstellt: Modell.lokalIso(), lokal: vs, wolke: dateien }; }
  const link = el("a", { download: "vorrat-sicherung-" + Modell.lokalIso().slice(0, 16).replace("T", "-").replace(":", "") + ".json",
    href: URL.createObjectURL(new Blob([JSON.stringify(inhalt)], { type: "application/json" })) });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  hinweis("Backup liegt im Download-Ordner.");
  return true;
}

// Ganze lokale DB weg -> neue Installation (Testdaten aus Abschnitt 1, Ordnerwechsel). OneDrive bleibt unberuehrt.
// grund(vorgaenge, abgleich) prueft UNMITTELBAR vor dem Loeschen, exklusiv (andere Tabs zu, Codex #4).
// Liefert true = geloescht. Danach ist die Verbindung dieses Tabs zu -> neu laden.
async function geraetLoeschen(grund) {
  sp = null;
  try { await Speicher.leeren(grund); } catch (x) {
    fehlerZeigen("Nichts gelöscht: " + ((x && x.message) || x) + ". Bitte die App neu laden.");
    return false;
  }
  stand = null;
  return true;
}

// Ordner durchklicken (UGC #41). Verknuepfungen (🔗) sind hier anklickbar: es geht ueber remoteItem weiter.
function ordnerDialog(fertig) {
  const pfad = []; // [{ name, ort }]
  const krumen = el("div", { className: "krumen" }), ordner = el("div");
  let nr = 0;
  async function zeigen() {
    const meins = ++nr; // schnelles Tippen: nur die letzte Antwort zaehlt
    krumen.replaceChildren(el("button", { type: "button", onclick: () => { pfad.length = 0; zeigen(); } }, "OneDrive"),
      ...pfad.map((p, i) => el("button", { type: "button", onclick: () => { pfad.length = i + 1; zeigen(); } }, p.name)));
    ordner.replaceChildren(el("p", { className: "klein" }, "Lädt …"));
    let inhalt;
    try {
      const kinder = await Cloud.unterordner(g, pfad.length ? pfad[pfad.length - 1].ort : await Cloud.wurzelOrt(g));
      inhalt = kinder.length ? kinder.map((k) => el("button", { type: "button", className: "zeile", onclick: () => { pfad.push({ name: k.name, ort: k }); zeigen(); } },
        (k.verknuepfung ? "🔗 " : "📁 ") + k.name)) : [el("p", { className: "klein" }, "Keine Unterordner.")];
    } catch (x) { inhalt = [el("p", { className: "meldung" }, (x && x.message) || String(x))]; }
    if (meins === nr) ordner.replaceChildren(...inhalt);
  }
  dialog("Ordner wählen", [krumen, ordner], [["Diesen Ordner nehmen", (melde, schliessen) => {
    if (!pfad.length) return melde("Bitte erst einen Ordner öffnen.");
    fertig(pfad.map((p) => p.name).join("/"));
    schliessen();
  }]]);
  zeigen();
}

// Einstellungen als Dialog: Eingaben ueberleben so jeden Abgleich im Hintergrund.
function einstellungenDialog() {
  const name = konto && konto.name();
  const daten = el("input", { value: einst.datenPfad, autocomplete: "off" });
  const sicher = el("input", { value: einst.sicherPfad, autocomplete: "off" });
  const ausgabe = el("div");
  const waehlen = (eingabe) => name && el("button", { type: "button", onclick: () => ordnerDialog((p) => { eingabe.value = p; }) }, "📁");
  dialog("Einstellungen", [
    el("h3", null, "Microsoft-Konto"),
    !konto ? el("p", { className: "hinweis-rot" }, "Anmeldung nicht geladen: " + (kontoFehler || "unbekannt"))
      : name ? el("div", { className: "zeilen" }, el("p", null, "Angemeldet: " + name), el("button", { type: "button", onclick: () => konto.anmelden() }, "Anderes Konto"))
        : el("button", { type: "button", onclick: () => konto.anmelden() }, "Bei Microsoft anmelden"),
    el("h3", null, "Ordner in OneDrive"),
    el("p", { className: "klein" }, "Steht nur in diesem Gerät. Eintippen (Windows-Pfad aus dem Explorer geht auch) oder 📁 durchklicken."),
    el("div", { className: "zeilen" }, feld("Datenordner", daten), waehlen(daten)),
    el("div", { className: "zeilen" }, feld("Sicherungsordner", sicher), waehlen(sicher)),
    !eingerichtet() && lokal.length > 0 && el("p", { className: "hinweis-rot" }, "Auf diesem Gerät liegen schon " + lokal.length +
      " Vorgänge (z. B. Testdaten aus v2). Mit „Übernehmen“ wandern sie beim ersten Abgleich nach OneDrive. Lieber vorher löschen: ☰ → Prüfen → 7× auf die Version tippen."),
    ausgabe,
  ], [
    ["Übernehmen", async (melde, schliessen) => {
      const d = Cloud.pfadNormal(daten.value), s = Cloud.pfadNormal(sicher.value);
      if (!d || !s) return melde("Bitte beide Ordner angeben.");
      if (Cloud.ordnerSchluessel(d) === Cloud.ordnerSchluessel(s)) return melde("Daten- und Sicherungsordner müssen verschieden sein.");
      const a = sp && (await sp.abgleich());
      if (Cloud.ordnerSchluessel(d) !== Cloud.ordnerSchluessel(einst.datenPfad) && a && a.gelesen) {
        // UGC #43: Vorgaenge des alten Ordners wandern nie in den neuen -> nur ohne Offenes, dann frisch starten.
        let f;
        try { f = await offenFrisch(); } catch (x) { return nichtLoeschen(x); }
        if (f.sperre) {
          melde(f.sperre + ". Ordnerwechsel gesperrt.");
          if (confirm(f.sperre + ".\n\nDer Ordnerwechsel ist gesperrt. Backup herunterladen?")) backupHerunterladen();
          return;
        }
        if (f.n) return melde(f.n + " Änderungen sind noch nicht abgeglichen. Erst abgleichen, dann den Ordner wechseln.");
        if (!confirm("Datenordner wechseln?\n\nDieses Gerät löscht dann seine lokale Kopie und startet mit neuer Kennung. " +
          "Alles Bisherige liegt schon im alten Ordner und wandert nicht mit.")) return;
        // Erst loeschen, dann den neuen Pfad speichern (Codex #5): bricht es dazwischen ab, bleibt der alte
        // Ordner mit leerem Geraet - harmlos, das liest erst wieder alles.
        if (!(await geraetLoeschen((vs, ag) => { const k = offenIn(vs, ag); return sperreIn(vs, ag) || (k ? k + " Änderungen sind noch nicht abgeglichen" : null); }))) return;
        einstSpeichern({ datenPfad: d, sicherPfad: s });
        return location.reload();
      }
      einstSpeichern({ datenPfad: d, sicherPfad: s });
      if (g.orte) g.orte.clear();
      nachladen = true; // nach dem Schliessen mit dem neuen Ordner rechnen
      schliessen();
      abgleich();
    }],
    name && ["Prüfen", async (melde) => {
      const d = Cloud.pfadNormal(daten.value), s = Cloud.pfadNormal(sicher.value);
      ausgabe.replaceChildren(el("p", { className: "klein" }, "Prüfe …"));
      const zeilen = (titel, z) => [el("b", null, titel), ...z.map(([ok, t]) => el("p", { className: ok ? "" : "hinweis-rot" }, (ok ? "✓ " : "✗ ") + t))];
      const zd = await Cloud.pruefen(g, d, false, sp ? sp.inst : "pruefen00");
      const zs = Cloud.ordnerSchluessel(d) === Cloud.ordnerSchluessel(s) ? [[false, "gleich wie der Datenordner – bitte einen anderen wählen"]] : await Cloud.pruefen(g, s, true, sp ? sp.inst : "pruefen00");
      ausgabe.replaceChildren(...zeilen("Datenordner", zd), ...zeilen("Sicherungsordner", zs));
      melde("");
    }],
  ]);
}

function sicherungAnsicht() {
  const zeilen = sp ? Cloud.zuletzt(ab, sp.inst, fruehereIds()) : [];
  const s = ab && ab.sicherung;
  const [text] = abgleichStand();
  return [kopf("Sicherung & Abgleich"),
    el("p", null, text),
    konto && konto.name() && el("button", { className: "zeile", disabled: abLaeuft, onclick: () => abgleich() }, "↻ Jetzt abgleichen"),
    el("h3", null, "Zuletzt abgeglichen"),
    zeilen.length ? el("table", { className: "pruefen" }, zeilen.map((r) => el("tr", { className: r.alt || r.fehlt || r.zurueck ? "alt" : "" },
      el("th", null, r.wer), el("td", null, r.fehlt ? "Datei fehlt in OneDrive (letzter Stand wird weiter gezeigt)"
        : r.wann + (r.zurueck ? " · Datei kürzer als bekannt (zurückgesetzt?), Bekanntes bleibt" : "") + (r.alt ? " · über eine Woche!" : "")))))
      : el("p", { className: "klein" }, "Noch keine Datei in OneDrive."),
    el("h3", null, "Sicherungen in OneDrive"),
    el("p", { className: s && s.fehler ? "hinweis-rot" : "" }, !s ? "Noch keine angelegt." : s.fehler ? "⚠ " + s.fehler
      : "Zuletzt " + zeitText(s.zeit) + (s.weg ? " · " + s.weg + " alte in den Papierkorb" : "")),
    el("p", { className: "klein" }, "Einmal am Tag beim Abgleich, dazu eine vor jeder neuen App-Version. Aufbewahrt: die 4 neuesten und je Woche eine für 4 Wochen. Ordner: " + einst.sicherPfad),
    el("button", { className: "zeile", onclick: backupHerunterladen }, "⬇ Backup herunterladen")];
}

const orteSichtbar = () => stand.orte.filter((o) => !o.geloescht)
  .sort((a, b) => (a.reihenfolge ?? 999) - (b.reihenfolge ?? 999) || a.name.localeCompare(b.name, "de"));
const ortVon = (id) => stand.orte.find((o) => o.id === id);
const fachVon = (id) => stand.faecher.find((f) => f.id === id);
const faecherAn = (ort, reihe, spalte, ausser) => stand.faecher.filter((f) => !f.geloescht && f.id !== ausser &&
  f.lage.ort === ort && f.lage.reihe === reihe && f.lage.spalte === spalte);
const imFach = (id) => stand.eintraege.filter((e) => e.sichtbar && e.fach === id);
const nachAblauf = (a, b) => ((a.ablauf || "9") + a.name).localeCompare((b.ablauf || "9") + b.name, "de");
const platzName = (o, r, c) => "Reihe " + (r + 1) + (o.spalten > 1 ? ", Platz " + (c + 1) : "");
const fachWort = (o) => (o && o.spalten === 1 ? "Schublade" : "Kiste");
const klaeren = () => ({ kisten: stand.faecher.filter((f) => f.ortKlaeren), eintraege: stand.eintraege.filter((e) => e.ortKlaeren).sort(nachAblauf) });

// ---- Ansichten ----
const ANSICHTEN = { start: startAnsicht, fach: fachAnsicht, ortKlaeren: ortKlaerenAnsicht, bestand: bestandAnsicht, menue: menueAnsicht, pruefen: pruefenAnsicht, sicherung: sicherungAnsicht };
function zeichnen() {
  if (dialogOffen()) return; // UGC #15: unter einem offenen Dialog nichts austauschen
  if (zieht) { nachZeichnen = true; return; } // waehrend Drag and Drop nichts austauschen (gezogene Kachel bliebe sonst haengen)
  const oben = stapel[stapel.length - 1];
  haupt.replaceChildren(...ANSICHTEN[oben.art](oben).flat(Infinity).filter(weg));
}
const kopf = (titel, ...extra) => el("div", { className: "ansichtkopf" },
  el("button", { className: "zurueck", "aria-label": "Zurück", onclick: () => zurueck() }, "←"), el("h2", null, titel), ...extra);

function startAnsicht() {
  if (!stand) return [el("div", { className: "karte warnung" }, ladeFehler || "Lädt …")];
  const orte = orteSichtbar();
  if (!orte.length && !darfSchreiben()) // sonst legen beide Handys die Grundausstattung an
    return [abgleichKarte(), el("p", null, "Noch keine Orte. Erst mit OneDrive abgleichen – vielleicht hat das andere Handy schon alles angelegt.")];
  if (!orte.length) {
    const knopf = el("button", { className: "gross", onclick: async () => {
      if (!confirm("Grundausstattung anlegen?\n\n• Gefrierschrank: 6 Schubladen (2 braun, 4 weiß)\n• Vorrats-Regal: 4 Böden, 8 Kisten\n" +
        "• Küchenschublade: 1 Schublade\n• Medizinschrank: 3 × 2 Plätze, noch ohne Kisten\n\nDanach ist alles änderbar.")) return;
      knopf.disabled = true;
      if (!(await tun(H.grundSchritte()))) knopf.disabled = false; // ganz oder gar nicht (Aufgabe A)
    } }, "Grundausstattung anlegen");
    return [abgleichKarte(), el("p", null, "Noch keine Orte angelegt."), knopf, el("p", { className: "klein" }, "Eigene Orte gehen auch: ☰ → Ort anlegen.")];
  }
  if (!orte.some((o) => o.id === ortWahl)) ortWahl = orte[0].id;
  const k = klaeren(), nKlaeren = k.kisten.length + k.eintraege.length;
  const nPruefen = stand.eintraege.filter((e) => e.bestandPruefen).length;
  const nDaten = stand.widersprueche.length + stand.verwaist.length;
  const baldJeOrt = new Map();
  for (const [fid, m] of H.fachMarken(H.baldAb(stand.eintraege, Modell.heuteIso()))) {
    const f = fachVon(fid);
    if (f) baldJeOrt.set(f.lage.ort, (baldJeOrt.get(f.lage.ort) || 0) + m.n);
  }
  return [
    baldAbTeil(),
    abgleichKarte(),
    el("nav", { className: "reiter" }, orte.map((o) => {
      const n = baldJeOrt.get(o.id) || 0; // Abschnitt 3: auch im Reiter sehen, wo etwas bald ablaeuft
      return el("button", { className: o.id === ortWahl ? "an" : "", "aria-current": o.id === ortWahl ? "true" : "false", onclick: () => { ortWahl = o.id; zeichnen(); },
        "aria-label": o.name + (n > 0 ? ", " + n + " laufen bald ab" : "") },
        o.name, n > 0 && el("span", { className: "reiterzahl", "aria-hidden": "true" }, String(n)));
    })),
    nDaten > 0 && el("div", { className: "karte still" }, "Daten prüfen: " + nDaten + " Vorgänge passen nicht zusammen und werden nicht angewendet (☰ → Prüfen). Gelöscht wurde nichts."),
    (nKlaeren > 0 || nPruefen > 0) && el("div", { className: "knoepfe" },
      nKlaeren > 0 && el("button", { className: "ortklaeren", onclick: () => oeffne({ art: "ortKlaeren" }) }, "Ort klären (" + nKlaeren + ")"),
      nPruefen > 0 && el("button", { className: "bestand", onclick: () => oeffne({ art: "bestand" }) }, "Bestand prüfen (" + nPruefen + ")")),
    zeichnung(ortVon(ortWahl)),
  ];
}

// ---- Abschnitt 3: "Laeuft bald ab" (Kernfunktion), ganz oben auf der Startseite ----
// Bis 5 Zeilen, der Rest auf Knopfdruck: eine lange Liste soll die Abgleich-Warnung darunter nicht wegschieben.
let baldAlle = false;
const BALD_KURZ = 5;
function baldAbTeil() {
  const l = H.baldAb(stand.eintraege, Modell.heuteIso());
  if (!l.length) return null;
  const zeigen = baldAlle ? l : l.slice(0, BALD_KURZ);
  return el("section", { className: "bald", "aria-labelledby": "bald-titel" },
    el("h2", { id: "bald-titel" }, "Läuft bald ab (" + l.length + ")"),
    el("ul", null, zeigen.map((x) => el("li", null, baldZeile(x)))),
    l.length > BALD_KURZ && el("button", { className: "neben", "aria-expanded": String(baldAlle), onclick: () => { baldAlle = !baldAlle; zeichnen(); } },
      baldAlle ? "Weniger zeigen" : "Alle " + l.length + " zeigen"));
}
function baldZeile(x) {
  const e = x.e;
  const wort = { abgelaufen: "abgelaufen", rot: "bald", gelb: "demnächst" }[x.stufe];
  const z = el("button", { className: "baldzeile " + x.stufe, "aria-label": e.name + (e.menge >= 2 ? ", " + e.menge + " Stück" : "") + ", " +
      H.baldText(x.tage) + ", " + H.fundort(e, stand.orte, stand.faecher) + ". Antippen öffnet das Fach." },
    el("span", { className: "bild", "aria-hidden": "true" }, e.symbol || H.bildchen(e.name)),
    el("span", { className: "was" }, el("b", null, e.name + (e.menge >= 2 ? " ×" + e.menge : "")), el("span", { className: "klein" }, H.fundort(e, stand.orte, stand.faecher))),
    el("span", { className: "wann" }, el("b", null, H.kurzDatum(e)), el("span", null, x.stufe === "abgelaufen" ? "abgelaufen" : H.baldText(x.tage))));
  z.dataset.stufe = wort;
  druck(z, () => zumFach(e), () => eintragMenue(e), zugStart(e)); // Abschnitt 5: lange druecken / ziehen wie bei Kacheln
  return z;
}
// Antippen springt zum Fach (Reiter dazu umschalten); ohne gueltigen Platz nach "Ort klaeren".
function zumFach(e) {
  const f = e.fach && fachVon(e.fach);
  if (e.ortKlaeren || !f) return oeffne({ art: "ortKlaeren" });
  ortWahl = f.lage.ort;
  oeffne({ art: "fach", id: f.id, hervor: e.id });
}

// Digitales Bild des Orts: 1 Spalte = Schubladen uebereinander, sonst Boeden mit Kisten.
// Jeder feste Platz zeigt seine Kiste oder ist frei (gestrichelt, "+").
function zeichnung(ort) {
  const W = 360, rand = 12, luft = 8, schub = ort.spalten === 1, rh = schub ? 62 : 84;
  const cw = (W - 2 * rand - (ort.spalten - 1) * luft) / ort.spalten;
  const hoehe = 2 * rand + ort.reihen * rh + (ort.reihen - 1) * luft;
  const marken = H.fachMarken(H.baldAb(stand.eintraege, Modell.heuteIso())); // Abschnitt 3
  const svg = sv("svg", { viewBox: `0 0 ${W} ${hoehe}`, class: "ortbild", role: "group", "aria-label": ort.name },
    sv("rect", { width: W, height: hoehe, rx: 14, class: "korpus" }));
  for (let r = 0; r < ort.reihen; r++) {
    const y = rand + r * (rh + luft);
    const [fuell, schrift] = FARBE[(ort.farben || [])[r]] || (schub ? ["#eef3f1", "#1d2b24"] : ["#d9b98d", "#3b2a17"]);
    if (!schub) svg.append(sv("rect", { x: rand - 6, y: y + rh + 1, width: W - 2 * rand + 12, height: 5, rx: 2, class: "boden" }));
    for (let c = 0; c < ort.spalten; c++) {
      const x = rand + c * (cw + luft);
      const hier = faecherAn(ort.id, r, c);
      if (!hier.length) {
        const g = sv("g", { class: "frei", tabindex: "0", role: "button", "aria-label": "Freier Platz " + platzName(ort, r, c) + ", neue " + fachWort(ort) + " anlegen" }, sv("rect", { x, y, width: cw, height: rh, rx: 8 }), sv("text", { x: x + cw / 2, y: y + rh / 2 + 10, "text-anchor": "middle" }, "+"));
        g.addEventListener("click", () => fachDialog(null, { ort: ort.id, reihe: r, spalte: c }));
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fachDialog(null, { ort: ort.id, reihe: r, spalte: c }); } });
        svg.append(g);
      }
      // ponytail: zwei Kisten auf einem Platz (gleichzeitig angelegt) teilen sich die Breite.
      const w = cw / Math.max(1, hier.length);
      hier.forEach((f, i) => {
        const es = imFach(f.id);
        const mk = marken.get(f.id); // { n, farbe } oder undefined
        const xi = x + i * w, mitte = xi + w / 2;
        const g = sv("g", { class: "platz" + (mk ? " " + mk.farbe : ""), tabindex: "0", role: "button", "data-fach": f.id,
          "aria-label": f.name + ", " + (es.length ? es.length + (es.length === 1 ? " Sache" : " Sachen") : "leer") +
            (mk ? ", " + mk.n + " " + (mk.farbe === "rot" ? "laufen bald ab oder sind abgelaufen" : "laufen in 30 Tagen ab") : "") },
          sv("rect", { x: xi, y, width: w, height: rh, rx: 8, fill: fuell }),
          sv("rect", { x: mitte - 22, y: y + 7, width: 44, height: 6, rx: 3, class: "griff" }),
          sv("text", { x: mitte, y: y + rh * 0.55, "text-anchor": "middle", fill: schrift, class: "fname" }, kuerze(f.name, Math.max(3, Math.floor(w / 9)))),
          sv("text", { x: mitte, y: y + rh * 0.84, "text-anchor": "middle", fill: schrift, class: "fzahl" }, es.length ? es.length + (es.length === 1 ? " Sache" : " Sachen") : "leer"),
          mk && sv("circle", { cx: xi + w - 15, cy: y + 15, r: 11, class: "punkt " + mk.farbe }),
          mk && sv("text", { x: xi + w - 15, y: y + 19.5, "text-anchor": "middle", class: "punktzahl " + mk.farbe }, mk.n > 99 ? "99+" : String(mk.n)));
        g.addEventListener("click", () => oeffne({ art: "fach", id: f.id }));
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); oeffne({ art: "fach", id: f.id }); } });
        svg.append(g);
      });
    }
  }
  return svg;
}

// Antippen = kurz, lange druecken (0,5 s) = lang. Scrollen bricht ab (pointercancel).
// Mit zieh (Abschnitt 5): nach 0,5 s ist die Kachel "angehoben"; loslassen ohne Bewegung = lang(), bewegen = ziehen.
// Bis zum Anheben bleibt der Bildlauf frei (touch-action bleibt, kein preventDefault); erst danach verhindert
// touchmove den Bildlauf, damit Chrome den Zug nicht als Scrollen abbricht.
function druck(knopf, kurz, lang, zieh) {
  let uhr = null, lange = false, start = null, zug = null, zeiger = null;
  const ab = () => { clearTimeout(uhr); uhr = null; };
  const weit = (ev, n) => start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > n;
  // Waehrend eines Drucks horcht document (nicht die Kachel): so kommen Bewegung und Loslassen auch an, wenn
  // der Zeiger die Kachel verlaesst, der Capture verloren geht oder die Kachel neu gezeichnet wird.
  const los = () => {
    ab();
    knopf.classList.remove("angehoben");
    for (const [t, f, o] of horcher) document.removeEventListener(t, f, o);
    zeiger = null;
  };
  const bewegt = (ev) => {
    if (ev.pointerId !== zeiger) return;
    if (uhr && weit(ev, 10)) ab(); // vor dem Anheben bewegt = Bildlauf, kein langes Druecken
    if (zieh && lange && !zug && weit(ev, 8)) zug = zieh(ev);
    if (zug) zug.bewege(ev);
  };
  const hoch = (ev) => {
    if (ev.pointerId !== zeiger) return;
    los();
    if (zug) { const z = zug; zug = null; z.ende(ev); return; } // der folgende click wird ignoriert (lange = true)
    if (zieh && lange) lang();
  };
  const abgebrochen = (ev) => {
    if (ev.pointerId !== zeiger) return;
    los();
    if (zug) { const z = zug; zug = null; z.abbruch(); }
    lange = false;
  };
  // Erst nach dem Anheben den Bildlauf sperren: bis dahin bleibt Wischen ein normaler Bildlauf.
  const wisch = (ev) => { if (zieh && lange && ev.cancelable) ev.preventDefault(); };
  // Codex v4 #6: App in den Hintergrund (Anruf, Home) mitten im Druck = Abbruch, sonst haengt zieht = true
  const hintergrund = () => { if (document.hidden && zeiger !== null) abgebrochen({ pointerId: zeiger }); };
  const horcher = [["pointermove", bewegt, undefined], ["pointerup", hoch, undefined], ["pointercancel", abgebrochen, undefined],
    ["touchmove", wisch, { passive: false }], ["visibilitychange", hintergrund, undefined]];
  knopf.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0 || zeiger !== null) return;
    lange = false; ab(); start = { x: ev.clientX, y: ev.clientY }; zeiger = ev.pointerId;
    for (const [t, f, o] of horcher) document.addEventListener(t, f, o);
    uhr = setTimeout(() => {
      uhr = null; lange = true;
      if (!zieh) return lang();
      knopf.classList.add("angehoben");
      if (navigator.vibrate) navigator.vibrate(25);
    }, 500);
  });
  knopf.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse" && !lange) ab(); }); // Maus raus = kein langes Druecken
  // Chrome entscheidet beim touchstart, ob die Beruehrung blockierend ist: der nicht-passive Horcher muss
  // DANN schon an der Kachel haengen, sonst ist touchmove nicht abbrechbar und Chrome scrollt (Review E #3).
  if (zieh) knopf.addEventListener("touchmove", wisch, { passive: false });
  knopf.addEventListener("contextmenu", (ev) => ev.preventDefault());
  knopf.addEventListener("click", () => { ab(); if (!lange) kurz(); lange = false; });
  // Tastatur: Kontextmenue-Taste / Umschalt+F10 = langes Druecken (Barrierefreiheit)
  knopf.addEventListener("keydown", (ev) => { if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) { ev.preventDefault(); lang(); } });
}

// ==== Abschnitt 5: Verschieben ====
// Ein Verschieben = EIN Vorgang (Feld "fach" des Eintrags). Ziele: Faecher der Zeichnung (data-fach) und die
// Fach-Leiste, die waehrend des Ziehens unten eingeblendet wird (alle Orte, so geht es von ueberall).
let zieht = false, nachZeichnen = false;
const faecherVonOrt = (ortId) => stand.faecher.filter((f) => !f.geloescht && !f.ortKlaeren && f.lage.ort === ortId)
  .sort((a, b) => a.lage.reihe - b.lage.reihe || a.lage.spalte - b.lage.spalte);
function zielLeiste(e) {
  return el("div", { className: "zielleiste", "aria-hidden": "true" },
    el("p", null, "Auf ein Fach ziehen und loslassen · woanders loslassen = abbrechen"),
    orteSichtbar().map((o) => {
      const fs = faecherVonOrt(o.id);
      return fs.length > 0 && el("div", { className: "zielort" }, el("b", null, o.name), el("div", { className: "zielchips" }, fs.map((f) => {
        const c = el("span", { className: "zielchip" + (f.id === e.fach ? " hier" : "") }, f.name);
        if (f.id !== e.fach) c.dataset.fach = f.id;
        return c;
      })));
    }));
}
function zugStart(e) {
  return (ev) => {
    zieht = true;
    const geist = el("div", { className: "zuggeist", "aria-hidden": "true" }, el("span", { className: "bild" }, e.symbol || H.bildchen(e.name)), el("span", null, e.name));
    const leiste = zielLeiste(e);
    document.body.append(leiste, geist);
    let ziel = null;
    const setze = (x, y) => {
      geist.style.transform = "translate(" + (x - 50) + "px," + (y - 70) + "px)";
      const t = document.elementFromPoint(x, y);
      const z = t && t.closest ? t.closest("[data-fach]") : null;
      const neu = z && z.dataset.fach !== e.fach ? z : null;
      if (neu !== ziel) { if (ziel) ziel.classList.remove("ziel"); ziel = neu; if (ziel) ziel.classList.add("ziel"); }
    };
    setze(ev.clientX, ev.clientY);
    const fertig = () => {
      geist.remove(); leiste.remove();
      if (ziel) ziel.classList.remove("ziel");
      zieht = false;
      if (nachZeichnen) { nachZeichnen = false; zeichnen(); }
      return nachladen ? laden() : null;
    };
    return {
      bewege: (m) => setze(m.clientX, m.clientY),
      // Codex v4 #1: erst den waehrend des Ziehens aufgeschobenen Stand laden, dann gegen IHN pruefen
      ende: async (m) => { setze(m.clientX, m.clientY); const z = ziel && ziel.dataset.fach; await fertig(); if (z) verschieben(e, z); },
      abbruch: fertig,
    };
  };
}
const fachText = (fachId) => { const f = fachVon(fachId), o = f && ortVon(f.lage.ort); return f && o ? o.name + " – " + f.name : "?"; };
// Codex v4 #1/#2: Eintrag und Faecher immer im AKTUELLEN Stand pruefen, nicht im Objekt von Zugbeginn.
const eintragJetzt = (id) => (stand ? stand.eintraege.find((x) => x.id === id && x.sichtbar) : null);
const fachGueltig = (id) => { const f = id && fachVon(id); return !!f && !f.geloescht && !f.ortKlaeren; };
async function verschieben(e, fachId) {
  const jetzt = eintragJetzt(e.id);
  if (!jetzt) { hinweis("Diesen Eintrag gibt es nicht mehr."); return false; }
  const alt = jetzt.fach ?? null;
  if (fachId === alt) return true;
  if (!fachGueltig(fachId)) { hinweis("Dieses Fach gibt es nicht mehr."); return false; }
  if (!(await tun([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: fachId }]))) return false;
  untenZeigen(e.name + " → " + fachText(fachId), "Rückgängig", async () => {
    const nun = eintragJetzt(e.id);
    if (!nun || nun.fach !== fachId) return hinweis("Inzwischen anders verschoben – Rückgängig nicht mehr möglich.");
    if (alt && !fachGueltig(alt)) return hinweis("Das alte Fach gibt es nicht mehr – bitte über „Verschieben nach …“ einordnen.");
    if (await tun([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: alt }])) untenZeigen(e.name + " zurück" + (alt ? " nach " + fachText(alt) : ""));
  });
  return true;
}
// Ziel waehlen: Ort -> Fach. Vorbelegt mit dem jetzigen Platz. wert(): undefined = kein Ort gewaehlt (nichts
// aendern), "" = Ort ohne Faecher, sonst die Fach-Kennung. Faecher ohne gueltigen Platz sind kein Ziel.
function zielWahl(aktFach) {
  const f = aktFach && fachVon(aktFach);
  const startOrt = f && !f.geloescht && !f.ortKlaeren ? f.lage.ort : "";
  const fachSel = el("select");
  const fachFeld = feld("Fach", fachSel);
  const leer = el("p", { className: "hinweis-rot" }, "Dieser Ort hat noch keine Kiste.");
  const ortSel = el("select", { onchange: () => fuellen() }, el("option", { value: "" }, "– Ort wählen –"),
    orteSichtbar().map((o) => el("option", { value: o.id, selected: o.id === startOrt }, o.name)));
  const fuellen = () => {
    const fs = ortSel.value ? faecherVonOrt(ortSel.value) : [];
    fachSel.replaceChildren(...fs.map((x) => el("option", { value: x.id, selected: x.id === aktFach }, x.name + (x.id === aktFach ? " (jetzt)" : ""))));
    fachFeld.hidden = !fs.length;
    leer.hidden = !ortSel.value || fs.length > 0;
  };
  fuellen();
  return { teil: [el("div", { className: "zeilen" }, feld("Ort", ortSel), fachFeld), leer], wert: () => (!ortSel.value ? undefined : fachSel.value || "") };
}
function verschiebenDialog(e) {
  const z = zielWahl(e.fach);
  dialog("„" + kuerze(e.name, 30) + "“ verschieben nach …", [
    el("p", { className: "klein" }, "Liegt jetzt in: " + (e.ortKlaeren ? "– unklar (Ort klären) –" : fachText(e.fach))), z.teil,
    el("p", { className: "klein" }, "Tipp: Kachel gedrückt halten und auf ein Fach ziehen geht auch."),
  ], [["Verschieben", async (melde, schliessen) => {
    const w = z.wert();
    if (w === undefined) return melde("Bitte Ort wählen.");
    if (w === "") return melde("Dieser Ort hat noch keine Kiste.");
    if (w === e.fach || (await verschieben(e, w))) schliessen();
  }]]);
}
// Langes Druecken auf eine Kachel: kleines Menue (Bearbeiten, Verschieben nach ...).
function eintragMenue(e) {
  const weiter = (fn) => (melde, schliessen) => { nachZurueck = fn; schliessen(); };
  dialog(kuerze(e.name, 40), [el("p", { className: "klein" }, (e.menge >= 2 ? e.menge + " Stück · " : "") + (e.ortKlaeren ? "Ort klären" : fachText(e.fach)))], [
    ["✎ Bearbeiten", weiter(() => eintragDialog(e))],
    ["↦ Verschieben nach …", weiter(() => verschiebenDialog(e))],
  ]);
}

// Bring-Kachel. Farbe nach Haltbarkeit; ohne Datum neutral.
function kachel(e, kurz, lang, ziehbar) {
  const st = Modell.stufe(e.ablauf, Modell.heuteIso());
  const k = el("button", { className: "kachel" + (st === "rot" || st === "gelb" ? " " + st : "") + (e.bestandPruefen ? " pruefen" : "") },
    el("span", { className: "bild" }, e.symbol || H.bildchen(e.name)),
    el("span", { className: "name" }, e.name),
    e.menge >= 2 && el("span", { className: "zahl" }, "×" + e.menge),
    el("span", { className: "datum" }, H.kurzDatum(e)),
    (e.bestandPruefen || e.ortKlaeren) && el("span", { className: "marke" }, e.bestandPruefen ? "Bestand prüfen" : "Ort klären"));
  druck(k, kurz, lang, ziehbar ? zugStart(e) : null);
  return k;
}

// Entscheidung 11: Antippen = -1, Leiste mit Rueckgaengig (= Gegenvorgang +1), keine Rueckfrage.
async function entnehmen(e) {
  if (!(await tun([{ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }]))) return;
  untenZeigen(e.name + " −1", "Rückgängig", async () => {
    if (await tun([{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" }])) untenZeigen(e.name + " +1 (rückgängig gemacht)");
  });
}

function fachAnsicht(ebene) {
  const { id, hervor } = ebene;
  const f = stand && fachVon(id);
  if (!f || f.geloescht) return [kopf("Kiste"), el("p", null, "Diese Kiste gibt es nicht mehr.")];
  const o = ortVon(f.lage.ort);
  return [
    kopf(f.name, el("button", { className: "neben", onclick: () => fachDialog(f) }, "✎ " + fachWort(o))),
    el("p", { className: "unterzeile" }, f.ortKlaeren ? "ohne gültigen Platz (Ort klären)" : o.name + " · " + platzName(o, f.lage.reihe, f.lage.spalte)),
    el("div", { className: "kacheln" }, imFach(id).sort(nachAblauf).map((e) => {
      const k = kachel(e, () => entnehmen(e), () => eintragMenue(e), true);
      if (e.id === hervor) {
        k.classList.add("hervor");
        // nur beim ersten Zeichnen hinscrollen, sonst springt die Ansicht nach jedem Antippen (-1) zurueck
        if (!ebene.gescrollt) { ebene.gescrollt = true; requestAnimationFrame(() => k.scrollIntoView({ block: "center", behavior: "smooth" })); }
      }
      return k;
    }),
      el("button", { className: "kachel neu", onclick: () => eintragDialog(null, id) }, el("span", { className: "bild" }, "+"), el("span", { className: "name" }, "Neu"))),
    el("p", { className: "klein" }, "Antippen = eins weniger · lange drücken = Menü (bearbeiten, verschieben) · gedrückt halten und ziehen = auf ein anderes Fach legen"),
  ];
}

function ortKlaerenAnsicht() {
  const { kisten, eintraege } = klaeren();
  return [kopf("Ort klären"),
    el("p", { className: "klein" }, "Diese Sachen haben keinen gültigen Platz. Antippen und Platz wählen."),
    kisten.map((f) => el("button", { className: "zeile", onclick: () => fachDialog(f) }, "📦 " + fachWort(ortVon(f.lage.ort)) + " „" + f.name + "“: Platz wählen")),
    el("div", { className: "kacheln" }, eintraege.map((e) => kachel(e, () => eintragDialog(e), () => eintragMenue(e), true))),
    !kisten.length && !eintraege.length && el("p", null, "Alles geklärt.")];
}

function bestandAnsicht() {
  const es = stand.eintraege.filter((e) => e.bestandPruefen).sort(nachAblauf);
  return [kopf("Bestand prüfen"),
    el("p", { className: "klein" }, "Hier stimmt die Stückzahl nicht (öfter entnommen als da war, oder gleichzeitig gezählt). Antippen, nachzählen, eintragen."),
    el("div", { className: "kacheln" }, es.map((e) => kachel(e, () => eintragDialog(e), () => eintragDialog(e)))),
    !es.length && el("p", null, "Alles stimmt.")];
}

// UGC #88: Menue auch ohne Daten erreichbar (dann nur Pruefen und Update).
function menueAnsicht() {
  const suche = el("button", { className: "zeile", onclick: async () => { suche.disabled = true; await updateSuchen(); suche.disabled = false; } }, "↻ Nach Update suchen");
  return [kopf("Menü"),
    stand && [el("h3", null, "Orte"),
      orteSichtbar().map((o) => el("button", { className: "zeile", onclick: () => ortDialog(o) }, "✎ " + o.name + " (" + o.reihen + " × " + o.spalten + ")")),
      el("button", { className: "zeile", onclick: () => ortDialog(null) }, "+ Ort anlegen")],
    el("h3", null, "OneDrive"),
    el("button", { className: "zeile", onclick: einstellungenDialog }, "⚙ Einstellungen (Konto, Ordner)"),
    el("button", { className: "zeile", onclick: () => oeffne({ art: "sicherung" }) }, "🛟 Sicherung & Abgleich"),
    el("h3", null, "App"),
    el("button", { className: "zeile", onclick: () => oeffne({ art: "pruefen" }) }, "🔍 Prüfen"),
    suche];
}

function pruefenAnsicht(ebene) {
  const dauer = el("span", null, "…");
  dauerhaftP.then((d) => { dauer.textContent = d === true ? "ja" : d === false ? "nein (Browser hat abgelehnt)" : "nicht feststellbar"; });
  const ausgabe = el("pre", { className: "ausgabe" });
  const test = el("button", { onclick: () => dreiJahresTest(ausgabe, test) }, "Drei-Jahres-Test");
  const loesch = el("button", { className: "gefahr", onclick: async () => {
    if (!sp) return nichtLoeschen(ladeFehler || "Speicher nicht geöffnet");
    let f;
    try { f = await offenFrisch(); } catch (x) { return nichtLoeschen(x); }
    // Widerspruch / fehlende Datei: erst Backup, dann eine zweite, ausdrueckliche Rueckfrage (Codex2 #1/#2).
    if (f.sperre) {
      if (!confirm("⚠ " + f.sperre + ".\n\nVor dem Löschen erst ein Backup herunterladen? (Abbrechen = nichts löschen)")) return;
      if (!(await backupHerunterladen())) return;
    }
    if (!confirm("Alle Daten auf DIESEM Gerät löschen?\n\n" + f.gesamt + " eigene Vorgänge, davon " + f.n + " noch nicht in OneDrive – die gehen verloren.\n" +
      "OneDrive bleibt unangetastet. Danach startet das Gerät mit neuer Kennung.")) return;
    // Hat ein anderer Tab seit der Rueckfrage etwas gespeichert, wird nicht geloescht (Codex #4).
    if (await geraetLoeschen((vs, ag) => (vs.length !== f.gesamt || offenIn(vs, ag) !== f.n || sperreIn(vs, ag) !== f.sperre ? "Inzwischen wurde etwas gespeichert" : null))) location.reload();
  } }, "Gerätedaten löschen (z. B. Testdaten)");
  // UGC #82: 7x auf die Version tippen, Zaehler ab dem 4. sichtbar, gilt nur fuer diese offene Ansicht.
  const ver = el("button", { className: "text" });
  const verZeigen = () => { const t = ebene.tipps || 0; ver.textContent = APP_VERSION + (t >= 4 && t < 7 ? " · noch " + (7 - t) + "×" : ""); test.hidden = loesch.hidden = t < 7; };
  ver.addEventListener("click", () => { ebene.tipps = (ebene.tipps || 0) + 1; verZeigen(); });
  verZeigen();
  const zeile = (a, b) => el("tr", null, el("th", null, a), el("td", null, b));
  const z = (art) => String(stand[art].filter((x) => !x.geloescht && x.sichtbar !== false).length);
  return [kopf("Prüfen"),
    el("table", { className: "pruefen" },
      zeile("Installation", sp ? sp.inst.slice(0, 8) + "…" : "–"),
      zeile("Vorgänge", String(liste.length)),
      zeile("Bestand", stand ? z("orte") + " Orte · " + z("faecher") + " Kisten · " + z("eintraege") + " Einträge" : ladeFehler || "–"),
      zeile("Nicht angewendet", stand ? stand.widersprueche.length + " widersprüchlich · " + stand.verwaist.length + " ohne Anleger" : "–"),
      zeile("Dauerhafter Speicher", dauer),
      zeile("Konto", konto ? konto.name() || "nicht angemeldet" : "nicht geladen"),
      zeile("Abgleich", abgleichStand()[0]),
      zeile("Noch nicht abgeglichen", String(offen())),
      zeile("Version", ver)),
    test, loesch, ausgabe];
}

// ---- Wachstumstest (Offen-Punkt 6): nur im Arbeitsspeicher und in einer eigenen Test-DB ----
const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
async function idbMessen(vorgaenge) {
  const TEST = "vorrat-test"; // nie Speicher.DB ("vorrat")
  const loeschen = () => new Promise((ok) => { const r = indexedDB.deleteDatabase(TEST); r.onsuccess = r.onerror = r.onblocked = ok; });
  await loeschen();
  const auf = indexedDB.open(TEST, 1);
  auf.onupgradeneeded = () => auf.result.createObjectStore("v", { keyPath: "id" });
  const db = await anfrage(auf);
  try {
    let a = performance.now();
    const t = db.transaction("v", "readwrite");
    for (const v of vorgaenge) t.objectStore("v").put(v);
    await new Promise((ok, nein) => { t.oncomplete = ok; t.onabort = () => nein(t.error); });
    const schreiben = performance.now() - a;
    a = performance.now();
    const n = (await anfrage(db.transaction("v").objectStore("v").getAll())).length;
    return { schreiben, lesen: performance.now() - a, n };
  } finally { db.close(); await loeschen(); }
}
async function dreiJahresTest(ausgabe, knopf) {
  knopf.disabled = true;
  ausgabe.textContent = "läuft … (einige Sekunden)";
  await new Promise((ok) => setTimeout(ok, 50)); // Anzeige erst zeichnen lassen
  const zeilen = [];
  const ms = (a) => Math.round(performance.now() - a) + " ms";
  try {
    let a = performance.now();
    const k = kunstdaten();
    zeilen.push("Kunstdaten erzeugen: " + ms(a));
    a = performance.now();
    const texte = k.dateien.map((d) => JSON.stringify(d));
    zeilen.push("JSON.stringify: " + ms(a));
    a = performance.now();
    const dateien = texte.map((t) => JSON.parse(t));
    zeilen.push("JSON.parse: " + ms(a));
    a = performance.now();
    const pr = dateien.map((d) => Modell.pruefeDatei(d)).find((p) => !p.ok);
    if (pr) throw new Error(pr.fehler);
    zeilen.push("pruefeDatei: " + ms(a));
    a = performance.now();
    const v = Modell.vereinige(dateien.map((d) => d.vorgaenge));
    if (!v.ok) throw new Error(v.fehler);
    zeilen.push("vereinige: " + ms(a));
    a = performance.now();
    const s = Modell.berechne(v.vorgaenge);
    zeilen.push("berechne: " + ms(a));
    const idb = await idbMessen(v.vorgaenge);
    zeilen.push("IndexedDB schreiben: " + Math.round(idb.schreiben) + " ms", "IndexedDB lesen: " + Math.round(idb.lesen) + " ms (" + idb.n + ")");
    zeilen.unshift("Vorgänge: " + v.vorgaenge.length + " · " + (texte.reduce((x, t) => x + t.length, 0) / 1e6).toFixed(1) + " MB · " +
      s.eintraege.filter((e) => e.sichtbar).length + " sichtbare Einträge", "");
  } catch (x) { zeilen.push("FEHLER: " + ((x && x.message) || x)); }
  ausgabe.textContent = zeilen.join("\n");
  knopf.disabled = false;
}

// ---- Dialoge (eigene Ebene, kein <dialog>: dessen Zurueck-Verhalten auf Android umgeht den Verlauf) ----
// knoepfe: [text, fn(melde, schliessen), klasse]. schliessen(n) geht n Ebenen zurueck, nur einmal und
// nur solange dieser Dialog oben liegt (Doppeltipp, Zurueck waehrend des Speicherns).
// weg (optional) laeuft beim Schliessen. Rueckgabe { melde, schliessen } fuer Dialoge, die von aussen schliessen.
function dialog(titel, inhalt, knoepfe, weg) {
  const meldung = el("p", { className: "meldung", role: "alert" });
  const melde = (t) => { meldung.textContent = t; };
  const ebene = { weg };
  const schliessen = (n) => { if (stapel[stapel.length - 1] === ebene) { ebene.zu = true; zurueck(n); } };
  const k = knoepfe.filter(Boolean).map(([text, fn, klasse]) => el("button", { className: klasse || "", onclick: () => { if (!ebene.zu) fn(melde, schliessen); } }, text));
  ebene.el = el("div", { className: "blatt" }, el("div", { className: "fenster" }, el("h2", null, titel), inhalt, meldung,
    el("div", { className: "knoepfe" }, k, el("button", { className: "zweit", onclick: () => schliessen() }, "Abbrechen"))));
  const fenster = ebene.el.firstChild;
  fenster.setAttribute("role", "dialog");
  fenster.setAttribute("aria-modal", "true");
  fenster.setAttribute("aria-label", titel);
  fenster.tabIndex = -1;
  ebene.el.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); schliessen(); } });
  oeffne(ebene);
  // Fokus in den Dialog (Tastatur/Screenreader); ein Dialog, der selbst ein Feld fokussiert, ueberschreibt das danach.
  if (!fenster.contains(document.activeElement)) fenster.focus({ preventScroll: true });
  return { melde, schliessen };
}

// ==== Abschnitt 4: Scannen ====
// Code -> Name nur auf DIESEM Geraet (localStorage "vorrat-codes"): v3-Apps stoppen bei jedem unbekannten
// Vorgangstyp oder Feld in einer OneDrive-Datei (Modell.pruefeVorgang) -> nicht in die gemeinsamen Dateien.
const CODES_KEY = "vorrat-codes";
function codesLesen() { try { return H.codesSauber(JSON.parse(localStorage.getItem(CODES_KEY) || "{}")); } catch (_) { return {}; } }
const codeName = (schluessel) => (Object.hasOwn(codesLesen(), schluessel) ? codesLesen()[schluessel] : null);
function codeMerken(schluessel, name) { try { localStorage.setItem(CODES_KEY, JSON.stringify(H.codesMerken(codesLesen(), schluessel, name))); } catch (_) { /* voll/gesperrt: nur nicht gemerkt */ } }

// Name aus Open Food Facts. Zeitgrenze 6 s, offline sofort aufgeben, jeder Fehler = "kein Treffer" (nie blockieren).
async function offSuchen(ean) {
  if (navigator.onLine === false) return { name: null, offline: true };
  try {
    const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(ean) + ".json?fields=product_name,product_name_de,brands",
      { signal: AbortSignal.timeout(6000), credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) return { name: null }; // 404 = unbekanntes Produkt
    return { name: H.offName(await r.json()) };
  } catch (_) { return { name: null, offline: true }; }
}

// Kamera + BarcodeDetector. fertig(ergebnis von H.leseCode/codeAusEingabe) nur bei einem brauchbaren Code.
// Die Kamera wird bei Treffer, Abbrechen, Android-Zurueck, App im Hintergrund und Fehler gestoppt (stopp()).
// Den Rohwert (kann eine Seriennummer enthalten) zeigt, speichert und protokolliert die App nie.
const SCAN_FORMATE = ["ean_13", "ean_8", "upc_a", "data_matrix"];
function scanDialog(fertig) {
  const video = el("video", { className: "scanbild", muted: true, playsInline: true, autoplay: true });
  video.setAttribute("aria-label", "Kamerabild");
  const status = el("p", { className: "klein", role: "status" }, "Kamera startet …");
  const eingabe = el("input", { inputMode: "numeric", placeholder: "EAN oder PZN", autocomplete: "off", enterKeyHint: "done" });
  let strom = null, aus = false, uhr = null;
  const stopp = () => {
    aus = true;
    clearTimeout(uhr);
    if (strom) strom.getTracks().forEach((t) => t.stop());
    strom = null;
    video.srcObject = null;
    document.removeEventListener("visibilitychange", hintergrund);
  };
  const hintergrund = () => { if (document.visibilityState === "hidden") { stopp(); d.schliessen(); } };
  const nimm = (c) => { stopp(); d.schliessen(); fertig(c); };
  const d = dialog("Scannen", [video, status, feld("oder Code eintippen", eingabe)], [["Code übernehmen", (melde) => {
    const c = H.codeAusEingabe(eingabe.value);
    if (!c) return melde("Kein gültiger EAN- oder PZN-Code (Prüfziffer?)");
    nimm(c);
  }]], stopp);
  document.addEventListener("visibilitychange", hintergrund);
  const ohne = (text) => { video.hidden = true; status.textContent = text; };
  (async () => {
    if (typeof BarcodeDetector === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return ohne("Scannen geht auf diesem Gerät/Browser nicht (BarcodeDetector fehlt). Bitte Code eintippen oder den Namen direkt eingeben.");
    let erkenner;
    try {
      const da = await BarcodeDetector.getSupportedFormats();
      if (aus) return; // Dialog schon zu: Kamera gar nicht erst anfragen (Review E #4)
      const formate = SCAN_FORMATE.filter((f) => da.includes(f));
      if (!formate.length) return ohne("Dieser Browser erkennt keine EAN-/DataMatrix-Codes. Bitte eintippen.");
      erkenner = new BarcodeDetector({ formats: formate });
    } catch (_) { return ohne("Code-Erkennung nicht verfügbar. Bitte eintippen."); }
    try {
      strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (x) {
      return ohne(x && x.name === "NotAllowedError" ? "Kamera nicht erlaubt. In Chrome: Schloss-Symbol → Berechtigungen → Kamera. Oder Code eintippen."
        : "Kamera nicht verfügbar (" + ((x && x.name) || "Fehler") + "). Bitte Code eintippen.");
    }
    if (aus) { strom.getTracks().forEach((t) => t.stop()); strom = null; return; } // Dialog waehrend der Kamera-Frage geschlossen
    video.srcObject = strom;
    try { await video.play(); } catch (_) { /* autoplay reicht meist */ }
    status.textContent = "Strichcode oder DataMatrix-Code ins Bild halten …";
    const suchen = async () => {
      if (aus) return;
      try {
        if (video.readyState >= 2) {
          const treffer = await erkenner.detect(video);
          if (aus) return;
          for (const t of treffer) { const c = H.leseCode(t.rawValue, t.format); if (c) { if (navigator.vibrate) navigator.vibrate(60); return nimm(c); } }
          if (treffer.length) status.textContent = "Code gesehen, aber nicht lesbar (kein EAN/PZN) – weiter halten oder eintippen.";
        }
      } catch (_) { /* einzelnes Bild nicht auswertbar: weiter */ }
      if (!aus) uhr = setTimeout(suchen, 200);
    };
    suchen();
  })();
}

// Eintrag anlegen (e = null, in Fach fachId) oder bearbeiten. Vorbelegen, nie ungefragt speichern (UGC #85).
function eintragDialog(e, fachId) {
  const heute = Modell.heuteIso();
  const name = el("input", { value: e ? e.name : "", maxLength: 100, placeholder: "z. B. Pizza", autocomplete: "off" });
  const symStart = e ? e.symbol || H.bildchen(e.name) : "📦";
  let symbolHand = !!e && symStart !== H.bildchen(e.name); // von Hand gewaehlt -> Namensaenderung laesst es stehen
  const symbol = el("input", { value: symStart, className: "symbol", maxLength: 16, oninput: () => { symbolHand = true; } });
  name.addEventListener("input", () => { if (!symbolHand) symbol.value = H.bildchen(name.value); });

  // Menge: neu = Feld, bearbeiten = +/- (relativ) oder Nachgezaehlt (Korrektur, loest "Bestand pruefen")
  let delta = 0;
  const mengeIn = el("input", { type: "number", min: 1, max: 999, value: "1", inputMode: "numeric" });
  const mengeAnz = el("b");
  const mengeZeigen = () => { mengeAnz.textContent = String(Math.max(0, e.summe + delta)); };
  const nachgezaehlt = el("input", { type: "number", min: 0, max: 999, placeholder: "Stück", inputMode: "numeric" });
  const mengeTeil = !e ? feld("Menge", mengeIn) : [
    el("div", { className: "feld" }, el("span", null, "Menge"), el("div", { className: "plusminus" },
      el("button", { type: "button", onclick: () => { if (e.summe + delta > 0) delta--; mengeZeigen(); } }, "−"), mengeAnz,
      el("button", { type: "button", onclick: () => { if (delta < 999) delta++; mengeZeigen(); } }, "+"))),
    e.bestandPruefen && el("p", { className: "hinweis-rot" }, "Bestand prüfen: bitte nachzählen."),
    feld("Nachgezählt (ersetzt +/−)", nachgezaehlt)];
  if (e) mengeZeigen();

  // MHD: Schnellauswahl Monat/Jahr, alternativ genaues Datum
  let mhd = e ? e.mhd ?? null : null;
  let jahr = (H.mhdTeile(mhd) || { jahr: Number(heute.slice(0, 4)) }).jahr;
  let jahrHand = !!mhd; // solange das Jahr nicht gewaehlt ist, schlaegt der Monat das naechste Vorkommen vor
  const mhdAnz = el("b"), jahrAnz = el("b"), monate = el("div", { className: "monate" });
  const genau = el("input", { type: "date", value: mhd && mhd.length === 10 ? mhd : "" });
  const mhdZeigen = () => {
    const t = mhd && mhd.length === 7 ? H.mhdTeile(mhd) : null;
    jahrAnz.textContent = String(jahr);
    mhdAnz.textContent = mhd ? H.deDatum(mhd) : "kein MHD";
    monate.replaceChildren(...MONATE.map((m, i) => el("button", { type: "button", className: t && t.jahr === jahr && t.monat === i + 1 ? "an" : "",
      onclick: () => { if (!jahrHand) jahr = H.mhdJahr(i + 1, heute); mhd = H.mhdMonat(jahr, i + 1); genau.value = ""; mhdZeigen(); } }, m)));
  };
  genau.addEventListener("change", () => { mhd = genau.value || null; if (mhd) { jahr = Number(mhd.slice(0, 4)); jahrHand = true; } mhdZeigen(); });
  const jahrKnopf = (d, t) => el("button", { type: "button", onclick: () => {
    jahr += d;
    jahrHand = true;
    if (mhd && mhd.length === 7) mhd = H.mhdMonat(jahr, H.mhdTeile(mhd).monat);
    mhdZeigen();
  } }, t);
  const mhdTeil = el("div", null,
    el("div", { className: "feld" }, el("span", null, "MHD"), mhdAnz),
    el("div", { className: "jahr" }, jahrKnopf(-1, "‹"), jahrAnz, jahrKnopf(1, "›")),
    monate,
    el("div", { className: "zeilen" }, feld("oder genaues Datum", genau),
      el("button", { type: "button", className: "zweit", onclick: () => { mhd = null; genau.value = ""; mhdZeigen(); } }, "kein MHD")));
  mhdZeigen();

  // Selbst eingefroren: Einfrierdatum + Frist -> "essen bis". Stichwort im Namen belegt die Frist vor
  // (Fisch 3, Gefluegel 6, Rind 9 ...); ohne Stichwort bleibt sie leer und ist Pflicht (Entscheidung Tobias, Abschnitt 3).
  const frost = el("input", { type: "checkbox", checked: !!(e && e.eingefroren) });
  const einDatum = el("input", { type: "date", value: (e && e.eingefroren) || heute });
  let fristHand = !!(e && e.frist); // von Hand gewaehlt oder vorhanden -> Namensaenderung laesst sie stehen
  const frist = el("input", { type: "number", min: 1, max: 60, inputMode: "numeric", placeholder: "Monate", value: e && e.frist ? String(e.frist) : "" });
  const schnell = el("div", { className: "monate", role: "group", "aria-label": "Frist in Monaten" });
  const vorschlagAnz = el("p", { className: "klein" });
  const essenAnz = el("b");
  const essenZeigen = () => {
    const w = { eingefroren: einDatum.value, frist: Number(frist.value) };
    essenAnz.textContent = !einDatum.value || H.pruefe("eintrag", w) ? "– (Frist wählen)" : H.deDatum(Modell.ablaufdatum(w));
  };
  const fristZeigen = () => {
    const jetzt = Number(frist.value);
    schnell.replaceChildren(...H.FRIST_SCHNELL.map((m) => el("button", { type: "button", className: jetzt === m ? "an" : "", "aria-pressed": String(jetzt === m),
      onclick: () => { frist.value = String(m); fristHand = true; fristZeigen(); } }, m + " M")));
    essenZeigen();
  };
  const vorschlagen = () => {
    const k = H.fristKategorie(name.value);
    vorschlagAnz.textContent = k === null ? "Kein Stichwort erkannt – bitte Frist wählen." : "Vorschlag nach Stichwort: " + H.FRISTEN[k].name + " (" + H.FRISTEN[k].monate + " Monate)";
    if (!fristHand) frist.value = k === null ? "" : String(H.FRISTEN[k].monate);
    fristZeigen();
  };
  einDatum.addEventListener("input", essenZeigen);
  frist.addEventListener("input", () => { fristHand = frist.value !== ""; fristZeigen(); });
  name.addEventListener("input", () => { if (frost.checked) vorschlagen(); });
  const frostTeil = el("div", null, feld("eingefroren am", einDatum),
    el("div", { className: "feld" }, el("span", null, "Frist bis „essen bis“ (Pflicht)"), schnell), feld("oder Monate eintippen (1–60)", frist),
    vorschlagAnz, el("div", { className: "feld" }, el("span", null, "essen bis"), essenAnz));
  const frostZeigen = () => { frostTeil.hidden = !frost.checked; mhdTeil.hidden = frost.checked; if (frost.checked) vorschlagen(); };
  frost.addEventListener("change", frostZeigen);
  frostZeigen();

  // Verschieben nach ... (nur beim Bearbeiten): Ort -> Fach, vorbelegt mit dem jetzigen Platz (zielWahl).
  let ziel = null, verschiebenTeil = null;
  if (e) {
    ziel = zielWahl(e.fach);
    verschiebenTeil = [el("h3", null, "Platz"), el("p", { className: "klein" }, "Liegt in: " + (e.ortKlaeren ? "– unklar (Ort klären) –" : fachText(e.fach))), ziel.teil];
  }

  // Scannen (nur beim Neuanlegen): Name aus dem Gedaechtnis oder Open Food Facts, MHD aus DataMatrix.
  let code = null;
  const scanAnz = el("p", { className: "klein", role: "status" });
  const setzeName = (n) => { name.value = n; name.dispatchEvent(new Event("input")); };
  let scanMhd = null; // MHD, das der letzte Scan gesetzt hat
  async function codeUebernehmen(c) {
    code = c;
    // Codex v4 #4: ein MHD vom vorigen Scan nicht an die naechste Packung vererben (von Hand Geaendertes bleibt)
    if (!c.mhd && scanMhd && mhd === scanMhd) { mhd = null; genau.value = ""; jahrHand = false; mhdZeigen(); }
    scanMhd = c.mhd || null;
    if (c.mhd) { // Verfall aus dem DataMatrix-Code
      frost.checked = false;
      frostZeigen();
      mhd = c.mhd;
      jahr = Number(c.mhd.slice(0, 4));
      jahrHand = true;
      genau.value = c.mhd.length === 10 ? c.mhd : "";
      mhdZeigen();
    }
    const kennt = c.anzeige + (c.mhd ? " · MHD " + H.deDatum(c.mhd) : "");
    const gemerkt = codeName(c.schluessel);
    if (gemerkt) { setzeName(gemerkt); scanAnz.textContent = kennt + " · Name von früher"; return; }
    if (!c.ean) { scanAnz.textContent = kennt + " · Name bitte eintippen – wird für diesen Code gemerkt."; name.focus(); return; }
    scanAnz.textContent = kennt + " · suche Namen …";
    const vorher = name.value;
    const r = await offSuchen(c.ean);
    if (code !== c) return; // inzwischen anders gescannt
    if (r.name && name.value === vorher) { setzeName(r.name); scanAnz.textContent = kennt + " · Name aus Open Food Facts, bitte prüfen."; }
    else if (r.name) scanAnz.textContent = kennt + " · Vorschlag „" + r.name + "“ nicht übernommen (Name schon getippt).";
    else scanAnz.textContent = kennt + (r.offline ? " · offline/keine Antwort" : " · unbekannt") + " – Name bitte eintippen, wird gemerkt.";
  }
  const scanTeil = !e && el("div", { className: "zeilen scanzeile" },
    el("button", { type: "button", className: "an", onclick: () => scanDialog(codeUebernehmen) }, "📷 Scannen"), scanAnz);

  async function speichern(melde, schliessen) {
    const fr = frost.checked;
    if (fr && !einDatum.value) return melde("Einfrierdatum fehlt");
    if (fr && frist.value === "") return melde("Bitte Frist wählen (Monate bis „essen bis“)");
    let fach = fachId;
    if (e) {
      fach = e.fach ?? null;
      const z = ziel.wert();
      if (z === "") return melde("Dieser Ort hat noch keine Kiste.");
      if (z) fach = z;
    }
    const werte = { name: name.value.trim(), symbol: symbol.value.trim() || null, mhd: fr ? null : mhd,
      eingefroren: fr ? einDatum.value : null, frist: fr ? Number(frist.value) : null, fach };
    const fe = H.pruefe("eintrag", werte); // UGC #86: vor dem Vorgang pruefen
    if (fe) return melde(fe);
    if (!e) {
      const menge = Number(mengeIn.value);
      if (!Number.isInteger(menge) || menge < 1 || menge > 999) return melde("Menge: 1 bis 999");
      if (await tun([{ typ: "neu", art: "eintrag", werte, menge }])) {
        if (code) codeMerken(code.schluessel, werte.name); // Abschnitt 4: Code -> Name, nur dieses Geraet
        schliessen();
      }
      return;
    }
    // Je geaendertem Feld ein eigener feld-Vorgang, sonst nichts
    const daten = Object.entries(werte).filter(([k, w]) => w !== (k === "symbol" ? symStart : e[k] ?? null))
      .map(([k, w]) => ({ typ: "feld", art: "eintrag", ziel: e.id, feld: k, wert: w }));
    if (nachgezaehlt.value !== "") {
      const n = Number(nachgezaehlt.value);
      if (!Number.isInteger(n) || n < 0 || n > 999) return melde("Nachgezählt: 0 bis 999 Stück");
      const k = Modell.korrektur(e, n);
      if (k) daten.push(k);
    } else if (delta) daten.push({ typ: "menge", art: "eintrag", ziel: e.id, delta, grund: delta < 0 ? "entnahme" : "zugang" });
    if (!daten.length || (await tun(daten))) schliessen();
  }

  dialog(e ? "Bearbeiten" : "Neuer Eintrag", [
    scanTeil,
    el("div", { className: "zeilen" }, feld("Name", name), feld("Bild", symbol)),
    mengeTeil,
    el("label", { className: "schalter" }, frost, "selbst eingefroren"),
    mhdTeil, frostTeil, verschiebenTeil,
  ], [
    ["Speichern", speichern],
    e && ["Löschen", async (melde, schliessen) => {
      if (!confirm("„" + e.name + "“ (" + e.menge + " Stück) löschen?")) return;
      if (await tun([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert: true }])) schliessen();
    }, "gefahr"],
  ]);
  if (!e) name.focus();
}

// Kiste/Schublade anlegen (f = null, auf freiem Platz lage) oder bearbeiten.
function fachDialog(f, lage) {
  const ort = ortVon(f ? f.lage.ort : lage.ort);
  const wort = fachWort(ort);
  const name = el("input", { value: f ? f.name : "", maxLength: 60, placeholder: "z. B. Nudeln", autocomplete: "off" });
  let platzSel = null;
  if (f) { // Platz: eigener + alle freien Plaetze aller Orte
    const opt = f.ortKlaeren ? [el("option", { value: "" }, "– kein gültiger Platz –")] : [];
    for (const o of orteSichtbar()) for (let r = 0; r < o.reihen; r++) for (let c = 0; c < o.spalten; c++) {
      const meins = !f.ortKlaeren && f.lage.ort === o.id && f.lage.reihe === r && f.lage.spalte === c;
      if (meins || !faecherAn(o.id, r, c, f.id).length) opt.push(el("option", { value: JSON.stringify({ ort: o.id, reihe: r, spalte: c }), selected: meins }, o.name + " · " + platzName(o, r, c)));
    }
    platzSel = el("select", null, opt);
  }
  dialog(f ? wort + " bearbeiten" : "Neue " + wort, [
    !f && el("p", { className: "klein" }, ort.name + " · " + platzName(ort, lage.reihe, lage.spalte)),
    feld("Name", name),
    platzSel && feld("Platz", platzSel),
  ], [
    ["Speichern", async (melde, schliessen) => {
      const werte = { name: name.value.trim() };
      if (!f) werte.lage = lage;
      else if (platzSel.value) {
        const l = JSON.parse(platzSel.value);
        if (l.ort !== f.lage.ort || l.reihe !== f.lage.reihe || l.spalte !== f.lage.spalte) werte.lage = l;
      }
      const fe = H.pruefe("fach", werte);
      if (fe) return melde(fe);
      if (!f) { if (await tun([{ typ: "neu", art: "fach", werte }])) schliessen(); return; }
      const daten = Object.entries(werte).filter(([k, w]) => k !== "name" || w !== f.name)
        .map(([k, w]) => ({ typ: "feld", art: "fach", ziel: f.id, feld: k, wert: w }));
      if (!daten.length || (await tun(daten))) schliessen();
    }],
    f && ["Löschen", async (melde, schliessen) => {
      const n = imFach(f.id).length;
      if (!confirm(wort + " „" + f.name + "“ löschen?" + (n ? "\n\n" + n + " Einträge darin kommen in „Ort klären“, nichts geht verloren." : ""))) return;
      const darunter = stapel[stapel.length - 2];
      if (await tun([{ typ: "feld", art: "fach", ziel: f.id, feld: "geloescht", wert: true }])) schliessen(darunter.art === "fach" && darunter.id === f.id ? 2 : 1);
    }, "gefahr"],
  ]);
  name.focus();
}

function ortDialog(o) {
  const zahl = (w, min, max) => el("input", { type: "number", min, max, value: String(w), inputMode: "numeric" });
  const name = el("input", { value: o ? o.name : "", maxLength: 60, autocomplete: "off" });
  const reihen = zahl(o ? o.reihen : 3, 1, 20), spalten = zahl(o ? o.spalten : 1, 1, 20);
  const folge = zahl(o ? o.reihenfolge ?? 0 : orteSichtbar().reduce((m, x) => Math.max(m, (x.reihenfolge ?? 0) + 1), 0), 0, 999);
  const werteLesen = () => ({ name: name.value.trim(), reihen: Number(reihen.value), spalten: Number(spalten.value), reihenfolge: Number(folge.value) });
  const start = werteLesen();
  dialog(o ? "Ort bearbeiten" : "Neuer Ort", [
    feld("Name", name),
    el("div", { className: "zeilen" }, feld("Reihen", reihen), feld("Spalten", spalten), feld("Reiter-Nr.", folge)),
    el("p", { className: "klein" }, "1 Spalte = Schubladen übereinander, mehrere Spalten = Böden mit Kisten."),
  ], [
    ["Speichern", async (melde, schliessen) => {
      const werte = werteLesen();
      const fe = H.pruefe("ort", werte);
      if (fe) return melde(fe);
      if (!o) { const v = await tun([{ typ: "neu", art: "ort", werte }]); if (v) { ortWahl = v[0].id; schliessen(); } return; }
      const aussen = stand.faecher.filter((f) => !f.geloescht && !f.ortKlaeren && f.lage.ort === o.id && (f.lage.reihe >= werte.reihen || f.lage.spalte >= werte.spalten)).length;
      if (aussen && !confirm(aussen + " Kisten liegen dann außerhalb und kommen in „Ort klären“. Trotzdem ändern?")) return;
      const daten = Object.entries(werte).filter(([k, w]) => w !== start[k]).map(([k, w]) => ({ typ: "feld", art: "ort", ziel: o.id, feld: k, wert: w }));
      if (!daten.length || (await tun(daten))) schliessen();
    }],
    o && ["Löschen", async (melde, schliessen) => {
      const kisten = stand.faecher.filter((f) => !f.geloescht && f.lage.ort === o.id);
      const n = kisten.reduce((s, f) => s + imFach(f.id).length, 0);
      if (!confirm("Ort „" + o.name + "“ löschen?\n\n" + kisten.length + " Kisten und " + n + " Einträge kommen in „Ort klären“, nichts geht verloren.")) return;
      if (await tun([{ typ: "feld", art: "ort", ziel: o.id, feld: "geloescht", wert: true }])) schliessen();
    }, "gefahr"],
  ]);
}

zeichnen();
// UGC #21: Kaltstart wie Rueckkehr behandeln -> nach dem Laden einmal abgleichen.
Promise.all([laden(), konto && konto.bereit]).then(() => { zeichnen(); abgleich(true); });
