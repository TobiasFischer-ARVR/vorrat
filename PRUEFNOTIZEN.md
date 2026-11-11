# Prüfnotizen Abschnitt 3–5 (Zweig `abschnitt-3-5`, App-Version v4)

Nachtlauf ohne Aufsicht. NICHTS davon ist live: `main` ist unverändert. Diese Datei ist auch die Übergabe an einen späteren Lauf.

## 1. Stand je Aufgabe

| Aufgabe | Stand | Letzter Commit |
|---|---|---|
| A Speichern in einem Schritt | fertig | (siehe git log) |
| B Läuft bald ab | offen | – |
| C Scannen | offen | – |
| D Verschieben | offen | – |
| E Code-Prüfung | offen | – |

Tests: `node tests/test_*.js` (test_speicher braucht fake-indexeddb, `VORRAT_TESTDEPS=<ordner>`).

## 2. Was wurde gemacht

### Aufgabe A

| Punkt | Was | Woher |
|---|---|---|
| A1 | `sp.ausfuehrenAlle(schritte)` in speicher.js: eine Transaktion, Zähler einmal gelesen/geschrieben, ganz oder gar nicht. Schritt = Daten oder Funktion `(bisher) => Daten/[Daten]` (sieht Kopien). Max. 500 Vorgänge. | Auftrag A |
| A2 | `ausfuehren(d)` ist jetzt `ausfuehrenAlle([d])[0]` (eine Stelle) | eigene Entscheidung |
| A3 | `Hilfen.grundSchritte()`: Grundausstattung (4 Orte + 15 Fächer) als EIN Schritt | Auftrag A |
| A4 | `tun()` in app.js nutzt `ausfuehrenAlle`; Bearbeiten mit mehreren Feldern, Ort-/Fach-Bearbeiten und Grundausstattung damit ganz oder gar nicht. Fehlertext „nur teilweise“ entfällt. | Auftrag A |
| A5 | Tests: 3 neue Fälle in tests/test_speicher.js | Auftrag Testen |

## 3. Verdachtsstellen

(werden je Aufgabe ergänzt)

## 4. Prüfliste fürs Handy

(werden je Aufgabe ergänzt)

## 5. Eigene Entscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Wie bekommen Fächer der Grundausstattung die Ort-Kennung, wenn alles in einem Schritt entsteht? | Schritte dürfen Funktionen sein, die die bereits erzeugten Vorgänge desselben Aufrufs sehen | Kennung entsteht erst in `erzeuge()` innerhalb der Transaktion; so bleibt alles in einer Transaktion |

## 6. Nächster Schritt

Aufgabe B.
