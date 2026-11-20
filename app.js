// Vorrats-App: Geruest (Abschnitt 1c) und Oberflaeche (Abschnitt 1d).
"use strict";
const APP_VERSION = "v6.21"; // UGC #71: im Gleichschritt mit CACHE in service-worker.js pflegen

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

  // v6.20: Meldung angetippt, App war offen -> zur Liste "Laeuft bald ab"
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data === "bald") { if (dialogOffen()) baldBeimStart = true; else daumenBald.click(); } }); // Codex v6.20 #8: nach dem Dialog
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
// v6.16 (Tobias 18.11.): feste Leiste unten fuer den Alltag (am Daumen). Liegt unter Dialogen (z-index), Suchfeld bleibt oben.
// zuStart(fn): alle Ebenen schliessen (auch Bearbeiten-Modus, Markieren), dann fn auf der frisch gezeichneten Startseite.
function zuStart(fn) {
  if (dialogOffen()) return; // ein Dialog liegt darueber (Knoepfe sind dann ohnehin verdeckt)
  if (Number(history.state) !== stapel.length) return; // Zurueck laeuft noch (Doppeltipp): sonst ginge es aus der App heraus
  if (stapel.length > 1) { nachZurueck = fn; zurueck(stapel.length - 1); } else fn();
}
const baldZahl = el("span", { className: "reiterzahl", hidden: true, "aria-hidden": "true" });
const daumenBald = el("button", { type: "button", "aria-label": "Läuft bald ab", onclick: () => zuStart(() => {
  if (!baldAlle) { baldAlle = true; zeichnen(); } // v6.17 (Tobias 18.11.): ⏰ zeigt gleich die ganze Liste
  const b = document.querySelector("main .bald");
  if (b) b.scrollIntoView({ block: "start", behavior: "smooth" });
  else hinweis(stand ? "Nichts läuft in den nächsten 30 Tagen ab." : "Daten noch nicht geladen.");
}) }, el("span", { className: "ikon", "aria-hidden": "true" }, "⏰"), el("span", null, "Läuft bald ab"), baldZahl);
// v6.19 (Tobias 18.11.): ✎ Bearbeiten sitzt in der Leiste (vorher Knopf ueber der Zeichnung). Im Modus „✓ Fertig“ (orange).
// Aus einem Fach heraus: zur Startseite, Reiter auf den Ort dieses Fachs, Modus an.
const stiftIkon = el("span", { className: "ikon", "aria-hidden": "true" }, "✎"), stiftWort = el("span", null, "Bearbeiten");
const daumenStift = el("button", { type: "button", className: "stift", "aria-pressed": "false", onclick: () => {
  if (!stand) return hinweis("Daten noch nicht geladen.");
  if (imBearbeiten()) return bearbeitenUmschalten();
  const fe = [...stapel].reverse().find((x) => x.art === "fach"), f = fe && fachVon(fe.id);
  zuStart(() => { if (f && !f.ortKlaeren && ortVon(f.lage.ort)) ortWahl = f.lage.ort; bearbeitenUmschalten(); });
} }, stiftIkon, stiftWort);
const daumenLeiste = el("nav", { id: "daumen", "aria-label": "Schnellzugriff" },
  el("button", { type: "button", onclick: () => { if (!stand) return hinweis("Daten noch nicht geladen."); if (!dialogOffen()) multiScan(null); } },
    el("span", { className: "ikon", "aria-hidden": "true" }, "📷"), el("span", null, "Scannen")),
  daumenBald,
  daumenStift,
  el("button", { type: "button", onclick: () => zuStart(() => scrollTo({ top: 0, behavior: "smooth" })) }, el("span", { className: "ikon", "aria-hidden": "true" }, "🏠"), el("span", null, "Start")));
document.body.append(daumenLeiste);
function daumenZeigen() {
  const n = stand ? H.baldAb(stand.eintraege, Modell.heuteIso()).length : 0;
  baldZahl.hidden = !n;
  baldZahl.textContent = n > 99 ? "99+" : String(n);
  daumenBald.setAttribute("aria-label", "Läuft bald ab" + (n ? ", " + n + " Einträge" : ""));
  const an = imBearbeiten();
  daumenStift.classList.toggle("an", an);
  daumenStift.setAttribute("aria-pressed", String(an));
  stiftIkon.textContent = an ? "✓" : "✎";
  stiftWort.textContent = an ? "Fertig" : "Bearbeiten";
  // v6.20: per Meldung gestartet (?bald): einmal zur Liste, sobald Daten da sind
  // Codex R2 #2: Vormerkung erst beim echten Sprung loeschen (oeffnet das Zurueck gleich einen Folgedialog, bleibt sie stehen)
  if (baldBeimStart && stand) { history.replaceState(history.state, "", location.pathname); setTimeout(() => { if (!baldBeimStart || dialogOffen()) return; baldBeimStart = false; daumenBald.click(); }); }
}
let baldBeimStart = new URLSearchParams(location.search).has("bald");
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
  let neu;
  try {
    sp = sp || (await Speicher.oeffnen());
    let vs, a, z;
    do { z = aenderungen; vs = await sp.alleVorgaenge(); a = await sp.abgleich(); } while (z !== aenderungen);
    // Lesefehler nie als leeren Vorrat behandeln (Bauplan R2 #10). OneDrive-Stand nur fuer den eingestellten
    // Ordner (nach Ordnerwechsel nie den alten mischen).
    const neuAb = a && a.ordner === Cloud.ordnerSchluessel(einst.datenPfad) ? a : null;
    const r = Cloud.zusammenfuehren(vs, neuAb ? neuAb.dateien : {});
    if (!r.ok) throw new Error(r.fehler);
    neu = () => { ab = neuAb; lokal = vs; liste = r.vorgaenge; stand = Modell.berechne(liste); ladeFehler = null; };
  } catch (x) {
    neu = () => { stand = null; ladeFehler = "Daten konnten nicht gelesen werden: " + ((x && x.message) || x) + ". Es wurde nichts verändert."; };
  }
  // Codex R2 #1: waehrend des Lesens kann ein Zug oder Dialog begonnen haben -> auch jetzt nicht darunter tauschen
  if (laeuft || dialogOffen() || zieht) { nachladen = true; return; }
  neu();
  erinnerungAblegen();
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
    erinnerungAblegen();
    zeichnen();
    if (fertig) abgleichBald();
    if (nachladen) laden();
  }
}

// ==== Abschnitt 2: OneDrive (Logik in cloud.js) ====
const CLIENT_ID = "d95d99d1-c6b1-47ce-b533-86ae39816199"; // Entra "Vorrats-App", kein Geheimnis
const SCOPES = ["User.Read", "Files.ReadWrite"];
const EINST_KEY = "vorrat-einst";
// v6.20: Erinnerung bei Ablauf. Eigener Schluessel, NICHT in einst: ein Eintrag unter EINST_KEY macht das
// Geraet "eingerichtet" und startet den Abgleich ohne bestaetigte Ordner.
const ERINNERUNG_KEY = "vorrat-erinnerung-an";
const erinnerungIstAn = () => localStorage.getItem(ERINNERUNG_KEY) === "1";
// Codex v6.20 #1: auch synchrone Fehler (z. B. erinnerung.js nicht geladen) duerfen laden()/tun() nie unterbrechen
const erinnerungAblegen = () => { try { if (stand && erinnerungIstAn()) Erinnerung.ablegen(stand.eintraege).catch(() => {}); } catch { /* nur Erinnerung */ } };
// Codex v6.20 #2: ohne aktiven Service Worker nicht ewig warten
const swBereit = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, nein) => setTimeout(() => nein(new Error("Hintergrund-Dienst der App läuft nicht (App einmal neu laden)")), 5000))]);
// Liefert null (ok) oder den Grund, warum es nicht geht.
async function erinnerungEinschalten() {
  if (!("Notification" in window) || !navigator.serviceWorker) return "Dieser Browser kann keine Meldungen.";
  const reg = await swBereit();
  if (!reg.periodicSync) return "Chrome bietet hier keine Prüfung im Hintergrund an. Die App muss installiert sein (Chrome-Menü → „App installieren“ bzw. „Zum Startbildschirm“).";
  if ((await Notification.requestPermission()) !== "granted") return "Meldungen sind nicht erlaubt. In den Android-Einstellungen bei der App erlauben, dann nochmal.";
  const st = await navigator.permissions.query({ name: "periodic-background-sync" }).catch(() => null);
  if (st && st.state === "denied") return "Chrome erlaubt die Prüfung im Hintergrund nicht. Ist die App installiert?";
  localStorage.setItem(ERINNERUNG_KEY, "1"); // Codex v6.20 #3: erst der Schalter, dann Chrome (sonst Anmeldung ohne Ausschaltweg)
  try { await reg.periodicSync.register("erinnerung", { minInterval: 12 * 3600e3 }); } // Chrome entscheidet selbst, oft seltener
  catch (x) { localStorage.removeItem(ERINNERUNG_KEY); throw x; }
  erinnerungAblegen();
  return null;
}
async function erinnerungAusschalten() {
  localStorage.removeItem(ERINNERUNG_KEY);
  // Codex v6.20 #3 / R2 #1: beide Schritte unabhaengig versuchen (Liste leer = auch ein spaetes Wecken meldet nichts)
  const fehler = [];
  await Erinnerung.schreiben("liste", null).catch((x) => fehler.push(x));
  await swBereit().then((r) => r.periodicSync && r.periodicSync.unregister("erinnerung")).catch((x) => fehler.push(x));
  if (fehler.length) throw fehler[0];
}
function erinnerungTeil() {
  const p = el("p", { className: "klein" }), k = el("button", { type: "button" });
  const zeigen = () => {
    const an = erinnerungIstAn();
    k.textContent = an ? "🔕 Ausschalten" : "🔔 Einschalten";
    p.textContent = an ? "An: höchstens 1× am Tag eine Meldung, wenn etwas rot oder abgelaufen ist. Grundlage ist der Stand vom letzten Öffnen der App."
      : "Aus. Chrome prüft im Hintergrund etwa 1× am Tag (nicht garantiert, im Stromsparmodus seltener).";
  };
  k.onclick = async () => {
    k.disabled = true;
    try {
      const grund = erinnerungIstAn() ? (await erinnerungAusschalten(), null) : await erinnerungEinschalten();
      zeigen();
      if (grund) p.textContent = grund;
    } catch (x) { zeigen(); p.textContent = "Ging nicht: " + ((x && x.message) || x); } // R2 #1: Knopf passt immer zum Schalter
    k.disabled = false;
  };
  zeigen();
  return el("div", null, p, k);
}
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
      // v6.3: Kontoauswahl nur bei "Anderes Konto"; sonst nimmt Microsoft die laufende Browser-Sitzung (meist ohne Eingabe).
      anmelden: (auswahl) => app.loginRedirect({ scopes: SCOPES, ...(auswahl ? { prompt: "select_account" } : {}) }),
      // v6.3: SPA-Verlaengerung (Refresh-Token) gilt bei Microsoft nur 24 h. Danach EIN Umweg ueber die Microsoft-Seite,
      // mit dem bekannten Konto und ohne Kontoauswahl - bei laufender Microsoft-Sitzung ohne Eingabe zurueck.
      abgelaufen: false,
      erneuern: () => { const k = app.getActiveAccount(); return k ? app.acquireTokenRedirect({ scopes: SCOPES, account: k }) : app.loginRedirect({ scopes: SCOPES }); },
      // Kein "Abmelden": MSAL 4.30 entfernt beim Logout ALLE localStorage-Eintraege mit der homeAccountId,
      // auch die der UGC-App auf derselben Domain (geprueft im Bibliothekscode, Codex-Frage 7).
      // Konto wechseln geht ueber anmelden() mit Kontoauswahl.
      async token() { // Luecke 11: abgelaufenes Token laut melden, nicht still "offline"
        const k = kontoBereit && !kontoFehler && app.getActiveAccount();
        if (!k) throw new Error("nicht bei Microsoft angemeldet");
        try { const t = (await app.acquireTokenSilent({ scopes: SCOPES, account: k })).accessToken; this.abgelaufen = false; return t; } catch (x) {
          if (!(x instanceof msal.InteractionRequiredAuthError)) throw new Error("Anmeldung nicht erreichbar (offline?)");
          this.abgelaufen = true;
          throw new Error("Anmeldung abgelaufen – „Neu anmelden“ antippen");
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
// v6 B (Tobias 16.11.: Rueckfrage statt Sperre): Satz fuer die Loesch-Rueckfrage, "" ohne eigene Fotos.
async function fotoText() {
  const aktuell = stand ? new Set(stand.bilder.map((b) => b.datei).filter(Boolean)) : null; // alle Objekte (Codex C #2); Stand unbekannt -> alle
  let n;
  try { n = await Bilder.fotosOffen(aktuell); } catch (_) { return "\nEigene Fotos: Anzahl nicht lesbar – vorhandene gehen verloren.\n"; }
  return n ? "\nDazu " + n + (n === 1 ? " eigenes Foto, noch nicht in OneDrive – geht" : " eigene Fotos, noch nicht in OneDrive – gehen") + " verloren.\n" : "";
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
  if (!abFehler) bilderLauf(); // v6 C: eigener Lauf NACH dem Vorgangs-Abgleich, nie darin (Codex #16)
  if (konto && konto.abgelaufen && neuAufloesen) autoErneuern();
  if (abNochmal) abgleich();
}

// ==== v6 Abschnitt C: eigene Fotos ueber OneDrive (Unterordner "Bilder", Logik in cloud.js) ====
// Nur nach einem erfolgreichen Abgleich und nur im dort gebundenen Ordner (ab.ort). Eigene Sperre, hoechstens ein Lauf
// (auch ueber Tabs), 30 s Budget. Fehler bleiben still in "Sicherung & Abgleich", nie in der roten Leiste.
let bilderLaeuft = false, bilderNochmal = false, bilderStand = null; // bilderStand = Ergebnis des letzten Laufs (Anzeige)
const bilderWarte = new Map(); // Datei -> Wartezeit nach Fehlschlag, ueber Laeufe hinweg
async function bilderLauf() {
  if (bilderLaeuft) { bilderNochmal = true; return; } // Review C #1: Foto waehrend eines Laufs -> gleich danach nochmal
  if (!sp || !darfSchreiben()) return;
  bilderLaeuft = true; bilderNochmal = false;
  const gen = bildGen, z = aenderungen;
  // Codex C #3: neue Aenderung, neuer Abgleich oder "Geraetedaten loeschen" beendet den Lauf (danach startet ein frischer)
  const gilt = () => gen === bildGen && z === aenderungen && !abLaeuft;
  const da = () => gen === bildGen; // Codex C #4: nach "Geraetedaten loeschen" nie mehr lokal schreiben
  const lager = { liste: () => Bilder.fotosListe(), lesen: (d) => Bilder.fotoLesen(d),
    speichern: async (d, b) => da() && Bilder.fotoSpeichern(d, b, true), markieren: async (d) => { if (da()) await Bilder.fotoMarkieren(d); },
    loeschen: async (d) => { if (da()) await Bilder.fotoLoeschen(d); } };
  try {
    // Codex C #1: Namen und "nichts Offenes" frisch aus dem Speicher, nicht aus dem angezeigten Stand (der wartet unter
    // einem offenen Dialog und kennt dann z. B. ein inzwischen zugeordnetes Foto nicht -> waere als Waise geloescht worden).
    const vs = await sp.alleVorgaenge(), a = mitOrdner(await sp.abgleich());
    if (!a || !a.ort || !a.letzter || a.letzter.fehler || a.gelesen !== sp.inst) return; // nur nach Erfolg, gebundener Ordner
    const z0 = Cloud.zusammenfuehren(vs, a.dateien);
    if (!z0.ok) return;
    const lauf = () => Cloud.bilderAbgleichen({ g, ort: a.ort, namen: H.bilderNamen(z0.vorgaenge, Modell.berechne(z0.vorgaenge).bilder),
      aufraeumen: Cloud.offene(a, vs) === 0, lokal: lager, pruefe: Bilder.normalisieren, warte: bilderWarte, weiter: gilt });
    const r = navigator.locks ? await navigator.locks.request("vorrat-bilder", { ifAvailable: true }, (l) => (l ? lauf() : null)) : await lauf();
    if (!r || gen !== bildGen) return;
    bilderStand = r;
    for (const d of r.neu) if (fotoUrls.get(d) === false) fotoUrls.delete(d); // war "liegt nicht hier" -> jetzt laden
    for (const d of r.weg) fotoUrlWeg(d);
    if (r.neu.length || r.weg.length) bildNeuZeichnen();
    else if (stapel[stapel.length - 1].art === "sicherung") zeichnen();
  } catch (x) { bilderStand = { fehler: (x && x.message) || String(x) }; // Review C #7: still anzeigen, nie unbehandelt
  } finally { bilderLaeuft = false; if (bilderNochmal) bilderLauf(); }
}
function bilderText() {
  const r = bilderStand;
  if (!r) return "Noch nicht abgeglichen.";
  if (r.keinOrdner) return "Ordner „Bilder“ fehlt in OneDrive – eigene Fotos bleiben vorerst auf diesem Handy" +
    (r.wartenHoch ? " (" + r.wartenHoch + " warten)" : "") + ". Bitte anlegen: " + einst.datenPfad + "/Bilder";
  const t = [];
  if (r.wartenHoch) t.push(r.wartenHoch + (r.wartenHoch === 1 ? " Foto wartet" : " Fotos warten") + " auf Upload");
  if (r.fehlen) t.push(r.fehlen + (r.fehlen === 1 ? " Foto" : " Fotos") + " vom anderen Handy noch nicht da" + (r.kaputt ? " (" + r.kaputt + " nicht ladbar)" : ""));
  if (r.fehler) t.push("⚠ " + r.fehler);
  return t.length ? t.join(" · ") : "✓ Alle Fotos abgeglichen";
}
// v6.3 (Tobias 16.11.: "so oft anmelden"): nur beim Oeffnen/Zurueckkehren, nie mitten in einem Dialog, Ziehen oder
// Speichern, und hoechstens alle 10 Minuten (keine Schleife, falls auch die Microsoft-Sitzung abgelaufen ist).
// Ungespeichertes geht dabei nicht verloren: jede Aenderung liegt schon vorher im Speicher des Handys.
function autoErneuern() {
  const zuletzt = Number(sessionStorage.getItem("vorrat-auto-anmeldung") || 0);
  if (dialogOffen() || zieht || laeuft || document.hidden || Date.now() - zuletzt < 600000) return;
  sessionStorage.setItem("vorrat-auto-anmeldung", String(Date.now()));
  konto.erneuern().catch(() => { /* Karte zeigt weiter "Neu anmelden" */ });
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
      konto && konto.abgelaufen && el("button", { onclick: () => konto.erneuern() }, "Neu anmelden"),
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
  // Bilder nach den Vorgaengen: deren exklusive Pruefung faengt auch ein inzwischen aufgenommenes Foto ab (jedes
  // eigene Foto kommt mit einem bild-Vorgang). Nicht hochgeladene Fotos hat die Rueckfrage vorher genannt (fotoText).
  bildGen++; bildSchlange.length = 0; // laufende Abrufe schreiben danach nichts mehr
  try { await Bilder.leeren(); } catch (_) { /* wiederbeschaffbar */ }
  for (const u of bildUrls.values()) if (u) URL.revokeObjectURL(u);
  for (const u of fotoUrls.values()) if (u) URL.revokeObjectURL(u);
  bildUrls.clear(); bildNetz.clear(); bildSpaeter.clear(); fotoUrls.clear();
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
      : name ? el("div", { className: "zeilen" }, el("p", null, "Angemeldet: " + name), el("button", { type: "button", onclick: () => konto.anmelden(true) }, "Anderes Konto"))
        : el("button", { type: "button", onclick: () => konto.anmelden() }, "Bei Microsoft anmelden"),
    el("h3", null, "Ordner in OneDrive"),
    el("p", { className: "klein" }, "Steht nur in diesem Gerät. Eintippen (Windows-Pfad aus dem Explorer geht auch) oder 📁 durchklicken."),
    el("div", { className: "zeilen" }, feld("Datenordner", daten), waehlen(daten)),
    el("div", { className: "zeilen" }, feld("Sicherungsordner", sicher), waehlen(sicher)),
    el("h3", null, "Erinnerung bei Ablauf"),
    erinnerungTeil(),
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
          "Alles Bisherige liegt schon im alten Ordner und wandert nicht mit.\n" + (await fotoText()))) return;
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
    el("h3", null, "Eigene Fotos in OneDrive"),
    el("p", { className: "klein fotostand" }, bilderText()),
    el("button", { className: "zeile", onclick: backupHerunterladen }, "⬇ Backup herunterladen")];
}

const orteSichtbar = () => stand.orte.filter((o) => !o.geloescht)
  .sort((a, b) => (a.reihenfolge ?? 999) - (b.reihenfolge ?? 999) || a.name.localeCompare(b.name, "de"));
const ortVon = (id) => stand.orte.find((o) => o.id === id);
const fachVon = (id) => stand.faecher.find((f) => f.id === id);
// Mehrere Faecher auf einem Platz (Aufteilen): nach Namen, damit beide Handys gleich zeichnen ("… links" vor "… rechts").
const nachName = (a, b) => a.name.localeCompare(b.name, "de", { numeric: true }) || (a.id < b.id ? -1 : 1);
const faecherAn = (ort, reihe, spalte, ausser) => stand.faecher.filter((f) => !f.geloescht && f.id !== ausser &&
  f.lage.ort === ort && f.lage.reihe === reihe && f.lage.spalte === spalte).sort(nachName);
// v6.7 Hoehe: ein Fach mit hoch = n belegt die Plaetze reihe .. reihe+n-1 seiner Spalte.
const hoeheVon = (f) => f.hoch || 1;
// Faecher, die den Platz (r, c) belegen: dort verankert ODER von weiter oben hineinragend.
const faecherUeber = (ort, r, c, ausser) => stand.faecher.filter((f) => !f.geloescht && f.id !== ausser && f.lage.ort === ort &&
  f.lage.spalte === c && f.lage.reihe !== null && f.lage.reihe <= r && r < f.lage.reihe + hoeheVon(f));
// Genug Platz fuer ein Fach der Hoehe h ab (r, c): im Raster und keine fremden Faecher auf den Plaetzen.
// Platz l liegt im Bereich eines hohen Fachs, das weiter oben verankert ist.
const verdeckt = (l, ausser) => faecherUeber(l.ort, l.reihe, l.spalte, ausser).some((x) => x.lage.reihe !== l.reihe);
const platzFrei = (ort, r, c, ausser, h = 1) => { const o = ortVon(ort); return !!o && r + h <= o.reihen &&
  Array.from({ length: h }, (_, i) => faecherUeber(ort, r + i, c, ausser).length === 0).every(Boolean); };
// Faecher, die bei einem Raster von reihen x spalten ausserhalb laegen (Ort verkleinern: Knoepfe und Ort-Dialog).
const ausserhalb = (ortId, reihen, spalten) => stand.faecher.filter((f) => !f.geloescht && !f.ortKlaeren && f.lage.ort === ortId &&
  (f.lage.reihe + hoeheVon(f) > reihen || f.lage.spalte >= spalten));
const imFach = (id) => stand.eintraege.filter((e) => e.sichtbar && e.fach === id);
// v6.18 (Tobias 18.11.): Anzeige zaehlt Stueck, nicht Eintraege (Muesli x2 = "2 Sachen"). Sichtbar mit Menge 0 (Bestand pruefen) zaehlt 1.
const stueckImFach = (id) => imFach(id).reduce((s, e) => s + Math.max(1, e.menge), 0);
const nachAblauf = (a, b) => ((a.ablauf || "9") + a.name).localeCompare((b.ablauf || "9") + b.name, "de");
const platzName = (o, r, c) => "Reihe " + (r + 1) + (o.spalten > 1 ? ", Platz " + (c + 1) : "");
const fachWort = (o) => (o && (o.spalten === 1 || o.stil === "sortierkasten") ? "Schublade" : "Kiste");
const fachArt = (f, o) => (f.offen ? "Ablage" : fachWort(o)); // v6.4
const klaeren = () => ({ kisten: stand.faecher.filter((f) => f.ortKlaeren), eintraege: stand.eintraege.filter((e) => e.ortKlaeren).sort(nachAblauf) });

// ---- Ansichten ----
const ANSICHTEN = { start: startAnsicht, fach: fachAnsicht, ortKlaeren: ortKlaerenAnsicht, bestand: bestandAnsicht, menue: menueAnsicht, pruefen: pruefenAnsicht, sicherung: sicherungAnsicht };
function zeichnen() {
  if (dialogOffen()) return; // UGC #15: unter einem offenen Dialog nichts austauschen
  if (zieht) { nachZeichnen = true; return; } // waehrend Drag and Drop nichts austauschen (gezogene Kachel bliebe sonst haengen)
  const oben = stapel[stapel.length - 1];
  haupt.replaceChildren(...ANSICHTEN[oben.art](oben).flat(Infinity).filter(weg));
  daumenZeigen();
}
const kopf = (titel, ...extra) => el("div", { className: "ansichtkopf" },
  el("button", { className: "zurueck", "aria-label": "Zurück", onclick: () => zurueck() }, "←"), el("h2", null, titel), ...extra);

// v6.16 (Tobias 18.11.): Erklaerzeilen nur noch hinter einem ⓘ-Knopf. Auf/zu bleibt beim Neuzeichnen erhalten.
const hilfeOffen = new Set();
function hilfe(schluessel, text) {
  const auf = hilfeOffen.has(schluessel);
  const p = el("p", { className: "klein hilfetext", id: "hilfe-" + schluessel, hidden: !auf }, text);
  const k = el("button", { type: "button", className: "ikon", "aria-label": "Erklärung", "aria-expanded": String(auf), "aria-controls": p.id, onclick: () => {
    const jetzt = !hilfeOffen.delete(schluessel);
    if (jetzt) hilfeOffen.add(schluessel);
    p.hidden = !jetzt;
    k.setAttribute("aria-expanded", String(jetzt));
  } }, "ⓘ");
  return { knopf: k, text: p };
}
// v6.16: Bearbeiten-Modus = eigene Ebene ueber der Startseite ({ art: "start", bearbeiten: true }), damit
// Android-Zurueck und der Zurueck-Knopf ihn verlassen. Nur darin stehen die Umbau-Knoepfe unter der Zeichnung.
const imBearbeiten = () => { const o = stapel[stapel.length - 1]; return o.art === "start" && !!o.bearbeiten; };
function bearbeitenUmschalten() {
  if (Number(history.state) !== stapel.length) return; // Doppeltipp, waehrend das Zurueck noch laeuft
  if (imBearbeiten()) zurueck(); else if (stapel[stapel.length - 1].art === "start") oeffne({ art: "start", bearbeiten: true });
}

function startAnsicht(ebene) {
  const bearb = !!(ebene && ebene.bearbeiten);
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
    suchTeil(),
    baldAbTeil(),
    abgleichKarte(),
    reiterLeiste(orte.map((o) => {
      const n = baldJeOrt.get(o.id) || 0; // Abschnitt 3: auch im Reiter sehen, wo etwas bald ablaeuft
      return el("button", { className: o.id === ortWahl ? "an" : "", "aria-current": o.id === ortWahl ? "true" : "false", onclick: () => { ortWahl = o.id; zeichnen(); },
        "aria-label": o.name + (n > 0 ? ", " + n + " laufen bald ab" : "") },
        o.name, n > 0 && el("span", { className: "reiterzahl", "aria-hidden": "true" }, String(n)));
    })),
    nDaten > 0 && el("div", { className: "karte still" }, "Daten prüfen: " + nDaten + " Vorgänge passen nicht zusammen und werden nicht angewendet (☰ → Prüfen). Gelöscht wurde nichts."),
    (nKlaeren > 0 || nPruefen > 0) && el("div", { className: "knoepfe" },
      nKlaeren > 0 && el("button", { className: "ortklaeren", onclick: () => oeffne({ art: "ortKlaeren" }) }, "Ort klären (" + nKlaeren + ")"),
      nPruefen > 0 && el("button", { className: "bestand", onclick: () => oeffne({ art: "bestand" }) }, "Bestand prüfen (" + nPruefen + ")")),
    zeichenKopf(ortVon(ortWahl), bearb),
    el("div", { className: "zeichenfeld" + (bearb ? " bearbeiten" : "") }, zeichnung(ortVon(ortWahl))),
    // v6.6 Vorlage, v6.2/v6.12 Raster: seit v6.16 nur im Bearbeiten-Modus (Scannen steht in der Daumenleiste unten)
    umbauTeil(ortVon(ortWahl), bearb),
  ];
}
function zeichenKopf(o, bearb) {
  const h = hilfe("start", "Fach antippen = öffnen · lange drücken = Menü (umbenennen, aufteilen, …) · gedrückt halten und ziehen = Platz ändern" +
    " · „✎ Bearbeiten“ unten = Reihen, Spalten, Vorlage und Ort ändern");
  return [el("div", { className: "zeichenkopf" + (bearb ? " bearbeiten" : "") },
    bearb ? el("b", { className: "modus" }, "✎ Bearbeiten: " + o.name) : el("span", { className: "modus" }),
    h.knopf), h.text];
}

// v6.8 (Tobias 16.11.): Die Reiter-Leiste behaelt beim Neuzeichnen ihre Wisch-Position, der gewaehlte Reiter bleibt sichtbar
// (vorher sprang sie nach jedem Tipp an den Anfang, der Medizinschrank verschwand rechts aus dem Bild).
let reiterScroll = 0;
function reiterLeiste(knoepfe) {
  const nav = el("nav", { className: "reiter" }, knoepfe);
  nav.addEventListener("scroll", () => { reiterScroll = nav.scrollLeft; }, { passive: true });
  requestAnimationFrame(() => {
    nav.scrollLeft = reiterScroll;
    const an = nav.querySelector("button.an");
    if (!an) return;
    const a = an.getBoundingClientRect(), b = nav.getBoundingClientRect();
    if (a.left < b.left) nav.scrollLeft -= b.left - a.left + 8;
    else if (a.right > b.right) nav.scrollLeft += a.right - b.right + 8;
  });
  return nav;
}

// ---- v6.3 Suche (Tobias 16.11.): "Tomat" findet Tomatenmark, Tomatenketchup … samt Lagerort ----
// Die Trefferliste wird beim Tippen nur IN PLACE erneuert (zeichnen() wuerde das Eingabefeld ersetzen = Tastatur zu).
let suchText = "";
const ohneAkzent = (t) => t.toLocaleLowerCase("de").normalize("NFD").replace(/[̀-ͯ]/g, "");
function suchTeil() {
  const liste = el("ul");
  const fuellen = () => {
    const q = ohneAkzent(suchText.trim());
    const treffer = q ? stand.eintraege.filter((e) => e.sichtbar && ohneAkzent(e.name).includes(q)).sort(nachAblauf) : [];
    liste.replaceChildren(...treffer.slice(0, 50).map((e) => el("li", null, el("button", {
      className: "baldzeile", onclick: () => zumFach(e),
      "aria-label": e.name + (e.menge >= 2 ? ", " + e.menge + " Stück" : "") + ", " + H.fundort(e, stand.orte, stand.faecher) + ". Antippen öffnet das Fach." },
      el("span", { className: "bild", "aria-hidden": "true" }, bildOder(e.code, e.name, e.symbol || H.bildchen(e.name))),
      el("span", { className: "was" }, el("b", null, e.name + (e.menge >= 2 ? " ×" + e.menge : "")), el("span", { className: "klein" }, H.fundort(e, stand.orte, stand.faecher))),
      el("span", { className: "wann" }, el("b", null, H.kurzDatum(e)))))),
      ...(q && !treffer.length ? [el("li", { className: "klein" }, "Nichts gefunden.")] : []));
  };
  const feldS = el("input", { type: "search", value: suchText, placeholder: "🔍 Produkt suchen", autocomplete: "off", "aria-label": "Vorrat durchsuchen",
    oninput: () => { suchText = feldS.value; fuellen(); } });
  fuellen();
  // Neuzeichnen (z. B. Abgleich fertig) waehrend des Tippens: Fokus und Cursor ins neue Feld uebernehmen
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest(".suche"))
    requestAnimationFrame(() => { feldS.focus(); feldS.setSelectionRange(feldS.value.length, feldS.value.length); });
  return el("section", { className: "suche" }, feldS, liste);
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
    el("span", { className: "bild", "aria-hidden": "true" }, bildOder(e.code, e.name, e.symbol || H.bildchen(e.name))),
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
// v5.4 Design A (Tobias 16.11.): nah an den echten Moebeln (Fotos 08.11.) - glaenzende braune/hellgraue
// Gefrierschubladen mit Etikettenleiste und Griffkante, schwarze Kisten mit Griffloch, Rillen und weissem Etikett
// im cremefarbenen Regal. Erstes Kind jedes Platzes = unsichtbare Trefferflaeche (Fokus, Ablageziel, Tests).
const ZEICHEN_DEFS = `
<linearGradient id="zBraun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f5d4f"/><stop offset=".55" stop-color="#4a3c31"/><stop offset="1" stop-color="#352a22"/></linearGradient>
<linearGradient id="zWeiss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2efe9"/><stop offset=".6" stop-color="#e2ddd3"/><stop offset="1" stop-color="#cbc5b9"/></linearGradient>
<linearGradient id="zGlanz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="zGriff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>
<linearGradient id="zInnen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8d4cc"/><stop offset=".5" stop-color="#ece9e3"/><stop offset="1" stop-color="#d8d4cc"/></linearGradient>
<linearGradient id="zKiste" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f2f31"/><stop offset="1" stop-color="#18181a"/></linearGradient>
<linearGradient id="zDeckel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#45454a"/><stop offset="1" stop-color="#2f2f31"/></linearGradient>
<linearGradient id="zBoden" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe6cf"/><stop offset="1" stop-color="#d6caa8"/></linearGradient>
<linearGradient id="zWand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1ede4"/><stop offset=".5" stop-color="#faf8f3"/><stop offset="1" stop-color="#f1ede4"/></linearGradient>
<filter id="zSchatten" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-opacity=".35"/></filter>`;
const sachenText = (n) => (n ? n + (n === 1 ? " Sache" : " Sachen") : "leer");

// Gefrierschublade: Front mit Glanz, Griffkante unten, Etikettenleiste mit Name, zwei Schieber.
function schubladeTeile(x, y, w, h, braun, name, zahl) {
  const fh = h - 14, mitte = x + w / 2, schrift = braun ? "#f4efe8" : "#2e2a24";
  return [
    sv("g", { filter: "url(#zSchatten)" },
      sv("rect", { x, y, width: w, height: h, rx: 7, fill: braun ? "url(#zBraun)" : "url(#zWeiss)" }),
      sv("rect", { x, y, width: w, height: fh, rx: 7, fill: "url(#zGlanz)" }),
      sv("rect", { x: x + 10, y: y + fh, width: w - 20, height: 9, rx: 4, fill: "url(#zGriff)" }),
      sv("rect", { x: x + 0.5, y: y + 0.5, width: w - 1, height: h - 1, rx: 7, fill: "none", stroke: braun ? "#ffffff22" : "#ffffffcc" }),
      sv("rect", { x: x + 12, y: y + 9, width: w - 24, height: fh - 14, rx: 5, fill: braun ? "#00000055" : "#ffffffaa", stroke: braun ? "#e8e1d6" : "#5b544a", "stroke-width": 1.2 }),
      sv("rect", { x: x + w - 34, y: y + fh - 3, width: 9, height: 7, rx: 1.5, class: "schieber" }),
      sv("rect", { x: x + w - 23, y: y + fh - 3, width: 9, height: 7, rx: 1.5, class: "schieber" })),
    sv("text", { x: mitte, y: y + 9 + (fh - 14) / 2 + 1, "text-anchor": "middle", fill: schrift, class: "fname" }, kuerze(name, Math.max(3, Math.floor((w - 24) / 9)))),
    sv("text", { x: mitte, y: y + 9 + (fh - 14) / 2 + 14, "text-anchor": "middle", fill: schrift, class: "fzahl" }, zahl),
  ];
}
// Kiste im Regal: schwarzer Korb (unten schmaler), Deckelrand, Griffloch, Rillen, weisses Etikett mit Name.
function kisteTeile(x, y, w, h, name, zahl) {
  const kh = h - 10, ky = y + 10, mitte = x + w / 2;
  const kurz = kuerze(name, Math.max(3, Math.floor((w - 38) / 7.2)));
  const lw = Math.min(w - 24, kurz.length * 7.2 + 14);
  const rippen = [0, 1, 2, 3, 4].map((k) => sv("rect", { x: x + 10, y: ky + kh - 30 + k * 5, width: w - 20, height: 1.6, rx: 0.8, fill: "#ffffff14" }));
  return [
    sv("g", { filter: "url(#zSchatten)" },
      sv("path", { d: `M${x + 4} ${ky + 6} H${x + w - 4} L${x + w - 8} ${ky + kh} H${x + 8} Z`, fill: "url(#zKiste)" }),
      sv("rect", { x, y: ky, width: w, height: 9, rx: 3, fill: "url(#zDeckel)" }),
      sv("rect", { x: mitte - 22, y: ky + 15, width: 44, height: 14, rx: 7, class: "griffloch" }),
      ...rippen,
      sv("rect", { x: mitte - lw / 2, y: ky + 33, width: lw, height: 19, rx: 2, class: "etikett" })),
    sv("text", { x: mitte, y: ky + 47, "text-anchor": "middle", class: "fname kname" }, kurz),
    sv("text", { x: mitte, y: ky + kh - 4, "text-anchor": "middle", class: "fzahl kzahl" }, zahl),
  ];
}

// v6.5 Sortierkasten-Schublade (Medizinschrank-Foto): durchsichtig, schwarzer Rahmen, Griffmulde oben, weisses Etikett (v6.8 mittig).
function klarTeile(x, y, w, h, name, zahl) {
  const kurz = kuerze(name, Math.max(3, Math.floor((w - 12) / 5.9)));
  const lw = Math.min(w - 8, kurz.length * 5.9 + 10), mitte = x + w / 2;
  return [
    sv("g", { filter: "url(#zSchatten)" },
      sv("rect", { x, y, width: w, height: h, rx: 3, class: "klar" }),
      sv("path", { d: `M${mitte - 11} ${y + 1.5} a11 8 0 0 0 22 0`, class: "klargriff" })),
    // v6.8 (Tobias): Etikett immer mittig - rechtsbuendig wirkten kurze Namen rechts, lange mittig
    sv("rect", { x: mitte - lw / 2, y: y + 14, width: lw, height: 15, rx: 1.5, class: "etikett" }),
    sv("text", { x: mitte, y: y + 25, "text-anchor": "middle", class: "fname kname klname" }, kurz),
    h >= 50 && sv("text", { x: mitte, y: y + h - 7, "text-anchor": "middle", class: "fzahl klzahl" }, zahl),
  ];
}

// v6.4 (Tobias 16.11.): Ablage ohne Kiste - Getraenke, Kuechenrolle, Oel … stehen direkt im Regal. Statt der Kiste
// stehen bis zu 3 Produktbilder auf dem Boden (Foto oder Bildchen, wie auf den Kacheln), darunter das Etikett.
function ablageTeile(x, y, w, h, f, n) {
  const es = imFach(f.id).sort(nachAblauf);
  const fo = sv("foreignObject", { x: x + 4, y: y + 4, width: w - 8, height: h - 30 });
  fo.append(el("div", { className: "ablage" }, es.slice(0, 3).map((e) => el("span", null, bildOder(e.code, e.name, e.symbol || H.bildchen(e.name)))),
    es.length > 3 && el("b", null, "+" + (es.length - 3))));
  const kurz = kuerze(f.name, Math.max(3, Math.floor((w - 16) / 7.2)));
  const lw = Math.min(w - 8, kurz.length * 7.2 + 14), mitte = x + w / 2;
  return [
    !n && sv("rect", { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 6, class: "ablagerand" }),
    fo,
    sv("rect", { x: mitte - lw / 2, y: y + h - 24, width: lw, height: 19, rx: 2, class: "etikett" }),
    sv("text", { x: mitte, y: y + h - 10, "text-anchor": "middle", class: "fname kname" }, kurz),
  ];
}

function zeichnung(ort) {
  // v6.5 Sortierkasten (Medizinschrank): breiter als der Bildschirm -> seitlich wischen; Trennwand zwischen den Schrankfaechern.
  const sk = ort.stil === "sortierkasten", tb = sk && ort.trenner && ort.trenner < ort.spalten ? 18 : 0;
  const W = sk ? Math.max(360, 100 * ort.spalten + tb) : 360, schub = !sk && ort.spalten === 1;
  const fein = sk && ort.reihen > 6; // v6.10: feines Raster (Medizinschrank 12 Reihen) - niedrigere Reihen
  const rand = schub ? 14 : 12, luft = schub ? 9 : sk ? (fein ? 4 : 6) : 10, rh = schub ? 66 : sk ? (fein ? 30 : 58) : 96, spalt = 6;
  const cw = (W - 2 * rand - (ort.spalten - 1) * luft - tb) / ort.spalten;
  const xVon = (c) => rand + c * (cw + luft) + (tb && c >= ort.trenner ? tb : 0);
  const hoehe = 2 * rand + ort.reihen * rh + (ort.reihen - 1) * luft;
  const marken = H.fachMarken(H.baldAb(stand.eintraege, Modell.heuteIso())); // Abschnitt 3
  const defs = sv("defs", {});
  defs.innerHTML = ZEICHEN_DEFS;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${hoehe}`, class: "ortbild", role: "group", "aria-label": ort.name }, defs);
  if (sk) {
    svg.style.width = W + "px"; svg.style.maxWidth = "none";
    svg.append(sv("rect", { width: W, height: hoehe, rx: 6, class: "skwand" }), sv("rect", { x: 0, y: hoehe - 5, width: W, height: 5, class: "skboden" }));
    if (tb) svg.append(sv("rect", { x: xVon(ort.trenner) - tb - luft + 4, y: 0, width: tb - 2, height: hoehe, class: "sktrenner" }));
  } else if (schub) svg.append(sv("rect", { width: W, height: hoehe, rx: 16, class: "korpus" }),
    sv("rect", { x: 7, y: 7, width: W - 14, height: hoehe - 14, rx: 11, fill: "url(#zInnen)", stroke: "#0002" }));
  else svg.append(sv("rect", { width: W, height: hoehe, rx: 10, fill: "url(#zWand)" }),
    sv("rect", { x: 2, y: 0, width: 7, height: hoehe, class: "pfosten" }), sv("rect", { x: W - 9, y: 0, width: 7, height: hoehe, class: "pfosten" }));
  const faecherG = []; // v6.7: hohe Faecher zuletzt anhaengen, sonst laege der Regalboden darunter ueber ihnen
  for (let r = 0; r < ort.reihen; r++) {
    const y = rand + r * (rh + luft);
    const braun = (ort.farben || [])[r] === "braun";
    if (!schub && !sk) svg.append(sv("rect", { x: 0, y: y + rh + 1, width: W, height: 8, fill: "url(#zBoden)" }), sv("rect", { x: 0, y: y + rh + 9, width: W, height: 3, fill: "#0002" }));
    for (let c = 0; c < ort.spalten; c++) {
      const x = xVon(c);
      const hier = faecherAn(ort.id, r, c);
      if (!faecherUeber(ort.id, r, c).length) {
        const g = sv("g", { class: "frei" + (sk ? " leise" : ""), "data-platz": JSON.stringify({ ort: ort.id, reihe: r, spalte: c }), tabindex: "0", role: "button", "aria-label": "Freier Platz " + platzName(ort, r, c) + ", neue " + fachWort(ort) + " anlegen" }, sv("rect", { x, y, width: cw, height: rh, rx: 8 }), sv("text", { x: x + cw / 2, y: y + rh / 2 + 10, "text-anchor": "middle" }, "+"));
        g.addEventListener("click", () => fachDialog(null, { ort: ort.id, reihe: r, spalte: c }));
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fachDialog(null, { ort: ort.id, reihe: r, spalte: c }); } });
        svg.append(g);
      }
      // Mehrere Faecher auf einem Platz (Aufteilen) stehen nebeneinander, mit kleinem Spalt.
      const w = (cw - (hier.length - 1) * spalt) / Math.max(1, hier.length);
      hier.forEach((f, i) => {
        const n = stueckImFach(f.id), hp = hoeheVon(f) * rh + (hoeheVon(f) - 1) * luft;
        const mk = marken.get(f.id); // { n, farbe } oder undefined
        const xi = x + i * (w + spalt), py = schub ? y + 15 : sk ? y + 12 : y + 26;
        const g = sv("g", { class: "platz" + (mk ? " " + mk.farbe : ""), tabindex: "0", role: "button", "data-fach": f.id,
          "aria-label": f.name + ", " + sachenText(n) +
            (mk ? ", " + mk.n + " " + (mk.farbe === "rot" ? "laufen bald ab oder sind abgelaufen" : "laufen in 30 Tagen ab") : "") },
          sv("rect", { x: xi, y, width: w, height: hp, rx: 8, class: "treffer" }),
          ...(f.offen ? ablageTeile(xi, y, w, hp, f, n) : schub ? schubladeTeile(xi, y, w, hp, braun, f.name, sachenText(n))
            : sk ? klarTeile(xi, y, w, hp, f.name, sachenText(n)) : kisteTeile(xi, y, w, hp, f.name, sachenText(n))),
          mk && sv("circle", { cx: xi + w - 15, cy: py, r: 11, class: "punkt " + mk.farbe }),
          mk && sv("text", { x: xi + w - 15, y: py + 4.5, "text-anchor": "middle", class: "punktzahl " + mk.farbe }, mk.n > 99 ? "99+" : String(mk.n)));
        // v5.2: lange druecken = Fach-Menue; v5.3: gedrueckt halten und ziehen = Platz aendern
        druck(g, () => oeffne({ art: "fach", id: f.id }), () => fachMenue(f), fachZug(f));
        g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); oeffne({ art: "fach", id: f.id }); } });
        if (hoeheVon(f) > 1) faecherG.push(g); else svg.append(g); // Tab-Reihenfolge bleibt Reihe fuer Reihe
      });
    }
  }
  svg.append(...faecherG);
  return sk ? sortierRahmen(svg, ort.id) : svg;
}

// v6.8 (Tobias 16.11.): Pfeile links/rechts zusaetzlich zum Wischen. Die Wisch-Position je Ort bleibt beim Neuzeichnen
// erhalten (sonst sprang die Ansicht nach jeder Aenderung auf der rechten Seite zurueck nach links).
const skScroll = new Map();
function sortierRahmen(svg, ortId) {
  const box = el("div", { className: "ortscroll" }, svg);
  const pfeil = (text, aria, richtung) => el("button", { type: "button", className: "ortpfeil " + (richtung < 0 ? "links" : "rechts"), "aria-label": aria,
    onclick: () => { box.scrollLeft = richtung < 0 ? 0 : box.scrollWidth; } }, text); // v6.9: ganz an den Rand (Browser begrenzt auf das Maximum)
  const li = pfeil("◀", "Weiter nach links", -1), re = pfeil("▶", "Weiter nach rechts", 1);
  // Klasse statt hidden: der Pfeil behaelt seinen Platz (global gilt [hidden] = display:none !important). Sonst wurde die
  // Zeichnung beim Erscheinen des linken Pfeils schmaler, und ▶ blieb 32 px vor dem Rand stehen (Tobias 16.11.).
  const aus = (k, ja) => { k.classList.toggle("aus", ja); k.disabled = ja; };
  const zeigen = () => { aus(li, box.scrollLeft <= 2); aus(re, box.scrollLeft + box.clientWidth >= box.scrollWidth - 2); };
  box.addEventListener("scroll", () => { skScroll.set(ortId, box.scrollLeft); zeigen(); }, { passive: true });
  requestAnimationFrame(() => { box.scrollLeft = skScroll.get(ortId) || 0; zeigen(); });
  return el("div", { className: "ortrahmen" }, li, box, re); // v6.9: Pfeile neben der Zeichnung
}

// v6.2 (Tobias 16.11.): Regal-Raster direkt an der Zeichnung vergroessern/verkleinern (nur Orte mit Kisten, also
// mehreren Spalten; Schubladen-Orte sind feste Moebel). "−" nur, wenn die letzte Reihe/Spalte leer ist.
function umbauTeil(o, bearbeiten) {
  const liste = H.umbauKnoepfe(o, bearbeiten);
  if (!liste.length) return null;
  const aendern = (feld, delta) => {
    const jetzt = ortVon(o.id);
    if (!jetzt || jetzt.geloescht) return hinweis("Diesen Ort gibt es nicht mehr.");
    if (jetzt.spalten < 2) return; // inzwischen (anderes Handy) ein Schubladen-Ort
    const wert = jetzt[feld] + delta;
    if (feld === "spalten" && wert < 2) return;
    const fe = H.pruefe("ort", { [feld]: wert });
    if (fe) return hinweis(fe);
    if (delta < 0) {
      const neu = { reihen: jetzt.reihen, spalten: jetzt.spalten, [feld]: wert };
      if (ausserhalb(o.id, neu.reihen, neu.spalten).length) return hinweis("In der letzten " + (feld === "reihen" ? "Reihe" : "Spalte") + " steht noch eine Kiste – bitte erst wegziehen oder löschen.");
    }
    tun([{ typ: "feld", art: "ort", ziel: o.id, feld, wert }]);
  };
  // v6.12 (Tobias 16.11.): mit Trennwand (zwei Schrankfaecher) die Spalte fuer die LINKE Seite direkt vor der Trennwand
  // einfuegen bzw. entfernen; die rechte Seite rueckt mit (alle Faecher ab der Trennwand eine Spalte weiter).
  const linksAendern = (delta) => {
    const jetzt = ortVon(o.id);
    if (!jetzt || jetzt.geloescht || !jetzt.trenner) return hinweis("Diesen Ort gibt es nicht mehr.");
    const t = jetzt.trenner, spalten = jetzt.spalten + delta;
    if (delta < 0 && t < 2) return;
    const fe = H.pruefe("ort", { spalten });
    if (fe) return hinweis(fe);
    const imOrt = stand.faecher.filter((f) => !f.geloescht && f.lage.ort === o.id && f.lage.spalte !== null);
    if (delta < 0 && imOrt.some((f) => f.lage.spalte === t - 1))
      return hinweis("In der äußeren Spalte links (vor der Trennwand) steht noch etwas – bitte erst wegziehen oder löschen.");
    tun([{ typ: "feld", art: "ort", ziel: o.id, feld: "spalten", wert: spalten }, { typ: "feld", art: "ort", ziel: o.id, feld: "trenner", wert: t + delta },
      ...imOrt.filter((f) => f.lage.spalte >= t).map((f) => ({ typ: "feld", art: "fach", ziel: f.id, feld: "lage", wert: { ...f.lage, spalte: f.lage.spalte + delta } }))]);
  };
  const tat = { "reihe+": () => aendern("reihen", 1), "reihe-": () => aendern("reihen", -1), "links+": () => linksAendern(1), "links-": () => linksAendern(-1),
    "spalte+": () => aendern("spalten", 1), "spalte-": () => aendern("spalten", -1), vorlage: () => medizinEinrichten(o.id),
    ort: () => { const j = ortVon(o.id); if (!j || j.geloescht) return hinweis("Diesen Ort gibt es nicht mehr."); ortDialog(j); } };
  // v6.16: je Gruppe eine Zeile (Beschriftung + Knoepfe). Raster-Knoepfe behalten die Klasse "raster" (Browsertest).
  const gruppen = [];
  for (const x of liste) {
    let g = gruppen.find((y) => y.name === x.gruppe);
    if (!g) gruppen.push((g = { name: x.gruppe, k: [] }));
    g.k.push(el("button", { className: "neben" + (x.id === "vorlage" ? " gross" : ""), "aria-label": x.aria, onclick: tat[x.id] }, x.text));
  }
  const raster = (n) => ["Reihen", "Spalten", "Linke Seite", "Rechte Seite"].includes(n);
  return el("section", { className: "umbau", "aria-label": "Umbau " + o.name },
    gruppen.map((g) => el("div", { className: "umbaugruppe" }, el("span", { className: "umbauname" }, g.name),
      el("div", { className: "knoepfe" + (raster(g.name) ? " raster" : "") }, g.k))),
    o.spalten < 2 && el("p", { className: "klein" }, "Schubladen-Orte haben feste Reihen – Anzahl über „Name und Größe“."));
}

// Antippen = kurz, lange druecken (0,5 s) = lang. Scrollen bricht ab (pointercancel).
// Mit zieh (Abschnitt 5): nach 0,5 s ist die Kachel "angehoben"; loslassen ohne Bewegung = lang(), bewegen = ziehen.
// Bis zum Anheben bleibt der Bildlauf frei (touch-action bleibt, kein preventDefault); erst danach verhindert
// touchmove den Bildlauf, damit Chrome den Zug nicht als Scrollen abbricht.
// v6.2: Nach einem langen Druck schiebt der Browser einen Klick nach. Zeichnet lang() neu oder oeffnet einen Dialog,
// trifft er ein NEUES Element (neue Kachel, Dialogknopf) - deshalb fuer die ganze Seite schlucken, nicht nur am Knopf.
let stummBis = 0;
document.addEventListener("click", (ev) => { if (Date.now() < stummBis) { stummBis = 0; ev.stopPropagation(); ev.preventDefault(); } }, true);
document.addEventListener("pointerdown", () => { stummBis = 0; }, true); // neue Beruehrung = echter Tipp, nie schlucken
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
    if (lange) stummBis = Date.now() + 400;
    if (zug) { const z = zug; zug = null; z.ende(ev); return; } // den folgenden click schlucken lange / stummBis
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
    if (ev.button > 0 || !ev.isPrimary || zeiger !== null) return; // Codex R2 #3: nur der erste Finger zieht (zieht ist EIN Schalter)
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
  // Nachklick auf DIESEN Knopf (auch wenn er schon ersetzt ist) per lange; auf andere Elemente per stummBis.
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
// Gemeinsamer Ablauf fuers Ziehen (Eintraege, v5.3 auch Faecher): Geist folgt dem Finger, das Ziel unter dem Finger
// wird markiert. Beim Loslassen erst den aufgeschobenen Stand laden, dann ablegen(ziel) gegen IHN (Codex v4 #1).
// geist()/leiste() werden erst beim Zugbeginn gebaut; zielVon(element) -> Ablage-Element oder null.
function zug(geist, leiste, zielVon, ablegen) {
  return (ev) => {
    zieht = true;
    const g = el("div", { className: "zuggeist", "aria-hidden": "true" }, geist());
    const l = leiste ? leiste() : null;
    document.body.append(...[l, g].filter(Boolean));
    let ziel = null;
    const setze = (x, y) => {
      g.style.transform = "translate(" + (x - 50) + "px," + (y - 70) + "px)";
      const t = document.elementFromPoint(x, y);
      const neu = t && t.closest ? zielVon(t) : null;
      if (neu !== ziel) { if (ziel) ziel.classList.remove("ziel"); ziel = neu; if (ziel) ziel.classList.add("ziel"); }
    };
    setze(ev.clientX, ev.clientY);
    const fertig = () => {
      g.remove(); if (l) l.remove();
      if (ziel) ziel.classList.remove("ziel");
      zieht = false;
      if (nachZeichnen) { nachZeichnen = false; zeichnen(); }
      return nachladen ? laden() : null;
    };
    return {
      bewege: (m) => setze(m.clientX, m.clientY),
      ende: async (m) => { setze(m.clientX, m.clientY); const z = ziel; await fertig(); if (z) ablegen(z); },
      abbruch: fertig,
    };
  };
}
const zugStart = (e) => zug(() => [el("span", { className: "bild" }, e.symbol || H.bildchen(e.name)), el("span", null, e.name)], () => zielLeiste(e),
  (t) => { const z = t.closest("[data-fach]"); return z && z.dataset.fach !== e.fach ? z : null; },
  (z) => verschieben([e.id], z.dataset.fach));
const fachText = (fachId) => { const f = fachVon(fachId), o = f && ortVon(f.lage.ort); return f && o ? o.name + " – " + f.name : "?"; };
// Codex v4 #1/#2: Eintrag und Faecher immer im AKTUELLEN Stand pruefen, nicht im Objekt von Zugbeginn.
const eintragJetzt = (id) => (stand ? stand.eintraege.find((x) => x.id === id && x.sichtbar) : null);
const fachGueltig = (id) => { const f = id && fachVon(id); return !!f && !f.geloescht && !f.ortKlaeren; };
// Ein Verschieben = EIN Schritt fuer alle Eintraege (je einer ein Vorgang "fach"), ein Rueckgaengig (v6.2: auch mehrere).
// Was schon im Ziel liegt, bleibt; zurueck wandert nur, was noch im Ziel liegt, jeder Eintrag in SEIN altes Fach.
async function verschieben(ids, fachId) {
  const es = ids.map(eintragJetzt).filter(Boolean);
  if (!es.length) { hinweis("Diesen Eintrag gibt es nicht mehr."); return false; }
  const weg = es.filter((e) => e.fach !== fachId);
  if (!weg.length) return true;
  if (!fachGueltig(fachId)) { hinweis("Dieses Fach gibt es nicht mehr."); return false; }
  const alt = new Map(weg.map((e) => [e.id, e.fach ?? null]));
  const schritte = (liste, ziel) => liste.map((e) => ({ typ: "feld", art: "eintrag", ziel: e.id, feld: "fach", wert: ziel(e) }));
  if (!(await tun(schritte(weg, () => fachId)))) return false;
  const was = weg.length === 1 ? weg[0].name : sachenText(weg.length);
  untenZeigen(was + " → " + fachText(fachId), "Rückgängig", async () => {
    const dort = weg.filter((e) => eintragJetzt(e.id)?.fach === fachId);
    if (!dort.length) return hinweis("Inzwischen anders verschoben – Rückgängig nicht mehr möglich.");
    if (dort.some((e) => alt.get(e.id) && !fachGueltig(alt.get(e.id)))) return hinweis("Das alte Fach gibt es nicht mehr – bitte über „Verschieben nach …“ einordnen.");
    const a1 = alt.get(dort[0].id);
    if (await tun(schritte(dort, (e) => alt.get(e.id)))) untenZeigen(was + " zurück" + (a1 ? " nach " + fachText(a1) : ""));
  });
  return true;
}
// Ziel waehlen: Ort -> Fach. Vorbelegt mit dem jetzigen Platz. wert(): undefined = kein Ort gewaehlt (nichts
// aendern), "" = Ort ohne Faecher, sonst die Fach-Kennung. Faecher ohne gueltigen Platz sind kein Ziel.
function zielWahl(aktFach, jetztWort = " (jetzt)") {
  const f = aktFach && fachVon(aktFach);
  const startOrt = f && !f.geloescht && !f.ortKlaeren ? f.lage.ort : "";
  const fachSel = el("select");
  const fachFeld = feld("Fach", fachSel);
  const leer = el("p", { className: "hinweis-rot" }, "Dieser Ort hat noch keine Kiste.");
  const ortSel = el("select", { onchange: () => fuellen() }, el("option", { value: "" }, "– Ort wählen –"),
    orteSichtbar().map((o) => el("option", { value: o.id, selected: o.id === startOrt }, o.name)));
  const fuellen = () => {
    const fs = ortSel.value ? faecherVonOrt(ortSel.value) : [];
    fachSel.replaceChildren(...fs.map((x) => el("option", { value: x.id, selected: x.id === aktFach }, x.name + (x.id === aktFach ? jetztWort : ""))));
    fachFeld.hidden = !fs.length;
    leer.hidden = !ortSel.value || fs.length > 0;
  };
  fuellen();
  return { teil: [el("div", { className: "zeilen" }, feld("Ort", ortSel), fachFeld), leer], wert: () => (!ortSel.value ? undefined : fachSel.value || "") };
}
// v6.12 (Tobias 16.11.: "alle Produkte aus Schublade 1 auf einmal loeschen"): markierte Eintraege in EINEM Schritt loeschen,
// ein Rueckgaengig. Weg: lange druecken -> "Alle" -> "Loeschen".
async function mehrLoeschen(ids, markierEbene = true) {
  const es = ids.map(eintragJetzt).filter(Boolean);
  if (!es.length) return hinweis("Die markierten Sachen gibt es nicht mehr.");
  const stueck = es.reduce((s, e) => s + e.menge, 0);
  if (!confirm(sachenText(es.length) + " (" + stueck + " Stück) löschen?" + String.fromCharCode(10, 10) +
    es.slice(0, 8).map((e) => "• " + e.name).join(String.fromCharCode(10)) + (es.length > 8 ? String.fromCharCode(10) + "…" : ""))) return;
  const schritte = (wert) => es.map((e) => ({ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert }));
  if (!(await tun(schritte(true)))) return;
  if (markierEbene) zurueck(); // Markier-Ebene schliessen (aus dem Produkt-Menue gibt es keine)
  untenZeigen(sachenText(es.length) + " gelöscht", "Rückgängig", async () => { if (await tun(schritte(false))) untenZeigen(sachenText(es.length) + " zurückgeholt"); });
}

// Ziel waehlen und verschieben, fuer einen oder mehrere Eintraege. inhalt(zielTeil) = Dialoginhalt, zu = Ebenen beim Schliessen.
function verschiebenDialog(ids, aktFach, titel, inhalt = (t) => [t], zu = 1) {
  const z = zielWahl(aktFach);
  dialog(titel, inhalt(z.teil), [["Verschieben", async (melde, schliessen) => {
    const w = z.wert();
    if (w === undefined) return melde("Bitte Ort wählen.");
    if (w === "") return melde("Dieser Ort hat noch keine Kiste.");
    if (await verschieben(ids, w)) schliessen(zu);
  }]]);
}
// Antippen oder langes Druecken auf eine Kachel: kleines Menue. v5 (Tobias 15.11.): -1 nur noch hier,
// Antippen allein veraendert nichts mehr.
// Menue-Knopf, der erst das Menue schliesst und dann fn oeffnet.
const weiter = (fn) => (melde, schliessen) => { nachZurueck = fn; schliessen(); };
function eintragMenue(e) {
  const eig = stand && H.eigenesFoto(stand.fotoVon, e.code, e.name);
  // v6.1 (Tobias 16.11.): grosses Bild; mit Strichcode umschaltbar auf die Inhaltsstoffe (PZN nie ans Netz)
  const ean = offTauglich(e.code) ? e.code.slice(5) : null;
  const grossBild = () => {
    const b = bildOder(e.code, e.name, null);
    if (b) { b.className = "gross"; return b; }
    return el("div", { className: "grossbildchen", "aria-hidden": "true" }, e.symbol || H.bildchen(e.name));
  };
  const flaeche = el("div", { className: "produkt", role: "status", "aria-live": "polite" }, grossBild());
  let info = false, tipp = 0; // tipp: nur die Antwort des letzten Umschaltens zaehlt
  const bildDazu = () => { if (!info) flaeche.replaceChildren(grossBild()); }; // Foto kam erst nach dem Oeffnen
  document.addEventListener("vorrat-bild", bildDazu);
  const umschalt = ean && el("button", { type: "button", className: "zweit umschalt", "aria-pressed": "false", onclick: async () => {
    const meins = ++tipp;
    info = !info;
    umschalt.textContent = info ? "🖼 Bild" : "🧾 Inhaltsstoffe";
    umschalt.setAttribute("aria-pressed", String(info));
    if (!info) return flaeche.replaceChildren(grossBild());
    flaeche.replaceChildren(el("p", { className: "klein" }, "Lade Angaben von Open Food Facts …"));
    const x = await offDetailsHolen(ean);
    if (meins === tipp) flaeche.replaceChildren(...(x.offline ? [el("p", { className: "klein" }, "Open Food Facts nicht erreichbar – bitte später nochmal.")] : infoTeil(x.d)));
  } }, "🧾 Inhaltsstoffe");
  menue(kuerze(e.name, 40), [flaeche, umschalt, el("p", { className: "klein" }, (e.menge >= 2 ? e.menge + " Stück · " : "") + (e.ortKlaeren ? "Ort klären" : fachText(e.fach)))], {
    oben: [
      ["−1" + (e.menge === 1 ? " (das letzte)" : " · eins raus"), weiter(() => entnehmen(e)), "an"],
      ["↦ Verschieben", weiter(() => verschiebenDialog([e.id], e.fach, "„" + kuerze(e.name, 30) + "“ verschieben nach …", (t) => [
        el("p", { className: "klein" }, "Liegt jetzt in: " + (e.ortKlaeren ? "– unklar (Ort klären) –" : fachText(e.fach))), t,
        el("p", { className: "klein" }, "Tipp: Kachel gedrückt halten und auf ein Fach ziehen geht auch.")]))],
      ["✎ Bearbeiten", weiter(() => eintragDialog(e))],
    ],
    liste: [
      // Dateiauswahl direkt im Tipp oeffnen (braucht die Nutzergeste), erst dann das Menue schliessen.
      ["📷 Foto" + (eig ? " ersetzen" : " aufnehmen oder wählen"), (melde, schliessen) => { fotoWaehlen(e, eig); schliessen(); }],
      eig && ["✖ Foto entfernen", weiter(() => fotoEntfernen(e, eig))],
    ],
    // v6.16: Loeschen auch direkt im Menue (wie bisher ueber Bearbeiten oder Markieren), mit Rueckfrage und Rueckgaengig
    gefahr: [["🗑 Löschen", weiter(() => mehrLoeschen([e.id], false))]],
  }, () => document.removeEventListener("vorrat-bild", bildDazu));
}

// Inhaltsstoffe je EAN, einmal je App-Start geholt; offline wird nicht gemerkt (naechster Tipp versucht es neu).
const offInfo = new Map();
function offDetailsHolen(ean) {
  if (!offInfo.has(ean)) {
    const p = offAbruf(ean, "ingredients_text_de,ingredients_text,allergens_tags,additives_tags,nutriscore_grade,nutriments,product_quantity_unit")
      .then(({ j, offline }) => (offline ? { offline } : { d: H.offDetails(j) }));
    offInfo.set(ean, p);
    p.then((x) => { if (x.offline) offInfo.delete(ean); });
  }
  return offInfo.get(ean);
}
function infoTeil(d) {
  if (!d) return [el("p", { className: "klein" }, "Open Food Facts hat zu diesem Produkt keine Angaben.")];
  const abschnitt = (titel, ...inhalt) => [el("h3", null, titel), ...inhalt];
  return [el("div", { className: "info" },
    d.nutri && el("p", null, el("b", { className: "nutri n" + d.nutri }, "Nutri-Score " + d.nutri)),
    d.allergene.length > 0 && abschnitt("Allergene", el("p", null, d.allergene.join(", "))),
    d.zusatz.length > 0 && abschnitt("Zusatzstoffe", el("p", null, d.zusatz.join(", "))),
    d.zutaten && abschnitt("Zutaten", el("p", { className: "klein" }, d.zutaten)),
    d.naehrwerte.length > 0 && abschnitt("Nährwerte je 100 " + (d.ml ? "ml" : "g"), el("table", null, d.naehrwerte.map(([n, w]) => el("tr", null, el("th", null, n), el("td", null, w))))),
    el("p", { className: "klein" }, "Quelle: Open Food Facts (von Freiwilligen gepflegt, bitte mit der Packung vergleichen)."))];
}

// ==== v6 Abschnitt B: eigenes Foto ====
// Schluessel: Code, sonst Name (Entscheidung 4). Ohne capture-Attribut bietet Android Kamera UND Galerie an.
// Ersetzen trifft den Schluessel des angezeigten Fotos, sonst gilt Code vor Name (Review v6 B #4).
const fotoZiel = (e, s) => (s.startsWith("n:") ? "„" + kuerze(e.name, 30) + "“" : H.codeText(s));
const fotoReichweite = (e, s) => "Foto für alle " + (s.startsWith("n:") ? "" : "Packungen mit ") + fotoZiel(e, s) + " – auf beiden Handys";
function fotoWaehlen(e, eig) {
  const wahl = el("input", { type: "file", accept: "image/*" });
  wahl.addEventListener("change", () => { if (wahl.files && wahl.files[0]) fotoVorschau(e, eig ? eig.schluessel : e.code || Modell.namensSchluessel(e.name), wahl.files[0]); });
  wahl.click();
}
async function fotoVorschau(e, schluessel, datei) {
  if (!schluessel) return hinweis("Für diesen Namen geht kein Foto (zu lang).");
  if (datei.size > 25 * 1024 * 1024) return hinweis("Foto zu groß (über 25 MB).");
  // ponytail: dekodiert in voller Groesse (12 MP ~ 50 MB Arbeitsspeicher); verkleinert dekodieren, falls der Handytest stockt (R2 #15)
  const blob = await Bilder.normalisieren(datei); // 400 x 400 aus der Mitte, neu als JPEG -> Ort/Kamera-Daten weg
  if (!blob) return hinweis("Foto nicht lesbar (nur JPEG/PNG, höchstens 8000 Pixel Kante).");
  const url = URL.createObjectURL(blob);
  dialog("Foto übernehmen?", [
    el("img", { src: url, alt: "Vorschau des Ausschnitts", className: "vorschau" }),
    el("p", { className: "klein" }, fotoReichweite(e, schluessel) + ". So wird es gespeichert – bitte prüfen, dass nichts Persönliches zu sehen ist."),
  ], [["Übernehmen", async (melde, schliessen) => { if (await fotoUebernehmen(schluessel, blob, melde)) schliessen(); }]],
  () => URL.revokeObjectURL(url));
}
// Erst die Datei, dann der Vorgang (Bauplan Stufe 2). Scheitert der Vorgang, kommt die Datei wieder weg.
async function fotoUebernehmen(schluessel, blob, melde) {
  if (!stand) { melde("Daten nicht geladen – nichts geändert."); return false; }
  const datei = fotoName(), vorher = stand.fotoVon.get(schluessel);
  if (!(await Bilder.fotoSpeichern(datei, blob))) { melde("⚠ Foto nicht gespeichert (Speicher voll?). Nichts geändert."); return false; }
  urlSetzen(fotoUrls, datei, blob); // vor tun(): dessen Neuzeichnen findet das Foto schon (Review v6 B #6)
  if (!(await tun([H.fotoSchritt(stand ? stand.bilder : [], schluessel, datei)]))) { fotoUrlWeg(datei); await Bilder.fotoLoeschen(datei); return false; }
  if (vorher) fotoUrlWeg(vorher);
  untenZeigen("Foto gespeichert");
  return true;
}
async function fotoEntfernen(e, eig) {
  if (!confirm("Foto für " + fotoZiel(e, eig.schluessel) + " entfernen?\n\nGilt auf beiden Handys. Danach zeigt die App wieder das Internetbild, falls es eins gibt. Kein Rückgängig.")) return;
  const jetzt = stand && stand.fotoVon.get(eig.schluessel);
  if (!jetzt) return hinweis("Das Foto ist schon entfernt.");
  if (await tun(H.fotoWegSchritte(stand.bilder, eig.schluessel))) { fotoUrlWeg(jetzt); untenZeigen("Foto entfernt"); }
}

// Bring-Kachel. Farbe nach Haltbarkeit; ohne Datum neutral.
function kachel(e, kurz, lang, ziehbar) {
  const st = Modell.stufe(e.ablauf, Modell.heuteIso());
  const k = el("button", { className: "kachel" + (st === "rot" || st === "gelb" ? " " + st : "") + (e.bestandPruefen ? " pruefen" : "") },
    el("span", { className: "bild" }, bildOder(e.code, e.name, e.symbol || H.bildchen(e.name))),
    el("span", { className: "name" }, e.name),
    e.menge >= 2 && el("span", { className: "zahl" }, "×" + e.menge),
    el("span", { className: "datum" }, H.kurzDatum(e)),
    (e.bestandPruefen || e.ortKlaeren) && el("span", { className: "marke" }, e.bestandPruefen ? "Bestand prüfen" : "Ort klären"));
  druck(k, kurz, lang, ziehbar ? zugStart(e) : null);
  return k;
}

// Entscheidung 11: -1 ohne Rueckfrage, Leiste mit Rueckgaengig (= Gegenvorgang +1). Seit v5 aus dem Menue.
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
  const es = imFach(id).sort(nachAblauf);
  // v6.2 (Tobias 16.11.): lange druecken = markieren, dann weitere antippen. Markieren ist eine eigene Ebene
  // (Android-Zurueck / "Fertig" hebt sie auf). Markiert bleibt nur, was noch hier liegt.
  const m = ebene.markiert;
  if (m) { const da = new Set(es.map((e) => e.id)); for (const x of m) if (!da.has(x)) m.delete(x); }
  const umschalten = (e) => {
    if (!m.delete(e.id)) m.add(e.id);
    if (m.size) zeichnen(); else zurueck();
  };
  const h = m ? hilfe("markieren", "Antippen = markieren oder abwählen · Zurück = fertig")
    : hilfe("fach", "Antippen = Menü (−1, bearbeiten, verschieben) · lange drücken = markieren, dann weitere antippen · gedrückt halten und ziehen = auf ein anderes Fach legen");
  return [
    kopf(f.name, h.knopf, !m && el("button", { className: "neben", onclick: () => fachMenue(f) }, "⋯ " + fachArt(f, o))),
    h.text,
    el("p", { className: "unterzeile" }, f.ortKlaeren ? "ohne gültigen Platz (Ort klären)" : o.name + " · " + platzName(o, f.lage.reihe, f.lage.spalte)),
    m && el("div", { className: "knoepfe markleiste", role: "status" },
      el("b", null, m.size + " markiert"),
      el("button", { onclick: () => verschiebenDialog([...m], id, sachenText(m.size) + " verschieben nach …", undefined, 2) }, "↦ Verschieben"), // 2 = Dialog + Markier-Ebene
      el("button", { className: "gefahr", onclick: () => mehrLoeschen([...m]) }, "🗑 Löschen"),
      m.size < es.length && el("button", { className: "neben", onclick: () => { for (const e of es) m.add(e.id); zeichnen(); } }, "Alle"),
      el("button", { className: "neben", onclick: () => zurueck() }, "Fertig")),
    el("div", { className: "kacheln" }, es.map((e) => {
      const t = () => umschalten(e);
      const k = m ? kachel(e, t, t, false) : kachel(e, () => eintragMenue(e), () => oeffne({ art: "fach", id, markiert: new Set([e.id]) }), true);
      if (m) { k.classList.toggle("markiert", m.has(e.id)); k.setAttribute("aria-pressed", String(m.has(e.id))); }
      if (e.id === hervor) {
        k.classList.add("hervor");
        // nur beim ersten Zeichnen hinscrollen, sonst springt die Ansicht nach jedem -1 zurueck
        if (!ebene.gescrollt) { ebene.gescrollt = true; requestAnimationFrame(() => k.scrollIntoView({ block: "center", behavior: "smooth" })); }
      }
      return k;
    }),
      ...(m ? [] : [
        el("button", { className: "kachel neu", onclick: () => eintragDialog(null, id) }, el("span", { className: "bild" }, "+"), el("span", { className: "name" }, "Neu")),
        el("button", { className: "kachel neu", onclick: () => multiScan(id) }, el("span", { className: "bild" }, "📷"), el("span", { className: "name" }, "Scannen"))])),
  ];
}


function ortKlaerenAnsicht() {
  const { kisten, eintraege } = klaeren();
  return [kopf("Ort klären"),
    el("p", { className: "klein" }, "Diese Sachen haben keinen gültigen Platz. Antippen und Platz wählen."),
    kisten.map((f) => el("button", { className: "zeile", onclick: () => fachMenue(f) }, "📦 " + fachWort(ortVon(f.lage.ort)) + " „" + f.name + "“: Platz wählen oder löschen")),
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
      (await fotoText()) + "OneDrive bleibt unangetastet. Danach startet das Gerät mit neuer Kennung.")) return;
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
// weg (optional) laeuft beim Schliessen; zu = Beschriftung des Schliessen-Knopfs.
// Rueckgabe { melde, schliessen } fuer Dialoge, die von aussen schliessen.
function dialog(titel, inhalt, knoepfe, weg, zu = "Abbrechen") {
  return blatt(titel, inhalt, (k, schliessKnopf) => [el("div", { className: "knoepfe" }, knoepfe.filter(Boolean).map((x) => k(x)), schliessKnopf(zu))], weg);
}
// v6.16 (Tobias 18.11., Knoepfe uebersichtlicher): Menue = haeufige Aktionen gross oben nebeneinander, Rest als Liste
// mit Symbolen, Gefahr (Loeschen) rot, abgesetzt, ganz unten. Schliessen = ✕ oben rechts (und Zurueck/Escape wie bisher).
// teile = { oben, liste, gefahr }: je Liste von [text, fn] oder falsch (faellt weg), siehe H.menueTeile.
function menue(titel, inhalt, teile, weg) {
  const t = H.menueTeile(teile);
  return blatt(titel, inhalt, (k, schliessKnopf) => [
    t.oben.length > 0 && el("div", { className: "menueoben" }, t.oben.map((x) => k(x, "gross"))),
    t.liste.length > 0 && el("div", { className: "menueliste" }, t.liste.map((x) => k(x, "zeile"))),
    t.gefahr.length > 0 && el("div", { className: "menuegefahr" }, t.gefahr.map((x) => k(x, "gefahr zeile"))),
  ], weg, (schliessKnopf) => schliessKnopf("✕", "schliessen", "Schließen"));
}
// Gemeinsamer Rahmen fuer dialog() und menue(). rumpf(k, schliessKnopf) baut die Knoepfe; titelZusatz kommt neben den Titel.
function blatt(titel, inhalt, rumpf, weg, titelZusatz) {
  const meldung = el("p", { className: "meldung", role: "alert" });
  const melde = (t) => { meldung.textContent = t; };
  const ebene = { weg };
  const schliessen = (n) => { if (stapel[stapel.length - 1] === ebene) { ebene.zu = true; zurueck(n); } };
  // Doppeltipp: solange eine Knopf-Aktion laeuft, zaehlt kein Knopf dieses Dialogs (Review v6 B #3, Simplify).
  const k = ([text, fn, klasse], extra) => el("button", { className: [klasse, extra].filter(Boolean).join(" "), onclick: async () => {
    if (ebene.zu || ebene.laeuft) return;
    ebene.laeuft = true;
    try { await fn(melde, schliessen); } finally { ebene.laeuft = false; }
  } }, text);
  const schliessKnopf = (text, klasse = "zweit", aria) => el("button", { className: klasse, "aria-label": aria || text, onclick: () => schliessen() }, text);
  const kopfZeile = titelZusatz ? el("div", { className: "fensterkopf" }, el("h2", null, titel), titelZusatz(schliessKnopf)) : el("h2", null, titel);
  ebene.el = el("div", { className: "blatt" }, el("div", { className: "fenster" }, kopfZeile, inhalt, meldung, rumpf(k, schliessKnopf)));
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
// Ein Abruf fuer alle OFF-Fragen: { j } = Antwort, { j: null } = Produkt unbekannt (404),
// { offline } = kein Netz, Zeitgrenze oder Serverfehler (spaeter nochmal, nie als "keine Angaben" merken).
async function offAbruf(ean, felder) {
  if (navigator.onLine === false) return { offline: true };
  try {
    const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(ean) + ".json?fields=" + felder,
      { signal: AbortSignal.timeout(8000), credentials: "omit", referrerPolicy: "no-referrer" });
    if (r.status === 404) return { j: null };
    return r.ok ? { j: await r.json() } : { offline: true };
  } catch (_) { return { offline: true }; }
}
async function offSuchen(ean) {
  const { j, offline } = await offAbruf(ean, "product_name,product_name_de,brands,image_front_url");
  return offline ? { name: null, offline: true } : { name: H.offName(j), bild: H.offBild(j) };
}

// ==== v6 Abschnitt A: Produktbilder (Internetbild je GTIN, Speicher in bilder.js) ====
// bildFuer(code) antwortet sofort (blob:-Adresse oder null) und stoesst das Laden an: erst Bild-Speicher, dann
// einmal je App-Start und Code Open Food Facts, hoechstens 2 Netzabrufe gleichzeitig. PZN nie ans Netz (Codex #13).
const bildUrls = new Map();  // code -> blob:-Adresse | null (gesucht/laeuft/keins)
const bildNetz = new Set();  // Codes, fuer die in dieser Sitzung schon im Netz gesucht wurde
const bildSchlange = [];
let bildNetzLaeuft = 0, bildZeichnenUhr = null, bildGen = 0;
const bildSpaeter = new Set(); // offline gescheitert -> beim naechsten "online" erneut (Review v6 A #4)
addEventListener("online", () => {
  for (const c of bildSpaeter) { bildNetz.delete(c); bildUrls.delete(c); }
  if (bildSpaeter.size) { bildSpaeter.clear(); zeichnen(); }
});
const offTauglich = (code) => typeof code === "string" && code.startsWith("gtin:");
function bildFuer(code) {
  if (!offTauglich(code)) return null;
  if (bildUrls.has(code)) return bildUrls.get(code);
  bildUrls.set(code, null);
  bildLaden(code, null);
  return null;
}
// Adresse schon bekannt (Produkt-Antwort beim Scannen): spart den zweiten Abruf.
function bildMitUrl(code, url) {
  if (!offTauglich(code) || !url || bildUrls.get(code)) return;
  bildUrls.set(code, null);
  bildLaden(code, url);
}
async function bildLaden(code, url) {
  const gespeichert = await Bilder.offLesen(code);
  if (gespeichert) return bildDa(code, gespeichert);
  if (bildNetz.has(code)) return;
  bildNetz.add(code);
  bildSchlange.push([code, url]);
  bildWeiter();
}
function bildWeiter() {
  while (bildNetzLaeuft < 2 && bildSchlange.length) {
    const [code, url] = bildSchlange.shift();
    const gen = bildGen;
    bildNetzLaeuft++;
    (async () => {
      try {
        if (navigator.onLine === false) { bildSpaeter.add(code); return; }
        const r = url ? null : await offSuchen(code.slice(5));
        if (r && r.offline) { bildSpaeter.add(code); return; }
        const u = url || r.bild;
        const blob = u ? await Bilder.offLaden(u) : null;
        if (gen !== bildGen) return; // inzwischen "Geraetedaten loeschen": nichts mehr schreiben (Review v6 A #3)
        if (blob) { await Bilder.offSchreiben(code, blob); bildDa(code, blob); }
      } catch (_) { /* kein Bild */ } finally { bildNetzLaeuft--; bildWeiter(); }
    })();
  }
}
const bildDa = (code, blob) => urlSetzen(bildUrls, code, blob);
function urlSetzen(karte, k, blob) {
  const alt = karte.get(k);
  if (alt) URL.revokeObjectURL(alt);
  karte.set(k, URL.createObjectURL(blob));
  bildNeuZeichnen();
}
function bildNeuZeichnen() {
  document.dispatchEvent(new Event("vorrat-bild"));
  clearTimeout(bildZeichnenUhr);
  bildZeichnenUhr = setTimeout(zeichnen, 150); // mehrere Bilder kurz nacheinander = einmal neu zeichnen
}
// v6 B: eigene Fotos (Speicher "fotos"). Dateien sind unveraenderlich -> einmal laden reicht.
// datei -> blob:-Adresse | null (laedt) | false (liegt nicht auf diesem Geraet, z. B. vom anderen Handy, Abschnitt C)
const fotoUrls = new Map();
function fotoFuer(datei) {
  if (fotoUrls.has(datei)) return fotoUrls.get(datei);
  fotoUrls.set(datei, null);
  const gen = bildGen;
  Bilder.fotoLesen(datei).then((b) => {
    if (gen !== bildGen) return;
    if (b) urlSetzen(fotoUrls, datei, b);
    else { fotoUrls.set(datei, false); bildNeuZeichnen(); } // dann das Internetbild versuchen (Review v6 B #2)
  });
  return null;
}
function fotoUrlWeg(datei) { const u = fotoUrls.get(datei); if (u) URL.revokeObjectURL(u); fotoUrls.delete(datei); }
const fotoName = () => "foto-" + Modell.neueInstallationsId() + ".jpg"; // Zufall, nie wiederverwendet (R2 #5)
// Bild fuer Kachel/Zeile: eigenes Foto (Code, dann Name) -> Internetbild (Code) -> Bildchen (R2 #7).
function bildOder(code, name, ersatz) {
  const eig = stand && H.eigenesFoto(stand.fotoVon, code, name);
  let u = eig ? fotoFuer(eig.datei) : false;
  if (u === null) return ersatz; // laedt gerade (Millisekunden): nicht kurz das Internetbild zeigen
  if (u === false) u = code ? bildFuer(code) : null;
  return u ? el("img", { src: u, alt: "", className: "foto", draggable: false }) : ersatz;
}

// Kamera + BarcodeDetector. fertig(ergebnis von H.leseCode/codeAusEingabe) nur bei einem brauchbaren Code.
// Die Kamera wird bei Treffer, Abbrechen, Android-Zurueck, App im Hintergrund und Fehler gestoppt (stopp()).
// Den Rohwert (kann eine Seriennummer enthalten) zeigt, speichert und protokolliert die App nie.
// Gegen Falschlesungen (Tobias 15.11.: 4 Packungen gescannt, 5 in der Liste, 2 davon unbekannt): ein Code zaehlt erst,
// wenn er in BESTAETIGT Bildern hintereinander gleich gelesen wurde; danach erst wieder nach einer Luecke.
// mehr (v5 Multiscan): { unten } = Element unter dem Kamerabild. Dann bleibt der Dialog offen, jeder bestaetigte Code
// geht an fertig(c, vonHand); fertig liefert false, wenn er nicht gezaehlt wurde (dann kein Brummen).
const SCAN_FORMATE = ["ean_13", "ean_8", "upc_a", "data_matrix"];
const BESTAETIGT = 3;
const codeKey = (c) => c.schluessel + "|" + (c.mhd || ""); // DataMatrix mit anderem Verfall = andere Packung
function scanDialog(fertig, mehr) {
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
  let folge = new Map(); // Code -> Zahl der Bilder in Folge, in denen er gelesen wurde
  const d = dialog(mehr ? "Mehrere scannen" : "Scannen", [video, status, mehr && mehr.unten, feld("oder Code eintippen", eingabe)], [["Code übernehmen", (melde) => {
    const c = H.codeAusEingabe(eingabe.value);
    if (!c) return melde("Kein gültiger EAN- oder PZN-Code (Prüfziffer?)");
    if (!mehr) return nimm(c);
    melde("");
    eingabe.value = "";
    fertig(c, true);
  }]], stopp, mehr ? "Fertig → Liste" : "Abbrechen");
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
    status.textContent = "Strichcode oder DataMatrix-Code ins Bild halten …" + (mehr ? " Jeder Code zählt einmal, weitere gleiche Packungen: Knopf „+1 gleiche Packung“." : "");
    const suchen = async () => {
      if (aus) return;
      try {
        if (video.readyState >= 2) {
          const treffer = await erkenner.detect(video);
          if (aus) return;
          let gelesen = false;
          const neu = new Map();
          for (const t of treffer) {
            const c = H.leseCode(t.rawValue, t.format);
            if (!c) continue;
            gelesen = true;
            const k = codeKey(c);
            if (neu.has(k)) continue;
            const n = (folge.get(k) || 0) + 1;
            neu.set(k, n);
            if (n !== BESTAETIGT) continue; // genau einmal je ununterbrochener Folge
            if (!mehr) { if (navigator.vibrate) navigator.vibrate(60); return nimm(c); }
            if (fertig(c, false) !== false && navigator.vibrate) navigator.vibrate(60);
          }
          folge = neu;
          if (treffer.length && !gelesen) status.textContent = "Code gesehen, aber nicht lesbar (kein EAN/PZN) – weiter halten oder eintippen.";
        }
      } catch (_) { /* einzelnes Bild nicht auswertbar: weiter */ }
      if (!aus) uhr = setTimeout(suchen, 200);
    };
    suchen();
  })();
}

// ==== v5: Multiscan (Tobias 15.11.) ====
// MHD-Wahl fuer Multiscan und Eintrag-Dialog (Offen 21: eine Funktion statt zwei). Monat antippen (naechstes passendes
// Jahr, bis das Jahr von Hand gewaehlt ist), "kein MHD". geaendert(mhd) bei jeder Wahl. Ein genaues Datum (DataMatrix)
// wird angezeigt, ein Monat ersetzt es. mitDatum: zusaetzlich Feld "oder genaues Datum" (Eintrag-Dialog).
// Rueckgabe: das Element; .setzen(mhd, jahrHand) setzt von aussen (Scan), Jahr folgt dem MHD.
function mhdWahl(start, geaendert, mitDatum) {
  const heute = Modell.heuteIso();
  let mhd = start || null, jahr = (H.mhdTeile(mhd) || { jahr: Number(heute.slice(0, 4)) }).jahr, jahrHand = !!mhd;
  const anz = el("b"), jahrAnz = el("b"), monate = el("div", { className: "monate" });
  const genau = mitDatum && el("input", { type: "date", value: mhd && mhd.length === 10 ? mhd : "" });
  const setze = (m) => { mhd = m; if (genau) genau.value = m && m.length === 10 ? m : ""; zeigen(); geaendert(mhd); };
  const zeigen = () => {
    const t = mhd && mhd.length === 7 ? H.mhdTeile(mhd) : null;
    anz.textContent = mhd ? H.deDatum(mhd) : "kein MHD";
    jahrAnz.textContent = String(jahr);
    monate.replaceChildren(...MONATE.map((m, i) => el("button", { type: "button", className: t && t.jahr === jahr && t.monat === i + 1 ? "an" : "",
      onclick: () => { if (!jahrHand) jahr = H.mhdJahr(i + 1, heute); setze(H.mhdMonat(jahr, i + 1)); } }, m)));
  };
  const jahrKnopf = (d, t) => el("button", { type: "button", onclick: () => {
    jahr += d; jahrHand = true;
    if (mhd && mhd.length === 7) setze(H.mhdMonat(jahr, H.mhdTeile(mhd).monat)); else zeigen();
  } }, t);
  if (genau) genau.addEventListener("change", () => { if (genau.value) { jahr = Number(genau.value.slice(0, 4)); jahrHand = true; } setze(genau.value || null); });
  zeigen();
  const anzeige = el("div", { className: "feld" }, el("span", null, "MHD"), anz);
  const keins = el("button", { type: "button", className: "zweit", onclick: () => setze(null) }, "kein MHD");
  const jahrZeile = el("div", { className: "jahr" }, jahrKnopf(-1, "‹"), jahrAnz, jahrKnopf(1, "›"));
  const teil = genau ? el("div", null, anzeige, jahrZeile, monate, el("div", { className: "zeilen" }, feld("oder genaues Datum", genau), keins))
    : el("div", null, el("div", { className: "zeilen mhdkopf" }, anzeige, keins), jahrZeile, monate);
  teil.setzen = (m, hand) => { if (m) jahr = Number(m.slice(0, 4)); jahrHand = hand; setze(m); };
  return teil;
}

// Ablauf: Liste oeffnen, Kamera sofort darueber. Jeder Treffer = eine Packung, darunter gleich die MHD-Wahl fuer
// sie. "Fertig → Liste" zeigt die Tabelle (gleicher Code + MHD = eine Zeile), ein Ziel fuer alle, vorbelegt mit
// dem Fach, aus dem gescannt wird. Eine Zeile antippen = eigenes MHD/Ziel. Gespeichert wird alles in EINEM tun().
// ponytail: neue Eintraege auch wenn im Fach schon dasselbe mit gleichem MHD liegt (wie beim Einzel-Scan);
// Zusammenlegen erst, wenn es stoert.
// alt = gemerkte Liste (v6.21: Entwurf auf dem Geraet).
// v6.21 (Tobias 20.11.: Zurueck-Wischen verlor die Liste): die angefangene Liste liegt auf DIESEM Geraet
// (localStorage), bis "Alle speichern" oder "Liste verwerfen". Nie in OneDrive, nie im Bestand.
const ENTWURF_KEY = "vorrat-scanliste";
const textMap = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([, v]) => typeof v === "string"));
function entwurfLesen() {
  try {
    const e = JSON.parse(localStorage.getItem(ENTWURF_KEY) || "null");
    if (!e || !Array.isArray(e.pakete)) return null;
    const pakete = e.pakete.filter((p) => p && typeof p.schluessel === "string")
      .map((p) => ({ schluessel: p.schluessel, mhd: typeof p.mhd === "string" ? p.mhd : null, codeMhd: !!p.codeMhd && typeof p.mhd === "string",
        code: typeof p.code === "string" ? p.code : undefined, fach: typeof p.fach === "string" ? p.fach : undefined }));
    return pakete.length ? { pakete, namen: textMap(e.namen), notiz: textMap(e.notiz), ziel: typeof e.ziel === "string" ? e.ziel : null } : null;
  } catch (_) { return null; }
}
const entwurfWeg = () => { try { localStorage.removeItem(ENTWURF_KEY); } catch (_) { /* gesperrt */ } };
const istHand = (s) => s.startsWith("hand:"); // v6.21: Zeile ohne Code (von Hand)
const packText = (n) => n + (n === 1 ? " Packung" : " Packungen");

function multiScan(fachId, alt) {
  if (!alt) { // v6.21: angefangene Liste? erst fragen
    const e = entwurfLesen();
    if (e) return dialog("Angefangene Liste", [el("p", null, packText(e.pakete.length) + " gescannt, noch nicht gespeichert.")], [
      ["Weitermachen", weiter(() => multiScan(fachId, e))],
      ["Verwerfen, neu scannen", weiter(() => { entwurfWeg(); multiScan(fachId); }), "gefahr"],
    ]);
  }
  const pakete = alt ? alt.pakete : [];  // { schluessel, mhd, fach?, code? } je Packung; ohne Code: schluessel "hand:…"
  const namen = alt ? alt.namen : {}, notiz = alt ? alt.notiz : {}; // je Code: Name, Hinweis (sucht/unbekannt/offline)
  for (const s in notiz) if (notiz[s] === "suche Namen …") delete notiz[s]; // Suche lief beim Merken noch: neu erlauben
  let gespeichert = false, zu = false; // zu: Liste geschlossen -> spaete Namenssuche schreibt den Entwurf nicht mehr (Review v6.21 #1)
  const ziel = zielWahl((alt && alt.ziel) || fachId || null, " (hier)");
  const merken = () => {
    if (gespeichert || zu) return;
    if (!pakete.length) return entwurfWeg();
    try { localStorage.setItem(ENTWURF_KEY, JSON.stringify({ pakete, namen, notiz, ziel: ziel.wert() || null })); } catch (_) { /* voll: nur nicht gemerkt */ }
  };
  const tabelle = el("div", { className: "mliste" });
  const kopfAnz = el("p", { className: "klein" });
  const zeilen = () => H.paketeZeilen(pakete);

  function render() {
    const zs = zeilen();
    kopfAnz.textContent = pakete.length ? pakete.length + (pakete.length === 1 ? " Packung" : " Packungen") + " in " + zs.length + (zs.length === 1 ? " Zeile" : " Zeilen") : "";
    tabelle.replaceChildren(...(zs.length ? zs.map(zeile) : [el("p", { className: "klein" }, "Noch nichts gescannt.")]));
    merken();
  }
  // Ohne Neuzeichnen, damit ein Feld, in dem gerade getippt wird, den Fokus behaelt.
  const nameSetzen = (s, n) => {
    namen[s] = n;
    merken();
    for (const i of tabelle.querySelectorAll("input[data-schl]")) if (i.dataset.schl === s) {
      if (i.value !== n) i.value = n;
      i.closest(".mzeile").classList.toggle("ohnename", !n.trim());
    }
  };

  function zeile(z) {
    const s = z.schluessel;
    const gruppe = () => z.pakete;
    const name = el("input", { value: namen[s] || "", placeholder: notiz[s] || "Name eintippen", maxLength: 100, autocomplete: "off", "data-schl": s,
      "aria-label": "Name", oninput: () => nameSetzen(s, name.value) });
    const minus = () => { const g = gruppe(); pakete.splice(pakete.lastIndexOf(g[g.length - 1]), 1); render(); };
    const plus = () => { if (z.menge < 999) { pakete.push(Object.assign({}, gruppe()[0])); render(); } };
    return el("div", { className: "mzeile" + ((namen[s] || "").trim() ? "" : " ohnename") },
      el("span", { className: "bild", "aria-hidden": "true" }, bildOder(istHand(s) ? null : s, namen[s], H.bildchen(namen[s] || ""))), name,
      el("button", { type: "button", className: "mdetail", onclick: () => zeileDialog(z, gruppe) },
        (z.mhd ? "MHD " + H.deDatum(z.mhd) : "kein MHD") + (z.fach ? " · " + fachText(z.fach) : "") + " ✎"),
      el("div", { className: "plusminus" }, el("button", { type: "button", "aria-label": "eins weniger", onclick: minus }, "−"),
        el("b", null, String(z.menge)), el("button", { type: "button", "aria-label": "eins mehr", onclick: plus }, "+")));
  }

  // Eine Zeile: eigenes MHD und Ziel (gilt fuer alle ihre Packungen), oder ganz entfernen.
  function zeileDialog(z, gruppe) {
    let mhd = z.mhd;
    const w = mhdWahl(mhd, (m) => { mhd = m; });
    const zw = zielWahl(z.fach || ziel.wert() || null, " (gewählt)");
    dialog((namen[z.schluessel] || "Zeile") + " · " + z.menge + " Stück", [w, el("h3", null, "Speichern in"), zw.teil], [
      ["Übernehmen", (melde, schliessen) => {
        const f = zw.wert();
        if (f === "") return melde("Dieser Ort hat noch keine Kiste.");
        for (const p of gruppe()) { p.mhd = mhd; p.fach = f || undefined; }
        schliessen(); render();
      }],
      ["Zeile entfernen", (melde, schliessen) => { for (const p of gruppe()) pakete.splice(pakete.indexOf(p), 1); schliessen(); render(); }, "gefahr"],
    ]);
  }

  async function nameSuchen(c) {
    const s = c.schluessel;
    if (s in namen || s in notiz) return; // schon bekannt oder Suche laeuft
    const gemerkt = codeName(s);
    if (gemerkt) { bildFuer(s); return nameSetzen(s, gemerkt); } // gemerkter Name: Bild trotzdem holen (Bauplan B3)
    if (!c.ean) { notiz[s] = c.anzeige + " · Name eintippen, wird gemerkt"; return; }
    notiz[s] = "suche Namen …";
    const r = await offSuchen(c.ean);
    if (r.bild) bildMitUrl(s, r.bild);
    // Code-Nummer mit anzeigen: so laesst sich mit der Packung vergleichen, ob die Kamera sich verlesen hat
    notiz[s] = r.name ? c.anzeige : c.anzeige + " · " + (r.offline ? "offline" : "unbekannt") + ", Name eintippen";
    for (const i of tabelle.querySelectorAll("input[data-schl]")) if (i.dataset.schl === s) i.placeholder = notiz[s];
    if (r.name && !namen[s]) nameSetzen(s, r.name);
    zuletztName();
  }

  // Kamera-Dialog: unter dem Bild die zuletzt gescannte Packung mit MHD-Wahl.
  const unten = el("div", { className: "zuletzt" });
  const nameAnz = el("p");
  const wiederAnz = el("p", { className: "hinweis-rot", hidden: true }, "Schon in der Liste. Noch eine Packung? → „+1 gleiche Packung“ oder „+1 anderes MHD“");
  const woAnz = el("p", { className: "klein woschon", hidden: true }); // v6.21 (Tobias 20.11.): wo liegt dasselbe schon? Nur Hinweis
  let letzte = null;
  // Gleiche Packung nochmal (Tobias 15.11.): nie von selbst, nur per Knopf. Neue Packung = Kopie samt MHD, eigene MHD-Wahl.
  // v6.21: "+1 anderes MHD" = Kopie ohne MHD, die MHD-Wahl darunter gilt dann fuer sie (eigene Zeile).
  const plusEins = (ohneMhd) => {
    if (!letzte || !pakete.includes(letzte)) return;
    if (pakete.filter((p) => p.code === letzte.code).length >= 999) return; // Review #4: wie das + in der Liste
    letzte = Object.assign({}, letzte);
    if (ohneMhd) letzte.mhd = null;
    pakete.push(letzte);
    wiederAnz.hidden = true;
    render(); zuletztZeigen();
  };
  const plusKnopf = el("button", { type: "button", className: "an", onclick: () => plusEins(false) }, "+1 gleiche Packung");
  const plusAnders = el("button", { type: "button", className: "zweit", onclick: () => plusEins(true) }, "+1 anderes MHD");
  const zuletztName = () => {
    if (!letzte) return;
    const n = pakete.filter((x) => x.schluessel === letzte.schluessel).length;
    nameAnz.replaceChildren("✓ ", el("b", null, namen[letzte.schluessel] || notiz[letzte.schluessel] || "…"), n > 1 ? " (" + n + "×)" : "", " · insgesamt " + pakete.length);
    const wo = H.woSchon(stand ? stand.eintraege : [], letzte.schluessel, namen[letzte.schluessel], fachGueltig);
    woAnz.textContent = wo.length ? "Schon im Vorrat: " + wo.map((x) => (x.fach ? fachText(x.fach) : "Ort klären") + " (" + x.menge + ")").join(" · ") : "";
    woAnz.hidden = !wo.length;
  };
  function zuletztZeigen() {
    if (letzte && !pakete.includes(letzte)) letzte = null; // in der Liste entfernt
    if (!letzte) return unten.replaceChildren(el("p", { className: "klein" }, "Noch nichts gescannt."));
    const p = letzte;
    zuletztName();
    unten.replaceChildren(nameAnz, woAnz, wiederAnz, el("div", { className: "zeilen" }, plusKnopf, !p.codeMhd && plusAnders),
      p.codeMhd ? el("p", { className: "klein" }, "MHD aus dem Code: " + H.deDatum(p.mhd)) : mhdWahl(p.mhd, (m) => { p.mhd = m; render(); }));
  }
  // Kamera: ein Code, der schon in der Liste steht, zaehlt nicht nochmal (lange draufgehalten, kurz verloren, zwei
  // Packungen im Bild). Er wird nur "aktuell", damit +1 auf IHN wirkt. Eingetippt zaehlt immer.
  function treffer(c, vonHand) {
    const code = codeKey(c);
    const schon = !vonHand && pakete.findLast((p) => p.code === code);
    if (schon) {
      if (letzte !== schon) { letzte = schon; zuletztZeigen(); }
      wiederAnz.hidden = false;
      return false;
    }
    wiederAnz.hidden = true;
    // Spaeter nochmal dieselbe: MHD der vorigen gleichen uebernehmen (meist zusammen gekauft); sichtbar und aenderbar.
    const vorige = c.mhd ? null : pakete.findLast((p) => p.schluessel === c.schluessel);
    letzte = { schluessel: c.schluessel, mhd: c.mhd || (vorige ? vorige.mhd : null), codeMhd: !!c.mhd, code };
    pakete.push(letzte);
    nameSuchen(c);
    render(); zuletztZeigen();
  }
  const scannen = () => { wiederAnz.hidden = true; zuletztZeigen(); scanDialog(treffer, { unten }); };

  async function speichern(melde, schliessen) {
    const zs = zeilen();
    if (!zs.length) return melde("Noch nichts gescannt.");
    const alle = ziel.wert(), daten = [];
    for (const z of zs) {
      const fach = z.fach || alle;
      const name = (namen[z.schluessel] || "").trim();
      if (!name) return melde("Bitte alle Namen eintragen (rot markiert).");
      if (fach === undefined) return melde("Bitte unten Ort und Fach wählen.");
      if (fach === "") return melde("Dieser Ort hat noch keine Kiste.");
      if (!fachGueltig(fach)) return melde("Das Fach für „" + name + "“ gibt es nicht mehr – bitte neu wählen.");
      if (z.menge > 999) return melde(name + ": höchstens 999 Stück");
      const werte = { name, symbol: H.bildchen(name), mhd: z.mhd, eingefroren: null, frist: null, fach, code: z.schluessel }; // v6: Schluessel, nie paket.code (Codex #9)
      if (istHand(z.schluessel)) delete werte.code; // v6.21 ohne Code: kein Feld (wie eintragDialog, Review v6 A #6)
      const fe = H.pruefe("eintrag", werte); // UGC #86: vor dem Vorgang pruefen
      if (fe) return melde(name + ": " + fe);
      daten.push({ typ: "neu", art: "eintrag", werte, menge: z.menge });
    }
    if (!(await tun(daten))) return; // Fehler: Entwurf bleibt liegen
    gespeichert = true;
    entwurfWeg();
    for (const z of zs) if (!istHand(z.schluessel)) codeMerken(z.schluessel, namen[z.schluessel].trim()); // Abschnitt 4: Code -> Name, nur dieses Geraet
    untenZeigen(packText(pakete.length) + " gespeichert");
    schliessen();
  }

  // v6.21 (Tobias 20.11.): Produkt ohne Strichcode in derselben Liste, Name in der Zeile eintippen.
  const handDazu = () => {
    pakete.push({ schluessel: "hand:" + Modell.neueInstallationsId(), mhd: null });
    render();
    const i = [...tabelle.querySelectorAll("input[data-schl]")].at(-1);
    if (i) i.focus();
  };
  const verwerfen = (melde, schliessen) => {
    if (pakete.length && !confirm(packText(pakete.length) + " verwerfen?")) return;
    pakete.length = 0;
    entwurfWeg();
    schliessen();
  };
  dialog("Gescannt", [kopfAnz, tabelle,
    el("div", { className: "zeilen" }, el("button", { type: "button", className: "an weiterscannen", onclick: scannen }, "📷 Weiter scannen"),
      el("button", { type: "button", className: "zweit weiterscannen", onclick: handDazu }, "✎ Ohne Code dazu")),
    el("h3", null, "Speichern in"), ziel.teil], [["Alle speichern", speichern], ["Liste verwerfen", verwerfen, "gefahr"]], () => {
    document.removeEventListener("vorrat-bild", bildNeu);
    merken(); // Ziel kann sich seit dem letzten Merken geaendert haben
    zu = true;
    if (gespeichert || !pakete.length) return;
    untenZeigen(packText(pakete.length) + " gemerkt – beim nächsten 📷 weiter", "Weitermachen", () => { const e = entwurfLesen(); if (e && !dialogOffen()) multiScan(fachId, e); });
  }, "Später weiter");
  tabelle.closest(".fenster").addEventListener("change", merken); // Review #3: Ort/Fach-Wahl sofort merken (App kann im Hintergrund sterben)
  // Bild kam an: Tabelle neu, ausser es wird gerade ein Name getippt (Fokus bliebe sonst nicht stehen)
  const bildNeu = () => { if (!tabelle.contains(document.activeElement)) render(); };
  document.addEventListener("vorrat-bild", bildNeu);
  render();
  if (alt) { // Review #2: Suche lief beim Schliessen noch -> fuer Zeilen ohne Namen neu anstossen
    for (const s of new Set(pakete.map((p) => p.schluessel))) if (!istHand(s) && !namen[s]) nameSuchen({ schluessel: s, ean: s.startsWith("gtin:") ? s.slice(5) : null, anzeige: H.codeText(s) });
    zuletztZeigen();
  } else scannen();
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

  // MHD: Schnellauswahl Monat/Jahr, alternativ genaues Datum (gemeinsame mhdWahl, Offen 21)
  let mhd = e ? e.mhd ?? null : null;
  const mhdTeil = mhdWahl(mhd, (m) => { mhd = m; }, true);

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

  // v6: Strichcode beim Bearbeiten erhalten, neu scannen oder entfernen (Codex #10). Neu: kommt aus dem Scan.
  let codeWert = e ? e.code ?? null : null, codeTeil = null;
  if (e) {
    const anz = el("b"), entf = el("button", { type: "button", className: "zweit", onclick: () => { codeWert = null; codeZeigen(); } }, "entfernen");
    const codeZeigen = () => { anz.textContent = codeWert ? H.codeText(codeWert) : "keiner"; entf.hidden = !codeWert; };
    codeTeil = el("div", { className: "zeilen codezeile" }, el("div", { className: "feld" }, el("span", null, "Strichcode"), anz),
      el("button", { type: "button", onclick: () => scanDialog((c) => { codeWert = c.schluessel; codeZeigen(); bildFuer(codeWert); }) }, "📷 neu scannen"), entf);
    codeZeigen();
  }

  // Scannen (nur beim Neuanlegen): Name aus dem Gedaechtnis oder Open Food Facts, MHD aus DataMatrix.
  let code = null;
  const scanAnz = el("p", { className: "klein", role: "status" });
  const setzeName = (n) => { name.value = n; name.dispatchEvent(new Event("input")); };
  let scanMhd = null, scanName = null; // MHD und Name, die der letzte Scan gesetzt hat
  const scanNameSetzen = (n) => { setzeName(n); scanName = n; };
  async function codeUebernehmen(c) {
    code = c;
    // Codex R2 #5: wie beim MHD - ein Name vom vorigen Scan gehoert nicht zur naechsten Packung (Getipptes bleibt)
    if (scanName !== null && name.value === scanName) setzeName("");
    scanName = null;
    // Codex v4 #4: ein MHD vom vorigen Scan nicht an die naechste Packung vererben (von Hand Geaendertes bleibt)
    if (!c.mhd && scanMhd && mhd === scanMhd) mhdTeil.setzen(null, false);
    scanMhd = c.mhd || null;
    if (c.mhd) { // Verfall aus dem DataMatrix-Code
      frost.checked = false;
      frostZeigen();
      mhdTeil.setzen(c.mhd, true);
    }
    const kennt = c.anzeige + (c.mhd ? " · MHD " + H.deDatum(c.mhd) : "");
    const gemerkt = codeName(c.schluessel);
    if (gemerkt) { bildFuer(c.schluessel); scanNameSetzen(gemerkt); scanAnz.textContent = kennt + " · Name von früher"; return; } // v6: Bild trotzdem holen
    if (!c.ean) { scanAnz.textContent = kennt + " · Name bitte eintippen – wird für diesen Code gemerkt."; name.focus(); return; }
    scanAnz.textContent = kennt + " · suche Namen …";
    const vorher = name.value;
    const r = await offSuchen(c.ean);
    if (r.bild) bildMitUrl(c.schluessel, r.bild);
    if (code !== c) return; // inzwischen anders gescannt
    if (r.name && name.value === vorher) { scanNameSetzen(r.name); scanAnz.textContent = kennt + " · Name aus Open Food Facts, bitte prüfen."; }
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
      eingefroren: fr ? einDatum.value : null, frist: fr ? Number(frist.value) : null, fach,
      code: e ? codeWert : code ? code.schluessel : null }; // v6: Schluessel aus dem Scan, nie das ganze Ergebnis (Codex #9)
    if (!e && !werte.code) delete werte.code; // ohne Scan kein Feld: aeltere Versionen lesen das weiter (Review v6 A #6)
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
    // v6 B (Tobias 16.11.: kopieren statt wandern): hat der alte Name ein Foto und der neue keins, bekommt der neue
    // eine Kopie unter neuem Dateinamen; der alte Name behaelt seins (Bibliothek). Klappt die Kopie nicht: ohne Foto weiter.
    const altS = Modell.namensSchluessel(e.name), neuS = Modell.namensSchluessel(werte.name);
    let kopie = null;
    if (stand && altS !== neuS && neuS && stand.fotoVon.has(altS) && !stand.fotoVon.has(neuS)) {
      const b = await Bilder.fotoLesen(stand.fotoVon.get(altS)), d = fotoName();
      if (b && (await Bilder.fotoSpeichern(d, b))) { kopie = d; daten.push(H.fotoSchritt(stand.bilder, neuS, d)); }
    }
    if (!daten.length || (await tun(daten))) schliessen();
    else if (kopie) await Bilder.fotoLoeschen(kopie);
  }

  dialog(e ? "Bearbeiten" : "Neuer Eintrag", [
    scanTeil,
    el("div", { className: "zeilen" }, feld("Name", name), feld("Bild", symbol)),
    mengeTeil,
    el("label", { className: "schalter" }, frost, "selbst eingefroren"),
    mhdTeil, frostTeil, verschiebenTeil, codeTeil,
  ], [
    ["Speichern", speichern],
    e && ["Löschen", async (melde, schliessen) => {
      if (!confirm("„" + e.name + "“ (" + e.menge + " Stück) löschen?")) return;
      if (await tun([{ typ: "feld", art: "eintrag", ziel: e.id, feld: "geloescht", wert: true }])) schliessen();
    }, "gefahr"],
  ]);
  if (!e) name.focus();
}

// Kiste/Schublade anlegen (f = null, auf freiem Platz lage) oder aendern: nur = "name" | "platz" (Fach-Menue).
function fachDialog(f, lage, nur) {
  const ort = ortVon(f ? f.lage.ort : lage.ort);
  const wort = fachWort(ort);
  const name = el("input", { value: f ? f.name : "", maxLength: 60, placeholder: "z. B. Nudeln", autocomplete: "off" });
  let platzSel = null;
  const ablage = !f && ort.spalten > 1 && el("input", { type: "checkbox" }); // v6.4
  if (f && nur === "platz") { // Platz: eigener + alle freien Plaetze aller Orte
    const opt = f.ortKlaeren ? [el("option", { value: "" }, "– kein gültiger Platz –")] : [];
    for (const o of orteSichtbar()) for (let r = 0; r < o.reihen; r++) for (let c = 0; c < o.spalten; c++) {
      const meins = !f.ortKlaeren && f.lage.ort === o.id && f.lage.reihe === r && f.lage.spalte === c;
      // v6.7: hohes Fach nur auf genug freien Platz; einfache nicht in/neben hohe Faecher
      if (!meins && (hoeheVon(f) > 1 ? !platzFrei(o.id, r, c, f.id, hoeheVon(f)) : faecherUeber(o.id, r, c, f.id).some((x) => hoeheVon(x) > 1))) continue;
      const da = faecherAn(o.id, r, c, f.id); // v5.3: belegte Plaetze auch (daneben legen, wie nach dem Aufteilen)
      opt.push(el("option", { value: JSON.stringify({ ort: o.id, reihe: r, spalte: c }), selected: meins },
        o.name + " · " + platzName(o, r, c) + (meins ? " (jetzt)" : da.length ? " (neben „" + da.map((x) => x.name).join("“, „") + "“)" : " (frei)")));
    }
    platzSel = el("select", null, opt);
  }
  dialog(!f ? "Neue " + wort : nur === "platz" ? "„" + kuerze(f.name, 30) + "“: Platz ändern" : wort + " umbenennen", [
    !f && el("p", { className: "klein" }, ort.name + " · " + platzName(ort, lage.reihe, lage.spalte)),
    nur !== "platz" && feld("Name", name),
    ablage && el("label", { className: "schalter" }, ablage, "🧺 Ablage ohne Kiste – die Produkte stehen direkt im Regal"),
    platzSel && feld("Platz", platzSel),
    platzSel && el("p", { className: "klein" }, "Belegter Platz = daneben legen. Der Inhalt zieht mit um. Tauschen: in der Zeichnung auf das andere Fach ziehen."),
  ], [
    ["Speichern", async (melde, schliessen) => {
      if (f && !fachVon(f.id)) return melde("Dieses Fach gibt es nicht mehr.");
      const werte = nur === "platz" ? {} : { name: name.value.trim() };
      if (ablage && ablage.checked) werte.offen = true; // nur wenn gewaehlt: Kisten bleiben ohne neues Feld
      if (!f) werte.lage = lage;
      else if (platzSel && platzSel.value) {
        const l = JSON.parse(platzSel.value);
        if (l.ort !== f.lage.ort || l.reihe !== f.lage.reihe || l.spalte !== f.lage.spalte) {
          if (nameDort(f.name, l, f.id)) return melde("Dort liegt schon ein Fach mit diesem Namen – bitte erst umbenennen.");
          if (hoeheVon(f) > 1 && !platzFrei(l.ort, l.reihe, l.spalte, f.id, hoeheVon(f))) return melde("Dort ist nicht genug Platz für dieses hohe Fach.");
          werte.lage = l;
        }
      }
      const fe = H.pruefe("fach", werte);
      if (fe) return melde(fe);
      if (!f) { if (await tun([{ typ: "neu", art: "fach", werte }])) schliessen(); return; }
      const daten = Object.entries(werte).filter(([k, w]) => k !== "name" || w !== f.name)
        .map(([k, w]) => ({ typ: "feld", art: "fach", ziel: f.id, feld: k, wert: w }));
      if (!daten.length || (await tun(daten))) schliessen();
    }],
  ]);
  if (nur !== "platz") name.focus();
}

// ==== v5.2: Fach-Menue (Tobias 15.11.): lange auf ein Fach druecken ====
const nachbarn = (f) => (f.ortKlaeren ? [] : faecherAn(f.lage.ort, f.lage.reihe, f.lage.spalte, f.id));
const fachAnsichtVon = (f) => { const d = stapel[stapel.length - 2]; return !!d && d.art === "fach" && d.id === f.id; };
// Fach weg: lag darunter seine eigene Ansicht, die gleich mit schliessen.
const fachWegSchliessen = (f, schliessen) => schliessen(fachAnsichtVon(f) ? 2 : 1);
function fachMenue(alt) {
  const f = fachVon(alt.id); // gezeichnetes Objekt kann veraltet sein (Abgleich waehrend des Drueckens)
  if (!f || f.geloescht) return hinweis("Dieses Fach gibt es nicht mehr.");
  const o = ortVon(f.lage.ort), wort = fachArt(f, o), n = stueckImFach(f.id), nb = nachbarn(f);
  menue(wort + " „" + kuerze(f.name, 30) + "“", [el("p", { className: "klein" },
    (f.ortKlaeren || !o ? "ohne gültigen Platz" : o.name + " · " + platzName(o, f.lage.reihe, f.lage.spalte)) + " · " + (n ? n + (n === 1 ? " Sache" : " Sachen") : "leer"))], {
    oben: [
      // v6.16: beim Bauen liegt das Menue noch nicht auf dem Stapel -> oberste Ebene pruefen (vorher stand „Öffnen“
      // auch in der eigenen Schublade und oeffnete sie ein zweites Mal)
      !(stapel[stapel.length - 1].art === "fach" && stapel[stapel.length - 1].id === f.id) && ["📂 Öffnen", weiter(() => oeffne({ art: "fach", id: f.id })), "an"],
      ["✎ Umbenennen", weiter(() => fachDialog(f, null, "name"))],
      ["⇄ Platz ändern", weiter(() => fachDialog(f, null, "platz"))],
    ],
    liste: [
      !f.ortKlaeren && ["✂ Aufteilen", weiter(() => aufteilenDialog(f))],
      nb.length > 0 && ["⊕ Zusammenlegen", weiter(() => zusammenDialog(f, nb))],
      ...hoehenKnoepfe(f),
      o && o.spalten > 1 && [f.offen ? "📦 In Kiste umwandeln" : "🧺 In Ablage umwandeln (ohne Kiste)", async (melde, schliessen) => {
        const jetzt = fachVon(f.id);
        if (!jetzt || jetzt.geloescht) return melde("Dieses Fach gibt es nicht mehr.");
        if (await tun([{ typ: "feld", art: "fach", ziel: f.id, feld: "offen", wert: !jetzt.offen }])) schliessen();
      }],
    ],
    gefahr: [["🗑 Löschen", async (melde, schliessen) => {
      if (!confirm(wort + " „" + f.name + "“ löschen?" + (n ? "\n\n" + n + " Einträge darin kommen in „Ort klären“, nichts geht verloren." : ""))) return;
      if (await tun([{ typ: "feld", art: "fach", ziel: f.id, feld: "geloescht", wert: true }])) fachWegSchliessen(f, schliessen);
    }]],
  });
}

// v6.7 (Tobias 16.11.): Faecher in der Hoehe verbinden. Nur fuer Faecher, die ihren Platz allein haben (nicht aufgeteilt).
// Moeglichkeiten werden bei jedem Tipp gegen den AKTUELLEN Stand neu bestimmt (Abgleich waehrend das Menue offen ist).
function hoehenLage(id) {
  const f = fachVon(id), o = f && ortVon(f.lage.ort);
  if (!f || f.geloescht || f.ortKlaeren || !o || nachbarn(f).length) return null;
  const h = hoeheVon(f), r = f.lage.reihe, c = f.lage.spalte, unten = r + h < o.reihen ? faecherUeber(o.id, r + h, c) : null;
  const untenFach = unten && unten.length === 1 && unten[0].lage.reihe === r + h && !nachbarn(unten[0]).length ? unten[0] : null;
  return { f, h, r, untenFrei: !!unten && !unten.length, untenFach, obenFrei: r > 0 && !faecherUeber(o.id, r - 1, c).length };
}
function hoehenKnoepfe(alt) {
  const L = hoehenLage(alt.id);
  if (!L) return [];
  // pruef(J) enthaelt auch die Grenze 6 Reihen (Modell erlaubt hoch 2..6)
  const tu = (pruef, schritte) => async (melde, schliessen) => {
    const J = hoehenLage(alt.id);
    if (!J || !pruef(J)) return melde("Das geht inzwischen nicht mehr – bitte das Menü neu öffnen.");
    if (await tun(schritte(J))) schliessen();
  };
  const passt = (J, dazu) => J.h + dazu <= 6;
  const fach = (feld, wert) => ({ typ: "feld", art: "fach", ziel: alt.id, feld, wert });
  return [
    L.untenFrei && passt(L, 1) && ["↕ Nach unten vergrößern", tu((J) => J.untenFrei && passt(J, 1), (J) => [fach("hoch", J.h + 1)])],
    L.untenFach && passt(L, hoeheVon(L.untenFach)) && ["↕ Mit „" + kuerze(L.untenFach.name, 20) + "“ darunter verbinden", async (melde, schliessen) => {
      const n = imFach(L.untenFach.id).length;
      if (!confirm("„" + L.untenFach.name + "“ mit „" + L.f.name + "“ verbinden?\n\n„" + L.untenFach.name + "“ verschwindet" +
        (n ? ", " + sachenText(n) + " wandern mit nach „" + L.f.name + "“." : ".") + " Mit „Wieder 1 Platz hoch“ wird es wieder klein (der untere Platz ist dann frei).")) return;
      return tu((J) => J.untenFach && J.untenFach.id === L.untenFach.id && passt(J, hoeheVon(J.untenFach)),
        (J) => H.verbindenSchritte(alt.id, J.h + hoeheVon(J.untenFach), J.untenFach.id, imFach(J.untenFach.id).map((e) => e.id)))(melde, schliessen);
    }],
    L.obenFrei && passt(L, 1) && ["↑ Nach oben vergrößern", tu((J) => J.obenFrei && passt(J, 1), (J) => [fach("lage", { ...J.f.lage, reihe: J.r - 1 }), fach("hoch", J.h + 1)])],
    L.h > 1 && ["⤒ Wieder 1 Platz hoch (bleibt oben)", tu((J) => J.h > 1, () => [fach("hoch", null)])],
  ];
}

// Zwei Teile nebeneinander auf demselben Platz; angekreuzte Eintraege kommen ins neue Teil.
function aufteilenDialog(f) {
  const n1 = el("input", { value: kuerze(f.name + " links", 60), maxLength: 60, autocomplete: "off" });
  const n2 = el("input", { value: kuerze(f.name + " rechts", 60), maxLength: 60, autocomplete: "off" });
  const haken = imFach(f.id).sort(nachAblauf).map((e) => ({ e, box: el("input", { type: "checkbox" }) }));
  dialog("„" + kuerze(f.name, 30) + "“ aufteilen", [
    el("p", { className: "klein" }, "Zwei Teile nebeneinander auf demselben Platz, in der Zeichnung nach Namen sortiert."),
    feld("Teil 1 (bleibt)", n1), feld("Teil 2 (neu)", n2),
    haken.length ? [el("h3", null, "Was kommt in Teil 2?"), haken.map(({ e, box }) => el("label", { className: "schalter" }, box,
      (e.symbol || H.bildchen(e.name)) + " " + e.name + (e.menge >= 2 ? " ×" + e.menge : "")))] : el("p", { className: "klein" }, "Das Fach ist leer."),
  ], [["Aufteilen", async (melde, schliessen) => {
    const a = n1.value.trim(), b = n2.value.trim();
    const fe = H.pruefe("fach", { name: a }) || H.pruefe("fach", { name: b });
    if (fe) return melde(fe);
    const belegt = nachbarn(f).map((x) => x.name.toLowerCase());
    if (a.toLowerCase() === b.toLowerCase() || belegt.includes(a.toLowerCase()) || belegt.includes(b.toLowerCase()))
      return melde("Bitte verschiedene Namen – sonst lassen sich die Teile nicht unterscheiden.");
    if (!fachGueltig(f.id)) return melde("Dieses Fach gibt es nicht mehr.");
    const ids = haken.filter((h) => h.box.checked && eintragJetzt(h.e.id)?.fach === f.id).map((h) => h.e.id);
    if (!(await tun(H.aufteilenSchritte(fachVon(f.id), a, b, ids)))) return;
    schliessen();
    untenZeigen("Aufgeteilt: „" + a + "“ und „" + b + "“");
  }]]);
}

// Gegenstueck: dieses Teil aufloesen, Inhalt in ein anderes Fach auf demselben Platz.
function zusammenDialog(f, nb) {
  const sel = el("select", null, nb.map((x) => el("option", { value: x.id }, x.name)));
  const n = imFach(f.id).length;
  dialog("„" + kuerze(f.name, 30) + "“ zusammenlegen", [
    feld("Inhalt kommt nach", sel),
    el("p", { className: "klein" }, "„" + f.name + "“ verschwindet" + (n ? ", " + (n === 1 ? "seine 1 Sache wandert" : "seine " + n + " Sachen wandern") + " mit." : ".") +
      " Den Namen des anderen Teils kannst du danach ändern (lange drücken → Umbenennen)."),
  ], [["Zusammenlegen", async (melde, schliessen) => {
    const z = sel.value;
    if (!fachGueltig(f.id) || !fachGueltig(z)) return melde("Ein Fach gibt es nicht mehr.");
    if (!(await tun(H.zusammenSchritte(f.id, z, imFach(f.id).map((e) => e.id))))) return;
    fachWegSchliessen(f, schliessen);
    untenZeigen("„" + f.name + "“ → „" + fachVon(z).name + "“ zusammengelegt");
  }]]);
}

// ==== v5.3: Faecher ziehen (Tobias 16.11.) ====
const lageKopie = (f) => ({ ort: f.lage.ort, reihe: f.lage.reihe, spalte: f.lage.spalte });
const gleicheLage = (a, b) => a.ort === b.ort && a.reihe === b.reihe && a.spalte === b.spalte;
// Platz gibt es im AKTUELLEN Stand (Ort nicht geloescht, innerhalb der Reihen/Spalten) - sonst landet das Fach in "Ort klaeren".
const lageGueltig = (l) => { const o = ortVon(l.ort); return !!o && !o.geloescht && l.reihe < o.reihen && l.spalte < o.spalten; };
// Gleicher Name wie ein Fach auf dem Platz l? (sonst lassen sich Teile nicht unterscheiden, wie beim Aufteilen)
const nameDort = (name, l, ausser) => faecherAn(l.ort, l.reihe, l.spalte, ausser).some((x) => x.name.toLowerCase() === name.toLowerCase());
// Ziel: anderes Fach (nicht auf demselben Platz) oder freier Platz. Immer gegen den aktuellen Stand.
const fachZug = (f) => zug(() => [el("span", { className: "bild" }, "🗄️"), el("span", null, f.name)], null, (t) => {
  const z = t.closest("[data-fach],[data-platz]"), ich = fachVon(f.id);
  if (!z || !ich || z.dataset.fach === f.id) return null;
  const x = z.dataset.fach && fachVon(z.dataset.fach);
  return x && gleicheLage(x.lage, ich.lage) ? null : z;
}, (z) => (z.dataset.platz ? fachAufPlatz(f.id, JSON.parse(z.dataset.platz)) : fachAufFach(f.id, z.dataset.fach)));

// Lagen mehrerer Faecher in EINEM Schritt setzen. Rueckgaengig nur, wenn noch alles so liegt und die alten Plaetze gelten.
async function lagenSetzen(neu, text) {
  const alt = neu.map(([id]) => [id, lageKopie(fachVon(id))]);
  if (!(await tun(neu.map(([id, lage]) => ({ typ: "feld", art: "fach", ziel: id, feld: "lage", wert: lage }))))) return;
  untenZeigen(text, "Rückgängig", async () => {
    if (!neu.every(([id, lage]) => fachGueltig(id) && gleicheLage(fachVon(id).lage, lage)))
      return hinweis("Inzwischen anders verschoben – Rückgängig nicht mehr möglich.");
    if (!alt.every(([i, l]) => lageGueltig(l) && (hoeheVon(fachVon(i)) === 1 ? !verdeckt(l, i) : platzFrei(l.ort, l.reihe, l.spalte, i, hoeheVon(fachVon(i))))))
      return hinweis("Den alten Platz gibt es nicht mehr – Rückgängig nicht möglich.");
    if (await tun(alt.map(([id, lage]) => ({ typ: "feld", art: "fach", ziel: id, feld: "lage", wert: lage })))) untenZeigen("Zurück verschoben");
  });
}
function fachAufPlatz(id, lage) {
  if (!fachGueltig(id)) return hinweis("Dieses Fach gibt es nicht mehr.");
  if (!lageGueltig(lage)) return hinweis("Diesen Platz gibt es nicht mehr.");
  const h = hoeheVon(fachVon(id));
  if (!platzFrei(lage.ort, lage.reihe, lage.spalte, id, h))
    return hinweis(h > 1 ? "Dort ist nicht genug Platz für ein Fach über " + h + " Reihen." : "Der Platz ist inzwischen belegt – bitte nochmal ziehen.");
  const o = ortVon(lage.ort);
  lagenSetzen([[id, lage]], "„" + fachVon(id).name + "“ → " + o.name + " · " + platzName(o, lage.reihe, lage.spalte));
}
function fachAufFach(id, zielId) {
  if (!fachGueltig(id) || !fachGueltig(zielId)) return hinweis("Dieses Fach gibt es nicht mehr.");
  if (hoeheVon(fachVon(id)) > 1 || hoeheVon(fachVon(zielId)) > 1) return hinweis("Hohe Fächer bitte auf einen freien Platz ziehen – Tauschen/Daneben geht nur mit einfachen.");
  // Beide Knoepfe pruefen erst den aktuellen Stand; paare(x, y) -> [[id, lage], ...] oder Fehlertext.
  const knopf = (text, paare, meldung) => [text, (melde, schliessen) => {
    if (!fachGueltig(id) || !fachGueltig(zielId)) return melde("Ein Fach gibt es nicht mehr.");
    if (hoeheVon(fachVon(id)) > 1 || hoeheVon(fachVon(zielId)) > 1) return melde("Inzwischen ist eins der Fächer hoch – bitte auf einen freien Platz ziehen.");
    const x = fachVon(id), y = fachVon(zielId), r = paare(x, y);
    if (typeof r === "string") return melde(r);
    schliessen();
    lagenSetzen(r, meldung(x, y));
  }];
  dialog("„" + kuerze(fachVon(id).name, 25) + "“ auf „" + kuerze(fachVon(zielId).name, 25) + "“", [
    el("p", { className: "klein" }, "Der Inhalt zieht jeweils mit um."),
  ], [
    knopf("⇄ Plätze tauschen", (x, y) => [[id, lageKopie(y)], [zielId, lageKopie(x)]], (x, y) => "„" + x.name + "“ ⇄ „" + y.name + "“ getauscht"),
    knopf("⊕ Daneben legen", (x, y) => (nameDort(x.name, y.lage, id) ? "Dort liegt schon ein Fach mit diesem Namen – bitte erst umbenennen." : [[id, lageKopie(y)]]),
      (x, y) => "„" + x.name + "“ liegt jetzt neben „" + y.name + "“"),
  ]);
}

// v6.5/v6.6: Vorlage Medizinschrank anwenden (Ort-Dialog und Knopf unter der Zeichnung). Belegte Plaetze bleiben.
async function medizinEinrichten(id) {
  const o = ortVon(id);
  if (!o || o.geloescht) { hinweis("Diesen Ort gibt es nicht mehr."); return false; }
  // Vorlagen-Schubladen, die es schon gibt, werden umgesetzt - sie zaehlen beim "frei" nicht als Hindernis.
  const namen = new Set(H.medizinPlaetze().map((p) => p.name));
  // v6.11 (Tobias 16.11.: zwei "Kochsalzlsg 2" nach Umbenennen -> Vorlage legte "Kochsalzlsg 1" neu an, die doppelte landete
  // verdeckt in "Ort klaeren"): doppelte Vorlagen-Namen erst aufloesen lassen, dann umsetzen.
  const doppelt = [...namen].filter((n) => stand.faecher.filter((f) => !f.geloescht && f.lage.ort === id && f.name === n).length > 1);
  if (doppelt.length) { alert("Diese Namen gibt es im " + o.name + " mehrfach:\n\n• " + doppelt.join("\n• ") +
    "\n\nBitte erst umbenennen oder löschen (lange drücken), dann nochmal – sonst landen Schubladen am falschen Platz."); return false; }
  // je Name nur die erste - alle anderen Faecher im Ort gelten als Hindernis
  const vorhanden = [];
  for (const f of stand.faecher) if (!f.geloescht && f.lage.ort === id && namen.has(f.name) && !vorhanden.some((v) => v.name === f.name)) vorhanden.push(f);
  const umzug = new Set(vorhanden.map((f) => f.id));
  const frei = (r, c) => !faecherUeber(id, r, c).some((f) => !umzug.has(f.id));
  const schritte = H.medizinSchritte(id, frei, vorhanden), neu = schritte.filter((v) => v.typ === "neu").length;
  if (!confirm("„" + o.name + "“ wie auf dem Foto einrichten?\n\n2 Seiten nebeneinander, Schubladen in den Größen vom Foto." +
    (vorhanden.length ? "\n" + vorhanden.length + " vorhandene Schubladen werden umgesetzt, der Inhalt bleibt drin." : "") +
    (neu ? "\n" + neu + " Schubladen/Ablagen werden neu angelegt." : "") + "\nEigene Fächer mit anderen Namen bleiben, wo sie sind.")) return false;
  if (!(await tun(schritte))) return false;
  ortWahl = id;
  return true;
}

function ortDialog(o) {
  const zahl = (w, min, max) => el("input", { type: "number", min, max, value: String(w), inputMode: "numeric" });
  const name = el("input", { value: o ? o.name : "", maxLength: 60, autocomplete: "off" });
  const reihen = zahl(o ? o.reihen : 3, 1, 20), spalten = zahl(o ? o.spalten : 1, 1, 20);
  // v6.2 (Tobias 16.11.): Reiter-Nr. laeuft unsichtbar mit, ein neuer Ort kommt ans Ende.
  const werteLesen = () => ({ name: name.value.trim(), reihen: Number(reihen.value), spalten: Number(spalten.value) });
  const start = werteLesen();
  dialog(o ? "Ort bearbeiten" : "Neuer Ort", [
    feld("Name", name),
    el("div", { className: "zeilen" }, feld("Reihen", reihen), feld("Spalten", spalten)),
    el("p", { className: "klein" }, "1 Spalte = Schubladen übereinander, mehrere Spalten = Böden mit Kisten."),
  ], [
    ["Speichern", async (melde, schliessen) => {
      const werte = werteLesen();
      const fe = H.pruefe("ort", werte);
      if (fe) return melde(fe);
      if (!o) { // neuer Ort ans Ende (Max ueber alle Orte, auch geloeschte)
        werte.reihenfolge = Math.min(999, stand.orte.reduce((m, x) => Math.max(m, (x.reihenfolge ?? 0) + 1), 0));
        const v = await tun([{ typ: "neu", art: "ort", werte }]);
        if (v) { ortWahl = v[0].id; schliessen(); }
        return;
      }
      const aussen = ausserhalb(o.id, werte.reihen, werte.spalten).length;
      if (aussen && !confirm(aussen + " Kisten liegen dann außerhalb und kommen in „Ort klären“. Trotzdem ändern?")) return;
      const daten = Object.entries(werte).filter(([k, w]) => w !== start[k]).map(([k, w]) => ({ typ: "feld", art: "ort", ziel: o.id, feld: k, wert: w }));
      if (!daten.length || (await tun(daten))) schliessen();
    }],
    // v6.5: Raster, Aussehen und alle Schubladen wie auf den Fotos; belegte Plaetze bleiben, wie sie sind.
    o && (!o.stil || o.reihen !== H.MEDIZIN.reihen) && [o.stil ? "🩹 Größen wie auf dem Foto übernehmen" : "🩹 Als Medizinschrank einrichten (Vorlage)", async (melde, schliessen) => { if (await medizinEinrichten(o.id)) schliessen(2); }],
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
