// Seeds the disposable Mongo with a download_queue shaped like the one in issue #73:
// 1,592 errored x 211 KB, 78 small finished, 13 unfinished (5 running, 8 waiting).
const { MongoClient } = require('mongodb');
const { v4: uuid } = require('uuid');

(async () => {
    const client = new MongoClient(`mongodb://127.0.0.1:${process.env.MONGO_PORT || 27018}`, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const col = client.db('ytdl_material').collection('download_queue');
    await col.deleteMany({});
    const base = (extra) => Object.assign({
        url: 'https://example.invalid/watch?v=x', type: 'video', title: '', user_uid: null, sub_id: null, sub_name: null,
        prefetched_info: null, options: {}, uid: uuid(), step_index: 0, paused: false, running: false,
        finished_step: true, error: null, percent_complete: null, finished: false, timestamp_start: Date.now()
    }, extra);
    const docs = [];
    const now = Date.now();
    for (let i = 0; i < 1592; i++) docs.push(base({ finished: true, running: false, error: 'E'.repeat(211 * 1024), error_type: 'unknown_error', timestamp_start: now - 1e7 + i }));
    for (let i = 0; i < 78; i++) docs.push(base({ finished: true, finished_step: true, step_index: 2, timestamp_start: now - 5e6 + i }));
    for (let i = 0; i < 5; i++) docs.push(base({ running: true, finished_step: false, step_index: 2, timestamp_start: now - 1e3 + i }));
    for (let i = 0; i < 8; i++) docs.push(base({ step_index: i % 2, timestamp_start: now + i }));
    for (let i = 0; i < docs.length; i += 20) await col.insertMany(docs.slice(i, i + 20));
    const stats = await client.db('ytdl_material').command({ collStats: 'download_queue' });
    console.log(JSON.stringify({ documents: await col.countDocuments(), unfinished: await col.countDocuments({ finished: false }), dataMB: Math.round(stats.size / 1048576) }));
    await client.close();
})().catch(err => { console.error(err); process.exit(1); });
