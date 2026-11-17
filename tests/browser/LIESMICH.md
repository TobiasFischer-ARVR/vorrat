# Browsertest Vorrats-App (v6.15, 315 Prüfungen)
- Browser: Microsoft Edge headless über das DevTools-Protokoll (CDP), Port 9333; App per `python -m http.server 8765` aus `app/`. Node >= 22 (eingebautes WebSocket/fetch).
- Start (Git Bash, Windows): `bash tests/browser/lauf_v615.sh` → startet Server + Edge, dann `node cdp_v615.js 9333 8765`; Ergebnis 0 = alles grün.
- Pfade sind fest auf `D:/tmp/vorrat-2/` (Profil, Screenshots, Downloads über `Browser.setDownloadBehavior`) und `C:/Program Files (x86)/Microsoft/Edge/...` – auf anderem System in `lauf_v615.sh` und `AUS`/`downloadPath` in `cdp_v615.js` anpassen (Chrome geht genauso).
- OneDrive ist nachgestellt (Abschnitt 17: Graph-Attrappe im Browser, `Cloud.abgleichen` ersetzt); Unit-Tests: `node tests/<datei>.js` (fake-indexeddb in D:/tmp/vorrat-testdeps).
