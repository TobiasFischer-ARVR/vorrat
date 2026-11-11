# Prüfnotizen Abschnitt 3–5 (Zweig `abschnitt-3-5`, App-Version v4)

Nachtlauf ohne Aufsicht. NICHTS davon ist live: `main` ist unverändert. Diese Datei ist auch die Übergabe an einen späteren Lauf.

## 1. Stand je Aufgabe

| Aufgabe | Stand | Letzter Commit |
|---|---|---|
| A Speichern in einem Schritt | fertig | (siehe git log) |
| B Läuft bald ab | fertig | (siehe git log) |
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

### Aufgabe B

| Punkt | Was | Woher |
|---|---|---|
| B1 | `Hilfen.baldAb(eintraege, heute)`: Stückzahl > 0, mit Datum (MHD bzw. „essen bis“, Monats-MHD bis Monatsende über `e.ablauf`), abgelaufen/rot ≤ 7/gelb ≤ 30, nach Datum sortiert (dann Name, dann Kennung) | Auftrag B |
| B2 | Startseite: Abschnitt „Läuft bald ab (N)“ ganz oben, erste 5 Zeilen, Knopf „Alle N zeigen“. Zeile = Bildchen, Name ×Stück, „Ort – Fach“, Datum + „in 5 Tagen“/„abgelaufen“. Antippen → Reiter umschalten, Fach öffnen, Kachel umrandet + ins Bild gescrollt; ohne gültigen Platz → „Ort klären“ | Auftrag B |
| B3 | Zeichnung: je Fach Zahl der bald ablaufenden **Einträge** (nicht Stück) in einem Kreis, rot wenn mind. einer abgelaufen/rot, sonst gelb; Rahmen in derselben Farbe (`Hilfen.fachMarken`) | Auftrag B |
| B4 | Reiter zeigen die Summe je Ort als rote Zahl (sonst sähe man Ablaufendes in anderen Orten nicht) | eigene Ergänzung |
| B5 | Selbst eingefroren: ohne Stichwort KEINE Vorbelegung (`fristKategorie` liefert null), Pflichtfeld mit Schnellauswahl 1/2/3/6/9/12 Monate + Eingabefeld 1–60; Stichwort-Vorgaben bleiben und stehen als „Vorschlag nach Stichwort …“ darunter; Namensänderung schlägt neu vor, solange die Frist nicht von Hand gewählt ist | Auftrag B / Entscheidung Tobias |
| B6 | Fächer und freie Plätze in der Zeichnung per Tastatur erreichbar (tabindex, role=button, aria-label, Enter/Leertaste) | Barrierefreiheit (E vorgezogen) |
| B7 | Tests: 3 neue Fälle (Sortierung/Filter, Monatsende inkl. Schaltjahr und 30/31-Tage-Grenze, Markierungszählung) + angepasster Frist-Test | Auftrag Testen |

## 3. Verdachtsstellen

(werden je Aufgabe ergänzt)

## 4. Prüfliste fürs Handy

(werden je Aufgabe ergänzt)

## 5. Eigene Entscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Wo steht „Läuft bald ab“ im Verhältnis zur Abgleich-Karte? | Ganz oben, max. 5 Zeilen, Rest aufklappbar | „ganz oben“ laut Auftrag; gekürzt, damit eine OneDrive-Warnung nicht weit nach unten rutscht |
| Zählt die Fach-Markierung Einträge oder Stück? | Einträge | „3 Pizzen gleichen MHDs“ ist ein Ding zum Aufessen; Stück würde große Packungen übergewichten |
| Wo ist die Grenze „abgelaufen“? | Tage < 0 (Ablauftag selbst = „läuft heute ab“, rot) | MHD gilt bis einschließlich des Tags |
| Wie fühlt sich „Pflichtfeld“ an? | Speichern meldet „Bitte Frist wählen“, kein stilles Vorbelegen | Entscheidung Tobias |
| Wie bekommen Fächer der Grundausstattung die Ort-Kennung, wenn alles in einem Schritt entsteht? | Schritte dürfen Funktionen sein, die die bereits erzeugten Vorgänge desselben Aufrufs sehen | Kennung entsteht erst in `erzeuge()` innerhalb der Transaktion; so bleibt alles in einer Transaktion |

## 6. Nächster Schritt

Aufgabe C.
