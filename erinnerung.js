// v6.20 (Tobias 18.11.): Erinnerung, wenn etwas ablaeuft. Die App legt nach jedem Laden eine kleine Liste
// (Name, Menge, Ablauf) in einer eigenen IndexedDB ab, der Service Worker liest sie, wenn Chrome ihn weckt
// (periodicsync, etwa 1x am Tag). Kein Server, kein OneDrive im Hintergrund: Stand = letztes Oeffnen der App.
// Laeuft in Seite, Service Worker (importScripts) und Node (require, ohne IndexedDB).
(function (wurzel) {
  const H = typeof module !== "undefined" && module.exports ? require("./hilfen.js") : wurzel.Hilfen;
  const DB = "vorrat-erinnerung";
  const db = () => new Promise((ok, fehl) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehl(r.error);
  });
  const tx = async (modus, fn) => {
    const d = await db();
    return new Promise((ok, fehl) => {
      const t = d.transaction("kv", modus), r = fn(t.objectStore("kv"));
      t.oncomplete = () => { d.close(); ok(r.result); };
      t.onerror = t.onabort = () => { d.close(); fehl(t.error); };
    });
  };
  const lesen = (k) => tx("readonly", (s) => s.get(k));
  const schreiben = (k, v) => tx("readwrite", (s) => s.put(v, k));

  // Nur was fuer "Laeuft bald ab" zaehlt, und nur die Felder, die H.baldAb braucht.
  const ablegen = (eintraege) => schreiben("liste", eintraege.filter((e) => e.sichtbar && e.menge > 0 && e.ablauf)
    .map((e) => ({ name: e.name, menge: e.menge, ablauf: e.ablauf, sichtbar: true })));

  // Nur rot + abgelaufen (Tobias 18.11.), gelb ("demnaechst") meldet nicht.
  function meldung(eintraege, heute) {
    const l = H.baldAb(eintraege, heute).filter((x) => x.stufe !== "gelb");
    if (!l.length) return null;
    const namen = l.slice(0, 4).map((x) => x.e.name + (x.e.menge >= 2 ? " ×" + x.e.menge : "")).join(", ") + (l.length > 4 ? ", …" : "");
    const weg = l.filter((x) => x.stufe === "abgelaufen").length;
    return { titel: "Vorrat: " + l.length + (l.length === 1 ? " Sache läuft" : " Sachen laufen") + " bald ab", text: (weg ? weg + " schon abgelaufen · " : "") + namen };
  }

  // Hoechstens eine Meldung pro Tag. Liefert die Meldung oder null; "gemeldet" setzt der Aufrufer erst NACH
  // der Anzeige (Codex v6.20 #5: scheitert die Anzeige, darf der Tag nicht verbraucht sein).
  async function pruefen(heute) {
    const l = await lesen("liste");
    if (!l || (await lesen("gemeldet")) === heute) return null;
    return meldung(l, heute);
  }

  const Erinnerung = { ablegen, meldung, pruefen, lesen, schreiben };
  wurzel.Erinnerung = Erinnerung;
  if (typeof module !== "undefined" && module.exports) module.exports = Erinnerung;
})(typeof window !== "undefined" ? window : globalThis);

// Selbsttest: node erinnerung.js
if (typeof require !== "undefined" && require.main === module) {
  const assert = require("assert"), E = module.exports;
  const e = (name, ablauf, menge = 1) => ({ name, ablauf, menge, sichtbar: true });
  const heute = "2026-11-18";
  assert.strictEqual(E.meldung([e("Joghurt", "2026-12-10")], heute), null, "gelb meldet nicht");
  assert.strictEqual(E.meldung([], heute), null);
  const m = E.meldung([e("Erdbeereis", "2026-11-01"), e("Erbsen", "2026-11-20", 2), e("Joghurt", "2026-12-10")], heute);
  assert.strictEqual(m.titel, "Vorrat: 2 Sachen laufen bald ab");
  assert.strictEqual(m.text, "1 schon abgelaufen · Erdbeereis, Erbsen ×2");
  const viele = E.meldung(["A", "B", "C", "D", "E"].map((n) => e(n, "2026-11-19")), heute);
  assert.ok(viele.text.endsWith("D, …"), viele.text);
  assert.strictEqual(E.meldung([e("Milch", "2026-11-19")], heute).titel, "Vorrat: 1 Sache läuft bald ab");
  console.log("erinnerung: alles ok");
}
