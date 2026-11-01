// Runs the real db.js + downloader.js scheduler against Mongo and prints one JSON report.
// cwd must be a backend copy (appdata paths are relative); run.sh sets that up. argv[2] labels the report.
// Stage steps are stubbed and ytdl_max_concurrent_downloads is 0, so nothing is downloaded.
const label = process.argv[2];
const config_api = require('./config');
const db_api = require('./db');
config_api.initialize();
db_api.initialize({}, {});
config_api.setConfigItem('ytdl_mongodb_connection_string', `mongodb://127.0.0.1:${process.env.MONGO_PORT || 27018}`);
config_api.setConfigItem('ytdl_max_concurrent_downloads', 0);

const mb = (b) => Math.round(b / 1048576);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    if (!(await db_api.connectToDB(0, true))) throw new Error('mongo connection failed');
    const downloader = require('./downloader');
    downloader.collectInfo = async () => {};
    downloader.downloadQueuedFile = async () => {};
    if (typeof downloader.checkDownloads !== 'function') throw new Error('checkDownloads not exported');

    const original = db_api.getRecords;
    let in_flight = 0, max_in_flight = 0, last_count = null, extra_delay = 0;
    db_api.getRecords = async (table, ...rest) => {
        if (table !== 'download_queue') return original(table, ...rest);
        in_flight++; max_in_flight = Math.max(max_in_flight, in_flight);
        try {
            const out = await original(table, ...rest);
            last_count = out.length;
            if (extra_delay) await sleep(extra_delay);
            return out;
        } finally { in_flight--; }
    };

    // A: sequential passes, per-pass time, documents returned, peak RSS/heap (sampled every 5 ms)
    const passes = [];
    for (let i = 0; i < 5; i++) {
        global.gc && global.gc();
        const before = process.memoryUsage();
        let peak_rss = before.rss, peak_heap = before.heapUsed;
        const sampler = setInterval(() => { const m = process.memoryUsage(); peak_rss = Math.max(peak_rss, m.rss); peak_heap = Math.max(peak_heap, m.heapUsed); }, 5);
        const t0 = Date.now();
        await downloader.checkDownloads();
        const ms = Date.now() - t0;
        clearInterval(sampler);
        passes.push({ ms, docs: last_count, rss_delta_mb: mb(peak_rss - before.rss), heap_peak_mb: mb(peak_heap) });
    }

    // B: 1000 ms timer like setupDownloads, with every read delayed 1500 ms; count simultaneous reads
    max_in_flight = 0; extra_delay = 1500;
    const timer = setInterval(() => downloader.checkDownloads(), 1000);
    await sleep(6000);
    clearInterval(timer);
    await sleep(2000);
    const overlap = { max_simultaneous_reads: max_in_flight };

    console.log(JSON.stringify({ label, passes, overlap }, null, 1));
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
