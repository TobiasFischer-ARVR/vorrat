#!/usr/bin/env bash
# Browsertest unter Linux (Cloud-Container/Chromium). Aufruf aus dem App-Ordner: bash tests/browser/lauf_linux.sh [ausgabeordner]
# Chromium: $CHROME, sonst Playwright-Chromium unter /opt/pw-browsers, sonst chromium/google-chrome im PATH.
set -u
cd "$(dirname "$0")/../.."
AUS="${1:-${TMPDIR:-/tmp}/vorrat-browsertest}"
rm -rf "$AUS/profil"; mkdir -p "$AUS/bilder" "$AUS/downloads"
CHROME="${CHROME:-$(ls /opt/pw-browsers/chromium-*/chrome-linux64/chrome 2>/dev/null | head -1)}"
[ -z "$CHROME" ] && CHROME="$(command -v chromium || command -v google-chrome || true)"
[ -z "$CHROME" ] && { echo "Kein Chromium gefunden (CHROME=… setzen)"; exit 2; }
python3 -m http.server 8765 --bind 127.0.0.1 > "$AUS/server.log" 2>&1 & SERVER=$!
"$CHROME" --headless=new --no-sandbox --remote-debugging-port=9333 --user-data-dir="$AUS/profil" --window-size=412,915 \
  --no-first-run --disable-extensions about:blank > "$AUS/chrome.log" 2>&1 & BROWSER=$!
sleep 2
VORRAT_AUS="$AUS/bilder/" VORRAT_DL="$AUS/downloads" node tests/browser/cdp_v615.js 9333 8765; ERG=$?
kill $SERVER $BROWSER 2>/dev/null
echo "Ergebnis: $ERG (Bilder in $AUS/bilder)"
exit $ERG
