cd "D:/Claude Code/Obsidian/Vault/Second Brain/Second Brain/02 Projekte/Vorrats-App/app"
rm -rf /d/tmp/vorrat-2/profil /d/tmp/vorrat-2/*.png
python -m http.server 8765 --bind 127.0.0.1 > /d/tmp/vorrat-2/server.log 2>&1 &
SERVER=$!
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --remote-debugging-port=9333 --user-data-dir='D:\tmp\vorrat-2\profil' --window-size=412,915 --no-first-run --disable-extensions about:blank > /d/tmp/vorrat-2/edge.log 2>&1 &
sleep 2
node /d/tmp/vorrat-2/cdp_v616.js 9333 8765; ERG=$?
kill $SERVER
echo "Ergebnis: $ERG"
