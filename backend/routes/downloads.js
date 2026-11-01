const db_api = require('../db');
const logger = require('../logger');

const isStringArray = (value) => Array.isArray(value) && value.every(item => typeof item === 'string');

// Lists the caller's downloads as summaries (no error text, see db_api.getDownloadSummaries). `uids` narrows the list.
exports.listDownloads = async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const uids = req.body.uids;
    if (uids !== undefined && uids !== null && !isStringArray(uids)) {
        res.sendStatus(400);
        return;
    }

    const filter = {user_uid: user_uid};
    if (uids) filter['uid'] = {$in: uids};

    try {
        res.send({downloads: await db_api.getDownloadSummaries(filter)});
    } catch (err) {
        logger.error(`Failed to list downloads: ${err.message}`);
        res.sendStatus(500);
    }
};

// Returns one full download, including its error text, only to the user it belongs to.
exports.getDownload = async (req, res) => {
    const user_uid = req.isAuthenticated() ? req.user.uid : null;
    const download_uid = req.body.download_uid;
    if (typeof download_uid !== 'string') {
        res.sendStatus(400);
        return;
    }

    try {
        const download = await db_api.getRecord('download_queue', {uid: download_uid, user_uid: user_uid});
        res.send({download: download || null});
    } catch (err) {
        logger.error(`Failed to get download ${download_uid}: ${err.message}`);
        res.sendStatus(500);
    }
};
