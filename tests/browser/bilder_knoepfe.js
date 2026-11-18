// Vorher-/Nachher-Bilder fuer den Knopf-Umbau (Nachtlauf 18.11.), Handybreite 412 px.
// Aufruf: node tests/browser/bilder_knoepfe.js <app-url> <ausgabeordner>   (braucht Playwright + Chromium; nicht Teil der App)
"use strict";
const { chromium } = require("playwright");
const [url = "http://127.0.0.1:8765/", aus = "."] = process.argv.slice(2);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const s = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  s.on("dialog", (d) => d.accept());
  const fehler = [];
  s.on("pageerror", (e) => fehler.push(String(e)));
  await s.goto(url);
  await s.waitForFunction(() => typeof stand !== "undefined" && !!stand);
  // Ersten Abgleich nachstellen (wie cdp_v615.js), dann Grundausstattung + Medizinschrank-Vorlage + ein paar Eintraege
  await s.evaluate(() => sp.abgleichSpeichern({ ordner: Cloud.ordnerSchluessel(einst.datenPfad), gelesen: sp.inst, dateien: {}, letzter: { zeit: Modell.lokalIso(), fehler: null } }, 0).then(() => laden()));
  await s.evaluate(() => tun(H.grundSchritte()));
  await s.evaluate(async () => {
    const med = orteSichtbar().find((o) => o.name === "Medizinschrank");
    const h = (t) => new Date(Date.now() + t * 864e5).toISOString().slice(0, 10);
    const f1 = stand.faecher.find((f) => f.name === "Schublade 1"), f2 = stand.faecher.find((f) => f.name === "Müsli");
    await tun([{ typ: "neu", art: "eintrag", werte: { name: "Pizza Salami", mhd: h(4), fach: f1.id }, menge: 2 },
      { typ: "neu", art: "eintrag", werte: { name: "Erbsen", mhd: h(20), fach: f1.id }, menge: 1 },
      { typ: "neu", art: "eintrag", werte: { name: "Haferflocken", mhd: h(200), fach: f2.id }, menge: 1 }]);
    ortWahl = med.id; zeichnen();
  });
  await warte(300);
  const knopf = (text) => s.evaluate((t) => { const k = [...document.querySelectorAll("main button")].find((x) => x.textContent.includes(t)); if (k) k.click(); return !!k; }, text);
  await s.evaluate(() => medizinEinrichten(ortWahl)); // gibt es vorher und nachher
  await warte(500);
  // Bildschirmausschnitt (feste Leiste unten sitzt so, wie man sie am Handy sieht); oben = Element, das oben stehen soll
  const bild = async (name, oben) => {
    if (oben) await s.evaluate((q) => { const e = document.querySelector(q); if (e) scrollTo(0, e.getBoundingClientRect().top + scrollY - 8); }, oben);
    await warte(400); await s.screenshot({ path: aus + "/" + name }); console.log("Bild " + name);
  };
  const ort = (n) => s.evaluate((n) => { ortWahl = orteSichtbar().find((o) => o.name === n).id; while (stapel.length > 1) stapel.pop(); history.replaceState(1, ""); zeichnen(); scrollTo(0, 0); }, n);
  await ort("Gefrierschrank"); await bild("1-start.png");
  await ort("Vorrats-Regal"); await bild("2-regal.png", ".reiter");
  await ort("Medizinschrank");
  const neu = await knopf("Bearbeiten"); // v6.19: Knopf sitzt unten in der Leiste; nach dem Umbau: Bearbeiten-Modus einschalten (vorher gibt es den Knopf nicht)
  await bild("3-medizin" + (neu ? "-bearbeiten" : "") + ".png", ".reiter");
  await ort("Gefrierschrank");
  await s.evaluate(() => { const e = stand.eintraege.find((x) => x.name === "Pizza Salami"); oeffne({ art: "fach", id: e.fach }); });
  await warte(300);
  await s.evaluate(() => eintragMenue(stand.eintraege.find((x) => x.name === "Pizza Salami")));
  await bild("4-menue-produkt.png");
  await s.evaluate(() => history.back()); await warte(300);
  await s.evaluate(() => fachMenue(stand.faecher.find((f) => f.name === "Schublade 1")));
  await bild("5-menue-fach.png");
  console.log(fehler.length ? "Seitenfehler: " + fehler.join(" | ") : "keine Seitenfehler");
  await b.close();
})();
