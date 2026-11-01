#!/usr/bin/env bash
# Compares the download scheduler before and after #73 against a real MongoDB.
# Needs Docker, git and rsync. Starts a disposable mongo:4 on 127.0.0.1:$MONGO_PORT and stops it on exit.
# Nothing is installed in the repository; dependencies and the two backend copies go under $WORK.
#
# usage: backend/test/bench/download-queue-mongo/run.sh
# env:   BASE_REF    commit with the old scheduler (default 85b3941, the commit before the fix)
#        WORK        scratch directory (default ${TMPDIR:-/tmp}/ytdl-queue-bench)
#        MONGO_PORT  host port for the disposable mongo (default 27018)
set -Eeuo pipefail

REPO="$(git rev-parse --show-toplevel)"
BASE_REF="${BASE_REF:-85b3941}"
WORK="${WORK:-${TMPDIR:-/tmp}/ytdl-queue-bench}"
MONGO_PORT="${MONGO_PORT:-27018}"
HERE="$REPO/backend/test/bench/download-queue-mongo"
NAME="ytdl-queue-bench-mongo"

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "container $NAME already exists; remove it first (docker rm -f $NAME)" >&2
  exit 1
fi
if ss -ltn | grep -q ":$MONGO_PORT "; then
  echo "port $MONGO_PORT is in use; set MONGO_PORT" >&2
  exit 1
fi
trap 'docker stop "$NAME" >/dev/null 2>&1 || true; echo "mongo stopped"' EXIT

node_run() { # variant, command...
  local variant="$1"; shift
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e MONGO_PORT="$MONGO_PORT" \
    -v "$WORK/$variant/backend":/app -v "$WORK/deps/node_modules":/app/node_modules:ro -w /app node:16 "$@"
}

# dependencies from the backend's lockfile, installed once
if [ ! -d "$WORK/deps/node_modules" ]; then
  mkdir -p "$WORK/deps"
  cp "$REPO/backend/package.json" "$REPO/backend/package-lock.json" "$WORK/deps/"
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$WORK/deps":/deps -w /deps node:16 \
    npm ci --no-audit --no-fund
fi

# base = old scheduler (plus the one-line export the harness calls), fixed = the working tree
rm -rf "$WORK/base" "$WORK/fixed"
mkdir -p "$WORK/base" "$WORK/fixed/backend"
git -C "$REPO" archive "$BASE_REF" backend | tar -x -C "$WORK/base"
rsync -a --exclude node_modules --exclude appdata "$REPO/backend/" "$WORK/fixed/backend/"
python3 - "$WORK/base/backend/downloader.js" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()
if 'exports.checkDownloads' not in src:
    anchor = 'function killActiveDownload(download) {'
    assert src.count(anchor) == 1
    src = src.replace(anchor, 'exports.checkDownloads = checkDownloads;\n\n' + anchor)
    open(path, 'w').write(src)
PY
for variant in base fixed; do
  mkdir -p "$WORK/$variant/backend/appdata"
  cp "$REPO/backend/appdata/default.json" "$WORK/$variant/backend/appdata/"
  cp "$HERE/harness.js" "$HERE/seed.js" "$HERE/explain.js" "$WORK/$variant/backend/"
done

docker run -d --rm --name "$NAME" -p "127.0.0.1:$MONGO_PORT:27017" mongo:4 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" mongo --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
  sleep 1
done

echo "== seed (1,592 errored x 211 KB, 78 small finished, 13 unfinished)"; node_run fixed node seed.js
echo "== query plan for {finished: false}"; node_run fixed node explain.js
echo "== BEFORE ($BASE_REF)"; node_run base node --expose-gc harness.js before
echo "== AFTER (working tree)"; node_run fixed node --expose-gc harness.js after
echo DONE
