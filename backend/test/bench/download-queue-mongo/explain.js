const { MongoClient } = require('mongodb');
(async () => {
    const client = new MongoClient(`mongodb://127.0.0.1:${process.env.MONGO_PORT || 27018}`, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const col = client.db('ytdl_material').collection('download_queue');
    const indexes = (await col.indexes()).map(i => JSON.stringify(i.key));
    const plan = await col.find({ finished: false }).explain('executionStats');
    const s = plan.executionStats;
    console.log(JSON.stringify({ indexes, stage: JSON.stringify(plan.queryPlanner.winningPlan).slice(0, 160), nReturned: s.nReturned, totalDocsExamined: s.totalDocsExamined, executionTimeMillis: s.executionTimeMillis }));
    await client.close();
})().catch(err => { console.error(err); process.exit(1); });
