// Pruefstand Cloud-Abgleich (Abschnitt 2) mit Graph-Attrappe. Aufruf: node tests/test_cloud.js
// Braucht fake-indexeddb wie test_speicher.js (VORRAT_TESTDEPS, Vorgabe D:/tmp/vorrat-testdeps).
"use strict";
const assert = require("assert");
const deps = process.env.VORRAT_TESTDEPS || "D:/tmp/vorrat-testdeps";
try { require(require.resolve("fake-indexeddb/auto", { paths: [deps] })); } catch (e) {
  console.error("fake-indexeddb fehlt in " + deps + "\nEinmalig: npm install --prefix " + deps + " fake-indexeddb");
  process.exit(1);
}
const M = require("../modell.js");
const S = require("../speicher.js");
const C = require("../cloud.js");

// ---- Graph-Attrappe: zwei Laufwerke, Ordner, Dateien, eTags, If-Match, Verknuepfung ----
function attrappe() {
  const items = new Map(); // id -> { id, drive, parent, name, ordner, inhalt, version, geaendert, von, remote }
  let nr = 0;
  const f = { ich: "D1", log: [], vorher: null, items, seite: 0 };
  f.neu = (drive, parent, name, art, inhalt) => {
    const it = { id: "i" + ++nr, drive, parent, name, ordner: art === "ordner", inhalt, version: 1, geaendert: new Date().toISOString(), von: drive === "D1" ? "Tobias" : "Andrea", remote: null };
    items.set(it.id, it);
    return it;
  };
  const wurzel = { D1: f.neu("D1", null, "", "ordner"), D2: f.neu("D2", null, "", "ordner") };
  f.gemein = f.neu("D1", wurzel.D1.id, "Gemeinschaftsordner", "ordner");
  f.daten = f.neu("D1", f.gemein.id, "Vorrats App", "ordner");
  f.sicher = f.neu("D1", f.daten.id, "Sicherungen", "ordner");
  // Andreas Sicht: Verknuepfung in ihrem Laufwerk auf Tobias' Gemeinschaftsordner
  const kurz = f.neu("D2", wurzel.D2.id, "Gemeinschaftsordner", "datei");
  kurz.remote = f.gemein;
  f.kinder = (ordner) => [...items.values()].filter((x) => x.parent === ordner.id);
  f.datei = (ordner, name) => f.kinder(ordner).find((x) => x.name === name);
  f.inhalt = (ordner, name) => JSON.parse(f.datei(ordner, name).inhalt);
  f.aendern = (it, inhalt) => { if (inhalt !== undefined) it.inhalt = inhalt; it.version++; it.geaendert = new Date().toISOString(); };
  const etag = (it) => '"{' + it.id + "}," + it.version + '"';
  const meta = (it) => Object.assign({ id: it.id, name: it.name, eTag: etag(it), lastModifiedDateTime: it.geaendert, lastModifiedBy: { user: { displayName: it.von } } },
    it.remote ? { remoteItem: { id: it.remote.id, parentReference: { driveId: it.remote.drive }, folder: {} } } : it.ordner ? { folder: {} } : { file: {} });
  const antwort = (status, body) => ({ ok: status >= 200 && status < 300, status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  f.fetch = async (url, opt) => {
    opt = opt || {};
    const pfad = url.replace("https://graph.microsoft.com/v1.0", "");
    const art = opt.method || "GET";
    f.log.push([art, pfad, opt.headers || {}]);
    if (f.vorher) { const r = await f.vorher(art, pfad, opt); if (r) return r; }
    let m;
    if (pfad === "/me/drive?$select=id") return antwort(200, { id: f.ich });
    if (pfad === "/me/drive/root?$select=id") return antwort(200, { id: wurzel[f.ich].id });
    if ((m = /^\/drives\/(\w+)\/items\/(\w+)\/children/.exec(pfad))) {
      const o = items.get(m[2]);
      if (!o || !o.ordner) return antwort(404, {});
      const alle = f.kinder(o).map(meta), ab = Number((/\$skiptoken=(\d+)/.exec(pfad) || [0, 0])[1]);
      if (!f.seite) return antwort(200, { value: alle });
      const r = { value: alle.slice(ab, ab + f.seite) };
      if (ab + f.seite < alle.length) r["@odata.nextLink"] = "https://graph.microsoft.com/v1.0/drives/" + m[1] + "/items/" + m[2] + "/children?$skiptoken=" + (ab + f.seite);
      return antwort(200, r);
    }
    if ((m = /^\/drives\/(\w+)\/items\/(\w+)\/content$/.exec(pfad))) {
      const it = items.get(m[2]);
      return it && !it.ordner ? antwort(200, it.inhalt) : antwort(404, {});
    }
    if ((m = /^\/drives\/(\w+)\/items\/(\w+):\/([^:?]+)(:\/content)?(\?.*)?$/.exec(pfad))) {
      const o = items.get(m[2]);
      if (!o || !o.ordner) return antwort(404, {});
      const it = f.datei(o, m[3]);
      if (art === "GET") return it ? antwort(200, meta(it)) : antwort(404, {});
      if (art === "PUT") {
        const im = opt.headers && opt.headers["If-Match"];
        if (im && (!it || im !== etag(it))) return antwort(412, {});
        if (it) { f.aendern(it, opt.body); return antwort(200, meta(it)); }
        return antwort(201, meta(f.neu(o.drive, o.id, m[3], "datei", opt.body)));
      }
    }
    if ((m = /^\/drives\/(\w+)\/items\/(\w+)$/.exec(pfad)) && art === "DELETE") return items.delete(m[2]) ? antwort(204, "") : antwort(404, {});
    return antwort(400, {});
  };
  f.puts = (muster) => f.log.filter(([a, p]) => a === "PUT" && (!muster || muster.test(p)));
  f.downloads = () => f.log.filter(([a, p]) => a === "GET" && /\/content$/.test(p));
  return f;
}

// Fremdes Handy: gueltige Vorgangsdatei mit n Orten, Uhr ab uhrAb.
function fremdeDatei(inst, n, uhrAb) {
  let z = { inst, nr: 1, uhr: uhrAb || 0 };
  const vorgaenge = [];
  for (let i = 0; i < n; i++) { const e = M.erzeuge(z, { typ: "neu", art: "ort", werte: { name: "Ort " + i, reihen: 1, spalten: 1 } }); z = e.zaehler; vorgaenge.push(e.vorgang); }
  return { schema: M.SCHEMA, inst, vorgaenge };
}
const ORT = { typ: "neu", art: "ort", werte: { name: "Gefrierschrank", reihen: 6, spalten: 1 } };
const PFAD = "Gemeinschaftsordner/Vorrats App", SICHER = PFAD + "/Sicherungen";
const ANDREA = "andrea0000000001";
const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });

const dbWeg = () => anfrage(indexedDB.deleteDatabase(S.DB));
async function aufbau() {
  await dbWeg();
  const f = attrappe();
  return { f, g: { fetch: f.fetch, token: async () => "T" }, sp: await S.oeffnen() };
}
const lauf = (x, extra) => C.abgleichen(Object.assign({ g: x.g, sp: x.sp, datenPfad: PFAD, sicherPfad: SICHER, version: "v3" }, extra));
const eigenName = (inst) => "vorgaenge-" + inst + ".json";

const faelle = [];
const fall = (name, fn) => faelle.push([name, fn]);

fall("Fremddatei im Datenordner: Stopp, nichts gelesen, nichts geschrieben, Dateiname nie gezeigt", async () => {
  const x = await aufbau();
  x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 2)));
  x.f.neu("D1", x.f.daten.id, "Steuer 2025 Az 4711.pdf", "datei", "geheim");
  await x.sp.ausfuehren(ORT);
  const r = await lauf(x);
  assert.strictEqual(r.ok, false);
  assert.match(r.fehler, /1 Datei\(en\), die nicht zur App gehören/);
  assert.ok(!/Steuer|4711|pdf/.test(r.fehler), "fremder Dateiname im Text");
  assert.strictEqual(x.f.downloads().length, 0, "nichts gelesen");
  assert.strictEqual(x.f.puts().length, 0, "nichts geschrieben (auch keine Sicherung)");
  const ab = await x.sp.abgleich();
  assert.deepStrictEqual([ab.gelesen, ab.dateien], [null, {}]);
  const p = await C.pruefen(x.g, PFAD, false, x.sp.inst);
  assert.ok(p.some(([ok, t]) => !ok && /nicht zur App/.test(t)) && !p.some(([, t]) => /Steuer/.test(t)));
  assert.strictEqual(x.f.puts().length, 0, "Pruefen schreibt bei Stopp nicht");
  x.sp.schliessen();
});

fall("Lesefehler ist nie ein leerer Vorrat: letzter Stand bleibt, nichts hochgeladen", async () => {
  const x = await aufbau();
  const a = x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 3)));
  assert.strictEqual((await lauf(x)).ok, true);
  await x.sp.ausfuehren(ORT);
  x.f.aendern(a, JSON.stringify(fremdeDatei(ANDREA, 4)));
  x.f.vorher = async (art, pfad) => (art === "GET" && pfad.endsWith(a.id + "/content") ? { ok: false, status: 500 } : null);
  const vorher = x.f.puts().length;
  const r = await lauf(x);
  assert.strictEqual(r.ok, false);
  assert.match(r.fehler, /nicht lesbar.*500/);
  assert.strictEqual(x.f.puts().length, vorher, "nichts hochgeladen");
  const ab = await x.sp.abgleich();
  assert.strictEqual(ab.dateien[eigenName(ANDREA)].vorgaenge.length, 3, "alter Stand bleibt");
  assert.strictEqual(C.offene(ab, await x.sp.alleVorgaenge()), 1);
  // kaputtes JSON und falsche Schema-Version genauso
  x.f.vorher = null;
  x.f.aendern(a, '{"schema":1,"inst":"' + ANDREA + '","vorgaenge":[');
  assert.match((await lauf(x)).fehler, /kein gültiges JSON/);
  x.f.aendern(a, JSON.stringify(Object.assign(fremdeDatei(ANDREA, 1), { schema: 2 })));
  assert.match((await lauf(x)).fehler, /Schema-Version/);
  x.f.aendern(a, JSON.stringify(fremdeDatei("andrea0000000999", 1)));
  assert.match((await lauf(x)).fehler, /Dateiname und Inhalt/);
  assert.strictEqual(x.f.puts().length, vorher);
  assert.strictEqual((await x.sp.abgleich()).dateien[eigenName(ANDREA)].vorgaenge.length, 3);
  x.sp.schliessen();
});

fall("412 bei If-Match: neu lesen, nochmal schreiben; dauerhaft 412 -> Fehler, nichts quittiert", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const eigen = x.f.datei(x.f.daten, eigenName(x.sp.inst));
  await x.sp.ausfuehren(ORT);
  let einmal = true;
  x.f.vorher = async (art, pfad) => { if (art === "PUT" && pfad.includes(eigenName(x.sp.inst)) && einmal) { einmal = false; x.f.aendern(eigen); } };
  const r = await lauf(x);
  assert.strictEqual(r.ok, true, r.fehler);
  const puts = x.f.puts(new RegExp(eigenName(x.sp.inst)));
  assert.ok(puts.slice(-2).every(([, , k]) => /^"/.test(k["If-Match"])), "beide Versuche mit If-Match");
  assert.strictEqual(x.f.inhalt(x.f.daten, eigenName(x.sp.inst)).vorgaenge.length, 2);
  assert.strictEqual(C.offene(await x.sp.abgleich(), await x.sp.alleVorgaenge()), 0);
  // anderer Tab schreibt jedes Mal dazwischen
  await x.sp.ausfuehren(ORT);
  x.f.vorher = async (art, pfad) => { if (art === "PUT" && pfad.includes(eigenName(x.sp.inst))) x.f.aendern(eigen); };
  const r2 = await lauf(x);
  assert.match(r2.fehler, /412/);
  assert.strictEqual(C.offene(await x.sp.abgleich(), await x.sp.alleVorgaenge()), 1, "nicht quittiert");
  x.sp.schliessen();
});

fall("Quittung nur fuer Hochgeladenes: was waehrend des Hochladens entsteht, bleibt offen", async () => {
  const x = await aufbau();
  for (let i = 0; i < 3; i++) await x.sp.ausfuehren(ORT);
  x.f.vorher = async (art, pfad) => { if (art === "PUT" && pfad.includes("vorgaenge-")) { x.f.vorher = null; await x.sp.ausfuehren(ORT); } };
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.inhalt(x.f.daten, eigenName(x.sp.inst)).vorgaenge.length, 3);
  assert.strictEqual((await x.sp.alleVorgaenge()).length, 4);
  assert.strictEqual(C.offene(await x.sp.abgleich(), await x.sp.alleVorgaenge()), 1);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.inhalt(x.f.daten, eigenName(x.sp.inst)).vorgaenge.length, 4);
  assert.strictEqual(C.offene(await x.sp.abgleich(), await x.sp.alleVorgaenge()), 0);
  x.sp.schliessen();
});

fall("Neue Installation: erst nach vollstaendigem Lesen schreiben, Uhr vorher nachgezogen", async () => {
  const x = await aufbau();
  const a = x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 3, 47)));
  assert.strictEqual(C.darfSchreiben(await x.sp.abgleich(), x.sp.inst, PFAD), false);
  x.f.vorher = async (art, pfad) => (pfad.endsWith(a.id + "/content") ? { ok: false, status: 0 } : null);
  assert.strictEqual((await lauf(x)).ok, false);
  assert.strictEqual(C.darfSchreiben(await x.sp.abgleich(), x.sp.inst, PFAD), false, "Lesefehler -> weiter gesperrt");
  x.f.vorher = null;
  assert.strictEqual((await lauf(x)).ok, true);
  const ab = await x.sp.abgleich();
  assert.strictEqual(C.darfSchreiben(ab, x.sp.inst, PFAD), true);
  assert.strictEqual(C.darfSchreiben(ab, x.sp.inst, "Anderer/Ordner"), false, "anderer Ordner = neu lesen");
  assert.strictEqual((await x.sp.zaehler()).uhr, 50);
  assert.strictEqual((await x.sp.ausfuehren(ORT)).uhr, 51, "frische Aenderung liegt hinter allem Gelesenen");
  x.sp.schliessen();
});

fall("Halber Zustand: alte Vorgaenge unter ihrer alten Datei, neue unter der neuen", async () => {
  const x = await aufbau();
  for (let i = 0; i < 3; i++) await x.sp.ausfuehren(ORT);
  const alt = x.sp.inst;
  x.sp.schliessen();
  const db = await anfrage(indexedDB.open(S.DB));
  await anfrage(db.transaction("meta", "readwrite").objectStore("meta").delete("zaehler"));
  db.close();
  x.sp = await S.oeffnen();
  assert.notStrictEqual(x.sp.inst, alt);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.inhalt(x.f.daten, eigenName(alt)).vorgaenge.length, 3);
  assert.ok(!x.f.datei(x.f.daten, eigenName(x.sp.inst)), "keine leere Datei fuer die neue ID");
  await x.sp.ausfuehren(ORT);
  const vorher = x.f.puts(new RegExp(eigenName(alt))).length;
  assert.strictEqual((await lauf(x)).ok, true);
  const neu = x.f.inhalt(x.f.daten, eigenName(x.sp.inst)).vorgaenge;
  assert.deepStrictEqual(neu.map((v) => v.inst), [x.sp.inst]);
  assert.strictEqual(x.f.puts(new RegExp(eigenName(alt))).length, vorher, "alte Datei nicht erneut geschrieben");
  const z = C.zuletzt(await x.sp.abgleich(), x.sp.inst, new Set([alt]));
  assert.deepStrictEqual(z.map((r) => [r.wer, r.alt]), [["dieses Gerät", false], ["dieses Gerät (frühere Installation)", false]]);
  x.sp.schliessen();
});

fall("Review #3: eigene OneDrive-Datei kennt mehr -> uebernehmen, Zaehler dahinter, Abgleich laeuft weiter", async () => {
  const x = await aufbau();
  const v1 = await x.sp.ausfuehren(ORT);
  const v2 = M.erzeuge({ inst: x.sp.inst, nr: 2, uhr: v1.uhr }, ORT).vorgang;
  x.f.neu("D1", x.f.daten.id, eigenName(x.sp.inst), "datei", JSON.stringify({ schema: M.SCHEMA, inst: x.sp.inst, vorgaenge: [v1, v2] }));
  const r = await lauf(x);
  assert.strictEqual(r.ok, true, r.fehler);
  assert.deepStrictEqual((await x.sp.alleVorgaenge()).map((v) => v.n).sort(), [1, 2]);
  const v3 = await x.sp.ausfuehren(ORT);
  assert.strictEqual(v3.id, x.sp.inst + "-3", "keine vorhandene Kennung neu vergeben");
  assert.strictEqual((await lauf(x)).ok, true, "naechster Abgleich haengt nicht");
  assert.deepStrictEqual(x.f.inhalt(x.f.daten, eigenName(x.sp.inst)).vorgaenge.map((v) => v.n), [1, 2, 3]);
  x.sp.schliessen();
});

fall("Review #4: fremde Datei schrumpft -> Bekanntes bleibt (auch in der Sicherung), als zurueckgesetzt markiert", async () => {
  const x = await aufbau();
  const voll = fremdeDatei(ANDREA, 3);
  const a = x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(voll));
  assert.strictEqual((await lauf(x)).ok, true);
  x.f.aendern(a, JSON.stringify({ schema: M.SCHEMA, inst: ANDREA, vorgaenge: voll.vorgaenge.slice(0, 2) }));
  const morgen = new Date(Date.now() + 864e5);
  const r = await lauf(x, { jetzt: morgen });
  assert.strictEqual(r.ok, true, r.fehler);
  const ab = await x.sp.abgleich();
  assert.strictEqual(ab.dateien[eigenName(ANDREA)].vorgaenge.length, 3);
  assert.strictEqual(ab.dateien[eigenName(ANDREA)].zurueckgesetzt, true);
  assert.strictEqual(C.zuletzt(ab, x.sp.inst, new Set()).find((z) => z.inst === ANDREA).zurueck, true);
  const tag = x.f.inhalt(x.f.sicher, "sicherung-" + x.sp.inst + "-" + M.heuteIso(morgen) + ".json");
  assert.strictEqual(tag.dateien.find((d) => d.inst === ANDREA).vorgaenge.length, 3);
  x.sp.schliessen();
});

fall("Schrumpf-Schutz alte ID: lokal teilweise verloren -> OneDrive-Fassung + Rest, nie weniger", async () => {
  const x = await aufbau();
  for (let i = 0; i < 2; i++) await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  await x.sp.ausfuehren(ORT); // Nummer 3, noch nicht oben
  const alt = x.sp.inst;
  x.sp.schliessen();
  const db = await anfrage(indexedDB.open(S.DB));
  const t = db.transaction(["vorgaenge", "meta"], "readwrite");
  t.objectStore("vorgaenge").delete(alt + "-1");
  t.objectStore("vorgaenge").delete(alt + "-2");
  t.objectStore("meta").delete("zaehler");
  await new Promise((ok) => { t.oncomplete = ok; });
  db.close();
  x.sp = await S.oeffnen();
  assert.strictEqual((await lauf(x)).ok, true);
  assert.deepStrictEqual(x.f.inhalt(x.f.daten, eigenName(alt)).vorgaenge.map((v) => v.n), [1, 2, 3]);
  // Review #2: die Oberflaeche rechnet lokal (nur Nummer 3) zusammen mit OneDrive (1..3) -> laedt
  const lokal = await x.sp.alleVorgaenge();
  const z = C.zusammenfuehren(lokal, (await x.sp.abgleich()).dateien);
  assert.strictEqual(z.ok, true, z.fehler);
  assert.strictEqual(z.vorgaenge.length, 3);
  assert.strictEqual(C.zusammenfuehren(lokal, {}).ok, false, "ohne OneDrive bleibt die Luecke ein Fehler");
  x.sp.schliessen();
});

fall("Widerspruch (gleiche Kennung, anderer Inhalt): anhalten, nichts schreiben", async () => {
  const x = await aufbau();
  const v1 = await x.sp.ausfuehren(ORT);
  const falsch = Object.assign({}, v1, { werte: { name: "Anders", reihen: 6, spalten: 1 } });
  x.f.neu("D1", x.f.daten.id, eigenName(x.sp.inst), "datei", JSON.stringify({ schema: M.SCHEMA, inst: x.sp.inst, vorgaenge: [falsch] }));
  assert.match((await lauf(x)).fehler, /Widerspruch/);
  assert.strictEqual(x.f.puts().length, 0);
  x.sp.schliessen();
});

fall("Anlegen nur nach Metadaten-Pruefung: existiert sie inzwischen, kein blindes Ueberschreiben", async () => {
  const x = await aufbau();
  const v1 = await x.sp.ausfuehren(ORT);
  x.f.vorher = async (art, pfad) => {
    if (art === "GET" && pfad.endsWith(eigenName(x.sp.inst) + "?$select=id")) { // zweiter Tab legt sie genau jetzt an
      x.f.vorher = null;
      x.f.neu("D1", x.f.daten.id, eigenName(x.sp.inst), "datei", JSON.stringify({ schema: M.SCHEMA, inst: x.sp.inst, vorgaenge: [v1] }));
    }
  };
  const r = await lauf(x);
  assert.strictEqual(r.ok, true, r.fehler);
  assert.ok(x.f.puts(/vorgaenge-/).every(([, , k]) => k["If-Match"]), "kein PUT ohne If-Match auf vorhandene Datei");
  x.sp.schliessen();
});

fall("Andrea: Pfad ueber Verknuepfung (remoteItem), Windows-Pfad aus dem Explorer", async () => {
  const x = await aufbau();
  x.f.ich = "D2";
  const ort = await C.ordnerFinden(x.g, "C:\\Users\\andrea\\OneDrive\\Gemeinschaftsordner\\Vorrats App\\");
  assert.deepStrictEqual([ort.driveId, ort.id, ort.verknuepfung], ["D1", x.f.daten.id, true]);
  assert.strictEqual(C.pfadNormal(" C:\\Users\\x\\OneDrive\\Gemeinschaftsordner\\Vorrats App\\ "), "Gemeinschaftsordner/Vorrats App");
  assert.strictEqual(C.pfadNormal("/Gemeinschaftsordner//Vorrats App/"), "Gemeinschaftsordner/Vorrats App");
  // Review #7: nur ein Windows-Pfad vorn wird gekuerzt, auch "OneDrive - Firma"
  const bs = (...t) => t.join(String.fromCharCode(92));
  assert.strictEqual(C.pfadNormal(bs("C:", "Users", "x", "OneDrive - Firma", "Gemeinschaftsordner", "Vorrats App")), "Gemeinschaftsordner/Vorrats App");
  assert.strictEqual(C.pfadNormal("Mein OneDrive/Vorrat"), "Mein OneDrive/Vorrat");
  assert.strictEqual(C.pfadNormal("Archiv/onedrive/Vorrat"), "Archiv/onedrive/Vorrat");
  assert.strictEqual(C.pfadNormal(bs("D:", "MeinOneDrive", "Vorrat")), "D:/MeinOneDrive/Vorrat");
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.ok(x.f.datei(x.f.daten, eigenName(x.sp.inst)), "Datei in Tobias' Ordner");
  assert.ok(!x.f.log.some(([, p]) => /root:\//.test(p)), "kein Pfad-Zugriff (HTTP 422 bei Verknuepfung)");
  x.sp.schliessen();
});

fall("Pruefen: Schreibprobe angelegt und weggeraeumt; Ordner fehlt -> nur Ordnernamen, nie Dateinamen", async () => {
  const x = await aufbau();
  const p = await C.pruefen(x.g, PFAD, false, x.sp.inst);
  assert.deepStrictEqual(p.map(([ok]) => ok), [true, true, true], JSON.stringify(p));
  assert.strictEqual(x.f.kinder(x.f.daten).filter((d) => /schreibprobe/.test(d.name)).length, 0);
  x.f.neu("D1", x.f.gemein.id, "Geheim Kontoauszug.pdf", "datei", "x");
  const q = await C.pruefen(x.g, "Gemeinschaftsordner/Vorrat", false, x.sp.inst);
  assert.strictEqual(q[0][0], false);
  assert.match(q[0][1], /„Vorrat“ nicht gefunden.*Vorrats App/);
  assert.ok(!/Geheim/.test(q[0][1]));
  const s = await C.pruefen(x.g, SICHER, true, x.sp.inst);
  assert.deepStrictEqual(s.map(([ok]) => ok), [true, true, true]);
  // eine liegengebliebene Schreibprobe stoppt den Abgleich nicht
  x.f.neu("D1", x.f.daten.id, "schreibprobe-" + x.sp.inst + ".json", "datei", "{}");
  x.f.neu("D1", x.f.daten.id, "test-tobias.json", "datei", "{}"); // vom Kontentest
  assert.strictEqual((await lauf(x)).ok, true);
  x.sp.schliessen();
});

fall("Sicherung: einmal am Tag + vor Version, Inhalt komplett, fremde Datei im Sicherungsordner -> nichts", async () => {
  const x = await aufbau();
  x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 2)));
  await x.sp.ausfuehren(ORT);
  const jetzt = new Date();
  const heute = M.heuteIso(jetzt);
  const r = await lauf(x, { jetzt });
  assert.strictEqual(r.ok, true, r.fehler);
  assert.deepStrictEqual(r.zustand.sicherung.fehler, null);
  const namen = x.f.kinder(x.f.sicher).map((d) => d.name).sort();
  assert.deepStrictEqual(namen, ["sicherung-" + x.sp.inst + "-" + heute + ".json", "sicherung-" + x.sp.inst + "-vor-v3-" + heute + ".json"]);
  const inhalt = x.f.inhalt(x.f.sicher, namen[0]);
  assert.deepStrictEqual(inhalt.dateien.map((d) => [d.inst, d.vorgaenge.length]).sort(), [[ANDREA, 2], [x.sp.inst, 1]].sort());
  for (const d of inhalt.dateien) assert.ok(M.pruefeDatei(d).ok);
  const n = x.f.puts(/Sicherungen|items\/i\d+:\/sicherung-/).length;
  await lauf(x, { jetzt });
  assert.strictEqual(x.f.puts(/:\/sicherung-/).length, n, "am selben Tag keine zweite Sicherung");
  // naechster Tag, aber fremde Datei im Sicherungsordner
  x.f.neu("D1", x.f.sicher.id, "Urlaub.jpg", "datei", "x");
  const morgen = new Date(jetzt.getTime() + 864e5);
  const r2 = await lauf(x, { jetzt: morgen });
  assert.strictEqual(r2.ok, true, "Abgleich selbst laeuft");
  assert.match(r2.zustand.sicherung.fehler, /Sicherungsordner/);
  assert.ok(!/Urlaub/.test(r2.zustand.sicherung.fehler));
  assert.strictEqual(x.f.puts(/:\/sicherung-/).length, n, "nichts in den Ordner geschrieben");
  // Daten- und Sicherungsordner gleich -> abgelehnt
  assert.match((await lauf(x, { sicherPfad: PFAD })).fehler, /verschieden/);
  x.sp.schliessen();
});

fall("Review #5: zweite Sicherung scheitert -> erste gebucht, Meldung ehrlich, nur die fehlende wird nachgeholt", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  const jetzt = new Date();
  x.f.vorher = async (art, pfad) => (art === "PUT" && pfad.includes("-vor-") ? { ok: false, status: 503 } : null);
  const r = await lauf(x, { jetzt });
  assert.strictEqual(r.zustand.gesichert, M.heuteIso(jetzt));
  assert.strictEqual(r.zustand.appStand, null);
  assert.match(r.zustand.sicherung.fehler, /Versionssicherung fehlgeschlagen.*Tagessicherung liegt/);
  assert.ok(!/NICHTS/.test(r.zustand.sicherung.fehler));
  x.f.vorher = null;
  const n = x.f.puts(/:\/sicherung-/).length;
  const r2 = await lauf(x, { jetzt });
  assert.strictEqual(r2.zustand.appStand, "v3");
  assert.deepStrictEqual(x.f.puts(/:\/sicherung-/).slice(n).map(([, p]) => /-vor-/.test(p)), [true], "nur die Versionssicherung nachgeholt");
  x.sp.schliessen();
});

fall("Review #6: Version mit Punkt (v3.1) -> eigene Sicherung zaehlt nicht als fremd", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  const r = await lauf(x, { version: "v3.1" });
  assert.strictEqual(r.zustand.sicherung.fehler, null);
  assert.ok(x.f.kinder(x.f.sicher).some((d) => d.name.includes("-vor-v3_1-")));
  const r2 = await lauf(x, { version: "v3.1", jetzt: new Date(Date.now() + 864e5) });
  assert.strictEqual(r2.zustand.sicherung.fehler, null, "naechster Tag nicht gesperrt");
  const ich = x.sp.inst;
  const weg = C.sicherungenAussortieren([{ id: "a", name: "sicherung-" + ich + "-vor-v3_1-2026-01-01.json" }, { id: "b", name: "sicherung-" + ich + "-vor-v2-2026-01-01.json" },
    { id: "c", name: "sicherung-" + ich + "-2026-02-01.json" }], ich, "v3.1", 1);
  assert.deepStrictEqual(weg.map((d) => d.id), ["b"], "laufende Version bleibt, alte geht");
  x.sp.schliessen();
});

fall("Review #8: ohne Aenderung keine grossen Daten schreiben; Ordnerwechsel mischt nie", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  const mit = [];
  const echt = x.sp.abgleichSpeichern;
  x.sp.abgleichSpeichern = (z, u) => { mit.push("dateien" in z); return echt(z, u); };
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.deepStrictEqual(mit, [true, false]);
  assert.strictEqual(Object.keys((await x.sp.abgleich()).dateien).length, 1, "Daten bleiben stehen");
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(mit[2], true, "neue Fassung hochgeladen -> geschrieben");
  const r = await lauf(x, { datenPfad: "Gibtesnicht" });
  assert.strictEqual(r.ok, false);
  const ab = await x.sp.abgleich();
  assert.deepStrictEqual([ab.ordner, ab.gelesen, ab.dateien], ["gibtesnicht", null, {}]);
  x.sp.schliessen();
});

fall("Aufbewahrung: nur eigene Sicherungen, 4 neueste + 4 Wochen, Versionssicherung bleibt", () => {
  const ich = "aaaaaaaa11111111";
  const tag = (i) => new Date(Date.UTC(2026, 10, 30) - i * 864e5).toISOString().slice(0, 10);
  const liste = [];
  for (let i = 0; i < 60; i++) liste.push({ id: "t" + i, name: "sicherung-" + ich + "-" + tag(i) + ".json" });
  liste.push({ id: "v3", name: "sicherung-" + ich + "-vor-v3-" + tag(50) + ".json" }, { id: "v2", name: "sicherung-" + ich + "-vor-v2-" + tag(55) + ".json" },
    { id: "and", name: "sicherung-" + ANDREA + "-" + tag(59) + ".json" }, { id: "x", name: "sicherung-" + ich + "-" + tag(59) + ".json.bak" },
    { id: "y", name: "sicherung-" + ich + "-2026-11-01-alt.json" });
  const weg = new Set(C.sicherungenAussortieren(liste, ich, "v3").map((d) => d.id));
  const bleibt = liste.filter((d) => !weg.has(d.id)).map((d) => d.id);
  assert.ok(["t0", "t1", "t2", "t3", "v3", "and", "x", "y"].every((i) => bleibt.includes(i)), bleibt.join());
  assert.ok(weg.has("v2") && weg.has("t59"));
  const wochen = bleibt.filter((i) => /^t\d+$/.test(i) && Number(i.slice(1)) > 3);
  assert.ok(wochen.length >= 3 && wochen.length <= 4, wochen.join());
  assert.ok(wochen.every((i) => Number(i.slice(1)) < 40), "keine uralten Wochensicherungen");
});

fall("Fehlende Datei: fremde behaelt letzten Stand (markiert), eigene wird neu hochgeladen; gleicher eTag = kein Download", async () => {
  const x = await aufbau();
  const a = x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 2)));
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const dl = x.f.downloads().length;
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.downloads().length, dl, "unveraendert -> nicht neu geladen");
  x.f.items.delete(a.id);
  x.f.items.delete(x.f.datei(x.f.daten, eigenName(x.sp.inst)).id);
  assert.strictEqual((await lauf(x)).ok, true);
  const ab = await x.sp.abgleich();
  assert.strictEqual(ab.dateien[eigenName(ANDREA)].fehlt, true);
  assert.strictEqual(ab.dateien[eigenName(ANDREA)].vorgaenge.length, 2, "nichts verworfen");
  assert.ok(x.f.datei(x.f.daten, eigenName(x.sp.inst)), "eigene Datei wieder da");
  assert.strictEqual(C.zuletzt(ab, x.sp.inst, new Set()).find((r) => r.inst === ANDREA).fehlt, true);
  x.sp.schliessen();
});

fall("Lebenszeichen und 'zuletzt abgeglichen': taeglich neu schreiben, ab 7 Tagen markiert", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const n = x.f.puts(/vorgaenge-/).length;
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.puts(/vorgaenge-/).length, n, "ohne Neues kein Hochladen");
  const eigen = x.f.datei(x.f.daten, eigenName(x.sp.inst));
  eigen.geaendert = new Date(Date.now() - 21 * 3600e3).toISOString();
  eigen.version++;
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual(x.f.puts(/vorgaenge-/).length, n + 1, "nach 20 Std. Lebenszeichen");
  const jetzt = new Date();
  const ab = { dateien: {
    a: { inst: ANDREA, von: "Andrea", geaendert: new Date(jetzt - 8 * 864e5).toISOString(), vorgaenge: [] },
    b: { inst: "bbbbbbbb", von: "Tobias", geaendert: new Date(jetzt - 2 * 3600e3).toISOString(), vorgaenge: [] } } };
  const z = C.zuletzt(ab, "ich00000", new Set(), jetzt);
  assert.deepStrictEqual(z.map((r) => [r.wer, r.wann, r.alt]), [["Andrea", "vor 8 Tagen", true], ["Tobias", "vor 2 Std.", false]]);
  x.sp.schliessen();
});

fall("Anmeldung abgelaufen: Klartext, nichts geschrieben, Zustand bleibt", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  x.g.token = async () => { throw new Error("Anmeldung abgelaufen – bitte neu anmelden"); };
  const r = await lauf(x);
  assert.match(r.fehler, /neu anmelden/);
  assert.strictEqual(x.f.log.length, 0);
  x.sp.schliessen();
});

// ==== Codex Runde 1 (Abschnitt 2): je Fund ein Fall ====

fall("Codex #1: bekannte fremde Kennung mit neuem Inhalt -> Widerspruch, nichts uebernommen", async () => {
  const x = await aufbau();
  const d = fremdeDatei(ANDREA, 2);
  const a = x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(d));
  assert.strictEqual((await lauf(x)).ok, true);
  const falsch = JSON.parse(JSON.stringify(d));
  falsch.vorgaenge[1].werte.name = "Ganz anders";
  x.f.aendern(a, JSON.stringify(falsch));
  const r = await lauf(x);
  assert.match(String(r.fehler), /Widerspruch/);
  assert.strictEqual((await x.sp.abgleich()).dateien[eigenName(ANDREA)].vorgaenge[1].werte.name, "Ort 1", "alter Inhalt bleibt");
  x.sp.schliessen();
});

async function halberZustand(x) { // alte ID mit 1..3 in OneDrive, lokal davon nur Nummer 1, neue ID laeuft
  for (let i = 0; i < 3; i++) await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const alt = x.sp.inst;
  x.sp.schliessen();
  const db = await anfrage(indexedDB.open(S.DB));
  const t = db.transaction(["vorgaenge", "meta"], "readwrite");
  t.objectStore("vorgaenge").delete(alt + "-2");
  t.objectStore("vorgaenge").delete(alt + "-3");
  t.objectStore("meta").delete("zaehler");
  await new Promise((ok) => { t.oncomplete = ok; });
  db.close();
  x.sp = await S.oeffnen();
  return alt;
}

fall("Codex #2a: halber Zustand, alte Datei in OneDrive verkuerzt -> Bekanntes bleibt und wird wieder hochgeladen", async () => {
  const x = await aufbau();
  const alt = await halberZustand(x);
  const datei = x.f.datei(x.f.daten, eigenName(alt));
  const d = JSON.parse(datei.inhalt);
  x.f.aendern(datei, JSON.stringify(Object.assign(d, { vorgaenge: d.vorgaenge.slice(0, 2) })));
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual((await x.sp.abgleich()).dateien[eigenName(alt)].vorgaenge.length, 3);
  assert.deepStrictEqual(x.f.inhalt(x.f.daten, eigenName(alt)).vorgaenge.map((v) => v.n), [1, 2, 3]);
  x.sp.schliessen();
});

fall("Codex #2b: halber Zustand, alte Datei verschwunden -> mit allen 3 wieder angelegt, nicht nur mit Nummer 1", async () => {
  const x = await aufbau();
  const alt = await halberZustand(x);
  x.f.items.delete(x.f.datei(x.f.daten, eigenName(alt)).id);
  assert.strictEqual((await lauf(x)).ok, true);
  assert.deepStrictEqual(x.f.inhalt(x.f.daten, eigenName(alt)).vorgaenge.map((v) => v.n), [1, 2, 3]);
  x.sp.schliessen();
});

fall("Codex #3: laufende ID lokal leer, OneDrive kennt sie schon -> uebernehmen, keine Kennung doppelt", async () => {
  const x = await aufbau();
  const v = M.erzeuge({ inst: x.sp.inst, nr: 1, uhr: 0 }, ORT).vorgang;
  x.f.neu("D1", x.f.daten.id, eigenName(x.sp.inst), "datei", JSON.stringify({ schema: M.SCHEMA, inst: x.sp.inst, vorgaenge: [v] }));
  assert.strictEqual((await lauf(x)).ok, true);
  assert.strictEqual((await x.sp.zaehler()).nr, 2);
  assert.strictEqual((await x.sp.ausfuehren(ORT)).id, x.sp.inst + "-2");
  assert.strictEqual((await lauf(x)).ok, true, "naechster Abgleich ohne Widerspruch");
  x.sp.schliessen();
});

fall("Codex #6: unter dem alten Pfad liegt ein anderer Ordner -> Stopp, nichts hochgeladen", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  x.f.daten.name = "Vorrats App alt"; // umbenannt, neuer gleichnamiger Ordner
  const neuer = x.f.neu("D1", x.f.gemein.id, "Vorrats App", "ordner");
  x.f.neu("D1", neuer.id, "Sicherungen", "ordner");
  await x.sp.ausfuehren(ORT);
  x.g = { fetch: x.f.fetch, token: async () => "T" }; // neue Sitzung (Neustart)
  const r = await lauf(x);
  assert.match(String(r.fehler), /anderer Ordner/);
  assert.strictEqual(x.f.kinder(neuer).filter((d) => /^vorgaenge-/.test(d.name)).length, 0, "nichts in den neuen Ordner");
  x.sp.schliessen();
});

fall("Codex #8: Liste ohne value-Array -> Fehler, nie leerer Ordner", async () => {
  const x = await aufbau();
  x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 1)));
  x.f.vorher = async (art, pfad) => (pfad.startsWith("/drives/D1/items/" + x.f.daten.id + "/children") ? { ok: true, status: 200, json: async () => ({}) } : null);
  const r = await lauf(x);
  assert.strictEqual(r.ok, false);
  assert.strictEqual((await x.sp.abgleich()).gelesen, null, "nicht freigeschaltet");
  assert.strictEqual(x.f.puts().length, 0, "keine (leere) Sicherung");
  x.sp.schliessen();
});

fall("Codex #9: Seiten (@odata.nextLink) werden gelesen; Folgeseite auf fremdem Host -> Fehler ohne Token", async () => {
  const x = await aufbau();
  x.f.neu("D1", x.f.gemein.parent, "Aaa", "ordner");
  x.f.neu("D1", x.f.gemein.parent, "Bbb", "ordner");
  x.f.neu("D1", x.f.daten.id, eigenName(ANDREA), "datei", JSON.stringify(fremdeDatei(ANDREA, 1)));
  x.f.seite = 1;
  await x.sp.ausfuehren(ORT);
  const r = await lauf(x);
  assert.strictEqual(r.ok, true, r.fehler);
  assert.ok(r.zustand.dateien[eigenName(ANDREA)], "Datei auf Folgeseite gelesen");
  const wurzel = await C.wurzelOrt(x.g);
  assert.strictEqual((await C.unterordner(x.g, wurzel)).length, 3);
  const fremd = [];
  const g2 = { token: async () => "T", fetch: async (u, o) => {
    if (!u.startsWith("https://graph.microsoft.com/")) fremd.push(u);
    const r0 = await x.f.fetch(u, o);
    if (!/children/.test(u)) return r0;
    const j = await r0.json();
    if (j["@odata.nextLink"]) j["@odata.nextLink"] = "https://boese.example/naechste";
    return { ok: true, status: 200, json: async () => j };
  } };
  await assert.rejects(C.unterordner(g2, wurzel), /Folgeseite/);
  assert.deepStrictEqual(fremd, [], "kein Aufruf an fremden Host");
  x.sp.schliessen();
});

// ==== Codex Runde 2 ====

fall("Codex2 #1: Reparatur gescheitert -> nur Bekanntes aus dem Cache zaehlt NICHT als abgeglichen, Loeschen gesperrt", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT); await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const eigen = x.f.datei(x.f.daten, eigenName(x.sp.inst));
  const d = JSON.parse(eigen.inhalt);
  x.f.aendern(eigen, JSON.stringify(Object.assign(d, { vorgaenge: d.vorgaenge.slice(0, 1) })));
  x.f.vorher = async (art, pfad) => (art === "PUT" && pfad.includes("vorgaenge-") ? { ok: false, status: 412 } : null);
  assert.strictEqual((await lauf(x)).ok, false);
  const ab = await x.sp.abgleich(), lokal = await x.sp.alleVorgaenge();
  assert.strictEqual(C.offene(ab, lokal), 2, "verkuerzte Datei bestaetigt nichts (Nummer 2 steht nicht in OneDrive)");
  assert.match(String(C.loeschSperre(ab, lokal)), /kürzer|fehlt/);
  x.sp.schliessen();
});

fall("Codex2 #2: lokaler Vorgang mit anderem Inhalt als in OneDrive -> offen + Loeschen gesperrt", async () => {
  const x = await aufbau();
  const v1 = await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  const db = await anfrage(indexedDB.open(S.DB));
  await anfrage(db.transaction("vorgaenge", "readwrite").objectStore("vorgaenge").put(Object.assign({}, v1, { werte: { name: "Anders", reihen: 6, spalten: 1 } })));
  db.close();
  const ab = await x.sp.abgleich(), lokal = await x.sp.alleVorgaenge();
  assert.strictEqual(C.offene(ab, lokal), 1);
  assert.match(String(C.loeschSperre(ab, lokal)), /Widerspruch/);
  x.sp.schliessen();
});

fall("Codex2 #3: Fehler nach dem Lesen -> keine Sicherung; Sicherung verwirft nie eine Variante", async () => {
  const x = await aufbau();
  const v = M.erzeuge({ inst: x.sp.inst, nr: 1, uhr: 0 }, ORT).vorgang;
  x.f.neu("D1", x.f.daten.id, eigenName(x.sp.inst), "datei", JSON.stringify({ schema: M.SCHEMA, inst: x.sp.inst, vorgaenge: [v] }));
  x.sp.uebernehmen = () => Promise.reject(new Error("ConstraintError"));
  const r = await lauf(x);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(x.f.puts(/:\/sicherung-/).length, 0, "keine Sicherung nach Fehler");
  const anders = Object.assign({}, v, { werte: { name: "Anders", reihen: 6, spalten: 1 } });
  assert.throws(() => C.sicherungsInhalt({ a: { inst: x.sp.inst, vorgaenge: [v] } }, [anders], x.sp.inst, new Date()), /Widerspruch/);
  x.sp.schliessen();
});

fall("Codex2 #6: Zustand mit Daten, aber ohne Ordnerbindung -> Stopp, nichts geschrieben", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  await x.sp.abgleichSpeichern({ ordner: C.ordnerSchluessel(PFAD), gelesen: x.sp.inst, dateien: { [eigenName(ANDREA)]: { inst: ANDREA, eTag: '"a"', geaendert: new Date().toISOString(), vorgaenge: [] } } }, 0);
  const r = await lauf(x);
  assert.match(String(r.fehler), /Ordnerbindung/);
  assert.strictEqual(x.f.puts().length, 0);
  x.sp.schliessen();
});

fall("Codex2 #7: frisch=true loest den Pfad neu auf -> Austausch auch in laufender Sitzung erkannt", async () => {
  const x = await aufbau();
  await x.sp.ausfuehren(ORT);
  assert.strictEqual((await lauf(x)).ok, true);
  x.f.daten.name = "Vorrats App alt";
  x.f.neu("D1", x.f.gemein.id, "Vorrats App", "ordner");
  assert.strictEqual((await lauf(x)).ok, true, "ohne frisch: Sitzungs-Cache (alter, umbenannter Ordner)");
  assert.match(String((await lauf(x, { frisch: true })).fehler), /anderer Ordner/);
  x.sp.schliessen();
});

(async () => {
  let rot = 0;
  for (const [name, fn] of faelle) {
    try { await fn(); console.log("ok  " + name); } catch (e) { rot++; console.log("ROT " + name + " -> " + String(e.message).split(String.fromCharCode(10))[0]); }
  }
  if (rot) { console.log(rot + " rot"); process.exit(1); }
  console.log(String.fromCharCode(10) + faelle.length + " Faelle bestanden.");
})().catch((e) => { console.error(e); process.exit(1); });
