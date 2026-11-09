// Vorrats-App: Geruest (Abschnitt 1c) und Oberflaeche (Abschnitt 1d).
"use strict";
const APP_VERSION = "v2"; // UGC #71: im Gleichschritt mit CACHE in service-worker.js pflegen

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
// Datenfluss: Speicher -> eigene Vorgaenge -> vereinige -> berechne -> zeichnen.
// Jede Aktion: ausfuehren (loest erst nach dem Schreiben auf) -> neu berechnen -> neu zeichnen.
const H = window.Hilfen;
let sp = null;          // Speicher-Verbindung
let liste = [];         // alle eigenen Vorgaenge
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
  while (stapel.length > ziel) { const e = stapel.pop(); if (e.el) e.el.remove(); }
  zeichnen(); // UGC #15: nach dem Schliessen nachholen
});
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
  try {
    sp = sp || (await Speicher.oeffnen());
    const vs = await sp.eigeneVorgaenge();
    // Lesefehler nie als leeren Vorrat behandeln (Bauplan R2 #10): jede Installation einzeln pruefen.
    const nachInst = new Map();
    for (const v of vs) { const k = v && v.inst; if (!nachInst.has(k)) nachInst.set(k, []); nachInst.get(k).push(v); }
    for (const [inst, vorgaenge] of nachInst) {
      const p = Modell.pruefeDatei({ schema: Modell.SCHEMA, inst, vorgaenge });
      if (!p.ok) throw new Error(p.fehler);
    }
    const r = Modell.vereinige([vs]);
    if (!r.ok) throw new Error(r.fehler);
    liste = r.vorgaenge;
    stand = Modell.berechne(liste);
  } catch (x) {
    stand = null;
    ladeFehler = "Daten konnten nicht gelesen werden: " + ((x && x.message) || x) + ". Es wurde nichts verändert.";
  }
  zeichnen();
}

// Vorgaenge nacheinander ausfuehren. Liefert die gespeicherten Vorgaenge oder null; bei Fehler steht
// die Fehlerleiste und die Aktion gilt NICHT als erledigt (UGC #5, Bauplan Warteschlange).
async function tun(datenListe) {
  if (laeuft || !stand) return null;
  laeuft = true;
  const fertig = [];
  try {
    for (const d of datenListe) { const v = await sp.ausfuehren(d); liste.push(v); fertig.push(v); }
    return fertig;
  } catch (x) {
    fehlerZeigen("Speichern fehlgeschlagen" + (fertig.length ? " (nur teilweise)" : "") + ": " +
      ((x && x.message) || x) + ". Diese Änderung ist NICHT gespeichert.");
    return null;
  } finally {
    laeuft = false;
    stand = Modell.berechne(liste);
    zeichnen();
  }
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
const ANSICHTEN = { start: startAnsicht, fach: fachAnsicht, ortKlaeren: ortKlaerenAnsicht, bestand: bestandAnsicht, menue: menueAnsicht, pruefen: pruefenAnsicht };
function zeichnen() {
  if (dialogOffen()) return; // UGC #15: unter einem offenen Dialog nichts austauschen
  const oben = stapel[stapel.length - 1];
  haupt.replaceChildren(...ANSICHTEN[oben.art](oben).flat(Infinity).filter(weg));
}
const kopf = (titel, ...extra) => el("div", { className: "ansichtkopf" },
  el("button", { className: "zurueck", "aria-label": "Zurück", onclick: () => zurueck() }, "←"), el("h2", null, titel), ...extra);

function startAnsicht() {
  if (!stand) return [el("div", { className: "karte warnung" }, ladeFehler || "Lädt …")];
  const orte = orteSichtbar();
  if (!orte.length) {
    const knopf = el("button", { className: "gross", onclick: async () => {
      if (!confirm("Grundausstattung anlegen?\n\n• Gefrierschrank: 6 Schubladen (2 braun, 4 weiß)\n• Vorrats-Regal: 4 Böden, 8 Kisten\n" +
        "• Küchenschublade: 1 Schublade\n• Medizinschrank: 3 × 2 Plätze, noch ohne Kisten\n\nDanach ist alles änderbar.")) return;
      knopf.disabled = true;
      for (const g of H.grundausstattung()) {
        const o = await tun([g.ort]);
        if (!o || !(await tun(g.faecher(o[0].id)))) return;
      }
    } }, "Grundausstattung anlegen");
    return [el("p", null, "Noch keine Orte angelegt."), knopf, el("p", { className: "klein" }, "Eigene Orte gehen auch: ☰ → Ort anlegen.")];
  }
  if (!orte.some((o) => o.id === ortWahl)) ortWahl = orte[0].id;
  const k = klaeren(), nKlaeren = k.kisten.length + k.eintraege.length;
  const nPruefen = stand.eintraege.filter((e) => e.bestandPruefen).length;
  const nDaten = stand.widersprueche.length + stand.verwaist.length;
  return [
    el("nav", { className: "reiter" }, orte.map((o) => el("button", { className: o.id === ortWahl ? "an" : "", onclick: () => { ortWahl = o.id; zeichnen(); } }, o.name))),
    nDaten > 0 && el("div", { className: "karte still" }, "Daten prüfen: " + nDaten + " Vorgänge passen nicht zusammen und werden nicht angewendet (☰ → Prüfen). Gelöscht wurde nichts."),
    (nKlaeren > 0 || nPruefen > 0) && el("div", { className: "knoepfe" },
      nKlaeren > 0 && el("button", { className: "ortklaeren", onclick: () => oeffne({ art: "ortKlaeren" }) }, "Ort klären (" + nKlaeren + ")"),
      nPruefen > 0 && el("button", { className: "bestand", onclick: () => oeffne({ art: "bestand" }) }, "Bestand prüfen (" + nPruefen + ")")),
    zeichnung(ortVon(ortWahl)),
  ];
}

// Digitales Bild des Orts: 1 Spalte = Schubladen uebereinander, sonst Boeden mit Kisten.
// Jeder feste Platz zeigt seine Kiste oder ist frei (gestrichelt, "+").
function zeichnung(ort) {
  const W = 360, rand = 12, luft = 8, schub = ort.spalten === 1, rh = schub ? 62 : 84;
  const cw = (W - 2 * rand - (ort.spalten - 1) * luft) / ort.spalten;
  const hoehe = 2 * rand + ort.reihen * rh + (ort.reihen - 1) * luft;
  const heute = Modell.heuteIso();
  const svg = sv("svg", { viewBox: `0 0 ${W} ${hoehe}`, class: "ortbild", role: "img", "aria-label": ort.name },
    sv("rect", { width: W, height: hoehe, rx: 14, class: "korpus" }));
  for (let r = 0; r < ort.reihen; r++) {
    const y = rand + r * (rh + luft);
    const [fuell, schrift] = FARBE[(ort.farben || [])[r]] || (schub ? ["#eef3f1", "#1d2b24"] : ["#d9b98d", "#3b2a17"]);
    if (!schub) svg.append(sv("rect", { x: rand - 6, y: y + rh + 1, width: W - 2 * rand + 12, height: 5, rx: 2, class: "boden" }));
    for (let c = 0; c < ort.spalten; c++) {
      const x = rand + c * (cw + luft);
      const hier = faecherAn(ort.id, r, c);
      if (!hier.length) {
        const g = sv("g", { class: "frei" }, sv("rect", { x, y, width: cw, height: rh, rx: 8 }), sv("text", { x: x + cw / 2, y: y + rh / 2 + 10, "text-anchor": "middle" }, "+"));
        g.addEventListener("click", () => fachDialog(null, { ort: ort.id, reihe: r, spalte: c }));
        svg.append(g);
      }
      // ponytail: zwei Kisten auf einem Platz (gleichzeitig angelegt) teilen sich die Breite.
      const w = cw / Math.max(1, hier.length);
      hier.forEach((f, i) => {
        const es = imFach(f.id);
        const rot = es.some((e) => Modell.stufe(e.ablauf, heute) === "rot");
        const xi = x + i * w, mitte = xi + w / 2;
        const g = sv("g", { class: "platz" + (rot ? " rot" : "") },
          sv("rect", { x: xi, y, width: w, height: rh, rx: 8, fill: fuell }),
          sv("rect", { x: mitte - 22, y: y + 7, width: 44, height: 6, rx: 3, class: "griff" }),
          sv("text", { x: mitte, y: y + rh * 0.55, "text-anchor": "middle", fill: schrift, class: "fname" }, kuerze(f.name, Math.max(3, Math.floor(w / 9)))),
          sv("text", { x: mitte, y: y + rh * 0.84, "text-anchor": "middle", fill: schrift, class: "fzahl" }, es.length ? es.length + (es.length === 1 ? " Sache" : " Sachen") : "leer"),
          rot && sv("circle", { cx: xi + w - 13, cy: y + 13, r: 8, class: "punkt" }));
        g.addEventListener("click", () => oeffne({ art: "fach", id: f.id }));
        svg.append(g);
      });
    }
  }
  return svg;
}

// Antippen = kurz, lange druecken (0,5 s) = lang. Scrollen bricht ab (pointercancel).
function druck(knopf, kurz, lang) {
  let uhr = null, lange = false;
  const ab = () => { clearTimeout(uhr); uhr = null; };
  knopf.addEventListener("pointerdown", () => { lange = false; ab(); uhr = setTimeout(() => { uhr = null; lange = true; lang(); }, 500); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) knopf.addEventListener(t, ab);
  knopf.addEventListener("contextmenu", (ev) => ev.preventDefault());
  knopf.addEventListener("click", () => { ab(); if (!lange) kurz(); lange = false; });
}

// Bring-Kachel. Farbe nach Haltbarkeit; ohne Datum neutral.
function kachel(e, kurz, lang) {
  const st = Modell.stufe(e.ablauf, Modell.heuteIso());
  const k = el("button", { className: "kachel" + (st === "rot" || st === "gelb" ? " " + st : "") + (e.bestandPruefen ? " pruefen" : "") },
    el("span", { className: "bild" }, e.symbol || H.bildchen(e.name)),
    el("span", { className: "name" }, e.name),
    e.menge >= 2 && el("span", { className: "zahl" }, "×" + e.menge),
    el("span", { className: "datum" }, H.kurzDatum(e)),
    (e.bestandPruefen || e.ortKlaeren) && el("span", { className: "marke" }, e.bestandPruefen ? "Bestand prüfen" : "Ort klären"));
  druck(k, kurz, lang);
  return k;
}

// Entscheidung 11: Antippen = -1, Leiste mit Rueckgaengig (= Gegenvorgang +1), keine Rueckfrage.
async function entnehmen(e) {
  if (!(await tun([{ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }]))) return;
  untenZeigen(e.name + " −1", "Rückgängig", async () => {
    if (await tun([{ typ: "menge", art: "eintrag", ziel: e.id, delta: 1, grund: "zugang" }])) untenZeigen(e.name + " +1 (rückgängig gemacht)");
  });
}

function fachAnsicht({ id }) {
  const f = stand && fachVon(id);
  if (!f || f.geloescht) return [kopf("Kiste"), el("p", null, "Diese Kiste gibt es nicht mehr.")];
  const o = ortVon(f.lage.ort);
  return [
    kopf(f.name, el("button", { className: "neben", onclick: () => fachDialog(f) }, "✎ " + fachWort(o))),
    el("p", { className: "unterzeile" }, f.ortKlaeren ? "ohne gültigen Platz (Ort klären)" : o.name + " · " + platzName(o, f.lage.reihe, f.lage.spalte)),
    el("div", { className: "kacheln" }, imFach(id).sort(nachAblauf).map((e) => kachel(e, () => entnehmen(e), () => eintragDialog(e))),
      el("button", { className: "kachel neu", onclick: () => eintragDialog(null, id) }, el("span", { className: "bild" }, "+"), el("span", { className: "name" }, "Neu"))),
    el("p", { className: "klein" }, "Antippen = eins weniger · lange drücken = bearbeiten"),
  ];
}

function ortKlaerenAnsicht() {
  const { kisten, eintraege } = klaeren();
  return [kopf("Ort klären"),
    el("p", { className: "klein" }, "Diese Sachen haben keinen gültigen Platz. Antippen und Platz wählen."),
    kisten.map((f) => el("button", { className: "zeile", onclick: () => fachDialog(f) }, "📦 " + fachWort(ortVon(f.lage.ort)) + " „" + f.name + "“: Platz wählen")),
    el("div", { className: "kacheln" }, eintraege.map((e) => kachel(e, () => eintragDialog(e), () => eintragDialog(e)))),
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
    el("h3", null, "App"),
    el("button", { className: "zeile", onclick: () => oeffne({ art: "pruefen" }) }, "🔍 Prüfen"),
    suche];
}

function pruefenAnsicht(ebene) {
  const dauer = el("span", null, "…");
  dauerhaftP.then((d) => { dauer.textContent = d === true ? "ja" : d === false ? "nein (Browser hat abgelehnt)" : "nicht feststellbar"; });
  const ausgabe = el("pre", { className: "ausgabe" });
  const test = el("button", { onclick: () => dreiJahresTest(ausgabe, test) }, "Drei-Jahres-Test");
  // UGC #82: 7x auf die Version tippen, Zaehler ab dem 4. sichtbar, gilt nur fuer diese offene Ansicht.
  const ver = el("button", { className: "text" });
  const verZeigen = () => { const t = ebene.tipps || 0; ver.textContent = APP_VERSION + (t >= 4 && t < 7 ? " · noch " + (7 - t) + "×" : ""); test.hidden = t < 7; };
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
      zeile("Version", ver)),
    test, ausgabe];
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
function dialog(titel, inhalt, knoepfe) {
  const meldung = el("p", { className: "meldung", role: "alert" });
  const melde = (t) => { meldung.textContent = t; };
  const ebene = {};
  const schliessen = (n) => { if (stapel[stapel.length - 1] === ebene) { ebene.zu = true; zurueck(n); } };
  const k = knoepfe.filter(Boolean).map(([text, fn, klasse]) => el("button", { className: klasse || "", onclick: () => { if (!ebene.zu) fn(melde, schliessen); } }, text));
  ebene.el = el("div", { className: "blatt" }, el("div", { className: "fenster" }, el("h2", null, titel), inhalt, meldung,
    el("div", { className: "knoepfe" }, k, el("button", { className: "zweit", onclick: () => schliessen() }, "Abbrechen"))));
  oeffne(ebene);
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

  // Selbst eingefroren: Einfrierdatum + Frist (Kategorie nur zum Vorbelegen) -> "essen bis"
  const frost = el("input", { type: "checkbox", checked: !!(e && e.eingefroren) });
  const einDatum = el("input", { type: "date", value: (e && e.eingefroren) || heute });
  const kat = el("select", null, H.FRISTEN.map((f, i) => el("option", { value: String(i) }, f.name + " (" + f.monate + " Mon.)")));
  kat.value = String(H.fristKategorie(e ? e.name : ""));
  const frist = el("input", { type: "number", min: 1, max: 60, inputMode: "numeric", value: String((e && e.frist) || H.FRISTEN[Number(kat.value)].monate) });
  const essenAnz = el("b");
  const essenZeigen = () => {
    const w = { eingefroren: einDatum.value, frist: Number(frist.value) };
    essenAnz.textContent = H.pruefe("eintrag", w) ? "–" : H.deDatum(Modell.ablaufdatum(w));
  };
  const katSetzen = () => { kat.value = String(H.fristKategorie(name.value)); frist.value = String(H.FRISTEN[Number(kat.value)].monate); };
  kat.addEventListener("change", () => { frist.value = String(H.FRISTEN[Number(kat.value)].monate); essenZeigen(); });
  einDatum.addEventListener("input", essenZeigen);
  frist.addEventListener("input", essenZeigen);
  const frostTeil = el("div", null, el("div", { className: "zeilen" }, feld("eingefroren am", einDatum), feld("Frist (Monate)", frist)),
    feld("Art", kat), el("div", { className: "feld" }, el("span", null, "essen bis"), essenAnz));
  const frostZeigen = () => { frostTeil.hidden = !frost.checked; mhdTeil.hidden = frost.checked; essenZeigen(); };
  frost.addEventListener("change", () => { if (frost.checked && !(e && e.eingefroren)) katSetzen(); frostZeigen(); });
  frostZeigen();

  // Verschieben nach ... (nur beim Bearbeiten): Ort -> Fach. "bleibt" = nichts aendern.
  let ortSel = null, fachSel = null, verschieben = null;
  if (e) {
    const f = fachVon(e.fach);
    fachSel = el("select");
    const fachFeld = feld("Fach", fachSel);
    ortSel = el("select", { onchange: () => fuellen() }, el("option", { value: "" }, "– bleibt –"), orteSichtbar().map((o) => el("option", { value: o.id }, o.name)));
    const fuellen = () => {
      fachSel.replaceChildren(...stand.faecher.filter((x) => !x.geloescht && x.lage.ort === ortSel.value)
        .sort((a, b) => a.lage.reihe - b.lage.reihe || a.lage.spalte - b.lage.spalte)
        .map((x) => el("option", { value: x.id, selected: x.id === e.fach }, x.name)));
      fachFeld.hidden = !ortSel.value;
    };
    fuellen();
    verschieben = [el("p", { className: "klein" }, "Liegt in: " + (e.ortKlaeren || !f ? "– unklar (Ort klären) –" : ortVon(f.lage.ort).name + " · " + f.name)),
      el("div", { className: "zeilen" }, feld("Verschieben nach", ortSel), fachFeld)];
  }

  async function speichern(melde, schliessen) {
    const fr = frost.checked;
    if (fr && !einDatum.value) return melde("Einfrierdatum fehlt");
    let fach = fachId;
    if (e) {
      fach = e.fach ?? null;
      if (ortSel.value) { if (!fachSel.value) return melde("Dieser Ort hat noch keine Kiste."); fach = fachSel.value; }
    }
    const werte = { name: name.value.trim(), symbol: symbol.value.trim() || null, mhd: fr ? null : mhd,
      eingefroren: fr ? einDatum.value : null, frist: fr ? Number(frist.value) : null, fach };
    const fe = H.pruefe("eintrag", werte); // UGC #86: vor dem Vorgang pruefen
    if (fe) return melde(fe);
    if (!e) {
      const menge = Number(mengeIn.value);
      if (!Number.isInteger(menge) || menge < 1 || menge > 999) return melde("Menge: 1 bis 999");
      if (await tun([{ typ: "neu", art: "eintrag", werte, menge }])) schliessen();
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
    el("div", { className: "zeilen" }, feld("Name", name), feld("Bild", symbol)),
    mengeTeil,
    el("label", { className: "schalter" }, frost, "selbst eingefroren"),
    mhdTeil, frostTeil, verschieben,
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
laden();
