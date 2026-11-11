# Prüfnotizen Abschnitt 3–5 (Zweig `abschnitt-3-5`, App-Version v4)

Nachtlauf ohne Aufsicht. NICHTS davon ist live: `main` ist unverändert.

**⚠ Push auf GitHub ging in diesem Lauf nicht (HTTP 403, die Claude-GitHub-App hat keine Schreibrechte auf das Repo).** Der Zweig `abschnitt-3-5` existiert nur lokal im Cloud-Container. Alle Commits liegen zusätzlich als Patch-Datei `abschnitt-3-5.patch` im Arbeitsordner (einspielen: `git checkout -b abschnitt-3-5 main && git am abschnitt-3-5.patch`). Diese Datei ist auch die Übergabe an einen späteren Lauf.

## 1. Stand je Aufgabe

| Aufgabe | Stand | Letzter Commit |
|---|---|---|
| A Speichern in einem Schritt | fertig | (siehe git log) |
| B Läuft bald ab | fertig | (siehe git log) |
| C Scannen | fertig | (siehe git log) |
| D Verschieben | fertig | (siehe git log) |
| E Code-Prüfung | fertig | (siehe git log) |

Tests: `node tests/test_*.js` (test_speicher braucht fake-indexeddb, `VORRAT_TESTDEPS=<ordner>`). Stand Ende: test_cloud 33, test_codes 9, test_geruest ok, test_modell 20, test_oberflaeche 11, test_speicher 20 – alle grün. Oberfläche headless (Chromium, Playwright, Skript nicht im Repo) ohne Konsolenfehler; einziger Fehler ist der gesperrte Abruf von Open Food Facts in der Sandbox.

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

### Aufgabe D

| Punkt | Was | Woher |
|---|---|---|
| D1 | Lange drücken auf eine Kachel (Fach-Ansicht, „Ort klären“) oder eine „Läuft bald ab“-Zeile → kleines Menü „✎ Bearbeiten“ / „↦ Verschieben nach …“ (vorher: direkt Bearbeiten) | Auftrag D |
| D2 | Dialog „… verschieben nach …“: Ort + Fach, vorbelegt mit dem jetzigen Platz („(jetzt)“), Hinweis bei Ort ohne Kiste; Fächer ohne gültigen Platz sind kein Ziel mehr | Auftrag D „vorhandenes prüfen und vervollständigen“ |
| D3 | Bearbeiten-Dialog: Abschnitt „Platz“ nutzt dieselbe Auswahl (`zielWahl`), vorbelegt statt „– bleibt –“; unverändert = kein Vorgang | Auftrag D |
| D4 | Drag and Drop mit Pointer Events: 0,5 s halten → Kachel „angehoben“ (vibriert kurz); dann ziehen → Fach-Leiste oben (alle Orte/Fächer) + Fächer der Zeichnung sind Ziele (`data-fach`), Ziel wird hervorgehoben; loslassen auf Ziel = verschieben, sonst Abbruch. Loslassen ohne Bewegung = Menü. Wischen vor Ablauf der 0,5 s = normaler Bildlauf (kein preventDefault, `touch-action` unverändert); erst nach dem Anheben sperrt ein `touchmove`-Horcher (passive:false) den Bildlauf | Auftrag D |
| D5 | Während eines Drucks horcht `document` auf pointermove/up/cancel (nicht die Kachel) – headless zeigte, dass die Kachel beim ersten Zug den Capture verliert. Während des Ziehens wird nicht neu gezeichnet/geladen (`zieht`), danach nachgeholt | Fehlerfund beim Test |
| D6 | Ein Verschieben = EIN Vorgang (`feld` „fach“ des Eintrags), danach Leiste „Pizza → Gefrierschrank – Schublade 2“ mit „Rückgängig“ (Gegenvorgang auf den alten Wert) | Auftrag D |
| D7 | Tastatur: Kontextmenü-Taste / Umschalt+F10 = langes Drücken | Barrierefreiheit |
| D8 | Test: 1 neuer Fall (Verschieben = ein Vorgang, Markierung wandert mit). UI headless per CDP-Touch geprüft: Wischen scrollt (scrollY 272, kein Zug), Halten = Menü, Menü → Folgedialog, Ziehen auf Zeichnung und auf Leiste, Rückgängig, Antippen = −1 | Auftrag Testen |

### Aufgabe E (eigene Prüfung + eine unabhängige zweite Prüfung des Diffs)

| Punkt | Was (behoben) | Woher |
|---|---|---|
| E1 | Hervorgehobene Kachel: nur beim ersten Zeichnen hinscrollen (sonst sprang die Ansicht nach jedem −1 zurück) | eigene Prüfung + Zweitprüfung |
| E2 | `tun()` während eines laufenden Speicherns: Hinweis „Moment – … bitte nochmal“ statt stumm ignorieren (betraf schnelles Doppeltippen und Ablegen per Ziehen) | eigene Prüfung |
| E3 | Dialoge: `role=dialog`, `aria-modal`, `aria-label`, Fokus in den Dialog, Escape schließt | eigene Prüfung (Barrierefreiheit) |
| E4 | GS1: AIs in beliebiger Reihenfolge (17 vor 01), Gewichts-AIs 310n–369n überspringen statt abbrechen, AI 15 (Mindesthaltbarkeit) als MHD, wenn 17 fehlt | eigene Prüfung + Zweitprüfung |
| E5 | popstate: Folgedialog (Menü → Bearbeiten/Verschieben) öffnet VOR dem Nachladen, sonst tauschte `laden()` den Stand unter dem neuen Dialog aus (Verstoß gegen UGC #15) | Zweitprüfung |
| E6 | Ziehen: nicht-passiver `touchmove`-Horcher hängt schon beim Anlegen an der Kachel (Chrome entscheidet beim touchstart, ob touchmove abbrechbar ist) | Zweitprüfung |
| E7 | Scannen: Dialog während `getSupportedFormats` geschlossen → Kamera wird gar nicht erst angefragt | Zweitprüfung |
| E8 | Eintippen: 7/8 Ziffern ohne Präfix zuerst als PZN (vorher EAN-8; ~10 % der PZN sind zugleich gültige EAN-8) | Zweitprüfung |
| E9 | Reiter: Zahl als `aria-label` am Knopf statt am `span` | Zweitprüfung |
| E10 | Tests ergänzt (GS1-Reihenfolge, AI 710 allein, AI 15/3103, PZN/EAN-8-Doppeldeutigkeit) | – |

Geprüft ohne Befund: Seriennummer wird nirgends zurückgegeben/angezeigt/gespeichert/gesendet (an Open Food Facts geht nur die Lebensmittel-GTIN); Kamera stoppt in allen Wegen; `zieht` wird bei Ende und Abbruch zurückgesetzt; `ausfuehrenAlle` ganz oder gar nicht; Datumsrechnung; cloud.js und der Datenverlust-Schutz sind **unverändert** (keine Änderung an cloud.js nötig); Service Worker löscht weiterhin nur `vorrat-…`-Caches, keine neuen Dateien im Cache nötig.

## 3. Verdachtsstellen

(Format: ID · Datei:Funktion · Szenario · wie sicher)

- **V-C1 · modell.js:pruefeVorgang / cloud.js:dateiLesen · Code→Name nicht in OneDrive.** Geprüft: v3 lehnt jeden unbekannten Vorgangstyp (`unbekannter Vorgangstyp`), jede unbekannte Art und jedes unbekannte Feld ab; `dateiLesen` wirft dann und der GANZE Abgleich stoppt. Ein v4-Handy, das Codes in seine Vorgangsdatei schriebe, würde das noch nicht aktualisierte v3-Handy lahmlegen. Daher nur lokal; das andere Handy kennt gemerkte Namen NICHT. Später möglich: erst eine Version ausrollen, die unbekannte Typen überspringt, dann Codes teilen. · sicher
- **V-C2 · hilfen.js:gs1Felder · DataMatrix ohne GS-Trenner.** Liefert der Scanner keine FNC1/GS-Zeichen, verschluckt ein variables Feld (10/21) alles bis zum Ende. Steht 17 (Verfall) HINTER 10/21, fehlt dann das MHD (wird leer gelassen, nicht falsch). Die Seriennummer landet höchstens in der verworfenen Charge – sie wird nie zurückgegeben. Wie Chrome/Android `rawValue` bei GS1-DataMatrix genau liefert (GS als \x1d? führendes FNC1? „]d2“?), ist ungeprüft → Handy-Test. · mittel
- **V-C3 · hilfen.js:leseIfa · PPN-Prüfziffern** werden nicht geprüft, nur die PZN darin (mod 11). Ein Lesefehler in den letzten 2 Stellen würde nicht erkannt; die PZN selbst schon. · sicher, geringes Risiko
- **V-C4 · hilfen.js:codeAusEingabe · 8 Ziffern ohne „PZN“.** Ist eine Zahl zugleich gültige EAN-8 und PZN, wird sie als PZN gelesen (E8). Eine eingetippte Lebensmittel-EAN-8 kann so als PZN gemerkt werden und fragt Open Food Facts nicht. Gescannte EAN-8 sind nicht betroffen. · sicher, selten
- **V-C5 · app.js:offSuchen · CORS/Netz.** Open Food Facts erlaubt CORS für GET; im Sandbox-Test war die Seite gesperrt, echter Abruf also ungeprüft. CSP der App hat kein `connect-src` (bewusst), Service Worker lässt fremde URLs durch. · mittel
- **V-C6 · app.js:scanDialog · Hintergrund.** Geht die App in den Hintergrund, wird die Kamera gestoppt und der Scan-Dialog geschlossen (zurück zum Eintrag). Bei manchen Android-Versionen kommt beim Erlaubnis-Popup selbst ein `visibilitychange`? Dann würde der Dialog beim ersten Mal sofort zugehen. · unsicher → Handy-Test
- **V-C7 · Datenschutz:** Beim Scannen geht der EAN (nur Lebensmittel, nie PZN) an Open Food Facts. Ohne Cookies/Referrer. · Hinweis

- **V-D1 · app.js:druck · Chrome Android und langes Drücken.** Headless (CDP-Touch) funktioniert Halten → Ziehen ohne `pointercancel`. Auf echtem Android kann Chrome bei langem Drücken auf einen Knopf eigene Gesten auslösen (Textauswahl, Kontextmenü, Drag des Links/Bilds). `contextmenu` wird verhindert, `user-select: none` und `-webkit-touch-callout: none` sind gesetzt. Ob das erste `touchmove` nach 0,5 s Ruhe noch `cancelable` ist (sonst scrollt die Seite und `pointercancel` beendet den Zug), ist nur am Handy zu klären. · mittel → Handy-Test
- **V-D2 · app.js:zugStart · Ziel unter dem Finger.** Ziel = `elementFromPoint` am Finger; der Geist schwebt bewusst 70 px darüber. Die Fach-Leiste oben deckt den oberen Bildschirmrand ab (max. 40 % Höhe) – liegt ein Fach der Zeichnung dort, ist es während des Ziehens nur über die Leiste erreichbar. Kein automatisches Scrollen während des Ziehens. · sicher, Bedienfrage
- **V-D3 · app.js:zeichnen/laden · Aufschub während des Ziehens.** Kommt während des Ziehens ein Abgleich mit neuen Daten, wird erst nach dem Loslassen gezeichnet; das Verschieben nutzt den Eintrag von Zugbeginn (nur `e.id` und altes `e.fach` für Rückgängig). Wurde das Ziel-Fach in der Zwischenzeit gelöscht, meldet `verschieben` „Dieses Fach gibt es nicht mehr“. · sicher
- **V-D4 · app.js:eintragMenue · Folgedialog über `nachZurueck`.** Menü schließt (history.go(-1)), der Folgedialog öffnet erst im popstate. Drückt man sehr schnell zweimal, könnte `nachZurueck` von einem anderen Zurück ausgelöst werden. · unwahrscheinlich
- **V-D5 · Bedienänderung:** Langes Drücken öffnet jetzt ein Menü statt direkt „Bearbeiten“ (ein Tipp mehr). In „Bestand prüfen“ unverändert (Tippen und Halten = Bearbeiten). · Hinweis für Tobias

- **V-E1 · app.js:tun · Schnelles Doppeltippen auf eine Kachel** zählt weiter nur −1 (zweites Tippen während des Speicherns), zeigt jetzt aber einen Hinweis. Ob das auf dem Handy oft vorkommt (Speichern dauert wenige ms), ist offen. · sicher, Bedienfrage
- **V-E2 · app.js:druck · Mehrere Finger.** Zwei Kacheln gleichzeitig ziehen ist nicht abgefangen; `zieht` ist ein gemeinsamer Merker, das erste Loslassen gibt das Neuzeichnen wieder frei. Kein Datenverlust, höchstens eine hängende Geist-Kachel bis zum nächsten Loslassen. · mittel, selten
- **V-E3 · app.js:druck · Maus außerhalb des Fensters losgelassen** → kein pointerup, die Kachel nimmt keinen neuen Druck an, bis neu gezeichnet wird. Am Handy irrelevant. · sicher, unwichtig
- **V-E4 · app.js:dialog · Fokusfalle fehlt.** Tab kann aus dem Dialog in die Seite dahinter wandern; Fokus springt nach dem Schließen nicht zum Auslöser zurück. · sicher, gering
- **V-E5 · Zeitzone/Mitternacht:** „Läuft bald ab“ rechnet mit `Modell.heuteIso()` beim Zeichnen; bleibt die App über Mitternacht offen, stimmen die Tage erst nach dem nächsten Zeichnen. · sicher, gering
- **V-E6 · Vorher schon vorhanden (nicht geändert):** `ortKlaerenAnsicht`/`bestandAnsicht` Kacheln sind Buttons ohne zusätzliche Beschreibung der Farbe (rot/gelb nur über Farbe, Datum steht aber als Text da). · Hinweis

## 4. Prüfliste fürs Handy

### Läuft bald ab (Abschnitt 3)
1. Startseite öffnen. Erwartet: ganz oben „Läuft bald ab (N)“, zuerst Abgelaufenes (dunkelroter Rand, rosa), dann rot (≤ 7 Tage), dann gelb (≤ 30); nichts ohne Datum, nichts mit 0 Stück. Bei mehr als 5: „Alle N zeigen“.
2. Eintrag mit MHD nur Monat (z. B. 11/2026) prüfen: Datum 30.11.26, erscheint bis einschließlich 30.11.
3. Zeile antippen. Erwartet: richtiger Reiter, Fach offen, Kachel schwarz umrandet und sichtbar.
4. Zeichnung: Fach mit bald Ablaufendem hat Kreis mit Zahl (rot oder gelb) und farbigen Rahmen; Reiter mit Zahl, wenn im Ort etwas bald abläuft.
5. Neuer Eintrag, „selbst eingefroren“, Name „Omas Spezial“: Frist leer, „Kein Stichwort erkannt“, Speichern → „Bitte Frist wählen“. „6 M“ tippen → essen bis = Einfrierdatum + 6 Monate. Name „Hähnchen“ (ohne Handwahl) → 6 vorbelegt.

### Verschieben (Abschnitt 5)
1. Fach öffnen, Kachel kurz antippen → −1 wie bisher (Rückgängig).
2. Kachel 0,5 s halten, NICHT bewegen, loslassen → Menü „Bearbeiten / Verschieben nach …“. „Verschieben nach …“ → Ort + Fach vorbelegt mit jetzigem Platz; anderes Fach wählen → Leiste „… → …“ mit Rückgängig.
3. **Drag and Drop:** Kachel 0,5 s halten (kurzes Vibrieren, Kachel wird größer), dann ziehen. Erwartet: Leiste mit allen Fächern oben, Kachel-Geist über dem Finger, Ziel färbt sich grün. Über einem Fach loslassen → verschoben, Rückgängig möglich. Neben die Ziele loslassen → nichts passiert.
4. **Bildlauf:** In einem vollen Fach / auf der Startseite über Kacheln und „Läuft bald ab“-Zeilen normal wischen. Erwartet: Seite scrollt, kein Menü, kein Ziehen, kein −1.
5. Startseite: „Läuft bald ab“-Zeile halten und auf ein Fach der Zeichnung ziehen. Erwartet: verschoben, Zahl in der Zeichnung wandert mit.
6. Nach einem Verschieben auf dem anderen Handy abgleichen → Eintrag liegt dort im neuen Fach (ein Vorgang).
7. Beim Ziehen prüfen: markiert Chrome Text, erscheint ein Kontextmenü oder bricht der Zug nach dem ersten Bewegen ab? (→ V-D1)

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
| Was ist „lange drücken“ jetzt? | Menü (Bearbeiten, Verschieben nach …); halten + ziehen = Drag and Drop | Auftrag D nennt „lange drücken → Verschieben nach …“, Bearbeiten muss erreichbar bleiben |
| Wohin mit der Fach-Leiste beim Ziehen? | Oben, nur während des Ziehens, alle Orte | Unten verdeckte sie im Test die Zeichnung; alle Orte, damit man auch aus „Läuft bald ab“ oder „Ort klären“ überall hin kann |
| Fächer (Kisten) per Ziehen umsetzen? | Nein, nur Einträge | Nicht verlangt; Kisten-Platz geht weiter über „✎ Kiste“ |
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

Aufgaben A–E sind fertig. Offen ist nur, was ein Lauf nicht kann:
1. Zweig nach GitHub bringen (Push-Rechte reparieren oder Patch-Datei einspielen, siehe oben).
2. Codex-Gegenprüfung der Verdachtsstellen.
3. Handy-Prüfliste (Kamera, Drag and Drop, OneDrive zwischen zwei Handys mit v3 + v4 gemischt: v4 schreibt nur Schema-1-Vorgänge, v3 muss die Dateien weiter lesen).
4. Erst danach (Tobias) nach `main`.
