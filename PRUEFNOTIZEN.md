# Prüfnotizen Abschnitt 3–5 (Zweig `abschnitt-3-5`, App-Version v4)

Nachtlauf ohne Aufsicht. NICHTS davon ist live: `main` ist unverändert. Diese Datei ist auch die Übergabe an einen späteren Lauf.

## 1. Stand je Aufgabe

| Aufgabe | Stand | Letzter Commit |
|---|---|---|
| A Speichern in einem Schritt | fertig | (siehe git log) |
| B Läuft bald ab | fertig | (siehe git log) |
| C Scannen | fertig | (siehe git log) |
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

### Aufgabe C

| Punkt | Was | Woher |
|---|---|---|
| C1 | Knopf „📷 Scannen“ oben im Dialog „Neuer Eintrag“ (nur beim Neuanlegen) | Auftrag C |
| C2 | Scan-Dialog: `getUserMedia` (Rückkamera, `facingMode: ideal environment`), `BarcodeDetector` mit ean_13/ean_8/upc_a/data_matrix (Schnittmenge mit `getSupportedFormats`), alle 200 ms ein Bild | Auftrag C |
| C3 | Kamera stoppt bei Treffer, „Abbrechen“, Android-Zurück (neuer `weg`-Haken im Ebenenstapel), App in den Hintergrund, und wenn der Dialog während der Kamera-Frage geschlossen wurde. Headless mit Fake-Kamera geprüft: alle Spuren `ended` | Auftrag C |
| C4 | Ohne API/Kamera/Erlaubnis: Klartext + Feld „oder Code eintippen“ (EAN mit Prüfziffer, „PZN 1234567(8)“, „-12345678“) | Auftrag C |
| C5 | Open Food Facts: `api/v2/product/<code>.json?fields=product_name,product_name_de,brands`, Zeitgrenze 6 s, offline sofort weiter, Fehler = „Name eintippen“. Deutscher Name zuerst, Marke in Klammern. Name nur übernommen, wenn der Nutzer währenddessen nichts getippt hat | Auftrag C |
| C6 | Parser in hilfen.js (reine Funktionen): `leseCode`, `codeAusEingabe`, `gtinOk`, `pznOk`, `verfallAus`, GS1 (AI-Tabelle fest/variabel, FNC1/GS, „]d2“, Klarschrift „(01)…“, AI 710 = PZN, NTIN 4150… → PZN) und IFA/PPN (9N, D, 8P; 1T/S ignoriert). Rückgabe enthält NIE Charge oder Seriennummer | Auftrag C |
| C7 | DataMatrix-Verfall → MHD im Dialog (Tag 00 → Monats-MHD) | Auftrag C |
| C8 | Code → Name NUR lokal (`localStorage["vorrat-codes"]`, max. 1000, nur Schlüssel `gtin:`/`pzn:`), gemerkt wird der beim Speichern tatsächlich verwendete Name | Auftrag C, siehe Verdachtsstelle V-C1 |
| C9 | Tests: neue Datei tests/test_codes.js, 9 Fälle (Prüfziffern, EAN/UPC, GS1 in 4 Schreibweisen, Tag 00, IFA, Eintippen, OFF-Antworten, Gedächtnis, Schema-Abwärtsverträglichkeit) | Auftrag Testen |

## 3. Verdachtsstellen

(Format: ID · Datei:Funktion · Szenario · wie sicher)

- **V-C1 · modell.js:pruefeVorgang / cloud.js:dateiLesen · Code→Name nicht in OneDrive.** Geprüft: v3 lehnt jeden unbekannten Vorgangstyp (`unbekannter Vorgangstyp`), jede unbekannte Art und jedes unbekannte Feld ab; `dateiLesen` wirft dann und der GANZE Abgleich stoppt. Ein v4-Handy, das Codes in seine Vorgangsdatei schriebe, würde das noch nicht aktualisierte v3-Handy lahmlegen. Daher nur lokal; das andere Handy kennt gemerkte Namen NICHT. Später möglich: erst eine Version ausrollen, die unbekannte Typen überspringt, dann Codes teilen. · sicher
- **V-C2 · hilfen.js:gs1Felder · DataMatrix ohne GS-Trenner.** Liefert der Scanner keine FNC1/GS-Zeichen, verschluckt ein variables Feld (10/21) alles bis zum Ende. Steht 17 (Verfall) HINTER 10/21, fehlt dann das MHD (wird leer gelassen, nicht falsch). Die Seriennummer landet höchstens in der verworfenen Charge – sie wird nie zurückgegeben. Wie Chrome/Android `rawValue` bei GS1-DataMatrix genau liefert (GS als \x1d? führendes FNC1? „]d2“?), ist ungeprüft → Handy-Test. · mittel
- **V-C3 · hilfen.js:leseIfa · PPN-Prüfziffern** werden nicht geprüft, nur die PZN darin (mod 11). Ein Lesefehler in den letzten 2 Stellen würde nicht erkannt; die PZN selbst schon. · sicher, geringes Risiko
- **V-C4 · hilfen.js:codeAusEingabe · 8 Ziffern ohne „PZN“.** Ist eine Zahl zugleich gültige EAN-8 und PZN, wird sie als EAN-8 gelesen. Hinweis im Feld nennt „PZN“ als Präfix. · sicher, selten
- **V-C5 · app.js:offSuchen · CORS/Netz.** Open Food Facts erlaubt CORS für GET; im Sandbox-Test war die Seite gesperrt, echter Abruf also ungeprüft. CSP der App hat kein `connect-src` (bewusst), Service Worker lässt fremde URLs durch. · mittel
- **V-C6 · app.js:scanDialog · Hintergrund.** Geht die App in den Hintergrund, wird die Kamera gestoppt und der Scan-Dialog geschlossen (zurück zum Eintrag). Bei manchen Android-Versionen kommt beim Erlaubnis-Popup selbst ein `visibilitychange`? Dann würde der Dialog beim ersten Mal sofort zugehen. · unsicher → Handy-Test
- **V-C7 · Datenschutz:** Beim Scannen geht der EAN (nur Lebensmittel, nie PZN) an Open Food Facts. Ohne Cookies/Referrer. · Hinweis

## 4. Prüfliste fürs Handy

### Scannen (Abschnitt 4)
1. Fach öffnen → „+ Neu“ → „📷 Scannen“ → Chrome fragt nach Kamera → erlauben. Erwartet: Rückkamera-Bild, Text „Strichcode oder DataMatrix-Code ins Bild halten …“.
2. EAN eines Lebensmittels (z. B. Nudelpackung) scannen. Erwartet: Vibrieren, Scan-Fenster zu, unter dem Knopf „EAN 400… · Name aus Open Food Facts, bitte prüfen“, Name + Bildchen gefüllt.
3. Speichern, dann denselben Code nochmal neu anlegen. Erwartet: „Name von früher“ (ohne Netz).
4. Flugmodus, unbekannten EAN scannen. Erwartet: sofort „offline/keine Antwort – Name bitte eintippen“.
5. Medikamentenpackung mit DataMatrix (securPharm) scannen. Erwartet: „PZN xxxxxxxx · MHD MM.JJJJ“, MHD-Feld zeigt das Verfallsdatum, Name leer mit Hinweis. Name eintippen, speichern, nochmal scannen → Name von früher. **Wichtig: prüfen, dass die Seriennummer nirgends auftaucht** (Anzeige, Prüfen-Ansicht, Backup-Datei).
6. Im Scan-Fenster Android-Zurück. Erwartet: Fenster zu, Kamera-Symbol in der Statusleiste verschwindet sofort.
7. Im Scan-Fenster App wechseln (Home) und zurück. Erwartet: Scan-Fenster zu, Kamera aus, Eintrag-Fenster noch da.
8. Kamera-Erlaubnis in Chrome verweigern. Erwartet: Klartext mit Weg zur Einstellung, Eintippen geht.
9. „PZN 1234567“ (7-stellig) und eine falsche EAN eintippen. Erwartet: gültige PZN wird übernommen, falsche EAN → „Kein gültiger EAN- oder PZN-Code“.

## 5. Eigene Entscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Code→Name in OneDrive teilen? | Nein, nur lokal | v3 stoppt den ganzen Abgleich bei unbekanntem Typ/Feld (V-C1) |
| Welche Formate scannen? | ean_13, ean_8, upc_a, data_matrix (kein upc_e, kein QR) | UPC-E bräuchte Umrechnung für OFF; QR trägt keine Produktnummer |
| Was ist der Schlüssel für Code→Name? | `pzn:<8>` für Arzneimittel (aus PPN, AI 710 oder NTIN 4150…), sonst `gtin:<13>` | Strichcode, GS1- und IFA-DataMatrix desselben Medikaments landen beim selben Namen |
| Marke im Namen aus OFF? | „Name (Marke)“, wenn die Marke nicht schon im Namen steht | Eintrag bleibt unterscheidbar; ist änderbar |
| Wo steht „Läuft bald ab“ im Verhältnis zur Abgleich-Karte? | Ganz oben, max. 5 Zeilen, Rest aufklappbar | „ganz oben“ laut Auftrag; gekürzt, damit eine OneDrive-Warnung nicht weit nach unten rutscht |
| Zählt die Fach-Markierung Einträge oder Stück? | Einträge | „3 Pizzen gleichen MHDs“ ist ein Ding zum Aufessen; Stück würde große Packungen übergewichten |
| Wo ist die Grenze „abgelaufen“? | Tage < 0 (Ablauftag selbst = „läuft heute ab“, rot) | MHD gilt bis einschließlich des Tags |
| Wie fühlt sich „Pflichtfeld“ an? | Speichern meldet „Bitte Frist wählen“, kein stilles Vorbelegen | Entscheidung Tobias |
| Wie bekommen Fächer der Grundausstattung die Ort-Kennung, wenn alles in einem Schritt entsteht? | Schritte dürfen Funktionen sein, die die bereits erzeugten Vorgänge desselben Aufrufs sehen | Kennung entsteht erst in `erzeuge()` innerhalb der Transaktion; so bleibt alles in einer Transaktion |

## 6. Nächster Schritt

Aufgabe D.
