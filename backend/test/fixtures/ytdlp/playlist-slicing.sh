#!/usr/bin/env bash
# Records how yt-dlp slices a playlist whose first video is unavailable. Read-only, no YouTube access.
# Run in a throwaway container:
#   docker run --rm -v "$PWD/playlist-slicing.sh:/run.sh:ro" python:3.12-slim bash /run.sh
set -Eeuo pipefail

release=2026.10.26
python3 -c "import urllib.request; urllib.request.urlretrieve('https://github.com/yt-dlp/yt-dlp/releases/download/${release}/yt-dlp', '/tmp/yt-dlp')"
chmod +x /tmp/yt-dlp

# A local RSS feed whose first item answers 404 and whose other items are playable. The generic extractor
# turns it into a playlist; slicing and per-entry error handling are in yt-dlp's core, not per site.
mkdir -p /srv
cd /srv
printf 'x' > ok.mp4
cat > feed.xml <<'XML'
<?xml version="1.0"?>
<rss version="2.0"><channel><title>Slicing test</title>
<item><title>First (missing)</title><enclosure url="http://127.0.0.1:8765/missing.mp4" type="video/mp4"/></item>
<item><title>Second (ok)</title><enclosure url="http://127.0.0.1:8765/ok.mp4" type="video/mp4"/></item>
<item><title>Third (ok)</title><enclosure url="http://127.0.0.1:8765/ok.mp4?3" type="video/mp4"/></item>
</channel></rss>
XML
python3 -m http.server 8765 --bind 127.0.0.1 > /dev/null 2>&1 &
sleep 1

run() {
    local status=0
    /tmp/yt-dlp "$@" > /tmp/out.txt 2> /tmp/err.txt || status=$?
    echo "yt-dlp $* -> exit ${status}, $(wc -l < /tmp/out.txt) entries printed"
}
url=http://127.0.0.1:8765/feed.xml
run --dump-json "${url}"
run --dump-json --playlist-end 1 "${url}"
run --dump-json --playlist-end 2 "${url}"
run --dump-json --max-downloads 1 "${url}"
