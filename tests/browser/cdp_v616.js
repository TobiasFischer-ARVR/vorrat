// Browsertest Vorrats-App 1d ueber das DevTools-Protokoll. Aufruf: node cdp.js <debug-port>
"use strict";
const fs = require("fs");
const port = process.argv[2] || 9333;
const AUS = process.env.VORRAT_AUS || "D:/tmp/vorrat-2/";
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ziele = [];
  for (let i = 0; i < 40 && !ziele.find((t) => t.type === "page"); i++) {
    try { ziele = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* startet noch */ }
    await warte(250);
  }
  const ws = new WebSocket(ziele.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let nr = 0;
  const offen = new Map();
  const fehler = [];
  const dialoge = [];
  let ablehnen = false; // naechste Rueckfrage mit "Abbrechen" beantworten
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); return; }
    if (d.method === "Page.javascriptDialogOpening") { console.log("  [confirm] " + d.params.message.split("\n")[0]); dialoge.push(d.params.message); senden("Page.handleJavaScriptDialog", { accept: !ablehnen }); ablehnen = false; }
    if (d.method === "Runtime.exceptionThrown") fehler.push("Ausnahme: " + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) fehler.push("console." + d.params.type + ": " + d.params.args.map((a) => a.value || a.description).join(" "));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error" && !d.params.entry.text.includes("navigator.vibrate")) fehler.push("Log: " + d.params.entry.text + " " + (d.params.entry.url || ""));
  };
  const senden = (method, params) => new Promise((r) => { const id = ++nr; offen.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (ausdruck) => {
    const r = await senden("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error("JS: " + ausdruck.slice(0, 80) + " -> " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  };
  const bild = async (name) => {
    const r = await senden("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(AUS + name, Buffer.from(r.result.data, "base64"));
    console.log("  Screenshot " + AUS + name);
  };
  const klick = (sel, text) => js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${text ? `x.textContent.includes(${JSON.stringify(text)})` : "true"}); if (!e) throw new Error("nicht gefunden: ${sel} ${text || ""}"); e.dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; })()`);
  // v6.16: Bearbeiten-Modus ein/aus (Umbau-Knoepfe gibt es nur darin)
  const bearb = async (an) => { if ((await js(`imBearbeiten()`)) !== an) { await klick("main button.modusknopf"); await warte(300); } };
  const pruefe = (bed, text) => { console.log((bed ? "ok    " : "FEHLT ") + text); if (!bed) process.exitCode = 1; };

  await senden("Runtime.enable"); await senden("Log.enable"); await senden("Page.enable");
  // Backups nie in Tobias' Downloads-Ordner (Hauptsession 17.11.): eigener Ordner, Inhalt prueft kein Test
  await senden("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.VORRAT_DL || "D:\\tmp\\vorrat-2\\downloads" });
  await senden("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await senden("Page.navigate", { url: `http://localhost:${process.argv[3] || 8765}/` });
  await warte(1500);

  // Server startet manchmal langsamer als Edge: neu aufrufen, bis die App wirklich da ist.
  for (let i = 0; i < 40 && !(await js(`typeof stand !== "undefined" && !!stand && !!document.querySelector("main .karte")`).catch(() => false)); i++) {
    if (i % 8 === 7) await senden("Page.navigate", { url: `http://localhost:${process.argv[3] || 8765}/` });
    await warte(250);
  }
  console.log("0. Abschnitt 2: ohne Abgleich gesperrt");
  console.log("  ladeFehler: " + (await js(`String(ladeFehler)`)));
  pruefe(await js(`!document.querySelector("main button.gross")`), "kein Grundausstattung-Knopf vor dem ersten Abgleich");
  pruefe((await js(`document.querySelector("main .karte").textContent`)).includes("Nicht bei Microsoft angemeldet"), "Karte: nicht angemeldet");
  pruefe(await js(`tun([{ typ: "neu", art: "ort", werte: { name: "X", reihen: 1, spalten: 1 } }]).then(x => x === null)`), "tun() vor dem Abgleich abgelehnt");
  pruefe(await js(`sp.alleVorgaenge().then(v => v.length === 0)`), "nichts gespeichert");
  await bild("0-gesperrt.png");
  // Ersten Abgleich nachstellen (Attrappe: gelesen, leerer Ordner)
  await js(`sp.abgleichSpeichern({ ordner: Cloud.ordnerSchluessel(einst.datenPfad), gelesen: sp.inst, dateien: {}, letzter: { zeit: Modell.lokalIso(), fehler: null } }, 0).then(() => laden()).then(() => 1)`);

  console.log("1. Leere App");
  pruefe(await js(`!!document.querySelector("main button.gross")`), "Knopf Grundausstattung da");
  pruefe(await js(`!!document.querySelector(".kopf button")`), "Menü auch ohne Daten (#88)");
  await bild("1-leer.png");

  console.log("2. Grundausstattung");
  await klick("main button.gross");
  await warte(1500);
  pruefe(await js(`[...document.querySelectorAll(".reiter button")].map(b => b.textContent).join("|")`) === "Gefrierschrank|Vorrats-Regal|Küchenschublade|Medizinschrank", "4 Reiter in Reihenfolge");
  pruefe(await js(`document.querySelectorAll("svg .platz").length`) === 6, "Gefrierschrank: 6 Schubladen gezeichnet");
  await bild("2-start-gefrierschrank.png");

  console.log("3. Eintrag über den Dialog anlegen");
  await klick("svg .platz");  // Schublade 1
  await warte(300);
  await klick("main button.kachel.neu");
  await warte(300);
  await js(`(() => { const n = document.querySelector(".fenster input"); n.value = "Salamipizza"; n.dispatchEvent(new Event("input")); return 1; })()`);
  pruefe(await js(`document.querySelector(".fenster .symbol").value`) === "🍕", "Bildchen automatisch 🍕");
  await js(`(() => { const m = document.querySelector(".fenster input[type=number]"); m.value = "3"; return 1; })()`);
  await klick(".fenster .monate button", "Mär");
  pruefe((await js(`document.querySelector(".fenster .feld b").textContent`)) === "03.2027", "Mär schlägt nächstes Jahr vor (03.2027)");
  await bild("3-dialog-neu.png");
  await klick(".fenster .knoepfe button", "Speichern");
  await warte(600);
  pruefe(await js(`!document.querySelector(".blatt")`), "Dialog nach Speichern zu");
  pruefe(await js(`document.querySelector(".kachel .zahl")?.textContent`) === "×3", "Kachel zeigt ×3");

  console.log("4. Weitere Einträge per tun() (gleicher Weg wie die Dialoge)");
  const fach = await js(`stapel[stapel.length - 1].id`);
  const heute = await js(`Modell.heuteIso()`);
  const neu = (name, extra, menge) => js(`tun([{ typ: "neu", art: "eintrag", werte: Object.assign({ name: ${JSON.stringify(name)}, symbol: Hilfen.bildchen(${JSON.stringify(name)}), fach: stapel[stapel.length - 1].id }, ${JSON.stringify(extra)}), menge: ${menge} }]).then(x => !!x)`);
  await neu("Erbsen", { mhd: heute.slice(0, 7) }, 2);                                             // rot (Monatsende < 7 Tage? sonst gelb)
  await neu("Fischstäbchen", { mhd: Hilfen_plus(heute, 20) }, 1);
  await neu("Hähnchenbrust", { eingefroren: "2026-06-01", frist: 6 }, 1);
  await neu("Brot", {}, 1);
  await neu("Erdbeereis", { mhd: "2026-10" }, 1);                                                  // abgelaufen -> rot
  await warte(400);
  await bild("4-kacheln.png");
  pruefe(await js(`document.querySelectorAll("main button.kachel.rot").length`) >= 1, "rote Kachel vorhanden");
  pruefe(await js(`document.querySelectorAll("main button.kachel.gelb").length`) >= 1, "gelbe Kachel vorhanden");

  console.log("5. v5: Antippen = Menü, −1 erst im Menü, mit Rückgängig");
  const zahl = (n) => js(`[...document.querySelectorAll(".kachel")].find(k => k.textContent.includes(${JSON.stringify(n)})).querySelector(".zahl").textContent`);
  await klick("main button.kachel", "Salamipizza");
  await warte(400);
  pruefe(await js(`[...document.querySelectorAll(".blatt button")].some(b => b.textContent.startsWith("−1"))`), "Antippen öffnet Menü mit −1");
  pruefe(await zahl("Salamipizza") === "×3", "Antippen allein: Menge bleibt ×3");
  await klick(".blatt button", "−1");
  await warte(600);
  pruefe(await js(`!document.querySelector(".blatt")`), "Menü nach −1 zu");
  pruefe((await js(`document.querySelector("#unten").textContent`)).includes("Salamipizza −1"), "Leiste „Salamipizza −1 · Rückgängig“");
  pruefe(await zahl("Salamipizza") === "×2", "Menge jetzt ×2");
  await bild("5-rueckgaengig.png");
  await klick("#unten button");
  await warte(500);
  pruefe(await zahl("Salamipizza") === "×3", "Rückgängig: wieder ×3");
  pruefe(!(await js(`document.querySelector("#unten").textContent`)).includes("undefined"), "Leiste ohne „undefined“");

  console.log("5b. v5 Multiscan (Code eintippen statt Kamera, Open Food Facts nachgestellt)");
  await js(`(window.__f = window.fetch, window.fetch = (u, o) => String(u).includes("openfoodfacts") ? Promise.resolve(String(u).includes("4000000000013")
    ? new Response(JSON.stringify({ status: 1, product: { product_name_de: "Testerbsen" } }), { status: 200 }) : new Response("{}", { status: 404 })) : __f(u, o), 1)`);
  const oben = `[...document.querySelectorAll(".blatt")].at(-1)`;
  const code = async (c) => {
    await js(`(() => { const i = ${oben}.querySelector("input[placeholder='EAN oder PZN']"); i.value = ${JSON.stringify(c)}; return 1; })()`);
    await js(`([...${oben}.querySelectorAll("button")].find(b => b.textContent === "Code übernehmen").click(), 1)`);
    await warte(400);
  };
  const obenKlick = (text) => js(`(() => { const b = [...${oben}.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error("Knopf fehlt"); b.click(); return 1; })()`);
  const nVor = await js(`liste.length`);
  await klick("main button.kachel.neu", "Scannen");
  await warte(500);
  pruefe(await js(`document.querySelectorAll(".blatt").length`) === 2, "Liste + Kamera darüber offen");
  pruefe(await js(`${oben}.querySelector("h2").textContent`) === "Mehrere scannen", "Titel „Mehrere scannen“");
  await code("4000000000013");
  pruefe((await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("Testerbsen"), "Name aus Open Food Facts unter dem Bild");
  await js(`([...${oben}.querySelectorAll(".zuletzt .monate button")].find(b => b.textContent === "Mär").click(), 1)`);
  await code("4000000000013");
  pruefe((await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("(2×)"), "zweite gleiche Packung erkannt (2×)");
  pruefe((await js(`${oben}.querySelector(".zuletzt .feld b").textContent`)) === "03.2027", "zweite Packung übernimmt MHD 03.2027");
  await code("4000000000020");
  pruefe((await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("unbekannt"), "unbekannter Code: Hinweis Name eintippen");
  await bild("5b-multiscan-kamera.png");
  await obenKlick("Fertig → Liste");
  await warte(400);
  pruefe(await js(`document.querySelectorAll(".blatt").length`) === 1, "Kamera zu, Liste bleibt");
  pruefe(await js(`document.querySelectorAll(".mzeile").length`) === 2, "2 Zeilen (Erbsen ×2, Unbekannt)");
  pruefe(await js(`document.querySelector(".mzeile .plusminus b").textContent`) === "2", "Erbsen-Zeile: Menge 2");
  pruefe(await js(`document.querySelector(".mzeile .mdetail").textContent.includes("03.2027")`), "Erbsen-Zeile: MHD 03.2027");
  pruefe(await js(`document.querySelectorAll(".mzeile.ohnename").length`) === 1, "Zeile ohne Namen rot markiert");
  await obenKlick("Alle speichern");
  await warte(300);
  pruefe((await js(`${oben}.querySelector(".meldung").textContent`)).includes("Namen"), "Speichern ohne Namen: Meldung, nichts gespeichert");
  pruefe(await js(`liste.length`) === nVor, "… und kein Vorgang");
  await js(`(() => { const i = document.querySelectorAll(".mzeile input")[1]; i.value = "Mehl"; i.dispatchEvent(new Event("input")); return 1; })()`);
  pruefe(await js(`document.querySelectorAll(".mzeile.ohnename").length`) === 0, "nach Eintippen nicht mehr rot");
  await js(`(document.querySelectorAll(".mzeile .plusminus button")[3].click(), 1)`); // Mehl +1
  await warte(100);
  pruefe(await js(`document.querySelectorAll(".mzeile .plusminus b")[1].textContent`) === "2", "+ erhöht auf 2");
  await js(`(document.querySelectorAll(".mzeile .plusminus button")[2].click(), 1)`); // Mehl -1
  await warte(100);
  pruefe(await js(`document.querySelectorAll(".mzeile input")[1].value`) === "Mehl", "Name bleibt nach Neuzeichnen");
  pruefe(await js(`[...${oben}.querySelectorAll("select")][1].selectedOptions[0].textContent`).then(t => t.includes("(hier)")), "Ziel vorbelegt mit diesem Fach (hier)");
  await js(`(() => { const s = [...${oben}.querySelectorAll("select")][1]; s.value = [...s.options].find(o => o.textContent === "Schublade 2").value; return 1; })()`);
  await bild("5b-multiscan-liste.png");
  await obenKlick("Alle speichern");
  await warte(700);
  pruefe(await js(`!document.querySelector(".blatt")`), "Liste nach Speichern zu");
  pruefe(await js(`liste.length`) === nVor + 2, "genau 2 Vorgänge (eine Zeile = ein Eintrag)");
  const s2 = await js(`stand.faecher.find(f => f.name === "Schublade 2" && !f.geloescht).id`);
  pruefe(await js(`JSON.stringify(stand.eintraege.filter(e => e.sichtbar && e.fach === ${JSON.stringify(s2)}).map(e => [e.name, e.menge, e.mhd]).sort())`)
    === JSON.stringify([["Mehl", 1, null], ["Testerbsen", 2, "2027-03"]]), "Schublade 2: Testerbsen ×2 (03.2027), Mehl ×1");
  pruefe(await js(`codeName("e4000000000020")`) === "Mehl" || await js(`Object.values(codesLesen()).includes("Mehl")`), "Code → Name gemerkt");
  // Review #2: versehentlich geschlossen -> Zurueckholen statt still verworfen
  await klick("main button.kachel.neu", "Scannen");
  await warte(400);
  await code("4000000000037");
  await obenKlick("Fertig → Liste"); await warte(300);
  await js(`(document.querySelector(".mzeile input").value = "Zucker", document.querySelector(".mzeile input").dispatchEvent(new Event("input")), 1)`);
  await js(`history.back(), 1`); await warte(500);
  pruefe(await js(`!document.querySelector(".blatt") && document.querySelector("#unten").textContent.includes("1 gescannte Packung verworfen")`), "Zurück auf der Liste: Leiste „verworfen · Zurückholen“");
  await klick("#unten button", "Zurückholen"); await warte(400);
  pruefe(await js(`document.querySelectorAll(".blatt").length === 1 && document.querySelector(".mzeile input").value === "Zucker"`), "Zurückholen: Liste samt Name wieder da, ohne Kamera");
  await obenKlick("Abbrechen"); await warte(400);
  await js(`(document.querySelector("#unten").hidden = true, 1)`);

  console.log("5c. v5.1 Kamera nachgestellt: 3 Bilder in Folge, gleicher Code nur per +1");
  // Attrappe: Kamerabild = bunte Leinwand, Erkennung liefert je Aufruf das naechste Bild aus __bilder
  await js(`(() => {
    window.__bilder = [];
    window.BarcodeDetector = class { static async getSupportedFormats() { return ["ean_13", "ean_8", "upc_a", "data_matrix"]; }
      async detect() { return (__bilder.length ? __bilder.shift() : []).map((v) => ({ rawValue: v, format: "ean_13" })); } };
    const c = document.createElement("canvas"); c.width = 64; c.height = 48; const g = c.getContext("2d");
    setInterval(() => { g.fillStyle = "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"); g.fillRect(0, 0, 64, 48); }, 50);
    navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
    return 1; })()`);
  const A = "4000000000037", B = "4000000000013", C = "4000000000044";
  const bilder = async (...liste) => {
    await js(`(__bilder.push(...${JSON.stringify(liste)}), 1)`);
    for (let i = 0; i < 60 && (await js(`__bilder.length`)) > 0; i++) await warte(100);
    await warte(300);
  };
  const anzahl = () => js(`(${oben}.querySelector(".zuletzt").textContent.match(/insgesamt (\\d+)/) || [0, "0"])[1]`).then(Number);
  await klick("main button.kachel.neu", "Scannen");
  await warte(800);
  pruefe(await js(`!${oben}.querySelector("video").hidden`), "Kamerabild läuft (Attrappe)");
  await bilder([A], [A], [], [B], [B], [B]);
  pruefe(await anzahl() === 1, "A nur 2 Bilder (Falschlesung) = nicht gezählt, B nach 3 Bildern = gezählt");
  await bilder([B], [B], [B], [B], [B]);
  pruefe(await anzahl() === 1, "B lange draufgehalten: zählt nicht nochmal");
  await bilder([], [B], [B], [B]);
  pruefe(await anzahl() === 1, "B kurz verloren und wieder da: zählt nicht nochmal");
  pruefe(await js(`!${oben}.querySelector(".zuletzt .hinweis-rot").hidden`), "Hinweis „Schon gezählt … +1 gleiche Packung“");
  await obenKlick("+1 gleiche Packung"); await warte(200);
  pruefe(await anzahl() === 2 && (await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("(2×)"), "+1 gleiche Packung: B ×2");
  await bilder([], [C], [C], [C]);
  pruefe(await anzahl() === 3, "C gezählt");
  await bilder([B, C], [B, C], [B, C], [C], [B, C], [B, C], [B, C]);
  pruefe(await anzahl() === 3, "B und C zusammen im Bild, flackernd: nichts doppelt");
  pruefe((await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("Testerbsen"), "B schon in der Liste: Anzeige springt auf B");
  await obenKlick("+1 gleiche Packung"); await warte(200);
  pruefe(await anzahl() === 4 && (await js(`${oben}.querySelector(".zuletzt").textContent`)).includes("(3×)"), "+1 wirkt auf B (jetzt 3×), nicht auf C");
  await obenKlick("Fertig → Liste"); await warte(300);
  pruefe(await js(`document.querySelectorAll(".mzeile").length`) === 2, "Liste: 2 Zeilen (B ×3, C ×1), A fehlt");
  await obenKlick("Weiter scannen"); await warte(500);
  pruefe(await js(`${oben}.querySelector(".zuletzt .hinweis-rot").hidden`), "Weiter scannen: alter Hinweis weg");
  await obenKlick("Fertig → Liste"); await warte(300);
  pruefe(await js(`[...document.querySelectorAll(".mzeile input")].some(i => i.placeholder.includes("EAN " + ${JSON.stringify(C)}) && i.placeholder.includes("unbekannt"))`), "unbekannte Zeile zeigt die Code-Nummer");
  await bild("5c-kamera-liste.png");
  await obenKlick("Abbrechen"); await warte(400);
  await js(`(document.querySelector("#unten").hidden = true, 1)`);
  await js(`(window.fetch = __f, 1)`);

  console.log("5d. v5.2 Fach-Menü: lange drücken, Umbenennen, Aufteilen mit Ankreuzen, Zusammenlegen");
  await js(`history.back(), 1`); await warte(400); // zurück zur Startseite (Gefrierschrank)
  const lang = async (name) => {
    await js(`(() => { const g = [...document.querySelectorAll("svg .platz")].find((x) => x.querySelector(".fname").textContent.startsWith(${JSON.stringify(name)}));
      g.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, isPrimary: true })); return 1; })()`);
    await warte(700);
    await js(`(() => { const g = [...document.querySelectorAll("svg .platz")].find((x) => x.querySelector(".fname").textContent.startsWith(${JSON.stringify(name)}));
      g.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, isPrimary: true })); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); return 1; })()`);
    await warte(300);
  };
  const plaetze = () => js(`document.querySelectorAll("svg .platz").length`);
  const p0 = await plaetze();
  await lang("Schublade 2");
  pruefe(await js(`stapel[stapel.length - 1].el && document.querySelector(".blatt h2").textContent.includes("Schublade 2")`), "lange drücken: Menü für Schublade 2, nicht geöffnet");
  pruefe(await js(`["Öffnen", "Umbenennen", "Platz ändern", "Aufteilen", "Löschen"].every((t) => [...document.querySelectorAll(".blatt button")].some((b) => b.textContent.includes(t)))`), "Menü: Öffnen, Umbenennen, Platz ändern, Aufteilen, Löschen");
  pruefe(await js(`![...document.querySelectorAll(".blatt button")].some((b) => b.textContent.includes("Zusammenlegen"))`), "kein Zusammenlegen ohne Nachbar");
  await bild("5d-fach-menue.png");
  await klick(".blatt button", "Aufteilen"); await warte(400);
  pruefe(await js(`document.querySelectorAll(".blatt input[type=checkbox]").length`) === 2, "Aufteilen: 2 Einträge zum Ankreuzen (Testerbsen, Mehl)");
  await js(`([...document.querySelectorAll(".blatt label.schalter")].find((l) => l.textContent.includes("Mehl")).querySelector("input").checked = true, 1)`);
  await bild("5d-aufteilen.png");
  const n5 = await js(`liste.length`);
  await klick(".blatt .knoepfe button", "Aufteilen"); await warte(700);
  pruefe(await js(`!document.querySelector(".blatt")`), "Aufteilen-Fenster zu");
  pruefe(await js(`liste.length`) === n5 + 3, "3 Vorgänge: umbenennen, neues Teil, Mehl verschoben");
  pruefe(await plaetze() === p0 + 1, "Zeichnung: ein Fach mehr");
  const ort = (n) => js(`(() => { const e = stand.eintraege.find((x) => x.sichtbar && x.name === ${JSON.stringify(n)}); return e && fachVon(e.fach).name; })()`);
  pruefe(await ort("Mehl") === "Schublade 2 rechts" && await ort("Testerbsen") === "Schublade 2 links", "Mehl rechts, Testerbsen links");
  pruefe(await js(`(() => { const [a, b] = [...document.querySelectorAll("svg .platz")].filter((g) => g.querySelector(".fname").textContent.startsWith("Schub")).slice(1, 3)
    .map((g) => +g.querySelector("rect").getAttribute("x")); return a < b; })()`), "links steht links");
  await bild("5d-aufgeteilt.png");
  await lang("Schublade 2 r");
  await klick(".blatt button", "Zusammenlegen"); await warte(400);
  await klick(".blatt .knoepfe button", "Zusammenlegen"); await warte(700);
  pruefe(await plaetze() === p0 && await ort("Mehl") === "Schublade 2 links", "Zusammenlegen: Mehl wieder links, Teil weg");
  await lang("Schublade 2 l");
  await klick(".blatt button", "Umbenennen"); await warte(400);
  await js(`(() => { const i = document.querySelector(".blatt input"); i.value = "Schublade 2"; return 1; })()`);
  await klick(".blatt .knoepfe button", "Speichern"); await warte(600);
  pruefe(await js(`[...document.querySelectorAll("svg .platz .fname")].some((t) => t.textContent === "Schublade 2")`), "Umbenennen zurück auf „Schublade 2“");
  await klick("svg .platz"); await warte(300); // Schublade 1 öffnen wie vorher
  pruefe(await js(`stapel[stapel.length - 1].art === "fach"`), "Antippen öffnet weiterhin das Fach");

  console.log("5e. v5.3 Ziehen: Fach auf Fach (daneben/tauschen), auf freien Platz, Rückgängig; Kachel auf Fach");
  await js(`history.back(), 1`); await warte(400);
  const fachG = (n) => `[...document.querySelectorAll("svg .platz")].find((g) => g.querySelector(".fname").textContent === ${JSON.stringify(n)})`;
  // Finger runter, 0,65 s halten, erst etwas bewegen (Zug beginnt, Ziel-Leiste erscheint), dann zum Ziel, loslassen
  const ziehe = (von, nach) => js(`(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const mitte = (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    const v = ${von}; v.scrollIntoView({ block: "center" }); await w(100);
    const a = mitte(v), opt = (p) => ({ bubbles: true, isPrimary: true, pointerId: 9, clientX: p.x, clientY: p.y });
    v.dispatchEvent(new PointerEvent("pointerdown", opt(a)));
    await w(650);
    document.dispatchEvent(new PointerEvent("pointermove", opt({ x: a.x + 15, y: a.y + 15 }))); await w(100);
    const z = ${nach}; if (!z) throw new Error("Ziel fehlt"); const b = mitte(z);
    document.dispatchEvent(new PointerEvent("pointermove", opt(b))); await w(100);
    document.dispatchEvent(new PointerEvent("pointerup", opt(b))); await w(400);
    return 1; })()`);
  const reihe = (n) => js(`stand.faecher.find((f) => !f.geloescht && f.name === ${JSON.stringify(n)}).lage.reihe`);
  const frei = () => js(`document.querySelectorAll("svg .frei").length`);
  await ziehe(fachG("Schublade 6"), fachG("Schublade 3"));
  pruefe(await js(`document.querySelector(".blatt h2")?.textContent`) === "„Schublade 6“ auf „Schublade 3“", "auf belegtes Fach: Frage tauschen/daneben");
  await bild("5e-ablegen-frage.png");
  await klick(".blatt button", "Daneben legen"); await warte(600);
  pruefe(await reihe("Schublade 6") === 2 && await frei() === 1, "daneben: Schublade 6 neben 3, Reihe 6 frei");
  await bild("5e-daneben.png");
  await ziehe(fachG("Schublade 6"), `document.querySelector("svg .frei")`);
  pruefe(await reihe("Schublade 6") === 5 && await frei() === 0, "auf freien Platz: ohne Frage verschoben");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await reihe("Schublade 6") === 2, "Rückgängig: wieder neben Schublade 3");
  await ziehe(fachG("Schublade 6"), `document.querySelector("svg .frei")`);
  await ziehe(fachG("Schublade 5"), fachG("Schublade 6"));
  await klick(".blatt button", "Plätze tauschen"); await warte(600);
  pruefe(await reihe("Schublade 5") === 5 && await reihe("Schublade 6") === 4, "tauschen: 5 und 6 haben die Plätze getauscht");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await reihe("Schublade 5") === 4 && await reihe("Schublade 6") === 5, "Rückgängig: Tausch zurück");
  pruefe(await js(`!document.querySelector(".zuggeist") && !zieht`), "nach dem Ziehen nichts hängen geblieben");
  await klick("svg .platz"); await warte(400); // Schublade 1
  const kachelZ = `[...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Brot"))`;
  await ziehe(kachelZ, `[...document.querySelectorAll(".zielchip")].find((c) => c.textContent === "Schublade 2")`);
  pruefe(await js(`fachVon(stand.eintraege.find((e) => e.sichtbar && e.name === "Brot").fach).name`) === "Schublade 2", "Kachel ziehen (gemeinsamer Ablauf): Brot → Schublade 2");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`fachVon(stand.eintraege.find((e) => e.sichtbar && e.name === "Brot").fach).name`) === "Schublade 1", "… und zurück");

  console.log("5f. v6 A: Produktbild von Open Food Facts, Code im Eintrag, PZN nie ans Netz, Code entfernen");
  // Attrappe: OFF-Antwort mit Bild-Adresse; der Bildserver liefert ein echtes JPEG (Leinwand 600x450). Jeder Abruf wird mitgeschrieben.
  await js(`(async () => {
    const c = document.createElement("canvas"); c.width = 600; c.height = 450; const g = c.getContext("2d");
    g.fillStyle = "#c33"; g.fillRect(0, 0, 600, 450); g.fillStyle = "#fff"; g.fillRect(250, 175, 100, 100);
    window.__jpg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    window.__abrufe = []; window.__f2 = window.fetch;
    window.fetch = (u, o) => { u = String(u); __abrufe.push(u);
      if (u.includes("world.openfoodfacts.org")) { const da = u.includes("4000000000051");
        return Promise.resolve(new Response(JSON.stringify(da ? { status: 1, product: { product_name_de: "Bildtest", image_front_url: "https://images.openfoodfacts.org/x/front.400.jpg" } } : { status: 0 }), { status: da ? 200 : 404 })); }
      if (u.startsWith("https://images.openfoodfacts.org/")) return Promise.resolve(new Response(__jpg, { status: 200, headers: { "content-type": "image/jpeg" } }));
      return __f2(u, o); };
    return 1; })()`);
  await js(`history.back(), 1`); await warte(400);
  await js(`(${fachG("Schublade 2")}.dispatchEvent(new MouseEvent("click", { bubbles: true })), 1)`); await warte(400);
  pruefe(await js(`document.querySelector(".ansichtkopf h2").textContent`) === "Schublade 2", "Schublade 2 offen");
  const neuMitCode = async (c, name) => {
    await klick("main button.kachel.neu", "Neu"); await warte(300);
    await obenKlick("📷 Scannen"); await warte(400);
    await code(c); await warte(600);
    if (name) await js(`(() => { const n = document.querySelector(".fenster input"); n.value = ${JSON.stringify(name)}; n.dispatchEvent(new Event("input")); return 1; })()`);
    await obenKlick("Speichern"); await warte(700);
  };
  await neuMitCode("4000000000051");
  const e5f = (n) => `stand.eintraege.find((e) => e.sichtbar && e.name === ${JSON.stringify(n)})`;
  pruefe(await js(`${e5f("Bildtest")}?.code`) === "gtin:4000000000051", "Eintrag kennt seinen Code (Einzel-Scan, eingetippt)");
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector("main .kachel img.foto")`)); i++) await warte(200);
  pruefe(await js(`[...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Bildtest"))?.querySelector("img.foto")?.src.startsWith("blob:")`), "Kachel zeigt das Foto");
  pruefe(await js(`(async () => { const i = document.querySelector("main .kachel img.foto"); await i.decode(); return i.naturalWidth + "x" + i.naturalHeight; })()`) === "400x400", "Foto ist 400 x 400 (quadratisch zugeschnitten)");
  pruefe(await js(`__abrufe.filter((u) => u.startsWith("https://images.openfoodfacts.org/")).length`) === 1, "Bild genau einmal geladen");
  pruefe(await js(`Bilder.offLesen("gtin:4000000000051").then((b) => !!b && b.type === "image/jpeg")`), "Bild liegt im Bild-Speicher (JPEG)");
  await bild("5f-foto.png");
  const offVorher = await js(`__abrufe.filter((u) => u.includes("openfoodfacts")).length`);
  await neuMitCode("PZN 1234562", "Ibuprofen 400");
  pruefe(await js(`${e5f("Ibuprofen 400")}?.code`) === "pzn:01234562", "Medikament kennt seine PZN");
  await warte(500);
  pruefe(await js(`__abrufe.filter((u) => u.includes("openfoodfacts")).length`) === offVorher, "PZN: keine Anfrage an Open Food Facts (Codex #13)");
  await klick("main button.kachel", "Bildtest"); await warte(300);
  await klick(".blatt button", "Bearbeiten"); await warte(500);
  pruefe((await js(`document.querySelector(".codezeile")?.textContent || ""`)).includes("EAN 4000000000051"), "Bearbeiten zeigt den Strichcode");
  const n5f = await js(`liste.length`);
  await obenKlick("Speichern"); await warte(600);
  pruefe(await js(`liste.length`) === n5f, "Bearbeiten ohne Änderung: Code bleibt, kein Vorgang (Codex #10)");
  await klick("main button.kachel", "Bildtest"); await warte(300);
  await klick(".blatt button", "Bearbeiten"); await warte(500);
  await obenKlick("entfernen"); await obenKlick("Speichern"); await warte(600);
  pruefe(await js(`liste.length`) === n5f + 1 && await js(`liste[liste.length - 1].feld === "code" && liste[liste.length - 1].wert === null`), "Code entfernen = ein Vorgang code: null");
  pruefe(await js(`![...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Bildtest"))?.querySelector("img.foto")`), "ohne Code wieder das Bildchen");

  console.log("5g. v6 B: eigenes Foto (Name, Code), Speicher voll, ersetzen, umbenennen kopiert, späte Internet-Antwort, entfernen");
  // Dateiauswahl abfangen: statt des Android-Fensters bekommt der Test das <input> und legt selbst ein JPEG hinein.
  await js(`(window.__klickAlt = HTMLInputElement.prototype.click, HTMLInputElement.prototype.click = function () { if (this.type === "file") { window.__wahl = this; return; } return __klickAlt.call(this); }, 1)`);
  const fotoGeben = (farbe) => js(`(async () => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600; const g = c.getContext("2d"); g.fillStyle = ${JSON.stringify(farbe)}; g.fillRect(0, 0, 800, 600);
    const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([b], "kamera.jpg", { type: "image/jpeg" }));
    __wahl.files = dt.files; __wahl.dispatchEvent(new Event("change")); return 1; })()`);
  const warteAuf = async (ausdruck) => { for (let i = 0; i < 40 && !(await js(ausdruck)); i++) await warte(150); };
  const vorschauDa = () => warteAuf(`!!document.querySelector(".fenster img.vorschau")`);
  const kachelSrc = (n) => js(`[...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes(${JSON.stringify(n)}))?.querySelector("img.foto")?.src || null`);
  const menueKnoepfe = () => js(`[...document.querySelectorAll(".blatt button")].map((b) => b.textContent)`);
  const letzter = () => js(`liste[liste.length - 1]`);
  const umbenennen = async (alt, neu) => {
    await klick("main button.kachel", alt); await warte(300);
    await klick(".blatt button", "Bearbeiten"); await warte(500);
    await js(`(() => { const n = document.querySelector(".fenster input"); n.value = ${JSON.stringify(neu)}; n.dispatchEvent(new Event("input")); return 1; })()`);
    await obenKlick("Speichern"); await warte(700);
  };
  // a) Foto je Name: "Bildtest" hat seit 5f keinen Code mehr
  await klick("main button.kachel", "Bildtest"); await warte(300);
  pruefe(!(await menueKnoepfe()).some((t) => t.includes("Foto entfernen")), "Menü ohne Foto: kein „Foto entfernen“");
  await klick(".blatt button", "📷 Foto"); await warte(400);
  pruefe(await js(`!!window.__wahl && __wahl.accept === "image/*" && !__wahl.hasAttribute("capture")`), "Dateiauswahl direkt aus dem Tipp (Kamera oder Galerie)");
  await fotoGeben("#2255cc"); await vorschauDa();
  pruefe(await js(`[...document.querySelectorAll(".fenster h2")].pop().textContent`) === "Foto übernehmen?", "Vorschau-Fenster offen");
  pruefe(await js(`(async () => { const i = document.querySelector(".fenster img.vorschau"); await i.decode(); return i.naturalWidth + "x" + i.naturalHeight; })()`) === "400x400", "Vorschau zeigt den Ausschnitt 400 x 400");
  pruefe((await js(`document.querySelector(".fenster img.vorschau").closest(".fenster").textContent`)).includes("Foto für alle „Bildtest“ – auf beiden Handys"), "Text nennt die Reichweite");
  const n5g = await js(`liste.length`);
  await js(`(window.__fs = Bilder.fotoSpeichern, Bilder.fotoSpeichern = async () => false, 1)`);
  await obenKlick("Übernehmen"); await warte(400);
  pruefe((await js(`[...document.querySelectorAll(".fenster .meldung")].pop().textContent`)).includes("Foto nicht gespeichert") && (await js(`liste.length`)) === n5g, "Speicher voll: sichtbare Meldung, kein Vorgang");
  await js(`(Bilder.fotoSpeichern = __fs, 1)`);
  await obenKlick("Übernehmen"); await warte(800);
  let v = await letzter();
  pruefe((await js(`liste.length`)) === n5g + 1 && v.art === "bild" && v.typ === "neu" && v.werte.schluessel === "n:bildtest" && /^foto-[0-9a-f]{32}\.jpg$/.test(v.werte.datei), "Übernehmen = ein Vorgang bild (Name-Schlüssel, Zufallsname)");
  const d1 = v.werte.datei;
  pruefe(await js(`Bilder.fotoLesen(${JSON.stringify(d1)}).then((b) => !!b && b.type === "image/jpeg")`), "Fotodatei liegt im Bild-Speicher");
  pruefe((await kachelSrc("Bildtest")) === (await js(`fotoUrls.get(${JSON.stringify(d1)})`)), "Kachel zeigt das eigene Foto");
  pruefe((await js(`Bilder.fotosOffen(null)`)) === 1, "1 Foto noch nicht hochgeladen");
  // b) ersetzen: dasselbe Objekt, neue Datei
  await klick("main button.kachel", "Bildtest"); await warte(300);
  const mk = await menueKnoepfe();
  pruefe(mk.includes("📷 Foto ersetzen") && mk.some((t) => t.includes("Foto entfernen")), "Menü mit Foto: ersetzen + entfernen");
  await klick(".blatt button", "📷 Foto ersetzen"); await warte(400);
  await fotoGeben("#22aa44"); await vorschauDa();
  await obenKlick("Übernehmen"); await warte(800);
  v = await letzter();
  pruefe(v.typ === "feld" && v.feld === "datei" && v.wert !== d1 && (await js(`stand.bilder.length`)) === 1, "Ersetzen = Feld datei am vorhandenen Objekt, neuer Name");
  const d2 = v.wert;
  pruefe((await kachelSrc("Bildtest")) === (await js(`fotoUrls.get(${JSON.stringify(d2)})`)), "Kachel zeigt das neue Foto");
  // c) umbenennen: neuer Name ohne Foto -> Kopie, alter Name behaelt seins; zurueck: Ziel hat Foto -> keine Kopie
  await umbenennen("Bildtest", "Bildtest Neu");
  pruefe(await js(`stand.fotoVon.has("n:bildtest neu") && stand.fotoVon.get("n:bildtest neu") !== stand.fotoVon.get("n:bildtest") && stand.fotoVon.get("n:bildtest") === ${JSON.stringify(d2)}`), "Umbenennen: Kopie unter neuem Namen, alter Name behält sein Foto");
  pruefe((await kachelSrc("Bildtest Neu")) !== null, "umbenannte Kachel zeigt das Foto");
  await umbenennen("Bildtest Neu", "Bildtest");
  pruefe((await js(`stand.bilder.length`)) === 2 && (await js(`${e5f("Bildtest")}?.name`)) === "Bildtest", "Zurück umbenennen: Ziel hat ein Foto, keine weitere Kopie");
  // d) Foto je Code gewinnt gegen das Internetbild, auch gegen eine spaete Internet-Antwort; Entfernen -> Internetbild zurueck
  await neuMitCode("4000000000051", "Codefoto");
  for (let i = 0; i < 20 && !(await kachelSrc("Codefoto")); i++) await warte(200);
  const offU = await js(`bildUrls.get("gtin:4000000000051")`);
  pruefe(!!offU && (await kachelSrc("Codefoto")) === offU, "Codefoto zeigt zuerst das Internetbild");
  await klick("main button.kachel", "Codefoto"); await warte(300);
  await klick(".blatt button", "📷 Foto"); await warte(400);
  await fotoGeben("#aa22aa"); await vorschauDa();
  pruefe((await js(`document.querySelector(".fenster img.vorschau").closest(".fenster").textContent`)).includes("Foto für alle Packungen mit EAN 4000000000051"), "Text nennt den Strichcode als Reichweite");
  await obenKlick("Übernehmen"); await warte(800);
  v = await letzter();
  pruefe(v.art === "bild" && v.werte.schluessel === "gtin:4000000000051", "Foto mit Code-Schlüssel");
  const eigenU = await js(`fotoUrls.get(stand.fotoVon.get("gtin:4000000000051"))`);
  pruefe((await kachelSrc("Codefoto")) === eigenU, "eigenes Foto gewinnt gegen das Internetbild");
  await js(`(bildDa("gtin:4000000000051", __jpg), 1)`); await warte(500);
  pruefe((await kachelSrc("Codefoto")) === eigenU, "späte Internet-Antwort überschreibt das eigene Foto nicht (Codex #12)");
  await klick("main button.kachel", "Codefoto"); await warte(300);
  await klick(".blatt button", "Foto entfernen"); await warte(800);
  pruefe((dialoge[dialoge.length - 1] || "").includes("beiden Handys"), "Rückfrage nennt „beide Handys“");
  v = await letzter();
  pruefe(v.feld === "datei" && v.wert === null && !(await js(`stand.fotoVon.has("gtin:4000000000051")`)), "Entfernen = datei: null");
  pruefe((await kachelSrc("Codefoto")) === (await js(`bildUrls.get("gtin:4000000000051")`)), "nach dem Entfernen wieder das Internetbild");
  pruefe((await js(`fotoText()`)).includes("Dazu 2 eigene Fotos, noch nicht in OneDrive"), "Lösch-Rückfrage zählt nur aktuelle Fotos (2, ersetzte/entfernte nicht)");
  // Review v6 B #1: Kamera-JPEG mit ueber 64 KB Zusatzdaten vor dem SOF-Marker wird gelesen
  pruefe(await js(`(async () => {
    const c = document.createElement("canvas"); c.width = 640; c.height = 480; c.getContext("2d").fillRect(0, 0, 640, 480);
    const j = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9))).arrayBuffer());
    const app = (m, n) => { const a = new Uint8Array(n + 2); a[0] = 0xff; a[1] = m; a[2] = n >> 8; a[3] = n & 255; return a; }; // Laenge n inkl. 2 Byte
    const gross = new Blob([j.slice(0, 2), app(0xe1, 65000), app(0xe2, 60000), j.slice(2)], { type: "image/jpeg" });
    const b = await Bilder.normalisieren(gross); return gross.size > 120000 && !!b; })()`), "Kamera-JPEG mit 125 KB Kopfdaten wird gelesen (Review #1)");
  // Review v6 B #3: Doppeltipp auf "Übernehmen" = ein Vorgang
  await klick("main button.kachel", "Codefoto"); await warte(300);
  await klick(".blatt button", "📷 Foto"); await warte(400);
  await fotoGeben("#888800"); await vorschauDa();
  const n3 = await js(`liste.length`);
  await js(`(() => { const b = [...document.querySelectorAll(".fenster button")].find((x) => x.textContent === "Übernehmen"); b.click(); b.click(); return 1; })()`); await warte(1000);
  pruefe((await js(`liste.length`)) === n3 + 1, "Doppeltipp auf „Übernehmen“: genau ein Vorgang (Review #3)");
  // Review v6 B #2: Foto vom anderen Handy, Datei noch nicht da -> Internetbild statt Bildchen
  await js(`tun([H.fotoSchritt(stand.bilder, "gtin:4000000000051", "foto-" + "d".repeat(32) + ".jpg")])`); await warte(800);
  pruefe((await kachelSrc("Codefoto")) === (await js(`bildUrls.get("gtin:4000000000051")`)), "fremdes Foto ohne Datei: Kachel zeigt das Internetbild (Review #2)");
  await js(`(HTMLInputElement.prototype.click = __klickAlt, 1)`);
  console.log("5h. v6.1 Produkt-Fenster: großes Bild, Umschalter Inhaltsstoffe, PZN ohne Umschalter");
  await js(`(() => { const alt = window.fetch; window.fetch = (u, o) => String(u).includes("ingredients_text") ? (__abrufe.push(String(u)), Promise.resolve(new Response(JSON.stringify({ status: 1, product: {
    ingredients_text_de: "Weizenmehl, <b>Zucker</b>", allergens_tags: ["en:milk"], additives_tags: ["en:e330"], nutriscore_grade: "b", nutriments: { sugars_100g: 12.5 } } }), { status: 200 }))) : alt(u, o); return 1; })()`);
  await klick("main button.kachel", "Codefoto"); await warte(300);
  pruefe(await js(`(async () => { const i = document.querySelector(".fenster .produkt img.gross"); if (!i) return false; await i.decode(); return i.naturalWidth > 0 && i.getBoundingClientRect().width > 150; /* Quelle: rohes Testbild aus der späten Antwort */ })()`), "Produkt-Fenster zeigt das große Bild");
  await klick(".fenster button.umschalt", "Inhaltsstoffe"); await warte(500);
  const info = await js(`document.querySelector(".fenster .produkt").textContent`);
  pruefe(info.includes("Nutri-Score B") && info.includes("Milch") && info.includes("E330") && info.includes("12,5 g") && info.includes("Weizenmehl, <b>Zucker</b>"), "Inhaltsstoffe: Nutri-Score, Allergene, E-Nummern, Nährwerte, Zutaten (als Text, kein HTML)");
  await bild("5h-inhaltsstoffe.png");
  const nInfo = await js(`__abrufe.filter((u) => u.includes("ingredients_text")).length`);
  await klick(".fenster button.umschalt", "Bild"); await warte(200);
  pruefe(await js(`!!document.querySelector(".fenster .produkt img.gross")`), "Umschalter zurück zum Bild");
  await klick(".fenster button.umschalt", "Inhaltsstoffe"); await warte(300);
  pruefe((await js(`__abrufe.filter((u) => u.includes("ingredients_text")).length`)) === nInfo, "zweites Umschalten ohne neuen Abruf");
  await js(`history.back(), 1`); await warte(400);
  await klick("main button.kachel", "Ibuprofen"); await warte(300);
  pruefe(await js(`!document.querySelector(".fenster button.umschalt") && !!document.querySelector(".fenster .produkt")`), "Medikament (PZN): großes Bildchen, kein Inhaltsstoffe-Knopf");
  await bild("5h-produkt-pzn.png");
  await js(`history.back(), 1`); await warte(400);
  await js(`(window.fetch = __f2, 1)`);
  await js(`history.back(), 1`); await warte(400);
  await klick("svg .platz"); await warte(400); // Schublade 1 wie vorher

  console.log("6. Lange drücken = Bearbeiten, Nachgezählt");
  await js(`(() => { const k = [...document.querySelectorAll(".kachel")].find(k => k.textContent.includes("Brot")); k.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true })); return 1; })()`);
  await warte(700);
  // v4: Loslassen nach langem Druck = Menue, daraus "Bearbeiten"
  await js(`(() => { const k = [...document.querySelectorAll(".kachel")].find(k => k.textContent.includes("Brot")); k.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, isPrimary: true })); k.dispatchEvent(new MouseEvent("click", { bubbles: true })); return 1; })()`);
  await warte(300);
  // v6.2: langer Druck = markieren (kein Menue mehr); "Fertig", dann Antippen = Menue
  pruefe(await js(`stapel[stapel.length - 1].markiert?.size === 1 && !dialogOffen()`), "v6.2: langer Druck markiert, kein Menü");
  await warte(300); // Nachklick-Sperre (400 ms) abwarten: so schnell tippt kein Mensch
  await klick(".markleiste button", "Fertig"); await warte(200);
  await klick("main .kachel", "Brot"); await warte(300);
  pruefe(await js(`[...document.querySelectorAll(".blatt button")].some(b => b.textContent.includes("Verschieben"))`), "Antippen öffnet das Menü");
  pruefe(await js(`[...document.querySelectorAll(".kachel")].find(k => k.textContent.includes("Brot")) !== undefined`), "Klick nach langem Druck hat nicht −1 gemacht (Brot noch da)");
  await klick(".blatt button", "Bearbeiten");
  await warte(800);
  pruefe(await js(`document.querySelector(".blatt h2")?.textContent`) === "Bearbeiten", "Bearbeiten-Dialog offen");
  await bild("6-bearbeiten.png");
  const vorher = await js(`liste.length`);
  await js(`(() => { const n = [...document.querySelectorAll(".fenster input[type=number]")].find(i => i.placeholder === "Stück"); n.value = "4"; return 1; })()`);
  await klick(".fenster .knoepfe button", "Speichern");
  await warte(600);
  pruefe(await js(`liste.length`) === vorher + 1, "Nachgezählt = genau 1 Vorgang (keine unveränderten Felder)");
  pruefe(await js(`liste[liste.length - 1].grund`) === "korrektur", "… und zwar eine Korrektur");

  console.log("7. Android-Zurück schließt Dialog, dann Kachelansicht (#87)");
  await klick("main button.kachel.neu");
  await warte(300);
  await js(`history.back(), 1`);
  await warte(400);
  pruefe(await js(`!document.querySelector(".blatt") && stapel[stapel.length - 1].art === "fach"`), "Zurück: Dialog zu, Kachelansicht bleibt");
  await js(`history.back(), 1`);
  await warte(400);
  pruefe(await js(`stapel.length === 1 && !!document.querySelector("svg.ortbild")`), "Zurück: Startseite");
  await bild("7-start-mit-rot.png");

  console.log("8. Kiste löschen -> Ort klären");
  await klick("svg .platz");
  await warte(300);
  await klick("main .ansichtkopf button.neben");
  await warte(300);
  await klick(".fenster button.gefahr");
  await warte(800);
  pruefe(await js(`stapel.length === 1`), "nach Löschen zurück auf der Startseite (2 Ebenen)");
  pruefe(await js(`document.querySelector("main button.ortklaeren")?.textContent`) === "Ort klären (6)", "Knopf „Ort klären (6)“");
  await bild("8-ort-klaeren-knopf.png");
  await klick("main button.ortklaeren");
  await warte(300);
  await bild("8b-ort-klaeren-liste.png");
  await js(`history.back(), 1`);
  await warte(300);

  console.log("9. Regal-Zeichnung, freier Platz");
  await klick(".reiter button", "Vorrats-Regal");
  await warte(300);
  await bild("9-regal.png");
  await klick(".reiter button", "Medizinschrank");
  await warte(300);
  pruefe(await js(`document.querySelectorAll("svg .frei").length`) === 6, "Medizinschrank: 6 freie Plätze");
  await klick("svg .frei");
  await warte(300);
  await js(`(() => { const n = document.querySelector(".fenster input"); n.value = "Schmerzmittel"; return 1; })()`);
  await klick(".fenster .knoepfe button", "Speichern");
  await warte(500);
  pruefe(await js(`document.querySelectorAll("svg .frei").length`) === 5, "Kiste auf freiem Platz angelegt");

  console.log("9a. v6.2: Raster am Regal, Markieren + mehrere verschieben, Reiter-Nr. automatisch");
  await klick(".reiter button", "Gefrierschrank"); await warte(300);
  pruefe(await js(`!document.querySelector(".knoepfe.raster")`), "Gefrierschrank (Schubladen): keine Raster-Knöpfe");
  await klick(".reiter button", "Vorrats-Regal"); await warte(300);
  pruefe(await js(`!document.querySelector(".knoepfe.raster") && !document.querySelector(".umbau") && !document.querySelector("main .scanstart")`), "v6.16 Normalmodus: keine Umbau-Knöpfe unter der Zeichnung");
  pruefe(await js(`document.querySelector("main button.modusknopf").textContent === "✎ Bearbeiten" && document.querySelector("main button.modusknopf").getAttribute("aria-pressed") === "false"`), "v6.16: Schalter „✎ Bearbeiten“ an der Zeichnung");
  await bearb(true);
  pruefe(await js(`stapel.length === 2 && imBearbeiten() && document.querySelector("main button.modusknopf").textContent === "✓ Fertig" && !!document.querySelector(".zeichenfeld.bearbeiten") && document.querySelector(".zeichenkopf .modus").textContent.includes("Vorrats-Regal")`), "v6.16: Bearbeiten-Modus erkennbar (Fertig, Rahmen, Ortsname), eigene Ebene");
  pruefe(await js(`[...document.querySelectorAll(".umbau .umbauname")].map((x) => x.textContent).join("|")`) === "Reihen|Spalten|Ort", "v6.16: Umbau-Knöpfe gruppiert (Reihen, Spalten, Ort)");
  await klick(".reiter button", "Gefrierschrank"); await warte(300);
  pruefe(await js(`imBearbeiten() && !document.querySelector(".knoepfe.raster") && [...document.querySelectorAll(".umbau button")].map((b) => b.textContent).join("|") === "✎ Name und Größe …"`), "v6.16: Gefrierschrank im Modus: nur „Name und Größe“");
  await klick(".umbau button", "Name und Größe"); await warte(300);
  pruefe(await js(`document.querySelector(".blatt h2").textContent === "Ort bearbeiten" && document.querySelector(".fenster input").value === "Gefrierschrank"`), "v6.16: „Name und Größe“ öffnet den Ort-Dialog");
  await js(`history.back(), 1`); await warte(300);
  await js(`history.back(), 1`); await warte(300);
  pruefe(await js(`stapel.length === 1 && !imBearbeiten() && !document.querySelector(".umbau")`), "v6.16: Zurück (Android) verlässt den Bearbeiten-Modus");
  await klick(".reiter button", "Vorrats-Regal"); await warte(300);
  await bearb(true);
  const regal = (f) => js(`orteSichtbar().find((o) => o.name === "Vorrats-Regal").${f}`);
  const rk = () => js(`[...document.querySelectorAll(".knoepfe.raster button")].map((b) => b.textContent).join("|")`);
  const hinweisText = () => js(`[...document.querySelectorAll(".hinweis")].map((h) => h.textContent).join("|")`);
  pruefe(await rk() === "+ Reihe|− Reihe|+ Spalte", "Regal 4×2: + Reihe, − Reihe, + Spalte (kein − Spalte bei 2)");
  const frei0 = await frei();
  console.log("  freie Plätze am Start: " + frei0);
  await klick(".knoepfe.raster button", "+ Reihe"); await warte(500);
  pruefe(await regal("reihen") === 5 && await frei() === frei0 + 2, "+ Reihe: 5 Reihen, 2 neue freie Plätze");
  await klick(".knoepfe.raster button", "+ Spalte"); await warte(500);
  pruefe(await regal("spalten") === 3 && await frei() === frei0 + 7, "+ Spalte: 3 Spalten, 5 weitere freie Plätze");
  pruefe((await rk()).includes("− Spalte"), "− Spalte erscheint ab 3 Spalten");
  await bild("9a-raster.png");
  const kisteId = await js(`document.querySelector("svg .platz").dataset.fach`);
  await ziehe(`document.querySelector("svg .platz")`, `[...document.querySelectorAll("svg .frei")].find((g) => { const p = JSON.parse(g.dataset.platz); return p.reihe === 0 && p.spalte === 2; })`);
  pruefe(await js(`fachVon(${JSON.stringify(kisteId)}).lage.spalte`) === 2, "Kiste per Ziehen in die neue Spalte eingerastet");
  await klick(".knoepfe.raster button", "− Spalte"); await warte(400);
  pruefe(await regal("spalten") === 3 && (await hinweisText()).includes("Spalte steht noch"), "− Spalte verweigert, solange dort eine Kiste steht");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`fachVon(${JSON.stringify(kisteId)}).lage.spalte`) < 2, "Rückgängig: Kiste zurück");
  await klick(".knoepfe.raster button", "− Spalte"); await warte(500);
  await klick(".knoepfe.raster button", "− Reihe"); await warte(500);
  pruefe(await regal("spalten") === 2 && await regal("reihen") === 4 && await frei() === frei0, "− Spalte, − Reihe: zurück auf 4×2");
  const letzteBelegt = await js(`(() => { const o = orteSichtbar().find((x) => x.name === "Vorrats-Regal"); return faecherAn(o.id, 3, 0).length + faecherAn(o.id, 3, 1).length > 0; })()`);
  if (letzteBelegt) {
    await klick(".knoepfe.raster button", "− Reihe"); await warte(400);
    pruefe(await regal("reihen") === 4 && (await hinweisText()).includes("Reihe steht noch"), "− Reihe verweigert: in der letzten Reihe stehen Kisten");
  } else pruefe(false, "Testannahme: letzte Regal-Reihe belegt");
  await bearb(false);
  pruefe(await js(`stapel.length === 1 && !document.querySelector(".knoepfe.raster")`), "v6.16: „Fertig“ verlässt den Modus, Knöpfe weg");

  await klick("svg .platz"); await warte(400);
  const quelle = await js(`stapel[stapel.length - 1].id`);
  for (const n of ["Mark A", "Mark B", "Mark C"]) await neu(n, {}, 1);
  await warte(400);
  const kachelN = (n) => `[...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes(${JSON.stringify(n)}))`;
  // Wie Android: nach dem Loslassen schiebt der Browser einen Klick nach - auf die NEU gezeichnete Kachel.
  const langDruck = (sel) => js(`(async () => { const v = ${sel}; const b = v.getBoundingClientRect(), o = { bubbles: true, isPrimary: true, pointerId: 7, clientX: b.left + 20, clientY: b.top + 20 };
    v.dispatchEvent(new PointerEvent("pointerdown", o)); await new Promise((r) => setTimeout(r, 650));
    document.dispatchEvent(new PointerEvent("pointerup", o)); const n = ${sel}; n.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450)); return 1; })()`);
  const M = "stapel[stapel.length - 1].markiert";
  await langDruck(kachelN("Mark A"));
  pruefe(await js(`!!document.querySelector(".markleiste") && ${M}?.size === 1 && !dialogOffen()`), "lange drücken: Mark A markiert, Leiste da, kein Menü; nachgeschobener Klick hebt es nicht auf");
  await klick("main .kachel", "Mark C"); await warte(200);
  pruefe(await js(`${M}.size`) === 2 && await js(`document.querySelectorAll("main .kachel.markiert").length`) === 2, "antippen: Mark C dazu (2 markiert)");
  await klick("main .kachel", "Mark C"); await warte(200);
  pruefe(await js(`${M}.size`) === 1, "nochmal antippen: abgewählt");
  await klick("main .kachel", "Mark C"); await warte(200);
  pruefe(await js(`!document.querySelector("main .kachel.neu") && !dialogOffen()`), "beim Markieren: keine Neu/Scannen-Kacheln, kein Menü");
  await bild("9a-markiert.png");
  await klick(".markleiste button", "Verschieben"); await warte(300);
  const ziel = await js(`faecherVonOrt(fachVon(${JSON.stringify(quelle)}).lage.ort).find((f) => f.id !== ${JSON.stringify(quelle)}).id`);
  await js(`(() => { const s = [...document.querySelectorAll(".fenster select")][1]; s.value = ${JSON.stringify(ziel)}; return 1; })()`);
  await bild("9a-verschieben.png");
  await klick(".fenster .knoepfe button", "Verschieben"); await warte(700);
  const fachVonN = (n) => js(`stand.eintraege.find((e) => e.sichtbar && e.name === ${JSON.stringify(n)}).fach`);
  pruefe(await fachVonN("Mark A") === ziel && await fachVonN("Mark C") === ziel && await fachVonN("Mark B") === quelle, "A und C verschoben (ein Schritt), B bleibt");
  pruefe(await js(`!${M} && stapel[stapel.length - 1].art === "fach" && !document.querySelector(".markleiste")`), "danach: Markierung weg, Fach-Ansicht bleibt offen");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await fachVonN("Mark A") === quelle && await fachVonN("Mark C") === quelle, "ein Rückgängig holt beide zurück");
  await langDruck(kachelN("Mark B"));
  await klick(".markleiste button", "Alle"); await warte(200);
  pruefe(await js(`${M}.size === imFach(${JSON.stringify(quelle)}).length`), "Alle: alles im Fach markiert");
  await klick(".markleiste button", "Fertig"); await warte(300);
  pruefe(await js(`!${M} && stapel[stapel.length - 1].art === "fach" && !!document.querySelector("main .kachel.neu")`), "Fertig: Markierung weg, Neu-Kachel zurück");
  await langDruck(kachelN("Mark B"));
  await js(`history.back(), 1`); await warte(300);
  pruefe(await js(`!${M} && stapel[stapel.length - 1].art === "fach"`), "Android-Zurück hebt nur die Markierung auf, Fach bleibt offen");
  await langDruck(kachelN("Mark B"));
  await klick("main .kachel", "Mark B"); await warte(300);
  pruefe(await js(`!${M} && stapel[stapel.length - 1].art === "fach"`), "letzte Markierung abgewählt = Markieren beendet");
  // v6.12: markierte auf einmal loeschen + Rueckgaengig
  await langDruck(kachelN("Mark A")); await klick("main .kachel", "Mark B"); await warte(200);
  await klick(".markleiste button", "Löschen"); await warte(700);
  pruefe(await js(`!stand.eintraege.some((e) => e.sichtbar && (e.name === "Mark A" || e.name === "Mark B")) && stand.eintraege.some((e) => e.sichtbar && e.name === "Mark C")`), "v6.12: markierte löschen (A, B weg, C bleibt)");
  pruefe(await js(`!stapel[stapel.length - 1].markiert && stapel[stapel.length - 1].art === "fach"`), "danach Markieren beendet, Fach bleibt offen");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`["Mark A", "Mark B"].every((n) => stand.eintraege.some((e) => e.sichtbar && e.name === n))`), "Rückgängig holt beide zurück");
  await js(`tun(stand.eintraege.filter((e) => e.sichtbar && e.name.startsWith("Mark ")).map((e) => ({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" }))).then(() => 1)`); await warte(400);
  await js(`history.back(), 1`); await warte(300);

  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Ort anlegen"); await warte(300);
  pruefe(await js(`![...document.querySelectorAll(".fenster .feld span")].some((s) => s.textContent.includes("Reiter"))`), "Ort-Dialog ohne Reiter-Nr.");
  await js(`(() => { document.querySelector(".fenster input").value = "Keller"; return 1; })()`);
  await klick(".fenster .knoepfe button", "Speichern"); await warte(500);
  pruefe(await js(`orteSichtbar().map((o) => o.name).pop()`) === "Keller", "neuer Ort automatisch als letzter Reiter");
  await klick("main button.zeile", "Keller"); await warte(300);
  await klick(".fenster .knoepfe button", "Löschen"); await warte(500);
  pruefe(await js(`!orteSichtbar().some((o) => o.name === "Keller")`), "Testort wieder gelöscht");
  await js(`history.back(), 1`); await warte(300);

  console.log("9c. v6.3: abgelaufene Anmeldung – automatisch erneuern nur beim Öffnen, ohne Dialog, höchstens alle 10 Min.");
    await js(`(() => { window.__alt = { name: konto.name, erneuern: konto.erneuern, ab: Cloud.abgleichen, einst: localStorage.getItem(EINST_KEY) }; window.__erneuert = 0;
    if (__alt.einst === null) localStorage.setItem(EINST_KEY, JSON.stringify(einst));
    konto.name = () => "Test"; konto.erneuern = () => { __erneuert++; return Promise.resolve(); };
    Cloud.abgleichen = async () => { konto.abgelaufen = true; return { ok: false, fehler: "Anmeldung abgelaufen – „Neu anmelden“ antippen" }; };
    sessionStorage.removeItem("vorrat-auto-anmeldung"); return 1; })()`);
  await js(`abgleich(true).then(() => 1)`); await warte(300);
  pruefe(await js(`__erneuert`) === 1, "beim Öffnen/Zurückkehren: automatisch zu Microsoft (ohne Kontoauswahl)");
  await js(`abgleich(true).then(() => 1)`); await warte(300);
  pruefe(await js(`__erneuert`) === 1, "zweiter Versuch innerhalb 10 Min.: keine Schleife");
  await js(`(sessionStorage.removeItem("vorrat-auto-anmeldung"), abgleich().then(() => 1))`); await warte(300);
  pruefe(await js(`__erneuert`) === 1, "Abgleich nach einer Änderung (nicht Öffnen): keine Umleitung");
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Ort anlegen"); await warte(300);
  await js(`abgleich(true).then(() => 1)`); await warte(300);
  pruefe(await js(`__erneuert`) === 1, "Dialog offen: keine Umleitung");
  await js(`history.back(), 1`); await warte(300);
  await js(`history.back(), 1`); await warte(300);
  pruefe(await js(`[...document.querySelectorAll("main .karte button")].some((b) => b.textContent === "Neu anmelden")`), "Karte zeigt „Neu anmelden“");
  await bild("9c-neu-anmelden.png");
  await klick("main .karte button", "Neu anmelden"); await warte(200);
  pruefe(await js(`__erneuert`) === 2, "„Neu anmelden“ = ein Tipp");
  await js(`(() => { konto.name = __alt.name; konto.erneuern = __alt.erneuern; Cloud.abgleichen = __alt.ab; konto.abgelaufen = false; abFehler = undefined; if (__alt.einst === null) localStorage.removeItem(EINST_KEY); sessionStorage.removeItem("vorrat-auto-anmeldung"); zeichnen(); return 1; })()`);

  console.log("9d. v6.3: Suche");
  await js(`(async () => { const f = stand.faecher.find((x) => !x.geloescht && !x.ortKlaeren);
    await tun([{ typ: "neu", art: "eintrag", werte: { name: "Tomatenmark", symbol: "🍅", fach: f.id }, menge: 1 }]);
    await tun([{ typ: "neu", art: "eintrag", werte: { name: "Tomatenketchup", symbol: "🍅", fach: f.id }, menge: 2 }]);
    await tun([{ typ: "neu", art: "eintrag", werte: { name: "Gnocchi", symbol: "🥔", fach: f.id }, menge: 1 }]);
    return 1; })()`); await warte(400);
  const tippe = (t) => js(`(() => { const i = document.querySelector(".suche input"); i.focus(); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`);
  const namen = () => js(`[...document.querySelectorAll(".suche li .was b")].map((b) => b.textContent).join("|")`);
  pruefe(await js(`!!document.querySelector(".suche input") && !document.querySelectorAll(".suche li").length`), "Suchfeld oben, ohne Eingabe keine Liste");
  await tippe("Tomat");
  const tr1 = await namen();
  pruefe(tr1.includes("Tomatenmark") && tr1.includes("Tomatenketchup ×2") && !tr1.includes("Gnocchi"), "„Tomat“ findet Tomatenmark und Tomatenketchup, nicht Gnocchi");
  pruefe((await js(`document.querySelector(".suche li .was .klein").textContent`)).length > 3, "Treffer zeigt den Lagerort");
  await tippe("TOMATENK");
  pruefe(await namen() === "Tomatenketchup ×2", "Groß/klein egal");
  await tippe("xyzq");
  pruefe(await js(`document.querySelector(".suche li").textContent`) === "Nichts gefunden.", "kein Treffer: „Nichts gefunden.“");
  await tippe("Tomat");
  await js(`(zeichnen(), 1)`); await warte(200);
  pruefe(await js(`document.activeElement === document.querySelector(".suche input") && document.querySelector(".suche input").value === "Tomat"`), "Neuzeichnen beim Tippen: Feld behält Text und Fokus");
  await bild("9d-suche.png");
  await klick(".suche li button", "Tomatenmark"); await warte(400);
  pruefe(await js(`stapel[stapel.length - 1].art === "fach" && !!document.querySelector("main .kachel.hervor")`), "Treffer antippen öffnet das Fach, Produkt hervorgehoben");
  await js(`history.back(), 1`); await warte(300);
  await tippe("");
  await js(`tun(stand.eintraege.filter((e) => e.sichtbar && ["Tomatenmark", "Tomatenketchup", "Gnocchi"].includes(e.name)).flatMap((e) => Array.from({ length: e.menge }, () => ({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" })))).then(() => 1)`); await warte(400);

  console.log("9e. v6.4: Ablage ohne Kiste");
  await klick(".reiter button", "Vorrats-Regal"); await warte(300);
  await bearb(true);
  await klick(".knoepfe.raster button", "+ Spalte"); await warte(500);
  await klick("svg .frei"); await warte(300);
  pruefe(await js(`[...document.querySelectorAll(".fenster label.schalter")].some((l) => l.textContent.includes("Ablage ohne Kiste"))`), "„+“ im Regal: Auswahl „Ablage ohne Kiste“");
  await js(`(() => { document.querySelector(".fenster input").value = "Getränke"; [...document.querySelectorAll(".fenster label.schalter input")][0].checked = true; return 1; })()`);
  await klick(".fenster .knoepfe button", "Speichern"); await warte(500);
  const abl = await js(`stand.faecher.find((f) => !f.geloescht && f.name === "Getränke").id`);
  const ablG = `document.querySelector('svg .platz[data-fach="${abl}"]')`;
  pruefe(await js(`fachVon(${JSON.stringify(abl)}).offen === true`), "Ablage gespeichert (Feld offen)");
  pruefe(await js(`!!${ablG}.querySelector(".ablagerand") && !${ablG}.querySelector(".griffloch")`), "leere Ablage: gestrichelter Umriss, keine Kiste");
  await js(`(async () => { for (const [n, s] of [["Wasser", "💧"], ["Apfelsaft", "🧃"], ["Punsch", "🍷"], ["Cola", "🥤"]])
    await tun([{ typ: "neu", art: "eintrag", werte: { name: n, symbol: s, fach: ${JSON.stringify(abl)} }, menge: 1 }]); return 1; })()`); await warte(400);
  pruefe(await js(`${ablG}.querySelectorAll(".ablage > span").length`) === 3 && (await js(`${ablG}.querySelector(".ablage b").textContent`)) === "+1", "4 Produkte: 3 Bilder + „+1“");
  pruefe(await js(`!${ablG}.querySelector(".ablagerand") && ${ablG}.querySelector(".kname").textContent === "Getränke"`), "gefüllt: kein Umriss, Etikett mit Name");
  await bild("9e-ablage.png");
  await klick("svg .platz", "Getränke"); await warte(400);
  pruefe(await js(`stapel[stapel.length - 1].art === "fach" && document.querySelectorAll("main .kachel").length >= 4`), "Antippen öffnet die Ablage mit ihren Produkten");
  pruefe(await js(`[...document.querySelectorAll(".ansichtkopf button")].some((b) => b.textContent === "⋯ Ablage")`), "Kopf-Knopf heißt „⋯ Ablage“");
  await js(`history.back(), 1`); await warte(300);
  await js(`(fachMenue(fachVon(${JSON.stringify(abl)})), 1)`); await warte(300);
  await klick(".blatt button", "In Kiste umwandeln"); await warte(500);
  pruefe(await js(`fachVon(${JSON.stringify(abl)}).offen === false && !!${ablG}.querySelector(".griffloch")`), "Fach-Menü: in Kiste umwandeln");
  await js(`(fachMenue(fachVon(${JSON.stringify(abl)})), 1)`); await warte(300);
  await klick(".blatt button", "In Ablage umwandeln"); await warte(500);
  pruefe(await js(`fachVon(${JSON.stringify(abl)}).offen === true && !${ablG}.querySelector(".griffloch")`), "… und zurück in Ablage");
  await js(`tun([...imFach(${JSON.stringify(abl)}).map((e) => ({ typ: "menge", art: "eintrag", ziel: e.id, delta: -1, grund: "entnahme" })), { typ: "feld", art: "fach", ziel: ${JSON.stringify(abl)}, feld: "geloescht", wert: true }]).then(() => 1)`); await warte(400);
  await klick(".knoepfe.raster button", "− Spalte"); await warte(500);
  pruefe(await js(`orteSichtbar().find((o) => o.name === "Vorrats-Regal").spalten`) === 2, "aufgeräumt: Regal wieder 2 Spalten");
  await bearb(false);

  console.log("9f. v6.5: Medizinschrank als Sortierkasten (Vorlage)");
  await klick(".reiter button", "Medizinschrank"); await warte(300);
  pruefe(await js(`![...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Wie auf dem Foto einrichten"))`), "v6.16: Vorlage-Knopf im Normalmodus unsichtbar");
  await bearb(true);
  pruefe(await js(`[...document.querySelectorAll(".umbau button")].some((b) => b.textContent.includes("Wie auf dem Foto einrichten"))`), "v6.6/v6.16: Knopf „Wie auf dem Foto einrichten“ im Bearbeiten-Modus unter dem alten Medizinschrank");
  await bearb(false);
  pruefe(await js(`document.querySelector(".suche input").placeholder`) === "🔍 Produkt suchen", "v6.6: Suchfeld „Produkt suchen“");
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Medizinschrank"); await warte(300);
  pruefe(await js(`[...document.querySelectorAll(".fenster .knoepfe button")].some((b) => b.textContent.includes("Als Medizinschrank einrichten"))`), "Ort-Dialog: Knopf „Als Medizinschrank einrichten“");
  const medVorher = await js(`stand.faecher.filter((f) => !f.geloescht && f.lage.ort === orteSichtbar().find((o) => o.name === "Medizinschrank").id).map((f) => f.name + "@" + f.lage.reihe + "," + f.lage.spalte).join("|")`);
  console.log("  vorher im Medizinschrank: " + medVorher);
  await klick(".fenster .knoepfe button", "Als Medizinschrank einrichten"); await warte(700);
  const med = `orteSichtbar().find((o) => o.name === "Medizinschrank")`;
  pruefe(await js(`(() => { const o = ${med}; return o.reihen === 12 && o.spalten === 8 && o.stil === "sortierkasten" && o.trenner === 4; })()`), "Raster 8 × 12, Stil Sortierkasten, Trennwand nach Spalte 4");
  pruefe(await js(`stand.faecher.filter((f) => !f.geloescht && !f.ortKlaeren && f.lage.ort === ${med}.id).length`) >= 36, "36 Schubladen/Ablagen angelegt (Vorhandenes bleibt)");
  pruefe(await js(`ortWahl === ${med}.id && stapel.length === 1`), "danach Startseite mit Reiter Medizinschrank");
  pruefe(await js(`![...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Wie auf dem Foto einrichten"))`), "v6.6: Knopf danach weg");
  pruefe(await js(`!!document.querySelector(".ortscroll svg") && document.querySelectorAll("svg .klar").length >= 34 && !!document.querySelector("svg .sktrenner")`), "Zeichnung: 34 durchsichtige Schubladen, Trennwand, seitlich wischbar");
  pruefe(await js(`document.querySelector(".ortscroll").scrollWidth > document.querySelector(".ortscroll").clientWidth`), "breiter als der Bildschirm → wischen");
  pruefe(await js(`stand.faecher.some((f) => !f.geloescht && f.name === "Oben rechts" && f.offen && f.hoch === 2)`), "Ablage „Oben rechts“ (links blockiert hier die alte Test-Kiste den Platz – richtig so)");
  await bild("9f-medizin.png");
  await klick("svg .platz", "Augen"); await warte(400);
  pruefe(await js(`stapel[stapel.length - 1].art === "fach" && [...document.querySelectorAll(".ansichtkopf button")].some((b) => b.textContent === "⋯ Schublade")`), "„Augen“ antippen öffnet die Schublade");
  await js(`history.back(), 1`); await warte(300);
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Medizinschrank"); await warte(300);
  pruefe(await js(`![...document.querySelectorAll(".fenster .knoepfe button")].some((b) => b.textContent.includes("Als Medizinschrank einrichten"))`), "Vorlage danach nicht mehr angeboten");
  await js(`history.back(), 1`); await warte(300);
  await js(`history.back(), 1`); await warte(300);

  console.log("9g. v6.7: Fächer in der Höhe");
  const fid = (n) => js(`stand.faecher.find((f) => !f.geloescht && f.name === ${JSON.stringify(n)}).id`);
  const fx = (n, ausdr) => js(`(() => { const f = stand.faecher.find((x) => !x.geloescht && x.name === ${JSON.stringify(n)}); return f ? ${ausdr} : null; })()`);
  const menue = async (n, knopf) => { await js(`(fachMenue(fachVon(${JSON.stringify(await fid(n))})), 1)`); await warte(300);
    const da = await js(`[...document.querySelectorAll(".blatt button")].some((b) => b.textContent.includes(${JSON.stringify(knopf)}))`);
    if (da) { await klick(".blatt button", knopf); await warte(600); } else { await js(`history.back(), 1`); await warte(300); }
    return da; };
  await klick(".reiter button", "Medizinschrank"); await warte(300);
  pruefe(await fx("Wärmepflaster", "f.hoch") === 5 && await fx("Baby Nase", "f.hoch") === 2 && await fx("Baby Bauch 1", "f.hoch") === 3, "v6.10: Größen wie auf dem Foto (Wärmepflaster 5, Baby rechts 2, Baby links 3)");
  pruefe(await js(`![...document.querySelectorAll("svg .frei")].some((g) => { const p = JSON.parse(g.dataset.platz); return p.reihe === 10 && p.spalte === 1; })`), "verdeckter Platz unter dem hohen Fach ist kein freier Platz");
  const hoeheRect = (n) => js(`(() => { const f = stand.faecher.find((x) => !x.geloescht && x.name === ${JSON.stringify(n)}); return Number(document.querySelector('svg .platz[data-fach="' + f.id + '"] .treffer').getAttribute("height")); })()`);
  pruefe(await hoeheRect("Baby Bauch 1") > 1.4 * await hoeheRect("Baby Nase"), "Zeichnung: Baby links deutlich größer als Baby rechts");
  await bild("9g-hoch.png");
  pruefe(await menue("Salben", "Nach oben vergrößern") && await fx("Salben", "f.lage.reihe + '/' + f.hoch") === "1/4", "↑ Nach oben vergrößern (Platz darüber frei)");
  pruefe(await menue("Salben", "Wieder 1 Platz hoch (bleibt oben)") && await fx("Salben", "!f.hoch") === true, "Wieder 1 Platz hoch");
  await js(`tun([{ typ: "neu", art: "eintrag", werte: { name: "Mullbinden Test", symbol: "🩹", fach: ${JSON.stringify(await fid("Mullbinden"))} }, menge: 1 }]).then(() => 1)`); await warte(300);
  pruefe(await menue("Klebeband", "darunter verbinden"), "Menü: „Mit Mullbinden darunter verbinden“");
  pruefe(await fx("Klebeband", "f.hoch") === 5 && await fx("Mullbinden", "1") === null, "verbunden: Klebeband 5 hoch, Mullbinden weg");
  pruefe(await js(`imFach(${JSON.stringify(await fid("Klebeband"))}).some((e) => e.name === "Mullbinden Test")`), "Inhalt ist mitgewandert");
  await js(`(fachAufPlatz(${JSON.stringify(await fid("Klebeband"))}, { ort: orteSichtbar().find((o) => o.name === "Medizinschrank").id, reihe: 0, spalte: 1 }), 1)`); await warte(300);
  pruefe((await hinweisText()).includes("nicht genug Platz"), "hohes Fach auf zu knappen Platz: Hinweis, nicht verschoben");
  const verd = await js(`(async () => { const o = orteSichtbar().find((x) => x.name === "Medizinschrank"); const v = await tun([{ typ: "neu", art: "fach", werte: { name: "Verdeckt Test", lage: { ort: o.id, reihe: 5, spalte: 0 } } }]); return v ? v[0].id : null; })()`); await warte(300);
  pruefe(await js(`fachVon(${JSON.stringify(verd)}).ortKlaeren === true`), "verdecktes Fach (zwei Handys gleichzeitig) kommt nach „Ort klären“");
  await js(`tun([{ typ: "feld", art: "fach", ziel: ${JSON.stringify(verd)}, feld: "geloescht", wert: true }]).then(() => 1)`); await warte(300);
  pruefe(await menue("Klebeband", "Wieder 1 Platz hoch (bleibt oben)") && await fx("Klebeband", "!f.hoch") === true, "Klebeband wieder 1 Platz hoch");
  // v6.10: "Größen übernehmen" setzt vorhandene Schubladen nach Namen um (Klebeband/Salben verschoben, Mullbinden fehlt → neu)
  await js(`tun([{ typ: "feld", art: "ort", ziel: orteSichtbar().find((o) => o.name === "Medizinschrank").id, feld: "reihen", wert: 11 }]).then(() => 1)`); await warte(300);
  await bearb(true);
  pruefe(await js(`[...document.querySelectorAll("main button")].some((b) => b.textContent.includes("Größen wie auf dem Foto"))`), "v6.10: Knopf „Größen wie auf dem Foto übernehmen“ bei abweichendem Raster");
  // v6.11: doppelter Vorlagen-Name -> Warnung, nichts geaendert
  const doppelId = await js(`(async () => { const o = orteSichtbar().find((x) => x.name === "Medizinschrank"); const v = await tun([{ typ: "neu", art: "fach", werte: { name: "Ohren", lage: { ort: o.id, reihe: 0, spalte: 5 } } }]); return v[0].id; })()`); await warte(300);
  const nVorher = await js(`liste.length`), dVorher = dialoge.length;
  await klick("main button", "Größen wie auf dem Foto"); await warte(500);
  pruefe((dialoge[dVorher] || "").includes("mehrfach") && (dialoge[dVorher] || "").includes("Ohren") && await js(`liste.length`) === nVorher, "v6.11: doppelter Name → Warnung, nichts umgesetzt");
  await js(`tun([{ typ: "feld", art: "fach", ziel: ${JSON.stringify(doppelId)}, feld: "geloescht", wert: true }]).then(() => 1)`); await warte(300);
  const inhaltK = await js(`imFach(${JSON.stringify(await fid("Klebeband"))}).length`);
  await klick("main button", "Größen wie auf dem Foto"); await warte(700);
  pruefe(await fx("Klebeband", "f.lage.reihe + '/' + (f.hoch || 1)") === "2/2" && await fx("Salben", "f.lage.reihe + '/' + f.hoch") === "2/3" && await fx("Mullbinden", "f.hoch") === 3,
    "Größen übernommen: Klebeband/Salben zurück an ihren Platz, Mullbinden neu angelegt");
  pruefe(await js(`imFach(${JSON.stringify(await fid("Klebeband"))}).length`) === inhaltK, "Inhalt bleibt beim Umsetzen in der Schublade");

  await klick(".reiter button", "Vorrats-Regal"); await warte(300);
  await klick(".knoepfe.raster button", "+ Reihe"); await warte(500);
  const unten = await js(`orteSichtbar().find((o) => o.name === "Vorrats-Regal").reihen - 2`);
  const regalKiste = await js(`stand.faecher.find((f) => !f.geloescht && f.lage.ort === orteSichtbar().find((o) => o.name === "Vorrats-Regal").id && f.lage.reihe === ${unten} && f.lage.spalte === 0).name`);
  pruefe(await menue(regalKiste, "Nach unten vergrößern") && await fx(regalKiste, "f.hoch") === 2, "Regal: Kiste nach unten vergrößert");
  await klick(".knoepfe.raster button", "− Reihe"); await warte(400);
  pruefe((await hinweisText()).includes("Reihe steht noch"), "− Reihe verweigert, solange die hohe Kiste hineinragt");
  await menue(regalKiste, "Wieder 1 Platz hoch (bleibt oben)");
  await klick(".knoepfe.raster button", "− Reihe"); await warte(500);
  pruefe(await js(`orteSichtbar().find((o) => o.name === "Vorrats-Regal").reihen`) === unten + 1, "aufgeräumt");
  await bearb(false);

  console.log("9h. v6.8: Pfeile links/rechts am Medizinschrank");
  await klick(".reiter button", "Medizinschrank"); await warte(400);
  const box = `document.querySelector(".ortscroll")`;
  await js(`(${box}.scrollLeft = 0, 1)`); await warte(200);
  pruefe(await js(`!document.querySelector(".ortpfeil.rechts").classList.contains("aus") && document.querySelector(".ortpfeil.links").classList.contains("aus")`), "am linken Rand: nur Pfeil ▶ sichtbar");
  await klick(".ortpfeil.rechts"); await warte(1800); // sanfter Bildlauf braucht etwas
  const pos = await js(`${box}.scrollLeft`);
  pruefe(pos > 100 && await js(`!document.querySelector(".ortpfeil.links").classList.contains("aus")`), "▶ springt nach rechts, dann auch ◀ sichtbar");
  console.log("  Messung: " + await js(`(() => { const b = document.querySelector(".ortscroll"); return JSON.stringify({ links: b.scrollLeft, sichtbar: b.clientWidth, gesamt: b.scrollWidth, rechtsVersteckt: document.querySelector(".ortpfeil.rechts").classList.contains("aus") }); })()`));
  pruefe(await js(`(() => { const b = document.querySelector(".ortscroll"); return b.scrollLeft + b.clientWidth >= b.scrollWidth - 2 && document.querySelector(".ortpfeil.rechts").classList.contains("aus"); })()`), "v6.9: ▶ geht ganz bis zum rechten Rand (ein Tipp)");
  await bild("9h-pfeile.png");
  await js(`(zeichnen(), 1)`); await warte(300);
  pruefe(Math.abs(await js(`${box}.scrollLeft`) - pos) < 3, "nach dem Neuzeichnen bleibt die Wisch-Position");
  await klick(".ortpfeil.links"); await warte(900);
  pruefe(await js(`${box}.scrollLeft`) <= 2, "◀ springt ganz an den Anfang");
  await js(`(${box}.scrollLeft = 0, 1)`); await warte(200);
  // Reiter-Leiste: gewaehlter Reiter bleibt sichtbar, Position bleibt nach dem Neuzeichnen
  await js(`(document.querySelector("nav.reiter").scrollLeft = 0, 1)`);
  await klick(".reiter button", "Medizinschrank"); await warte(400);
  const reiterSichtbar = `(() => { const a = document.querySelector("nav.reiter button.an").getBoundingClientRect(), b = document.querySelector("nav.reiter").getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; })()`;
  pruefe(await js(reiterSichtbar), "Reiter „Medizinschrank“ nach dem Antippen sichtbar (Leiste springt nicht an den Anfang)");
  await js(`(zeichnen(), 1)`); await warte(300);
  pruefe(await js(reiterSichtbar), "… auch nach dem Neuzeichnen");
  // v6.12: Spalte links/rechts bei Trennwand
  await klick(".reiter button", "Medizinschrank"); await warte(300);
  const medO = (f) => js(`orteSichtbar().find((o) => o.name === "Medizinschrank").${f}`);
  const spalteVon = (n) => js(`stand.faecher.find((f) => !f.geloescht && f.name === ${JSON.stringify(n)}).lage.spalte`);
  await bearb(true);
  pruefe(await js(`[...document.querySelectorAll(".umbau .umbauname")].map((x) => x.textContent).join("|")`) === "Reihen|Linke Seite|Rechte Seite|Ort", "v6.16: Medizinschrank im Modus: Reihen, Linke Seite, Rechte Seite, Ort");
  await bild("9i-medizin-bearbeiten.png");
  pruefe(await js(`["+ Spalte links", "+ Spalte rechts"].every((t) => [...document.querySelectorAll(".knoepfe.raster button")].some((b) => b.textContent === t))`), "Medizinschrank: „+ Spalte links“ und „+ Spalte rechts“");
  const mag = await spalteVon("Magendarm 1"), ohr = await spalteVon("Ohren");
  await klick(".knoepfe.raster button", "+ Spalte links"); await warte(600);
  pruefe(await medO("spalten") === 9 && await medO("trenner") === 5 && await spalteVon("Magendarm 1") === mag + 1 && await spalteVon("Ohren") === ohr, "+ Spalte links: vor der Trennwand eingefügt, rechte Seite rückt mit");
  pruefe(await js(`[...document.querySelectorAll("svg .frei")].some((g) => JSON.parse(g.dataset.platz).spalte === 4)`), "neue linke Spalte ist frei");
  await klick(".knoepfe.raster button", "− Spalte links"); await warte(600);
  pruefe(await medO("spalten") === 8 && await medO("trenner") === 4 && await spalteVon("Magendarm 1") === mag, "− Spalte links: zurück");
  await klick(".knoepfe.raster button", "− Spalte links"); await warte(400);
  pruefe(await medO("spalten") === 8 && (await hinweisText()).includes("äußeren Spalte links"), "− Spalte links verweigert, wenn dort Schubladen stehen");
  await klick(".knoepfe.raster button", "+ Spalte rechts"); await warte(600);
  pruefe(await medO("spalten") === 9 && await medO("trenner") === 4 && await spalteVon("Magendarm 1") === mag, "+ Spalte rechts: hinten angefügt");
  await klick(".knoepfe.raster button", "− Spalte rechts"); await warte(600);
  pruefe(await medO("spalten") === 8, "− Spalte rechts: zurück");
  pruefe(await js(`!!document.querySelector(".ortpfeil.rechts") && !!document.querySelector(".ortpfeil.links")`), "v6.16: Pfeile ◀ ▶ auch im Bearbeiten-Modus");
  await bearb(false);

  console.log("9j. v6.16: Daumenleiste, Menüs gruppiert, ⓘ statt Erklärzeilen");
  pruefe(await js(`[...document.querySelectorAll("#daumen button")].map((b) => b.textContent.replace(/\\d+/g, "")).join("|")`) === "📷Scannen|⏰Läuft bald ab|🏠Start", "Leiste unten: Scannen · Läuft bald ab · Start");
  pruefe(await js(`getComputedStyle(document.querySelector("#daumen")).position === "fixed" && document.querySelector("#daumen").getBoundingClientRect().bottom <= innerHeight + 1`), "Leiste fest am unteren Rand");
  pruefe(await js(`!!document.querySelector(".suche input") && document.querySelector("main").firstElementChild.classList.contains("suche")`), "Suchfeld bleibt oben");
  await js(`(document.body.append(Object.assign(document.createElement("div"), { className: "zuggeist", id: "__geist" })), 1)`);
  pruefe(await js(`getComputedStyle(document.querySelector("#daumen")).display === "none"`), "beim Ziehen ist die Leiste weg (Fächer unten bleiben Ziele)");
  await js(`(document.getElementById("__geist").remove(), 1)`);
  pruefe(await js(`getComputedStyle(document.querySelector("#daumen")).display !== "none"`), "… danach wieder da");
  pruefe(await js(`![...document.querySelectorAll("main p.klein")].some((p) => !p.hidden && p.textContent.includes("lange drücken"))`), "Erklärzeile Startseite nicht mehr offen sichtbar");
  await klick("main .zeichenkopf button.ikon"); await warte(200);
  pruefe(await js(`!document.querySelector("#hilfe-start").hidden && document.querySelector("#hilfe-start").textContent.includes("lange drücken") && document.querySelector(".zeichenkopf button.ikon").getAttribute("aria-expanded") === "true"`), "ⓘ zeigt die Erklärung");
  await js(`(zeichnen(), 1)`); await warte(200);
  pruefe(await js(`!document.querySelector("#hilfe-start").hidden`), "ⓘ bleibt nach dem Neuzeichnen offen");
  await klick("main .zeichenkopf button.ikon"); await warte(200);
  pruefe(await js(`document.querySelector("#hilfe-start").hidden`), "ⓘ nochmal = zu");
  // Scannen aus der Leiste = bisher „Scannen und einräumen“ (Multiscan ohne Fach)
  await js(`(window.__ms = multiScan, multiScan = (f) => { window.__msFach = f; }, 1)`);
  await klick("#daumen button", "Scannen"); await warte(200);
  pruefe(await js(`window.__msFach === null`), "📷 Scannen öffnet den Multiscan (ohne Fach)");
  await js(`(multiScan = window.__ms, 1)`);
  // Eintrag fuer Menue/Leiste: ins Gefrierschrank-Fach, laeuft in 3 Tagen ab
  await klick(".reiter button", "Gefrierschrank"); await warte(300);
  const nf = await js(`stand.faecher.find((f) => !f.geloescht && f.name === "Schublade 3").id`);
  const nid = await js(`tun([{ typ: "neu", art: "eintrag", werte: { name: "Leistentest", mhd: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), fach: ${JSON.stringify(nf)} }, menge: 2 }]).then((v) => v[0].id)`); await warte(300);
  await js(`(oeffne({ art: "fach", id: ${JSON.stringify(nf)} }), 1)`); await warte(300);
  pruefe(await js(`![...document.querySelectorAll("main p")].some((p) => !p.hidden && p.textContent.includes("Antippen ="))`), "Fach: Erklärzeile hinter ⓘ");
  await klick(".ansichtkopf button.ikon"); await warte(200);
  pruefe(await js(`!document.querySelector("#hilfe-fach").hidden`), "Fach: ⓘ zeigt die Erklärung");
  await klick("main button.kachel", "Leistentest"); await warte(400);
  pruefe(await js(`[...document.querySelectorAll(".menueoben button")].map((b) => b.textContent).join("|")`) === "−1 · eins raus|↦ Verschieben|✎ Bearbeiten", "Produkt-Menü oben groß: −1 · Verschieben · Bearbeiten");
  pruefe(await js(`[...document.querySelectorAll(".menueliste button")].map((b) => b.textContent).join("|")`) === "📷 Foto aufnehmen oder wählen", "Produkt-Menü Liste: Foto");
  pruefe(await js(`(() => { const g = document.querySelector(".fenster > :last-child"); return g.classList.contains("menuegefahr") && g.textContent === "🗑 Löschen" && g.querySelector("button").classList.contains("gefahr"); })()`), "🗑 Löschen rot, abgesetzt, ganz unten");
  await bild("9j-menue-produkt.png");
  await klick(".fensterkopf button.schliessen"); await warte(300);
  pruefe(await js(`!dialogOffen() && stapel[stapel.length - 1].art === "fach"`), "✕ schließt das Menü");
  await klick("main button.kachel", "Leistentest"); await warte(400);
  await klick(".menueoben button", "eins raus"); await warte(600);
  pruefe(await js(`eintragJetzt(${JSON.stringify(nid)}).menge === 1 && !document.querySelector("#unten").hidden`), "−1 aus dem Menü, Rückgängig-Leiste da");
  pruefe(await js(`(() => { const u = document.querySelector("#unten").getBoundingClientRect(), d = document.querySelector("#daumen").getBoundingClientRect(); return u.bottom <= d.top; })()`), "Rückgängig-Leiste liegt über der Daumenleiste (verdeckt nichts)");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`eintragJetzt(${JSON.stringify(nid)}).menge === 2`), "Rückgängig wirkt");
  await klick("main button.kachel", "Leistentest"); await warte(400);
  ablehnen = true;
  await klick(".menuegefahr button", "Löschen"); await warte(500);
  pruefe(await js(`!!eintragJetzt(${JSON.stringify(nid)}) && !dialogOffen()`), "Löschen mit Rückfrage – Abbrechen löscht nichts");
  await klick("main button.kachel", "Leistentest"); await warte(400);
  await klick(".menuegefahr button", "Löschen"); await warte(600);
  pruefe(await js(`!eintragJetzt(${JSON.stringify(nid)}) && stapel[stapel.length - 1].art === "fach" && !document.querySelector("#unten").hidden`), "Löschen aus dem Menü: weg, Fach bleibt offen, Rückgängig da");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`!!eintragJetzt(${JSON.stringify(nid)})`), "Löschen rückgängig gemacht");
  // Fach-Menü über „⋯ Schublade“: oben Umbenennen/Platz, Liste, Löschen unten
  await klick(".ansichtkopf button", "⋯ Schublade"); await warte(300);
  console.log("  Fach-Menü oben: " + await js(`[...document.querySelectorAll(".menueoben button")].map((b) => b.textContent).join("|")`));
  pruefe(await js(`[...document.querySelectorAll(".menueoben button")].map((b) => b.textContent).join("|")`) === "✎ Umbenennen|⇄ Platz ändern", "Fach-Menü (in der Schublade): oben Umbenennen · Platz ändern (Öffnen entfällt, wie bisher)");
  pruefe(await js(`[...document.querySelectorAll(".menueliste button")].some((b) => b.textContent === "✂ Aufteilen") && document.querySelector(".fenster > :last-child").textContent === "🗑 Löschen"`), "Fach-Menü: Aufteilen in der Liste, Löschen ganz unten");
  await js(`history.back(), 1`); await warte(300);
  // Läuft bald ab aus der Fachansicht: zurück zur Startseite, Abschnitt sichtbar
  await js(`scrollTo(0, 0), 1`);
  await klick("#daumen button", "Läuft bald ab"); await warte(900);
  pruefe(await js(`stapel.length === 1 && !!document.querySelector("main .bald") && document.querySelector("main .bald").getBoundingClientRect().top < innerHeight`), "⏰ Läuft bald ab: springt zur Liste auf der Startseite");
  pruefe(Number(await js(`document.querySelector("#daumen .reiterzahl").textContent`)) === await js(`H.baldAb(stand.eintraege, Modell.heuteIso()).length`), "Zahl an ⏰ = Einträge in „Läuft bald ab“");
  await bearb(true);
  await klick("svg .platz"); await warte(300);
  await klick("#daumen button", "Start"); await warte(500);
  pruefe(await js(`stapel.length === 1 && !imBearbeiten()`), "🏠 Start aus Fach im Bearbeiten-Modus: alle Ebenen zu, Normalmodus");
  await js(`tun([{ typ: "feld", art: "eintrag", ziel: ${JSON.stringify(nid)}, feld: "geloescht", wert: true }]).then(() => 1)`); await warte(300);
  await js(`scrollTo(0, 0), 1`);

  console.log("9b. v4 Codex #1/#2: Verschieben + Rueckgaengig gegen aktuellen Stand");
  await js(`(window.__e = stand.eintraege.find(e => e.sichtbar), window.__ok = stand.faecher.filter(f => !f.geloescht && !f.ortKlaeren), window.__alt = __ok[0].id, window.__ziel = __ok[1].id, 1)`);
  await js(`verschieben([__e.id], __alt), 1`); await warte(600);
  pruefe(await js(`stand.eintraege.find(e => e.id === __e.id).fach === __alt`), "aus Ort klaeren eingeordnet");
  await js(`verschieben([__e.id], __ziel).then(r => window.__r = r), 1`); await warte(600);
  pruefe(await js(`stand.eintraege.find(e => e.id === __e.id).fach === __ziel`), "verschoben");
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`stand.eintraege.find(e => e.id === __e.id).fach === __alt`), "Rueckgaengig normal: zurueck im alten Fach");
  await js(`verschieben([__e.id], __ziel), 1`); await warte(600);
  await js(`(fachVon(__alt).geloescht = true, 1)`); // so tun, als haette das andere Handy das alte Fach geloescht
  const n0 = await js(`liste.length`);
  await klick("#unten button", "Rückgängig"); await warte(600);
  pruefe(await js(`liste.length`) === n0 && await js(`stand.eintraege.find(e => e.id === __e.id).fach === __ziel`), "Rueckgaengig auf geloeschtes Fach: kein Vorgang");
  await js(`(fachVon(__alt).geloescht = false, 1)`);
  const n1 = await js(`liste.length`);
  await js(`verschieben(["gibtsnicht"], __alt), 1`); await warte(400);
  pruefe(await js(`liste.length`) === n1, "Verschieben eines verschwundenen Eintrags: kein Vorgang");
  await js(`(fachVon(__alt).geloescht = true, 1)`);
  await js(`verschieben([__e.id], __alt), 1`); await warte(400);
  pruefe(await js(`liste.length`) === n1, "Verschieben in geloeschtes Fach: kein Vorgang");
  await js(`(laden(), 1)`); await warte(600);

  console.log("9i. Codex R2 (v4-Korrekturen): laden() tauscht nicht unter Zug, nur erster Finger zieht, Scan-Name wandert nicht mit");
  pruefe(await js(`(async () => { const s0 = stand; const p = laden(); zieht = true; await p; const ok = stand === s0 && nachladen === true; zieht = false; await laden(); return ok; })()`),
    "R2 #1: Zug beginnt waehrend laden() liest -> kein Standtausch, nachladen vorgemerkt");
  await js(`(oeffne({ art: "fach", id: __ziel }), 1)`); await warte(400);
  pruefe(await js(`(async () => { const k = document.querySelector("main button.kachel:not(.neu)");
    k.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, isPrimary: false, button: 0, clientX: 50, clientY: 50 }));
    await new Promise((r) => setTimeout(r, 650)); const an = k.classList.contains("angehoben");
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7, isPrimary: false })); return !an; })()`), "R2 #3: zweiter Finger hebt keine Kachel an");
  await klick("main button.kachel.neu", "Neu"); await warte(300);
  await obenKlick("📷 Scannen"); await warte(400);
  await code("4000000000051"); await warte(600);
  const nameFeld = () => js(`document.querySelector(".fenster input").value`);
  const scan1 = await nameFeld();
  pruefe(scan1 !== "", "Scan 1 setzt den Namen (" + scan1 + ")");
  await obenKlick("📷 Scannen"); await warte(400);
  await code("PZN 11111116"); await warte(600);
  pruefe(await nameFeld() === "", "R2 #5: unbekannter zweiter Code -> Name der vorigen Packung weg");
  await js(`(() => { const n = document.querySelector(".fenster input"); n.value = "Eigenname"; n.dispatchEvent(new Event("input")); return 1; })()`);
  await obenKlick("📷 Scannen"); await warte(400);
  await code("PZN 01234562"); await warte(600);
  pruefe(await nameFeld() === "Ibuprofen 400", "gemerkter Name wird übernommen (wie bisher)");
  await obenKlick("📷 Scannen"); await warte(400);
  await code("PZN 11111116"); await warte(600);
  pruefe(await nameFeld() === "", "auch ein gemerkter Name wandert nicht zur naechsten Packung");
  await js(`(() => { const n = document.querySelector(".fenster input"); n.value = "Von Hand"; n.dispatchEvent(new Event("input")); return 1; })()`);
  await obenKlick("📷 Scannen"); await warte(400);
  await code("PZN 11111116"); await warte(600);
  pruefe(await nameFeld() === "Von Hand", "von Hand getippter Name bleibt beim naechsten Scan");
  await js(`history.back(), 1`); await warte(300);
  await js(`history.back(), 1`); await warte(300);

  console.log("9j. Offen 21: gemeinsame MHD-Wahl im Eintrag-Dialog (Datum, Monat, Jahr, kein MHD, Scan mit/ohne MHD)");
  await js(`(oeffne({ art: "fach", id: __ziel }), 1)`); await warte(400);
  await klick("main button.kachel.neu", "Neu"); await warte(300);
  const mhdAnz = () => js(`[...document.querySelectorAll(".fenster .feld")].find((f) => f.querySelector("span")?.textContent === "MHD").querySelector("b").textContent`);
  const datumWert = () => js(`document.querySelector(".fenster input[type=date]").value`);
  const jahrWert = () => js(`document.querySelector(".fenster .jahr b").textContent`);
  pruefe(await mhdAnz() === "kein MHD" && await datumWert() === "", "neu: kein MHD, Datum leer");
  await js(`(() => { const d = document.querySelector(".fenster input[type=date]"); d.value = "2029-05-17"; d.dispatchEvent(new Event("change")); return 1; })()`);
  pruefe(await mhdAnz() === "17.05.2029" && await jahrWert() === "2029", "genaues Datum: Anzeige + Jahr folgen");
  await klick(".fenster .monate button", "Feb");
  pruefe(await mhdAnz() === "02.2029" && await datumWert() === "", "Monat nach Datum: Jahr bleibt (von Hand), Datum geleert");
  await klick(".fenster .jahr button", "›");
  pruefe(await mhdAnz() === "02.2030" && await jahrWert() === "2030", "Jahr › verschiebt den Monat mit");
  await klick(".fenster button.zweit", "kein MHD");
  pruefe(await mhdAnz() === "kein MHD", "kein MHD");
  await js(`(window.__scanAlt = scanDialog, scanDialog = (fertig) => fertig(Hilfen.leseCode("010400000000005117271231", "data_matrix")), 1)`);
  await obenKlick("📷 Scannen"); await warte(600);
  pruefe(await mhdAnz() === "31.12.2027" && await datumWert() === "2027-12-31" && await jahrWert() === "2027", "Scan mit MHD (DataMatrix): Datum gesetzt");
  await js(`(scanDialog = (fertig) => fertig(Hilfen.codeAusEingabe("PZN 11111116")), 1)`);
  await obenKlick("📷 Scannen"); await warte(600);
  pruefe(await mhdAnz() === "kein MHD" && await datumWert() === "", "Codex v4 #4: Scan ohne MHD leert das Scan-MHD");
  await klick(".fenster .monate button", "Mär");
  const marz = await mhdAnz();
  pruefe(/^03\.20\d\d$/.test(marz), "danach Monat wählbar, naechstes passendes Jahr (" + marz + ")");
  await obenKlick("📷 Scannen"); await warte(600);
  pruefe(await mhdAnz() === marz, "von Hand gewähltes MHD bleibt beim naechsten Scan ohne MHD");
  await js(`(() => { const n = document.querySelector(".fenster input"); n.value = "MHD-Test"; n.dispatchEvent(new Event("input")); return 1; })()`);
  await obenKlick("Speichern"); await warte(700);
  pruefe(await js(`stand.eintraege.find((e) => e.sichtbar && e.name === "MHD-Test")?.mhd`) === marz.slice(3) + "-" + marz.slice(0, 2), "gespeichert mit dem gewählten MHD");
  await js(`(scanDialog = __scanAlt, 1)`);
  await klick("main button.kachel", "MHD-Test"); await warte(300);
  await klick(".blatt button", "Bearbeiten"); await warte(500);
  pruefe(await mhdAnz() === marz, "Bearbeiten zeigt das gespeicherte MHD");
  await klick(".fenster .jahr button", "›");
  await obenKlick("Speichern"); await warte(600);
  pruefe(await js(`stand.eintraege.find((e) => e.sichtbar && e.name === "MHD-Test")?.mhd`) === (Number(marz.slice(3)) + 1) + "-" + marz.slice(0, 2), "Bearbeiten: Jahr › gespeichert");
  await js(`history.back(), 1`); await warte(300);

  console.log("10. Speicherfehler: nicht wegklickbar, Aktion nicht erledigt (#5/#89)");
  await klick(".reiter button", "Küchenschublade");
  await warte(200);
  await klick("svg .platz");
  await warte(300);
  await neu("Mehl", {}, 2);
  await warte(300);
  await js(`(sp.ausfuehren = sp.ausfuehrenAlle = () => Promise.reject(new Error("Testfehler Speicher")), 1)`);
  await klick("main button.kachel", "Mehl");
  await warte(300);
  await klick(".blatt button", "−1"); // v5: −1 im Menü
  await warte(500);
  pruefe(await js(`!document.querySelector("#fehler").hidden && document.querySelector("#fehler").textContent.includes("NICHT gespeichert")`), "Fehlerleiste sichtbar");
  pruefe(await js(`[...document.querySelectorAll(".kachel")].find(k => k.textContent.includes("Mehl")).querySelector(".zahl").textContent`) === "×2", "Menge unverändert ×2");
  pruefe(await js(`document.querySelector("#unten").hidden`), "keine Rückgängig-Leiste");
  await bild("10-speicherfehler.png");

  console.log("11. Prüfen + Drei-Jahres-Test");
  await senden("Page.reload", {});
  await warte(1500);
  await klick(".kopf button");
  await warte(200);
  await klick("main button.zeile", "Prüfen");
  await warte(300);
  for (let i = 0; i < 4; i++) await klick("button.text");
  pruefe((await js(`document.querySelector("button.text").textContent`)).includes("noch 3×"), "Zähler ab dem 4. Tipp");
  for (let i = 0; i < 3; i++) await klick("button.text");
  pruefe(await js(`!![...document.querySelectorAll("main button.gefahr")].find(b => b.textContent.includes("Gerätedaten löschen") && !b.hidden)`), "nach 7× auch „Gerätedaten löschen“");
  pruefe((await js(`document.querySelector("table.pruefen").textContent`)).includes("Noch nicht abgeglichen"), "Prüfen zeigt offene Vorgänge");
  await klick("main button", "Drei-Jahres-Test");
  let aus = "";
  for (let i = 0; i < 120 && !/IndexedDB lesen|FEHLER/.test(aus); i++) { await warte(500); aus = await js(`document.querySelector("pre.ausgabe").textContent`); }
  console.log(aus.split("\n").map((z) => "    " + z).join("\n"));
  pruefe(/IndexedDB lesen/.test(aus), "Drei-Jahres-Test durchgelaufen");
  pruefe(await js(`indexedDB.databases().then(d => d.map(x => x.name).filter(n => n !== "vorrat-bilder").join(","))`) === "vorrat", "Test-DB wieder gelöscht, echte DB da (Bild-Speicher v6 zählt nicht)");
  pruefe(await js(`sp.alleVorgaenge().then(v => v.length) .then(n => n === liste.length)`), "echte Vorgänge unberührt");
  await bild("11-pruefen.png");

  console.log("12. Einstellungen, Sicherung & Abgleich, Backup herunterladen");
  await js(`history.back(), 1`); await warte(300);
  await klick("main button.zeile", "Einstellungen");
  await warte(300);
  pruefe(await js(`[...document.querySelectorAll(".fenster input")].map(i => i.value).join("|")`) === "Gemeinschaftsordner/Vorrats App|Gemeinschaftsordner/Vorrats App/Sicherungen", "Vorgaben Daten-/Sicherungsordner");
  pruefe(await js(`!!document.querySelector(".fenster button")?.textContent.includes("Bei Microsoft anmelden")`), "Anmelden-Knopf");
  await js(`(() => { const [d, s] = document.querySelectorAll(".fenster input"); s.value = ["C:", "Users", "x", "OneDrive", "Gemeinschaftsordner", "Vorrats App"].join(String.fromCharCode(92)); return 1; })()`);
  await klick(".fenster .knoepfe button", "Übernehmen");
  await warte(300);
  pruefe((await js(`document.querySelector(".fenster .meldung").textContent`)).includes("verschieden"), "gleicher Ordner (Windows-Pfad) abgelehnt");
  await bild("12-einstellungen.png");
  await js(`(() => { const [d, s] = document.querySelectorAll(".fenster input"); s.value = ["Gemeinschaftsordner", "Vorrats App", "Sicherungen2"].join(String.fromCharCode(92)); return 1; })()`);
  await klick(".fenster .knoepfe button", "Übernehmen");
  await warte(500);
  pruefe(await js(`!document.querySelector(".blatt") && JSON.parse(localStorage.getItem("vorrat-einst")).sicherPfad === "Gemeinschaftsordner/Vorrats App/Sicherungen2"`), "Sicherungsordner übernommen, im Gerät gespeichert");
  pruefe(await js(`darfSchreiben()`), "Sicherungsordner-Wechsel lässt den Abgleich-Stand stehen");
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Sicherung");
  await warte(300);
  pruefe((await js(`document.querySelector("main").textContent`)).includes("Backup herunterladen"), "Ansicht Sicherung & Abgleich");
  await klick("main button.zeile", "Backup herunterladen");
  await warte(300);
  pruefe((await js(`document.querySelector(".hinweis")?.textContent || ""`)).includes("Download"), "Backup-Download ausgelöst");
  await bild("13-sicherung.png");

  console.log("14. Review #1: vor dem Löschen frisch aus dem Speicher zählen");
  const echt = await js(`sp.alleVorgaenge().then(v => v.length)`);
  pruefe(echt > 0, "es liegen offene Vorgänge im Speicher (" + echt + ")");
  await js(`(lokal = [], ab = null, 1)`); // Arbeitsspeicher veraltet, wie nach einem fehlgeschlagenen laden()
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Prüfen"); await warte(300);
  for (let i = 0; i < 7; i++) await klick("button.text");
  ablehnen = true;
  await klick("main button.gefahr", "Gerätedaten löschen");
  await warte(500);
  pruefe((dialoge[dialoge.length - 1] || "").includes(echt + " eigene Vorgänge, davon " + echt + " noch nicht in OneDrive"), "Rückfrage nennt die echte Zahl (" + echt + "), nicht 0");
  pruefe(await js(`indexedDB.databases().then(d => d.some(x => x.name === "vorrat"))`), "abgebrochen: nichts gelöscht");
  await js(`history.back(), 1`); await warte(300);
  await js(`(lokal = [], 1)`);
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Einstellungen"); await warte(300);
  await js(`(document.querySelectorAll(".fenster input")[0].value = "Anderer/Ordner", 1)`);
  const dialogeVorher = dialoge.length;
  await klick(".fenster .knoepfe button", "Übernehmen"); await warte(500);
  pruefe((await js(`document.querySelector(".fenster .meldung").textContent`)).includes(echt + " Änderungen sind noch nicht abgeglichen"), "Ordnerwechsel verweigert mit echter Zahl");
  pruefe(dialoge.length === dialogeVorher && await js(`indexedDB.databases().then(d => d.some(x => x.name === "vorrat"))`), "keine Rückfrage, nichts gelöscht");
  await js(`history.back(), 1`); await warte(300);
  await js(`(window._alle = sp.alleVorgaenge, sp.alleVorgaenge = () => Promise.reject(new Error("Testfehler Lesen")), 1)`);
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Prüfen"); await warte(300);
  for (let i = 0; i < 7; i++) await klick("button.text");
  ablehnen = true;
  await klick("main button.gefahr", "Gerätedaten löschen");
  await warte(500);
  pruefe((dialoge[dialoge.length - 1] || "").includes("NICHTS gelöscht") && (dialoge[dialoge.length - 1] || "").includes("Backup"), "Lesefehler: nicht löschen, Backup anbieten");
  pruefe(await js(`indexedDB.databases().then(d => d.some(x => x.name === "vorrat"))`), "DB noch da");
  await js(`history.back(), 1`); await warte(300);

  console.log("15. Codex #5: Löschen scheitert beim Ordnerwechsel -> alter Pfad bleibt");
  await js(`(sp.alleVorgaenge = window._alle, 1)`);
  await js(`sp.alleVorgaenge().then(vs => sp.abgleichSpeichern({ ordner: Cloud.ordnerSchluessel(einst.datenPfad), gelesen: sp.inst, letzter: { zeit: Modell.lokalIso(), fehler: null },
    dateien: { ["vorgaenge-" + sp.inst + ".json"]: { inst: sp.inst, eTag: '"x"', geaendert: new Date().toISOString(), von: "Test", vorgaenge: vs } } }, 0)).then(() => laden()).then(() => offen())`);
  pruefe(await js(`offen()`) === 0, "alles abgeglichen (Attrappe)");
  await js(`(Speicher.loeschen = Speicher.leeren = () => Promise.reject(new Error("Testfehler Löschen")), 1)`);
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Einstellungen"); await warte(300);
  await js(`(document.querySelectorAll(".fenster input")[0].value = "Neuer/Ordner", 1)`);
  await klick(".fenster .knoepfe button", "Übernehmen"); await warte(800);
  pruefe((dialoge[dialoge.length - 1] || "").startsWith("Datenordner wechseln?"), "Rückfrage kam");
  pruefe(await js(`JSON.parse(localStorage.getItem("vorrat-einst")).datenPfad`) === "Gemeinschaftsordner/Vorrats App", "Pfad NICHT umgestellt, solange nicht gelöscht ist");
  pruefe(await js(`!document.querySelector("#fehler").hidden && document.querySelector("#fehler").textContent.includes("Testfehler Löschen")`), "Fehler sichtbar");

  console.log("15b. Codex2 #1-3: Backup auch ohne geladenen Stand; Löschsperre bei Widerspruch");
  await senden("Page.reload", {}); await warte(1500);
  for (let i = 0; i < 20 && !(await js(`typeof sp !== "undefined" && !!sp && !!stand`).catch(() => false)); i++) await warte(250);
  await js(`(Speicher.leeren = Speicher.loeschen = () => Promise.reject(new Error("darf nicht")), 1)`);
  await js(`document.querySelectorAll(".hinweis").forEach(h => h.remove()), 1`);
  await js(`(stand = null, 1)`);
  await js(`Promise.resolve(backupHerunterladen()).then(() => 1)`);
  await warte(300);
  pruefe((await js(`document.querySelector(".hinweis")?.textContent || ""`)).includes("Download"), "Backup ohne Stand möglich");
  await js(`sp.alleVorgaenge().then(vs => { const v = vs[0]; return sp.abgleich().then(a => sp.abgleichSpeichern(Object.assign({}, a, { dateien: { ["vorgaenge-" + sp.inst + ".json"]: { inst: sp.inst, eTag: '"x"', geaendert: new Date().toISOString(), von: "Test",
    vorgaenge: vs.map(x => x === v ? Object.assign({}, x, { zeit: "2000-01-01T00:00:00.000" }) : x) } } }), 0)); })`);
  ablehnen = true;
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Prüfen"); await warte(300);
  for (let i = 0; i < 7; i++) await klick("button.text");
  await klick("main button.gefahr", "Gerätedaten löschen"); await warte(600);
  pruefe((dialoge[dialoge.length - 1] || "").includes("Widerspruch"), "Löschen warnt vor Widerspruch und bietet Backup an");
  await js(`history.back(), 1`); await warte(300);

  console.log("16. Gerätedaten wirklich löschen (Versionswechsel im Browser)");
  await senden("Page.reload", {}); await warte(1500);
  const altInst = await js(`sp.inst`);
  const d16 = dialoge.length;
  await klick(".kopf button"); await warte(200);
  await klick("main button.zeile", "Prüfen"); await warte(300);
  for (let i = 0; i < 7; i++) await klick("button.text");
  await klick("main button.gefahr", "Gerätedaten löschen");
  await warte(2500);
  for (let i = 0; i < 20 && !(await js(`typeof sp !== "undefined" && !!sp && !!stand`).catch(() => false)); i++) await warte(250);
  pruefe(await js(`sp.inst`) !== altInst, "neue Kennung nach dem Löschen");
  pruefe(await js(`sp.alleVorgaenge().then(v => v.length)`) === 0, "Gerät leer");
  pruefe(dialoge.slice(d16).some((d) => d.includes("Dazu 5 eigene Fotos, noch nicht in OneDrive")), "Rückfrage bei Widerspruch (kein Stand): zählt vorsichtshalber alle 5 Fotos (v6 B)");
  pruefe(await js(`Bilder.fotosOffen(null)`) === 0, "Fotos mit gelöscht");
  pruefe(await js(`!!document.querySelector("main .karte")`), "App läuft weiter");

  console.log("17. v6 C: eigene Fotos über OneDrive (Ordner Bilder nachgestellt): fehlt -> lokal, angelegt -> hoch/runter/aufräumen");
  for (let i = 0; i < 20 && !(await js(`typeof sp !== "undefined" && !!sp && !!stand`).catch(() => false)); i++) await warte(250);
  // Graph-Attrappe im Browser: Datenordner DATEN, Unterordner BILDER (null = fehlt). Vorgangs-Abgleich nachgestellt:
  // markiert alle eigenen Vorgaenge als in OneDrive und mischt die Datei des "anderen Handys" (__od.fremd) dazu.
  await js(`(() => {
    window.__od = { bilder: null, log: [], fremd: [] };
    window.__alt17 = { name: konto.name, ab: Cloud.abgleichen, fetch: g.fetch, token: g.token };
    if (localStorage.getItem(EINST_KEY) === null) einstSpeichern({});
    konto.name = () => "Test";
    g.token = async () => "T";
    const J = (st, b) => new Response(b === undefined ? null : b instanceof Blob ? b : JSON.stringify(b), { status: st });
    g.fetch = async (u, o) => {
      o = o || {}; const art = o.method || "GET", p = String(u).replace("https://graph.microsoft.com/v1.0", ""); __od.log.push(art + " " + p);
      let m;
      if (p.startsWith("/drives/D1/items/DATEN/children")) return J(200, { value: __od.bilder ? [{ id: "BILDER", name: "Bilder", folder: {} }] : [] });
      if (p.startsWith("/drives/D1/items/BILDER/children")) return J(200, { value: [...__od.bilder].map(([n, b]) => ({ id: "f_" + n, name: n, size: b.size, file: {} })) });
      if ((m = /^[/]drives[/]D1[/]items[/]BILDER:[/]([^:]+):[/]content/.exec(p)) && art === "PUT") {
        if (__od.bilder.has(m[1])) return J(409, {}); __od.bilder.set(m[1], o.body); return J(201, { id: "f_" + m[1] }); }
      if ((m = /^[/]drives[/]D1[/]items[/]f_([^/]+)[/]content$/.exec(p))) return __od.bilder.has(m[1]) ? J(200, __od.bilder.get(m[1])) : J(404, {});
      if ((m = /^[/]drives[/]D1[/]items[/]f_([^/]+)$/.exec(p)) && art === "DELETE") { __od.bilder.delete(m[1]); return J(204); }
      return J(400, {});
    };
    Cloud.abgleichen = async (o) => {
      const vs = await o.sp.alleVorgaenge();
      const d = { ["vorgaenge-" + o.sp.inst + ".json"]: { inst: o.sp.inst, eTag: '"e"', geaendert: new Date().toISOString(), von: null, vorgaenge: vs } };
      if (__od.fremd.length) d["vorgaenge-andrea0000000001.json"] = { inst: "andrea0000000001", eTag: '"f"', geaendert: new Date().toISOString(), von: "Andrea", vorgaenge: __od.fremd };
      const uhr = Math.max(0, ...vs.map((v) => v.uhr), ...__od.fremd.map((v) => v.uhr));
      await o.sp.abgleichSpeichern({ ordner: Cloud.ordnerSchluessel(o.datenPfad), ort: { driveId: "D1", id: "DATEN" }, gelesen: o.sp.inst, dateien: d,
        letzter: { zeit: Modell.lokalIso(), fehler: null } }, uhr);
      return { ok: true, fehler: null };
    };
    return 1; })()`);
  // Ein Abgleich + Bilder-Lauf, bis das Ergebnis da ist
  const abBilder = async () => { await js(`(bilderStand = null, abgleich().then(() => 1))`);
    for (let i = 0; i < 40 && !(await js(`!bilderLaeuft && !!bilderStand`)); i++) await warte(150); };
  await abBilder();
  pruefe(await js(`darfSchreiben()`), "Abgleich nachgestellt: Gerät darf schreiben");
  await js(`(async () => {
    const c = document.createElement("canvas"); c.width = 300; c.height = 300; const x = c.getContext("2d");
    window.__jpgA = await new Promise((r) => { x.fillStyle = "#36c"; x.fillRect(0, 0, 300, 300); c.toBlob(r, "image/jpeg", 0.9); });
    window.__jpgB = await new Promise((r) => { x.fillStyle = "#c63"; x.fillRect(0, 0, 300, 300); c.toBlob(r, "image/jpeg", 0.9); });
    window.__jpgC = await new Promise((r) => { x.fillStyle = "#3c6"; x.fillRect(0, 0, 300, 300); c.toBlob(r, "image/jpeg", 0.9); });
    const ort = await tun([{ typ: "neu", art: "ort", werte: { name: "Testort", reihen: 1, spalten: 1 } }]);
    const fach = await tun([{ typ: "neu", art: "fach", werte: { name: "Fotokiste", lage: { ort: ort[0].id, reihe: 0, spalte: 0 } } }]);
    window.__fach17 = fach[0].id;
    await tun([{ typ: "neu", art: "eintrag", werte: { name: "Testsuppe", fach: __fach17 }, menge: 1 },
               { typ: "neu", art: "eintrag", werte: { name: "Fremdsuppe", fach: __fach17 }, menge: 1 }]);
    return await fotoUebernehmen("n:testsuppe", await Bilder.normalisieren(__jpgA), () => 0); })()`);
  {
    const datei1 = await js(`stand.fotoVon.get("n:testsuppe")`);
    pruefe(/^foto-[A-Za-z0-9]+\.jpg$/.test(datei1 || ""), "eigenes Foto aufgenommen");

    // a) Ordner Bilder fehlt
    await js(`(__od.bilder = null, __od.log = [], 1)`);
    await abBilder();
    pruefe(await js(`bilderStand.keinOrdner === true && bilderStand.wartenHoch === 1`), "Ordner fehlt: erkannt, 1 Foto wartet");
    pruefe(await js(`__od.log.every((l) => l.startsWith("GET "))`), "Ordner fehlt: nichts angelegt, nichts geschrieben");
    pruefe(await js(`Bilder.fotosOffen(null)`) === 1 && await js(`Bilder.fotoLesen(${JSON.stringify(datei1)}).then((b) => !!b)`), "Foto bleibt lokal, nicht als hochgeladen markiert");
    pruefe(await js(`fehlerLeiste.hidden`), "keine rote Fehlerleiste");
    await abBilder();
    pruefe(await js(`bilderStand.keinOrdner === true && fehlerLeiste.hidden && __od.log.every((l) => l.startsWith("GET "))`), "zweiter Abgleich: still, kein Dauerfeuer");
    await js(`(oeffne({ art: "sicherung" }), 1)`); await warte(300);
    pruefe((await js(`document.querySelector("main .fotostand")?.textContent || ""`)).includes("Ordner „Bilder“ fehlt"), "Sicherung & Abgleich: stille Zeile „Ordner Bilder fehlt“");
    await bild("17a-bilder-fehlt.png");
    await js(`history.back(), 1`); await warte(300);

    // b) Tobias legt den Ordner an -> Upload
    await js(`(__od.bilder = new Map(), __od.log = [], 1)`);
    await abBilder();
    pruefe(await js(`__od.bilder.has(${JSON.stringify(datei1)})`), "Ordner da: Foto hochgeladen");
    pruefe(await js(`(async () => { const a = new Uint8Array(await __od.bilder.get(${JSON.stringify(datei1)}).arrayBuffer()), b = new Uint8Array(await (await Bilder.fotoLesen(${JSON.stringify(datei1)})).arrayBuffer()); return a.length === b.length && a.every((x, i) => x === b[i]); })()`), "hochgeladen = Byte für Byte die lokale Datei");
    pruefe(await js(`__od.log.some((l) => l.startsWith("PUT ") && l.includes("conflictBehavior=fail"))`), "PUT mit conflictBehavior=fail");
    pruefe(await js(`Bilder.fotosOffen(null)`) === 0, "lokal als hochgeladen markiert (Gerätedaten löschen zählt es nicht mehr)");
    await js(`(oeffne({ art: "sicherung" }), 1)`); await warte(300);
    pruefe((await js(`document.querySelector("main .fotostand")?.textContent || ""`)).includes("Alle Fotos abgeglichen"), "Sicherung & Abgleich: ✓ Alle Fotos abgeglichen");
    await js(`history.back(), 1`); await warte(300);
    await js(`(__od.log = [], 1)`);
    await abBilder();
    pruefe(await js(`!__od.log.some((l) => l.startsWith("PUT "))`), "kein zweiter Upload");

    // c) Foto vom anderen Handy: Vorgang kommt mit dem Abgleich, Datei aus dem Ordner Bilder
    const fremdDatei = "foto-" + "f".repeat(32) + ".jpg";
    await js(`(async () => {
      const e = Modell.erzeuge({ inst: "andrea0000000001", nr: 1, uhr: 1 }, { typ: "neu", art: "bild", werte: { schluessel: "n:fremdsuppe", datei: ${JSON.stringify(fremdDatei)} } });
      __od.fremd = [e.vorgang]; __od.bilder.set(${JSON.stringify(fremdDatei)}, __jpgB); return 1; })()`);
    await js(`(oeffne({ art: "fach", id: __fach17 }), 1)`); await warte(300);
    await abBilder();
    pruefe(await js(`bilderStand.neu.includes(${JSON.stringify(fremdDatei)})`), "fremdes Foto heruntergeladen");
    for (let i = 0; i < 20 && !(await js(`!![...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Fremdsuppe"))?.querySelector("img.foto")`)); i++) await warte(150);
    pruefe(await js(`!![...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Fremdsuppe"))?.querySelector("img.foto")`), "Kachel „Fremdsuppe“ zeigt das Foto vom anderen Handy");
    pruefe(await js(`(async () => { const i = [...document.querySelectorAll("main .kachel")].find((k) => k.textContent.includes("Fremdsuppe")).querySelector("img.foto"); await i.decode(); return i.naturalWidth + "x" + i.naturalHeight; })()`) === "300x300", "durch die Bildstrecke (neu kodiert, quadratisch)");
    await bild("17c-fremdes-foto.png");
    pruefe(await js(`Bilder.fotosOffen(null)`) === 0, "heruntergeladenes Foto zählt nicht als „noch nicht in OneDrive“");

    // d) Ersetzen: altes Foto wird tot -> nach dem Abgleich (nichts Offenes) in OneDrive und lokal weg, neues hoch
    await js(`Bilder.normalisieren(__jpgC).then((b) => fotoUebernehmen("n:testsuppe", b, () => 0)).then(() => 1)`);
    const datei2 = await js(`stand.fotoVon.get("n:testsuppe")`);
    pruefe(datei2 && datei2 !== datei1, "Foto ersetzt (neuer Zufallsname)");
    await abBilder();
    pruefe(await js(`__od.bilder.has(${JSON.stringify(datei2)}) && !__od.bilder.has(${JSON.stringify(datei1)})`), "Aufräumen: neues in OneDrive, altes dort gelöscht");
    pruefe(await js(`Bilder.fotoLesen(${JSON.stringify(datei1)}).then((b) => b === null)`), "altes Foto lokal gelöscht");
    pruefe(await js(`__od.bilder.has(${JSON.stringify(fremdDatei)})`), "fremdes aktuelles Foto bleibt");
    // e) Entfernen: Datei wird tot, aber nicht vor dem Abgleich des Entfernens gelöscht
    await js(`(Cloud.__ab = Cloud.abgleichen, Cloud.abgleichen = async () => ({ ok: false, fehler: "offline (nachgestellt)" }), 1)`);
    await js(`(async () => { const eig = H.eigenesFoto(stand.fotoVon, null, "Testsuppe"); await tun(H.fotoWegSchritte(stand.bilder, eig.schluessel)); return 1; })()`);
    await abBilder();
    pruefe(await js(`__od.bilder.has(${JSON.stringify(datei2)})`), "Abgleich fehlgeschlagen: keine Bildarbeit, nichts gelöscht");
    await js(`(Cloud.abgleichen = Cloud.__ab, 1)`);
    await abBilder();
    pruefe(await js(`!__od.bilder.has(${JSON.stringify(datei2)})`), "nach erfolgreichem Abgleich des Entfernens: Datei aufgeräumt");
    // f) Codex C #1: Foto, das ein anderer Tab zugeordnet hat, waehrend hier ein Dialog offen ist (Stand im Arbeitsspeicher
    //    veraltet). Die Datei ist 2 Tage alt -> der alte Code hielt sie fuer eine Waise und loeschte die einzige Kopie.
    const waise = "foto-" + "a1".repeat(16) + ".jpg";
    await js(`(async () => {
      const db = await new Promise((ok, nein) => { const r = indexedDB.open("vorrat-bilder"); r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
      await new Promise((ok, nein) => { const t = db.transaction("fotos", "readwrite"); t.objectStore("fotos").put({ blob: __jpgA, hochgeladen: false, zeit: Date.now() - 2 * 864e5 }, ${JSON.stringify(waise)}); t.oncomplete = ok; t.onerror = () => nein(t.error); });
      db.close();
      dialog("Offener Dialog", [], []);
      await sp.ausfuehrenAlle([{ typ: "neu", art: "bild", werte: { schluessel: "n:tabsuppe", datei: ${JSON.stringify(waise)} } }]); // "anderer Tab"
      return 1; })()`);
    await abBilder();
    pruefe(await js(`!liste.some((v) => v.art === "bild" && v.werte && v.werte.datei === ${JSON.stringify(waise)})`), "Arbeitsspeicher kennt die Zuordnung nicht (Dialog offen)");
    pruefe(await js(`Bilder.fotoLesen(${JSON.stringify(waise)}).then((b) => !!b)`), "Codex C #1: zugeordnetes Foto nicht als Waise gelöscht");
    pruefe(await js(`__od.bilder.has(${JSON.stringify(waise)})`), "… sondern hochgeladen (Namen frisch aus dem Speicher)");
    await js(`history.back(), 1`); await warte(400);
  }
  await js(`(konto.name = __alt17.name, Cloud.abgleichen = __alt17.ab, g.fetch = __alt17.fetch, g.token = __alt17.token, 1)`);

  console.log(fehler.length ? "Konsole:\n  " + fehler.join("\n  ") : "Konsole: keine Fehler");
  if (fehler.length) process.exitCode = 1;
  senden("Browser.close", {}); await warte(500);
  ws.close();
})().catch(async (x) => { console.error(x); try { await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).then((v) => { const w = new WebSocket(v.webSocketDebuggerUrl); w.onopen = () => w.send(JSON.stringify({ id: 1, method: "Browser.close" })); }); await warte(800); } catch { /* */ } process.exit(2); });

function Hilfen_plus(iso, tage) { return new Date(Date.parse(iso) + tage * 864e5).toISOString().slice(0, 10); }
