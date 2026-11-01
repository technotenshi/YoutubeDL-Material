# Download queue benchmark (MongoDB)

Reproduces issue #73 against a real MongoDB: how much one download scheduler pass costs when `download_queue` holds a long history of large errored records, and whether passes overlap. The suite's own MongoDB cases are skipped, so this is the MongoDB check for `checkDownloads`. It is not part of `npm test`.

## Run

Needs Docker, git and rsync. From anywhere in the repository:

```bash
backend/test/bench/download-queue-mongo/run.sh
```

It starts a disposable `mongo:4` on `127.0.0.1:27018`, seeds the queue, runs the scheduler from `BASE_REF` and from your working tree in `node:16` containers, prints the two reports, and stops the container. Dependencies (`npm ci` from `backend/package-lock.json`) and the two backend copies go under `$WORK`; nothing is written to the repository. The first run installs dependencies and takes a few minutes; the seed writes about 330 MB.

| Variable | Default | Meaning |
|---|---|---|
| `BASE_REF` | `85b3941` | Commit with the old scheduler, the last one before #73. The script adds the one-line `exports.checkDownloads` the harness calls, if the commit lacks it. |
| `WORK` | `${TMPDIR:-/tmp}/ytdl-queue-bench` | Scratch directory. |
| `MONGO_PORT` | `27018` | Host port for the disposable Mongo. |

## What it measures

- `seed.js`: 1,592 errored records with a 211 KB error text, 78 small finished records and 13 unfinished ones (5 running, 8 waiting), the shape of the queue in #73.
- `explain.js`: the query plan and execution time of `find({finished: false})`.
- `harness.js`, with the real `db.js` and `downloader.js` and the stage steps stubbed (`ytdl_max_concurrent_downloads` is 0, so nothing downloads):
  - five sequential passes: milliseconds, documents returned, RSS rise (sampled every 5 ms, so indicative) and peak heap;
  - a 1,000 ms timer like `setupDownloads` with every read delayed 1,500 ms, counting the most simultaneous reads of `download_queue`.

## Results recorded for #73

| | Before | After |
|---|---|---|
| Time per pass | 969-1,499 ms | 6-32 ms |
| Documents returned | 1,683 | 13 |
| RSS rise per pass | 78-389 MB | 0-10 MB |
| Most simultaneous reads | 3 | 1 |

Query plan for `{finished: false}`: collection scan, 1,683 documents examined, 1-2 ms. See `docs/DECISIONS.md` (#73).

This shows per-pass cost and overlap. It does not reproduce the production heap-limit crash.
