// Vorrats-App: Geruest (Abschnitt 1c). Keine Logik zu Speicher/Modell.
"use strict";
const APP_VERSION = "v1"; // UGC #71: im Gleichschritt mit CACHE in service-worker.js pflegen

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

// Startanzeige (Platzhalter)
const kopf = document.createElement("h1");
kopf.textContent = "Vorrat";
const stand = document.createElement("p");
stand.textContent = "App-Version " + APP_VERSION;
const suche = document.createElement("button");
suche.textContent = "↻ Nach Update suchen";
suche.onclick = async () => { suche.disabled = true; await updateSuchen(); suche.disabled = false; };
haupt.append(kopf, stand, suche);

// Abschnitt 1d: Oberflaeche
// (Android-Zurueck #87 und Hauptmenue ohne Daten #88 gehoeren dorthin, sie brauchen Fenster/Ansichten.)
