/* eslint-disable no-undef */
const assert = require('assert');
const low = require('lowdb')
const winston = require('winston');
const path = require('path');
const util = require('util');
const fs = require('fs-extra');
const { v4: uuid } = require('uuid');
const NodeID3 = require('node-id3');
const exec = util.promisify(require('child_process').exec);

const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('./appdata/db.json');
const db = low(adapter)

const users_adapter = new FileSync('./appdata/users.json');
const users_db = low(users_adapter);

const defaultFormat = winston.format.printf(({ level, message, label, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});

let debugMode = process.env.YTDL_MODE === 'debug';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), defaultFormat),
    defaultMeta: {},
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log`
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'appdata/logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'appdata/logs/combined.log' }),
      new winston.transports.Console({level: 'debug', name: 'console'})
    ]
});

var auth_api = require('../authentication/auth');
var db_api = require('../db');
const utils = require('../utils');
const subscriptions_api = require('../subscriptions');
const archive_api = require('../archive');
const categories_api = require('../categories');
const files_api = require('../files');
const youtubedl_api = require('../youtube-dl');
const config_api = require('../config');

db_api.initialize(db, users_db, 'local_db_test.json');

const sample_video_json = {
    id: "Sample Video",
    title: "Sample Video",
    thumbnailURL: "https://sampleurl.jpg",
    isAudio: false,
    duration: 177.413,
    url: "sampleurl.com",
    uploader: "Sample Uploader",
    size: 2838445,
    path: "users\\admin\\video\\Sample Video.mp4",
    upload_date: "2017-07-28",
    description: null,
    view_count: 230,
    abr: 128,
    thumbnailPath: null,
    user_uid: "admin",
    uid: "1ada04ab-2773-4dd4-bbdd-3e2d40761c50",
    registered: 1628469039377
}

describe('Database', async function() {
    describe.skip('Import', async function() {
        // it('Migrate', async function() {
        //     // await db_api.connectToDB();
        //     await db_api.removeAllRecords();
        //     const success = await db_api.importJSONToDB(db.value(), users_db.value());
        //     assert(success);
        // });

        it('Transfer to remote', async function() {
            await db_api.removeAllRecords('test');
            await db_api.insertRecordIntoTable('test', {test: 'test'});

            await db_api.transferDB(true);
            const success = await db_api.getRecord('test', {test: 'test'});
            assert(success);
        });

        it('Transfer to local', async function() {
            // await db_api.connectToDB();
            await db_api.removeAllRecords('test');
            await db_api.insertRecordIntoTable('test', {test: 'test'});

            await db_api.transferDB(false);
            const success = await db_api.getRecord('test', {test: 'test'});
            assert(success);
        });

        it('Restore db', async function() {
            const db_stats = await db_api.getDBStats();
            
            const file_name = await db_api.backupDB();
            await db_api.restoreDB(file_name);

            const new_db_stats = await db_api.getDBStats();

            assert(JSON.stringify(db_stats), JSON.stringify(new_db_stats));
        });
    });

    describe('Basic functions', async function() {
        
        // test both local_db and remote_db
        const local_db_modes = [false, true];

        for (const local_db_mode of local_db_modes) {
            let use_local_db = local_db_mode;
            const describe_skippable = use_local_db ? describe : describe.skip;
            describe_skippable(`Use local DB - ${use_local_db}`, async function() {
                beforeEach(async function() {
                    if (!use_local_db) {
                        this.timeout(120000);
                        await db_api.connectToDB(0);
                    }
                    await db_api.removeAllRecords('test');
                });
                it('Add and read record', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_add: 'test', test_undefined: undefined, test_null: undefined});
                    const added_record = await db_api.getRecord('test', {test_add: 'test', test_undefined: undefined, test_null: null});
                    assert(added_record['test_add'] === 'test');
                    await db_api.removeRecord('test', {test_add: 'test'});
                });
                it('Add and read record - Nested property', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_add: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    const added_record = await db_api.getRecord('test', {test_add: 'test', 'test_nested.test_key1': 'test1', 'test_nested.test_key2': 'test2'});
                    const not_added_record = await db_api.getRecord('test', {test_add: 'test', 'test_nested.test_key1': 'test1', 'test_nested.test_key2': 'test3'});
                    assert(added_record['test_add'] === 'test');
                    assert(!not_added_record);
                    await db_api.removeRecord('test', {test_add: 'test'});
                });
                it('Replace filter', async function() {
                    this.timeout(120000);
                    await db_api.insertRecordIntoTable('test', {test_replace_filter: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}}, {test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    await db_api.insertRecordIntoTable('test', {test_replace_filter: 'test', test_nested: {test_key1: 'test1', test_key2: 'test2'}}, {test_nested: {test_key1: 'test1', test_key2: 'test2'}});
                    const count = await db_api.getRecords('test', {test_replace_filter: 'test'}, true);
                    assert(count === 1);
                    await db_api.removeRecord('test', {test_replace_filter: 'test'});
                });
                it('Find duplicates by key', async function() {
                    const test_duplicates = [
                        {
                            test: 'testing',
                            key: '1'
                        },
                        {
                            test: 'testing',
                            key: '2'
                        },
                        {
                            test: 'testing_missing',
                            key: '3'
                        },
                        {
                            test: 'testing',
                            key: '4'
                        }
                    ];
                    await db_api.insertRecordsIntoTable('test', test_duplicates);
                    const duplicates = await db_api.findDuplicatesByKey('test', 'test');
                    assert(duplicates && duplicates.length === 2 && duplicates[0]['key'] === '2' && duplicates[1]['key'] === '4')
                });

                it('Update record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_update: 'test'});
                    await db_api.updateRecord('test', {test_update: 'test'}, {added_field: true});
                    const updated_record = await db_api.getRecord('test', {test_update: 'test'});
                    assert(updated_record['added_field']);
                    await db_api.removeRecord('test', {test_update: 'test'});
                });

                it('Update records', async function() {
                    await db_api.insertRecordIntoTable('test', {test_update: 'test', key: 'test1'});
                    await db_api.insertRecordIntoTable('test', {test_update: 'test', key: 'test2'});
                    await db_api.updateRecords('test', {test_update: 'test'}, {added_field: true});
                    const updated_records = await db_api.getRecords('test', {added_field: true});
                    assert(updated_records.length === 2);
                    await db_api.removeRecord('test', {test_update: 'test'});
                });

                it('Remove property from record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_keep: 'test', test_remove: 'test'});
                    await db_api.removePropertyFromRecord('test', {test_keep: 'test'}, {test_remove: true});
                    const updated_record = await db_api.getRecord('test', {test_keep: 'test'});
                    assert(updated_record['test_keep']);
                    assert(!updated_record['test_remove']);
                    await db_api.removeRecord('test', {test_keep: 'test'});
                });

                it('Remove record', async function() {
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test'});
                    const delete_succeeded = await db_api.removeRecord('test', {test_remove: 'test'});
                    assert(delete_succeeded);
                    const deleted_record = await db_api.getRecord('test', {test_remove: 'test'});
                    assert(!deleted_record);
                });

                it('Remove records', async function() {
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test', test_property: 'test'});
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test', test_property: 'test2'});
                    await db_api.insertRecordIntoTable('test', {test_remove: 'test'});
                    const delete_succeeded = await db_api.removeAllRecords('test', {test_remove: 'test'});
                    assert(delete_succeeded);
                    const count = await db_api.getRecords('test', {test_remove: 'test'}, true);
                    assert(count === 0);
                });

                it('Push to record array', async function() {
                    await db_api.insertRecordIntoTable('test', {test: 'test', test_array: []});
                    await db_api.pushToRecordsArray('test', {test: 'test'}, 'test_array', 'test_item');
                    const record = await db_api.getRecord('test', {test: 'test'});
                    assert(record);
                    assert(record['test_array'].length === 1);
                });

                it('Pull from record array', async function() {
                    await db_api.insertRecordIntoTable('test', {test: 'test', test_array: ['test_item']});
                    await db_api.pullFromRecordsArray('test', {test: 'test'}, 'test_array', 'test_item');
                    const record = await db_api.getRecord('test', {test: 'test'});
                    assert(record);
                    assert(record['test_array'].length === 0);
                });

                it('Bulk add', async function() {
                    this.timeout(120000);
                    const NUM_RECORDS_TO_ADD = 2002; // max batch ops is 1000
                    const test_records = [];
                    for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                        test_records.push({
                            uid: uuid()
                        });
                    }
                    const succcess = await db_api.bulkInsertRecordsIntoTable('test', test_records);

                    const received_records = await db_api.getRecords('test');
                    assert(succcess && received_records && received_records.length === NUM_RECORDS_TO_ADD);
                });

                it('Bulk update', async function() {
                    // bulk add records
                    const NUM_RECORDS_TO_ADD = 100; // max batch ops is 1000
                    const test_records = [];
                    const update_obj = {};
                    for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                        const test_uid =  uuid();
                        test_records.push({
                            uid: test_uid
                        });
                        update_obj[test_uid] = {added_field: true};
                    }
                    let success = await db_api.bulkInsertRecordsIntoTable('test', test_records);
                    assert(success);

                    // makes sure they are added
                    const received_records = await db_api.getRecords('test');
                    assert(received_records && received_records.length === NUM_RECORDS_TO_ADD);

                    success = await db_api.bulkUpdateRecordsByKey('test', 'uid', update_obj);
                    assert(success);

                    const received_updated_records = await db_api.getRecords('test');
                    for (let i = 0; i < received_updated_records.length; i++) {
                        success &= received_updated_records[i]['added_field'];
                    }
                    assert(success);
                });

                it('Stats', async function() {
                    const stats = await db_api.getDBStats();
                    assert(stats);
                });

                it.skip('Query speed', async function() {
                    this.timeout(120000); 
                    const NUM_RECORDS_TO_ADD = 300004; // max batch ops is 1000
                    const test_records = [];
                    let random_uid = '06241f83-d1b8-4465-812c-618dfa7f2943';
                    for (let i = 0; i < NUM_RECORDS_TO_ADD; i++) {
                        const uid = uuid();
                        if (i === NUM_RECORDS_TO_ADD/2) random_uid = uid;
                        test_records.push({"id":"RandomTextRandomText","title":"RandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomText","thumbnailURL":"https://i.ytimg.com/vi/randomurl/maxresdefault.jpg","isAudio":true,"duration":312,"url":"https://www.youtube.com/watch?v=randomvideo","uploader":"randomUploader","size":5060157,"path":"audio\\RandomTextRandomText.mp3","upload_date":"2016-05-11","description":"RandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomTextRandomText","view_count":118689353,"height":null,"abr":160,"uid": uid,"registered":1626672120632});
                    }
                    const insert_start = Date.now();
                    let success = await db_api.bulkInsertRecordsIntoTable('test', test_records);
                    const insert_end = Date.now();

                    console.log(`Insert time: ${(insert_end - insert_start)/1000}s`);

                    const query_start = Date.now();
                    const random_record = await db_api.getRecord('test', {uid: random_uid});
                    const query_end = Date.now();

                    console.log(random_record)

                    console.log(`Query time: ${(query_end - query_start)/1000}s`);

                    success = !!random_record;

                    assert(success);
                });
            });
        }
    });

    describe('Local DB Filters', async function() {
        it('Basic', async function() {
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: 'test'}, 'find');
            assert(result && result['test'] === 'test');
        });

        it('Regex', async function() {
            const filter = {$regex: `\\w+\\d`, $options: 'i'};
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: filter}, 'find');
            assert(result && result['test'] === 'test1');
        });

        it('Not equals', async function() {
            const filter = {$ne: 'test'};
            const result = db_api.applyFilterLocalDB([{test: 'test'}, {test: 'test1'}], {test: filter}, 'find');
            assert(result && result['test'] === 'test1');
        });

        it('Nested', async function() {
            const result = db_api.applyFilterLocalDB([{test1: {test2: 'test3'}}, {test4: 'test5'}], {'test1.test2': 'test3'}, 'find');
            assert(result && result['test1']['test2'] === 'test3');
        });

        it('In a list', async function() {
            const records = [{test: 'a'}, {test: 'b'}, {test: 'c'}, {other: 'a'}];
            const result = db_api.applyFilterLocalDB(records, {test: {$in: ['a', 'c', 'd']}}, 'filter');
            assert.deepStrictEqual(result, [{test: 'a'}, {test: 'c'}]);
            assert.deepStrictEqual(db_api.applyFilterLocalDB(records, {test: {$in: []}}, 'filter'), []);
        });

        it('In a list, together with another property', async function() {
            const records = [{uid: 'a', owner: 'x'}, {uid: 'a', owner: 'y'}, {uid: 'b', owner: 'x'}, {uid: 'c', owner: 'x'}];
            const result = db_api.applyFilterLocalDB(records, {owner: 'x', uid: {$in: ['a', 'b']}}, 'filter');
            assert.deepStrictEqual(result, [{uid: 'a', owner: 'x'}, {uid: 'b', owner: 'x'}]);
        });
    })
});

describe('Multi User', async function() {
    this.timeout(120000);
    const user_to_test = 'test_user';
    const user_password = 'test_pass';
    const sub_to_test = '';
    const playlist_to_test = '';
    beforeEach(async function() {
        // await db_api.connectToDB();
        await auth_api.deleteUser(user_to_test);
    });
    describe('Basic', function() {
        it('Register', async function() {
            const user = await auth_api.registerUser(user_to_test, user_to_test, user_password);
            assert(user);
        });
        it('Login', async function() {
            await auth_api.registerUser(user_to_test, user_to_test, user_password);
            const user = await auth_api.login(user_to_test, user_password);
            assert(user);
        });
    });
    describe('Video player - normal', async function() {
        beforeEach(async function() {
            await db_api.removeRecord('files', {uid: sample_video_json['uid']});
            await db_api.insertRecordIntoTable('files', sample_video_json);
        });
        const video_to_test = sample_video_json['uid'];
        it('Get video', async function() {
            const video_obj = await files_api.getVideo(video_to_test);
            assert(video_obj);
        });

        it('Video access - disallowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: false});
            const video_obj = await auth_api.getUserVideo(user_to_test, video_to_test, true);
            assert(!video_obj);
        });

        it('Video access - allowed', async function() {
            await db_api.setVideoProperty(video_to_test, {sharingEnabled: true}, user_to_test);
            const video_obj = await auth_api.getUserVideo(user_to_test, video_to_test, true);
            assert(video_obj);
        });
    });
    describe.skip('Zip generators', function() {
        it('Playlist zip generator', async function() {
            const playlist = await files_api.getPlaylist(playlist_to_test, user_to_test);
            assert(playlist);
            const playlist_files_to_download = [];
            for (let i = 0; i < playlist['uids'].length; i++) {
                const uid = playlist['uids'][i];
                const playlist_file = await files_api.getVideo(uid, user_to_test);
                playlist_files_to_download.push(playlist_file);
            }
            const zip_path = await utils.createContainerZipFile(playlist, playlist_files_to_download);
            const zip_exists = fs.pathExistsSync(zip_path);
            assert(zip_exists);
            if (zip_exists) fs.unlinkSync(zip_path);
        });

        it('Subscription zip generator', async function() {
            const sub = await subscriptions_api.getSubscription(sub_to_test.id, user_to_test);
            const sub_videos = await db_api.getRecords('files', {sub_id: sub.id});
            assert(sub);
            const sub_files_to_download = [];
            for (let i = 0; i < sub_videos.length; i++) {
                const sub_file = sub_videos[i];
                sub_files_to_download.push(sub_file);
            }
            const zip_path = await utils.createContainerZipFile(sub, sub_files_to_download);
            const zip_exists = fs.pathExistsSync(zip_path);
            assert(zip_exists);
            if (zip_exists) fs.unlinkSync(zip_path);
        });
    });
    // describe('Video player - subscription', function() {
    //     const sub_to_test = '';
    //     const video_to_test = 'ebbcfffb-d6f1-4510-ad25-d1ec82e0477e';
    //     it('Get video', async function() {
    //         const video_obj = files_api.getVideo(video_to_test, 'admin', );
    //         assert(video_obj);
    //     });

    //     it('Video access - disallowed', async function() {
    //         await db_api.setVideoProperty(video_to_test, {sharingEnabled: false}, user_to_test, sub_to_test);
    //         const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
    //         assert(!video_obj);
    //     });

    //     it('Video access - allowed', async function() {
    //         await db_api.setVideoProperty(video_to_test, {sharingEnabled: true}, user_to_test, sub_to_test);
    //         const video_obj = auth_api.getUserVideo('admin', video_to_test, true);
    //         assert(video_obj);
    //     });
    // });

});
    
describe('Downloader', function() {
    const downloader_api = require('../downloader');
    const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const playlist_url = 'https://www.youtube.com/playlist?list=PLbZT16X07RLhqK-ZgSkRuUyiz9B_WLdNK';
    const sub_id = 'dc834388-3454-41bf-a618-e11cb8c7de1c';
    const options = {
        ui_uid: uuid()
    }

    // Recorded yt-dlp output (see test/fixtures/README.md). Keeps this suite offline.
    const video_info_fixture = fs.readJSONSync(path.join(__dirname, 'fixtures', 'ytdlp', 'video.info.json'));
    const playlist_info_fixture = fs.readJSONSync(path.join(__dirname, 'fixtures', 'ytdlp', 'playlist.info.json'));

    // Same seam as the 'Download file' test: a custom handler stands in for the yt-dlp process.
    // `calls` records what getVideoInfoByURL asked yt-dlp to run.
    function infoHandlerFor(info_fixture, calls = []) {
        return async (url, args, handler_options, callback) => {
            calls.push({url, args});
            return await callback(null, info_fixture.map(info => JSON.stringify(info)));
        };
    }

    async function createCategory(url, info_fixture) {
        // get info
        const args = await downloader_api.generateArgs(url, 'video', options, null, true);
        const [info] = await downloader_api.getVideoInfoByURL(url, args, null, infoHandlerFor(info_fixture));

        // create category
        await db_api.removeAllRecords('categories');
        const new_category = {
            name: 'test_category',
            uid: uuid(),
            rules: [],
            custom_output: ''
        };
        await db_api.insertRecordIntoTable('categories', new_category);
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'includes',
            property: 'title',
            value: info['title']
        });
    }

    before(async function() {
        // no yt-dlp binary update here: this suite never runs a real downloader (see test/live)
        config_api.setConfigItem('ytdl_max_concurrent_downloads', 0);
    });

    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('download_queue');
        config_api.setConfigItem('ytdl_allow_playlist_categorization', true);
    });

    it('Get file info', async function() {
        const info = await downloader_api.getVideoInfoByURL(url, [], null, infoHandlerFor(video_info_fixture));
        assert(!!info && info.length > 0);
        assert(info[0]['id'] === video_info_fixture[0]['id']);
    });

    it('Get file info - asks yt-dlp for JSON without downloading or archiving', async function() {
        const calls = [];
        const args = ['--download-archive', 'archive.txt', '--no-simulate', '-f', 'best'];
        await downloader_api.getVideoInfoByURL(url, args, null, infoHandlerFor(video_info_fixture, calls));
        assert(calls.length === 1);
        assert(calls[0]['url'] === url);
        assert(calls[0]['args'].includes('--dump-json'));
        assert(!calls[0]['args'].includes('--no-simulate'));
        assert(!calls[0]['args'].includes('--download-archive') && !calls[0]['args'].includes('archive.txt'));
        assert(calls[0]['args'].includes('-f') && calls[0]['args'].includes('best'));
    });

    it('Get file info - custom handler does not need the yt-dlp binary', async function() {
        // a clean checkout has no binary; the real path would download one from GitHub
        const binary_path = path.join('appdata', 'bin', config_api.getConfigItem('ytdl_default_downloader'));
        const backup_path = binary_path + '.test_bak';
        const had_binary = fs.existsSync(binary_path);
        if (had_binary) fs.moveSync(binary_path, backup_path, {overwrite: true});
        const original_check = youtubedl_api.checkForYoutubeDLUpdate;
        let update_checks = 0;
        youtubedl_api.checkForYoutubeDLUpdate = async () => { update_checks++; };
        try {
            const info = await downloader_api.getVideoInfoByURL(url, [], null, infoHandlerFor(video_info_fixture));
            assert(info && info.length > 0);
            assert(update_checks === 0);
        } finally {
            youtubedl_api.checkForYoutubeDLUpdate = original_check;
            if (had_binary) fs.moveSync(backup_path, binary_path, {overwrite: true});
        }
    });

    it('Download file', async function() {
        this.timeout(30000); // ffmpeg generates the placeholder video
        await downloader_api.setupDownloads();
        const args = await downloader_api.generateArgs(url, 'video', options, null, true);
        const [info] = await downloader_api.getVideoInfoByURL(url, args, null, infoHandlerFor(video_info_fixture));
        if (fs.existsSync(info['_filename'])) fs.unlinkSync(info['_filename']);
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        assert(returned_download);
        const custom_download_method = async (url, args, options, callback) => {
            fs.writeJSONSync(utils.getTrueFileName(info['_filename'], 'video', '.info.json'), info);
            await generateEmptyVideoFile(info['_filename']);
            return await callback(null, [JSON.stringify(info)]);
        }
        const success = await downloader_api.downloadQueuedFile(returned_download['uid'], custom_download_method);
        assert(success);
    });

    it('Downloader - categorize', async function() {
        await createCategory(url, video_info_fixture);
        // collect info (prefetched, so collectInfo does not call yt-dlp)
        const returned_download = await downloader_api.createDownload(url, 'video', options, null, null, null, video_info_fixture);
        await downloader_api.collectInfo(returned_download['uid']);
        assert(returned_download['category']);
        assert(returned_download['category']['name'] === 'test_category');
    });

    it('Downloader - categorize playlist', async function() {
        await createCategory(playlist_url, playlist_info_fixture);
        // collect info (prefetched, so collectInfo does not call yt-dlp)
        const returned_download_pass = await downloader_api.createDownload(playlist_url, 'video', options, null, null, null, playlist_info_fixture);
        await downloader_api.collectInfo(returned_download_pass['uid']);
        assert(returned_download_pass['category']);
        assert(returned_download_pass['category']['name'] === 'test_category');

        // test with playlist categorization disabled
        config_api.setConfigItem('ytdl_allow_playlist_categorization', false);
        const returned_download_fail = await downloader_api.createDownload(playlist_url, 'video', options, null, null, null, playlist_info_fixture);
        await downloader_api.collectInfo(returned_download_fail['uid']);
        assert(!returned_download_fail['category']);
    });

    it('Tag file', async function() {
        const success = await generateEmptyAudioFile('test/sample_mp3.mp3');
        const audio_path = './test/sample_mp3.mp3';
        const sample_json = fs.readJSONSync('./test/sample_mp3.info.json');
        const tags = {
            title: sample_json['title'],
            artist: sample_json['artist'] ? sample_json['artist'] : sample_json['uploader'],
            TRCK: '27'
        }
        NodeID3.write(tags, audio_path);
        const written_tags = NodeID3.read(audio_path);
        assert(success && written_tags['raw']['TRCK'] === '27');
    });

    it('Queue file', async function() {
        this.timeout(300000); 
        const returned_download = await downloader_api.createDownload(url, 'video', options, null, null, null, null, true);
        assert(returned_download);
    });

    it('Pause file', async function() {
        const returned_download = await downloader_api.createDownload(url, 'video', options);
        await downloader_api.pauseDownload(returned_download['uid']);
        const updated_download = await db_api.getRecord('download_queue', {uid: returned_download['uid']});
        assert(updated_download['paused'] && !updated_download['running']);
    });

    it('Generate args', async function() {
        const args = await downloader_api.generateArgs(url, 'video', options);
        assert(args.length > 0);
    });

    it.skip('Generate args - subscription', async function() {
        const sub = await subscriptions_api.getSubscription(sub_id);
        const sub_options = subscriptions_api.generateOptionsForSubscriptionDownload(sub, 'admin');
        const args_normal = await downloader_api.generateArgs(url, 'video', options);
        const args_sub = await downloader_api.generateArgs(url, 'video', sub_options, 'admin');
        console.log(JSON.stringify(args_normal) !== JSON.stringify(args_sub));
    });

    it('Generate kodi NFO file', async function() {
        const nfo_file_path = './test/sample.nfo';
        if (fs.existsSync(nfo_file_path)) {
            fs.unlinkSync(nfo_file_path);
        }
        const sample_json = fs.readJSONSync('./test/sample_mp4.info.json');
        downloader_api.generateNFOFile(sample_json, nfo_file_path);
        assert(fs.existsSync(nfo_file_path), true);
        fs.unlinkSync(nfo_file_path);
    });

    it('Inject args', async function() {
        const original_args1 = ['--no-resize-buffer', '-o', '%(title)s', '--no-mtime'];
        const new_args1 = ['--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        const updated_args1 = utils.injectArgs(original_args1, new_args1);
        const expected_args1 = ['--no-resize-buffer', '--no-mtime', '--age-limit', '25', '--yes-playlist', '--abort-on-error', '-o', '%(id)s'];
        assert(JSON.stringify(updated_args1) === JSON.stringify(expected_args1));

        const original_args2 = ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3'];
        const new_args2 =  ['--add-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'];
        const updated_args2 = utils.injectArgs(original_args2, new_args2);
        const expected_args2 =  ['-o', '%(title)s.%(ext)s', '--write-info-json', '--print-json', '--audio-quality', '0', '-x', '--audio-format', 'mp3', '--add-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'];
        assert(JSON.stringify(updated_args2) === JSON.stringify(expected_args2));

        const original_args3 = ['-o', '%(title)s.%(ext)s'];
        const new_args3 =  ['--min-filesize','1'];
        const updated_args3 = utils.injectArgs(original_args3, new_args3);
        const expected_args3 =  ['-o', '%(title)s.%(ext)s', '--min-filesize', '1'];
        assert(JSON.stringify(updated_args3) === JSON.stringify(expected_args3));
    });

    describe('Scheduler', function() {
        const scheduler_logger = require('../logger');
        const tick = () => new Promise(resolve => setImmediate(resolve));
        const gate = () => {
            let open;
            const promise = new Promise(resolve => { open = resolve; });
            return {promise, open};
        };

        let original_get_records, original_collect_info, original_download_queued_file, original_logger_error;
        let original_max_concurrent;
        let reads;        // result of every download_queue read, in order
        let read_filters; // filter argument of every download_queue read, in order
        let dispatched;   // [stage, uid] for every stage the scheduler started
        let next_read_hook;
        let release_held_read;

        // A queue record as createDownload writes it, with overrides.
        function queueRecord(overrides = {}) {
            return Object.assign({
                url: url,
                type: 'video',
                title: '',
                user_uid: null,
                sub_id: null,
                sub_name: null,
                prefetched_info: null,
                options: {},
                uid: uuid(),
                step_index: 0,
                paused: false,
                running: false,
                finished_step: true,
                error: null,
                percent_complete: null,
                finished: false,
                timestamp_start: Date.now()
            }, overrides);
        }

        // An old failed download: finished, with a large error text like the live queue holds.
        function erroredRecord(overrides = {}) {
            return queueRecord(Object.assign({finished: true, error: 'x'.repeat(10000), error_type: 'unknown_error'}, overrides));
        }

        async function seed(records) {
            for (const record of records) await db_api.insertRecordIntoTable('download_queue', record);
        }

        // createDownload turns checking on; drop its record so only the seeded ones are in the queue
        async function wakeScheduler() {
            const throwaway = await downloader_api.createDownload(url, 'video', {}, null, null, null, null, true);
            await downloader_api.clearDownload(throwaway['uid']);
        }

        // Make the next download_queue read stop after it has read, until the returned gate opens.
        function holdNextRead() {
            const started = gate();
            const release = gate();
            next_read_hook = async () => {
                started.open();
                await release.promise;
            };
            release_held_read = release.open;
            return {started: started.promise, release: release.open};
        }

        before(function() {
            original_max_concurrent = config_api.getConfigItem('ytdl_max_concurrent_downloads');
        });

        beforeEach(async function() {
            await db_api.removeAllRecords('download_queue');
            reads = [];
            read_filters = [];
            dispatched = [];
            next_read_hook = null;
            release_held_read = null;
            config_api.setConfigItem('ytdl_max_concurrent_downloads', 5);

            original_get_records = db_api.getRecords;
            db_api.getRecords = async (table, ...rest) => {
                const live = await original_get_records(table, ...rest);
                if (table !== 'download_queue') return live;
                read_filters.push(rest[0]);
                // the local DB returns its live record objects; a MongoDB read returns an independent snapshot
                const result = JSON.parse(JSON.stringify(live));
                reads.push(result);
                const hook = next_read_hook;
                next_read_hook = null;
                if (hook) await hook();
                return result;
            };

            original_collect_info = downloader_api.collectInfo;
            original_download_queued_file = downloader_api.downloadQueuedFile;
            downloader_api.collectInfo = async (uid) => { dispatched.push(['collectInfo', uid]); };
            downloader_api.downloadQueuedFile = async (uid) => { dispatched.push(['downloadQueuedFile', uid]); };

            original_logger_error = scheduler_logger.error;
        });

        afterEach(async function() {
            // a failed assertion must not leave a read (and the queue lock) held for the next test
            if (release_held_read) release_held_read();
            await tick();
            db_api.getRecords = original_get_records;
            downloader_api.collectInfo = original_collect_info;
            downloader_api.downloadQueuedFile = original_download_queued_file;
            scheduler_logger.error = original_logger_error;
            config_api.setConfigItem('ytdl_max_concurrent_downloads', original_max_concurrent);
            await db_api.removeAllRecords('download_queue');
        });

        describe('Reading the queue', function() {
            it('reads only unfinished records, however many finished ones exist', async function() {
                this.timeout(10000); // the local DB rewrites its file on every insert
                const waiting = [queueRecord({timestamp_start: 1}), queueRecord({timestamp_start: 2})];
                const running = queueRecord({running: true, step_index: 2, finished_step: false, timestamp_start: 3});
                const history = [];
                for (let i = 0; i < 60; i++) history.push(erroredRecord());
                await seed(history.concat(waiting, [running]));
                await wakeScheduler();

                await downloader_api.checkDownloads();

                assert.strictEqual(reads.length, 1);
                assert.deepStrictEqual(read_filters, [{finished: false}]);
                assert.strictEqual(reads[0].length, 3);
                assert(reads[0].every(record => record['finished'] === false));
                assert.deepStrictEqual(dispatched.map(entry => entry[1]), waiting.map(record => record['uid']));
            });
        });

        describe('Records the scheduler relies on', function() {
            it('createDownload writes an explicit finished: false', async function() {
                const created = await downloader_api.createDownload(url, 'video', {}, null, null, null, null, true);
                const stored = await db_api.getRecord('download_queue', {uid: created['uid']});
                assert.strictEqual(stored['finished'], false);
            });
        });

        describe('Overlapping passes', function() {
            it('does nothing when a pass is already in flight', async function() {
                const waiting = queueRecord();
                await seed([waiting]);
                await wakeScheduler();

                const hold = holdNextRead();
                const first = downloader_api.checkDownloads();
                await hold.started;
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1, 'second pass must not read the queue');

                hold.release();
                await first;
                assert.deepStrictEqual(dispatched, [['collectInfo', waiting['uid']]]);
            });

            it('runs the next pass once the previous one has finished', async function() {
                await seed([queueRecord({paused: false, finished_step: false, running: true, step_index: 1})]);
                await wakeScheduler();

                await downloader_api.checkDownloads();
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 2);
            });

            it('survives a failed read: logs it and runs again on the next pass', async function() {
                const waiting = queueRecord();
                await seed([waiting]);
                await wakeScheduler();

                const logged = [];
                scheduler_logger.error = (message) => { logged.push(message instanceof Error ? message.message : String(message)); };
                next_read_hook = async () => { throw new Error('database unavailable'); };

                await downloader_api.checkDownloads();
                assert(logged.some(message => message.includes('database unavailable')), `error not logged: ${JSON.stringify(logged)}`);
                assert.deepStrictEqual(dispatched, []);

                await downloader_api.checkDownloads();
                assert.deepStrictEqual(dispatched, [['collectInfo', waiting['uid']]]);
            });
        });

        describe('Choosing what to start', function() {
            it('starts waiting downloads oldest first, whatever order they were stored in', async function() {
                const newest = queueRecord({timestamp_start: 100});
                const oldest = queueRecord({timestamp_start: 9});
                const middle = queueRecord({timestamp_start: 10});
                await seed([newest, oldest, middle]);
                await wakeScheduler();

                await downloader_api.checkDownloads();

                assert.deepStrictEqual(dispatched.map(entry => entry[1]), [oldest['uid'], middle['uid'], newest['uid']]);
            });

            it('counts running downloads against ytdl_max_concurrent_downloads', async function() {
                config_api.setConfigItem('ytdl_max_concurrent_downloads', 2);
                const running = queueRecord({running: true, step_index: 2, finished_step: false, timestamp_start: 1});
                const first = queueRecord({timestamp_start: 2});
                const second = queueRecord({timestamp_start: 3});
                await seed([running, second, first]);
                await wakeScheduler();

                await downloader_api.checkDownloads();

                assert.deepStrictEqual(dispatched.map(entry => entry[1]), [first['uid']]);
            });

            it('starts nothing when the limit is 0 or negative', async function() {
                await seed([queueRecord()]);
                for (const limit of [0, -1]) {
                    config_api.setConfigItem('ytdl_max_concurrent_downloads', limit);
                    await wakeScheduler();
                    await downloader_api.checkDownloads();
                }
                assert.deepStrictEqual(dispatched, []);
            });

            it('runs the info step for step 0 and the file step for step 1', async function() {
                const needs_info = queueRecord({step_index: 0, timestamp_start: 1});
                const needs_file = queueRecord({step_index: 1, timestamp_start: 2});
                await seed([needs_info, needs_file]);
                await wakeScheduler();

                await downloader_api.checkDownloads();

                assert.deepStrictEqual(dispatched, [['collectInfo', needs_info['uid']], ['downloadQueuedFile', needs_file['uid']]]);
            });

            it('skips paused and finished downloads', async function() {
                const paused = queueRecord({paused: true, timestamp_start: 1});
                const finished = queueRecord({finished: true, timestamp_start: 2});
                const waiting = queueRecord({timestamp_start: 3});
                await seed([paused, finished, waiting]);
                await wakeScheduler();

                await downloader_api.checkDownloads();

                assert.deepStrictEqual(dispatched.map(entry => entry[1]), [waiting['uid']]);
            });
        });

        describe('Stopping and starting again', function() {
            it('stops reading once nothing but paused and finished downloads remain', async function() {
                await seed([queueRecord({paused: true}), erroredRecord()]);
                await wakeScheduler();

                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1);
                await downloader_api.checkDownloads();
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1);
            });

            it('stops reading when the queue is empty', async function() {
                await wakeScheduler();
                await downloader_api.checkDownloads();
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1);
            });

            it('starts again when a download is created', async function() {
                await wakeScheduler();
                await downloader_api.checkDownloads();
                const created = await downloader_api.createDownload(url, 'video', {});
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 2);
                assert.deepStrictEqual(dispatched, [['collectInfo', created['uid']]]);
            });

            it('starts again when a download is resumed', async function() {
                const paused = queueRecord({paused: true});
                await seed([paused]);
                await wakeScheduler();
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1);

                await downloader_api.resumeDownload(paused['uid']);
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 2);
                assert.deepStrictEqual(dispatched, [['collectInfo', paused['uid']]]);
            });

            it('starts again when a download is restarted', async function() {
                const failed = erroredRecord();
                await seed([failed]);
                await wakeScheduler();
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 1);

                const restarted = await downloader_api.restartDownload(failed['uid']);
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, 2);
                assert.deepStrictEqual(dispatched, [['collectInfo', restarted['uid']]]);
            });

            it('keeps the wake-up of a download created while an empty read is in flight', async function() {
                await wakeScheduler();

                const hold = holdNextRead();
                const pass = downloader_api.checkDownloads();
                await hold.started;
                const creating = downloader_api.createDownload(url, 'video', {});
                for (let i = 0; i < 20; i++) await tick();
                hold.release();
                await pass;
                const created = await creating;

                const reads_before = reads.length;
                await downloader_api.checkDownloads();
                assert.strictEqual(reads.length, reads_before + 1, 'the pass after create must read the queue');
                assert.deepStrictEqual(dispatched, [['collectInfo', created['uid']]]);
            });

            it('does not release the queue lock before a resume has been written', async function() {
                // MongoDB applies the update some time after the call; the local DB applies it at once
                const paused = queueRecord({paused: true});
                await seed([paused]);
                await wakeScheduler();

                const original_update_record = db_api.updateRecord;
                db_api.updateRecord = async (...args) => {
                    for (let i = 0; i < 5; i++) await tick();
                    return await original_update_record(...args);
                };
                try {
                    const resuming = downloader_api.resumeDownload(paused['uid']);
                    const pass = downloader_api.checkDownloads();
                    await Promise.all([resuming, pass]);
                } finally {
                    db_api.updateRecord = original_update_record;
                }

                // the stubbed steps leave the record waiting, so a pass may start it more than once
                await downloader_api.checkDownloads();
                assert(dispatched.some(entry => entry[1] === paused['uid']), 'the resumed download was never started');
            });

            it('keeps the wake-up of a download resumed while an all-paused read is in flight', async function() {
                const paused = queueRecord({paused: true});
                await seed([paused]);
                await wakeScheduler();

                const hold = holdNextRead();
                const pass = downloader_api.checkDownloads();
                await hold.started;
                const resuming = downloader_api.resumeDownload(paused['uid']);
                for (let i = 0; i < 20; i++) await tick();
                hold.release();
                await pass;
                await resuming;

                await downloader_api.checkDownloads();
                assert.deepStrictEqual(dispatched, [['collectInfo', paused['uid']]]);
            });
        });
    });

    describe('Twitch', async function () {
        const twitch_api = require('../twitch');
        const example_vod = '1790315420';
        const cli_output_fixture = path.join(__dirname, 'fixtures', 'twitch', 'chatdownload.json');
        const temp_cli_output_path = path.join('appdata', `${example_vod}.json`);
        const sample_path = path.join('test', 'sample.twitch_chat.json');

        // Stands in for TwitchDownloaderCLI: records the command and writes the file the CLI would write.
        function fakeCLI(calls, stderr = '') {
            return async (command) => {
                calls.push(command);
                if (!stderr) fs.copyFileSync(cli_output_fixture, temp_cli_output_path);
                return {stdout: '', stderr: stderr};
            };
        }

        beforeEach(function() {
            if (fs.existsSync(sample_path)) fs.unlinkSync(sample_path);
            if (fs.existsSync(temp_cli_output_path)) fs.unlinkSync(temp_cli_output_path);
        });

        afterEach(function() {
            if (fs.existsSync(sample_path)) fs.unlinkSync(sample_path);
            if (fs.existsSync(temp_cli_output_path)) fs.unlinkSync(temp_cli_output_path);
        });

        it('Download VOD chat', async function() {
            const calls = [];
            const chat = await twitch_api.downloadTwitchChatByVODID(example_vod, 'sample', null, null, null, './test', fakeCLI(calls));

            // the CLI is asked for this VOD, writing to the temp file we read back
            assert(calls.length === 1);
            assert(calls[0].includes(`chatdownload -u ${example_vod}`));
            assert(calls[0].includes(`-o appdata/${example_vod}.json`));

            // the chat file is produced from the CLI output
            assert(fs.existsSync(sample_path));
            const written_chat = fs.readJSONSync(sample_path);
            assert(JSON.stringify(written_chat) === JSON.stringify(chat));
            assert(written_chat.length === 3);
            assert(JSON.stringify(written_chat[0]) === JSON.stringify({
                timestamp: 5,
                timestamp_str: '00:00:05',
                name: 'sample_viewer_one',
                message: 'hello chat',
                user_color: '#FF69B4'
            }));
            assert(written_chat[1]['timestamp_str'] === '00:01:05');
            assert(written_chat[2]['timestamp_str'] === '01:02:05');

            // the CLI's temp file is cleaned up
            assert(!fs.existsSync(temp_cli_output_path));
        });

        it('Download VOD chat - CLI error writes no chat file', async function() {
            const calls = [];
            const chat = await twitch_api.downloadTwitchChatByVODID(example_vod, 'sample', null, null, null, './test', fakeCLI(calls, 'VOD not found'));
            assert(calls.length === 1);
            assert(chat === null);
            assert(!fs.existsSync(sample_path));
        });

        it('Download VOD chat - rejects VOD IDs that are not alphanumeric', async function() {
            const calls = [];
            const chat = await twitch_api.downloadTwitchChatByVODID('123; echo injected', 'sample', null, null, null, './test', fakeCLI(calls));
            assert(calls.length === 0);
            assert(chat === null);
            assert(!fs.existsSync(sample_path));
        });
    });
});

describe('Downloads API', function() {
    const downloads_routes = require('../routes/downloads');
    const routes_logger = require('../logger');

    const owner = 'user-owner';
    const other = 'user-other';
    const history_size = 60;

    // The DB reads a handler made, counted in records. A handler that filters in memory loads more than it returns.
    const read_functions = ['getRecords', 'getRecord', 'getDownloadSummaries'];
    let originals;
    let loaded;
    let original_logger_error;

    // A queue record as createDownload writes it, with overrides.
    function queueRecord(overrides = {}) {
        return Object.assign({
            url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
            type: 'video',
            title: '',
            user_uid: null,
            sub_id: null,
            sub_name: null,
            prefetched_info: null,
            options: {},
            uid: uuid(),
            step_index: 0,
            paused: false,
            running: false,
            finished_step: true,
            error: null,
            percent_complete: null,
            finished: false,
            timestamp_start: Date.now()
        }, overrides);
    }

    // An old failed download: finished, with large error text and prefetched info like the live queue holds.
    function erroredRecord(overrides = {}) {
        return queueRecord(Object.assign({
            finished: true,
            step_index: 1,
            error: 'x'.repeat(10000),
            error_type: 'unknown_error',
            prefetched_info: {description: 'y'.repeat(10000)}
        }, overrides));
    }

    function seed(records) {
        return db_api.insertRecordsIntoTable('download_queue', records);
    }

    // Calls a handler with a fake request and response; `user_uid` null means unauthenticated.
    async function call(handler, body, user_uid = null) {
        const req = {body: body, isAuthenticated: () => !!user_uid, user: user_uid ? {uid: user_uid} : undefined};
        const res = {
            status_code: 200,
            body: undefined,
            send(sent) { this.body = sent; return this; },
            sendStatus(code) { this.status_code = code; return this; }
        };
        await handler(req, res);
        return res;
    }

    const list = (body, user_uid = null) => call(downloads_routes.listDownloads, body, user_uid);
    const detail = (body, user_uid = null) => call(downloads_routes.getDownload, body, user_uid);

    beforeEach(async function() {
        await db_api.removeAllRecords('download_queue');
        loaded = 0;
        originals = {};
        for (const name of read_functions) {
            originals[name] = db_api[name];
            db_api[name] = async (...args) => {
                const result = await originals[name](...args);
                loaded += Array.isArray(result) ? result.length : (result ? 1 : 0);
                return result;
            };
        }
        original_logger_error = routes_logger.error;
    });

    afterEach(async function() {
        for (const name of read_functions) db_api[name] = originals[name];
        routes_logger.error = original_logger_error;
        await db_api.removeAllRecords('download_queue');
    });

    describe('List', function() {
        it('reads only the requested downloads, however many others exist', async function() {
            this.timeout(10000);
            const wanted = [queueRecord({user_uid: owner}), queueRecord({user_uid: owner, finished: true}), erroredRecord({user_uid: owner})];
            const history = Array.from({length: history_size}, () => erroredRecord({user_uid: owner}));
            await seed([...history, ...wanted]);

            const res = await list({uids: wanted.map(download => download['uid'])}, owner);

            assert.deepStrictEqual(res.body.downloads.map(download => download['uid']).sort(), wanted.map(download => download['uid']).sort());
            assert.strictEqual(loaded, 3);
        });

        it('does not return another user\'s download, even when asked for its uid', async function() {
            const mine = queueRecord({user_uid: owner});
            const theirs = queueRecord({user_uid: other});
            await seed([mine, theirs]);

            const res = await list({uids: [mine['uid'], theirs['uid']]}, owner);

            assert.deepStrictEqual(res.body.downloads.map(download => download['uid']), [mine['uid']]);
            assert.strictEqual(loaded, 1);
        });

        it('returns an unauthenticated caller only downloads without an owner', async function() {
            const unowned = queueRecord({user_uid: null});
            await seed([unowned, queueRecord({user_uid: owner})]);

            const res = await list({uids: null});

            assert.deepStrictEqual(res.body.downloads.map(download => download['uid']), [unowned['uid']]);
        });

        it('returns every download of the user when no uids are given', async function() {
            const records = [queueRecord({user_uid: owner}), erroredRecord({user_uid: owner}), queueRecord({user_uid: other})];
            await seed(records);

            for (const uids of [undefined, null]) {
                const res = await list({uids: uids}, owner);
                assert.deepStrictEqual(res.body.downloads.map(download => download['uid']).sort(), [records[0]['uid'], records[1]['uid']].sort());
            }
        });

        it('returns nothing for an empty uids list and for unknown uids', async function() {
            await seed([queueRecord({user_uid: owner})]);

            assert.deepStrictEqual((await list({uids: []}, owner)).body.downloads, []);
            assert.deepStrictEqual((await list({uids: [uuid()]}, owner)).body.downloads, []);
        });

        it('leaves out the error text and prefetched info, but still tells which downloads errored', async function() {
            const errored = erroredRecord({user_uid: owner});
            const finished = queueRecord({user_uid: owner, finished: true, step_index: 3, percent_complete: 100});
            const empty_error = queueRecord({user_uid: owner, finished: true, error: ''});
            const no_error_field = queueRecord({user_uid: owner, finished: true});
            delete no_error_field['error'];
            const running = queueRecord({user_uid: owner, running: true, step_index: 2, percent_complete: 40, prefetched_info: {description: 'z'}});
            await seed([errored, finished, empty_error, no_error_field, running]);

            const res = await list({uids: null}, owner);

            const by_uid = Object.fromEntries(res.body.downloads.map(download => [download['uid'], download]));
            assert.strictEqual(Object.keys(by_uid).length, 5);
            for (const download of res.body.downloads) {
                assert(!('error' in download), 'error text must not be listed');
                assert(!('prefetched_info' in download), 'prefetched_info must not be listed');
                assert(!('options' in download), 'options must not be listed');
            }
            assert.strictEqual(by_uid[errored['uid']]['has_error'], true);
            assert.strictEqual(by_uid[finished['uid']]['has_error'], false);
            assert.strictEqual(by_uid[empty_error['uid']]['has_error'], false);
            assert.strictEqual(by_uid[no_error_field['uid']]['has_error'], false);
            assert.strictEqual(by_uid[running['uid']]['has_error'], false);
            assert(JSON.stringify(res.body).length < 10000, 'the list must not grow with the stored error text');
        });

        it('lists what the Downloads page shows for a running download', async function() {
            const running = queueRecord({
                user_uid: owner, uid: 'running-uid', url: 'https://example.com/v', title: 'A title', sub_name: 'A sub', timestamp_start: 1700000000000,
                running: true, step_index: 2, percent_complete: 0, finished_step: false
            });
            await seed([running]);

            const res = await list({uids: null}, owner);

            assert.deepStrictEqual(res.body.downloads, [{
                uid: 'running-uid', url: 'https://example.com/v', type: 'video', title: 'A title', sub_name: 'A sub', timestamp_start: 1700000000000,
                step_index: 2, percent_complete: 0, finished: false, running: true, paused: false, finished_step: false, has_error: false
            }]);
        });

        it('keeps the null progress and subscription name of a new download and the string progress of a running one', async function() {
            const created = queueRecord({user_uid: owner});
            const running = queueRecord({user_uid: owner, running: true, step_index: 2, percent_complete: '42.50'});
            await seed([created, running]);

            const res = await list({uids: null}, owner);

            const by_uid = Object.fromEntries(res.body.downloads.map(download => [download['uid'], download]));
            assert.strictEqual(by_uid[created['uid']]['percent_complete'], null);
            assert.strictEqual(by_uid[created['uid']]['sub_name'], null);
            assert.strictEqual(by_uid[running['uid']]['percent_complete'], '42.50');
        });

        it('keeps only what playback needs of a finished download\'s container', async function() {
            const single = queueRecord({user_uid: owner, finished: true, step_index: 3, container: {uid: 'file-uid', id: 'video-id', title: 'T', path: '/p/f.mp4', size: 5}});
            const playlist = queueRecord({user_uid: owner, finished: true, step_index: 3, container: {id: 'playlist-id', name: 'N', uids: ['a', 'b']}});
            await seed([single, playlist]);

            const res = await list({uids: null}, owner);

            const by_uid = Object.fromEntries(res.body.downloads.map(download => [download['uid'], download]));
            assert.deepStrictEqual(by_uid[single['uid']]['container'], {uid: 'file-uid', id: 'video-id'});
            assert.deepStrictEqual(by_uid[playlist['uid']]['container'], {id: 'playlist-id', uids: ['a', 'b']});
        });

        it('does not change the stored records', async function() {
            const errored = erroredRecord({user_uid: owner, container: {uid: 'file-uid', id: 'video-id', uids: ['a']}});
            await seed([errored]);
            const before = JSON.stringify(await db_api.getRecords('download_queue'));

            const res = await list({uids: null}, owner);
            res.body.downloads[0]['container']['uids'].push('changed');
            res.body.downloads[0]['title'] = 'changed';

            assert.strictEqual(JSON.stringify(await db_api.getRecords('download_queue')), before);
        });

        it('rejects a uids value that is not a list of strings, without reading', async function() {
            await seed([queueRecord({user_uid: owner})]);

            for (const uids of ['abc', {$ne: null}, [{$ne: null}], [1], [null]]) {
                loaded = 0;
                const res = await list({uids: uids}, owner);
                assert.strictEqual(res.status_code, 400, JSON.stringify(uids));
                assert.strictEqual(res.body, undefined);
                assert.strictEqual(loaded, 0);
            }
        });

        it('answers 500 when the database read fails', async function() {
            routes_logger.error = () => {};
            for (const name of read_functions) db_api[name] = async () => { throw new Error('database unavailable'); };

            const res = await list({uids: null}, owner);

            assert.strictEqual(res.status_code, 500);
            assert.strictEqual(res.body, undefined);
        });
    });

    describe('Single download', function() {
        it('returns a download with its error text to its owner', async function() {
            const errored = erroredRecord({user_uid: owner});
            await seed([errored]);

            const res = await detail({download_uid: errored['uid']}, owner);

            assert.strictEqual(res.body.download['uid'], errored['uid']);
            assert.strictEqual(res.body.download['error'], 'x'.repeat(10000));
        });

        it('returns null for another user\'s download and for an unknown uid', async function() {
            const theirs = queueRecord({user_uid: other});
            await seed([theirs]);

            assert.deepStrictEqual((await detail({download_uid: theirs['uid']}, owner)).body, {download: null});
            assert.deepStrictEqual((await detail({download_uid: uuid()}, owner)).body, {download: null});
        });

        it('keeps unowned downloads readable without logging in, and hides owned ones from that caller', async function() {
            const unowned = queueRecord({user_uid: null});
            const owned = queueRecord({user_uid: owner});
            await seed([unowned, owned]);

            assert.strictEqual((await detail({download_uid: unowned['uid']})).body.download['uid'], unowned['uid']);
            assert.deepStrictEqual((await detail({download_uid: owned['uid']})).body, {download: null});
        });

        it('rejects a download_uid that is not a string, without reading', async function() {
            await seed([queueRecord({user_uid: owner})]);

            for (const download_uid of [{$ne: null}, ['a'], 1, undefined, null]) {
                loaded = 0;
                const res = await detail({download_uid: download_uid}, owner);
                assert.strictEqual(res.status_code, 400, JSON.stringify(download_uid));
                assert.strictEqual(res.body, undefined);
                assert.strictEqual(loaded, 0);
            }
        });

        it('answers 500 when the database read fails', async function() {
            routes_logger.error = () => {};
            for (const name of read_functions) db_api[name] = async () => { throw new Error('database unavailable'); };

            const res = await detail({download_uid: uuid()}, owner);

            assert.strictEqual(res.status_code, 500);
            assert.strictEqual(res.body, undefined);
        });
    });
});

describe('Subscriptions', function() {
    const new_sub = {
        name: 'test_sub',
        url: 'https://www.youtube.com/channel/UCzofo-P8yMMCOv8rsPfIR-g',
        maxQuality: null,
        id: uuid(),
        user_uid: null,
        type: 'video',
        paused: true
    };
    beforeEach(async function() {
        await db_api.removeAllRecords('subscriptions');
    });
    it('Subscribe', async function () {
        const success = await subscriptions_api.subscribe(new_sub, null, true);
        assert(success);
        const sub_exists = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(sub_exists);
    });
    it('Unsubscribe', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        await subscriptions_api.unsubscribe(new_sub);
        const sub_exists = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(!sub_exists);
    });
    it('Delete subscription file', async function () {
        
    });
    it('Get subscription by name', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_by_name = await subscriptions_api.getSubscriptionByName('test_sub');
        assert(sub_by_name);
    });
    it('Get subscriptions', async function() {
        await subscriptions_api.subscribe(new_sub, null, true);
        const subs = await subscriptions_api.getSubscriptions(null);
        assert(subs && subs.length === 1);
    });
    it('Update subscription', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_update = Object.assign({}, new_sub, {name: 'updated_name'});
        await subscriptions_api.updateSubscription(sub_update);
        const updated_sub = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(updated_sub['name'] === 'updated_name');
    });
    it('Update subscription property', async function () {
        await subscriptions_api.subscribe(new_sub, null, true);
        const sub_update = Object.assign({}, new_sub, {name: 'updated_name'});
        await subscriptions_api.updateSubscriptionPropertyMultiple([sub_update], {name: 'updated_name'});
        const updated_sub = await db_api.getRecord('subscriptions', {id: new_sub['id']});
        assert(updated_sub['name'] === 'updated_name');
    });
    it('Write subscription metadata', async function() {
        const metadata_path = path.join('subscriptions', 'channels', 'test_sub', 'subscription_backup.json');
        if (fs.existsSync(metadata_path)) fs.unlinkSync(metadata_path);
        await subscriptions_api.subscribe(new_sub, null, true);
        assert(fs.existsSync(metadata_path));
    });
    it('Fresh uploads', async function() {

    });
});

// A stub yt-dlp (a POSIX shell script in appdata/bin) prints canned output and exits with a chosen status,
// so the real process, parsing and queue code runs offline. yt-dlp exits 1 whenever any video in a playlist
// is private, removed or terminated, even though it still prints every other entry.
(process.platform === 'win32' ? describe.skip : describe)('Subscription checks when yt-dlp exits non-zero', function() {
    // longer than waitFor's limit, so a timeout reports what it was waiting for and the log
    this.timeout(10000);
    const os = require('os');
    const app_logger = require('../logger');
    const playlist_entries = require('./fixtures/ytdlp/playlist.info.json')
        .map(entry => Object.assign({}, entry, {playlist_title: 'Test playlist'}));
    // a signed media URL like the ones yt-dlp prints, which must never reach the log
    playlist_entries[0].url = 'https://rr1.googlevideo.com/videoplayback?sig=SIGNED-SECRET';
    const unavailable_error = 'ERROR: [youtube] unavail1: Private video. Sign in if you\'ve been granted access to this video';

    const binary_path = path.join('appdata', 'bin', 'yt-dlp');
    let work_dir = null;
    let saved = null;
    let log_lines = null;

    const sub = () => ({
        name: 'check_sub',
        url: 'https://www.youtube.com/playlist?list=PLtest',
        isPlaylist: true,
        maxQuality: null,
        id: uuid(),
        user_uid: null,
        type: 'video',
        paused: true
    });

    // `with_max_downloads` is what yt-dlp does when called with --max-downloads 1 instead: it skips the
    // unavailable video, prints the first entry it can extract and exits 101 (recorded in test/fixtures/README.md)
    const stubYoutubeDL = ({entries = [], stdout_text = '', stderr = '', exit_code = 0, killed_by_signal = false, with_max_downloads = null}) => {
        const stdout_path = path.join(work_dir, 'stdout.txt');
        const stderr_path = path.join(work_dir, 'stderr.txt');
        fs.writeFileSync(stdout_path, entries.map(entry => JSON.stringify(entry) + '\n').join('') + stdout_text);
        fs.writeFileSync(stderr_path, stderr);
        const end = killed_by_signal ? 'kill -9 $$' : `exit ${exit_code}`;
        let max_downloads_branch = '';
        if (with_max_downloads) {
            const max_stdout_path = path.join(work_dir, 'max_stdout.txt');
            const max_stderr_path = path.join(work_dir, 'max_stderr.txt');
            fs.writeFileSync(max_stdout_path, with_max_downloads.entries.map(entry => JSON.stringify(entry) + '\n').join(''));
            fs.writeFileSync(max_stderr_path, with_max_downloads.stderr || '');
            max_downloads_branch = `case " $* " in *" --max-downloads 1 "*) cat '${max_stdout_path}'; cat '${max_stderr_path}' >&2; exit 101;; esac\n`;
        }
        fs.ensureDirSync(path.dirname(binary_path));
        fs.writeFileSync(binary_path, `#!/bin/sh\n${max_downloads_branch}cat '${stdout_path}'\ncat '${stderr_path}' >&2\n${end}\n`, {mode: 0o755});
    };

    const waitFor = async (what, condition, timeout_ms = 5000) => {
        const deadline = Date.now() + timeout_ms;
        while (Date.now() < deadline) {
            const value = await condition();
            if (value) return value;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.fail(`Timed out waiting for ${what}. Log:\n${log_lines.join('\n')}`);
    };

    const queuedUrls = async () => (await db_api.getRecords('download_queue')).map(download => download['url']).sort();
    const waitForQueue = (count) => waitFor(`${count} queued downloads`, async () => (await queuedUrls()).length >= count);
    const waitForFailedCheck = () => waitFor('the check to fail', () => log_lines.some(line => line.includes('Subscription check failed')));
    // nothing else runs after the failure is logged, but give the queue a moment to prove it stays empty
    const settle = () => new Promise(resolve => setTimeout(resolve, 100));
    const logged = (level) => log_lines.filter(line => line.startsWith(`${level}: `));

    before(function() {
        work_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-sub-'));
        saved = {
            fork: config_api.getConfigItem('ytdl_default_downloader'),
            binary: fs.existsSync(binary_path) ? fs.readFileSync(binary_path) : null,
            logger_methods: {warn: app_logger.warn, error: app_logger.error, info: app_logger.info, verbose: app_logger.verbose}
        };
        config_api.setConfigItem('ytdl_default_downloader', 'yt-dlp');
    });

    beforeEach(async function() {
        await db_api.removeAllRecords('subscriptions');
        await db_api.removeAllRecords('download_queue');
        await db_api.removeAllRecords('archives');
        log_lines = [];
        for (const level of ['warn', 'error', 'info', 'verbose']) {
            // an Error is logged by its message, which is how winston prints it
            app_logger[level] = (message) => { log_lines.push(`${level}: ${message instanceof Error ? message.message : message}`); };
        }
    });

    afterEach(function() {
        Object.assign(app_logger, saved.logger_methods);
    });

    after(async function() {
        if (!saved) return;
        config_api.setConfigItem('ytdl_default_downloader', saved.fork);
        if (saved.binary) fs.writeFileSync(binary_path, saved.binary, {mode: 0o755});
        else fs.removeSync(binary_path);
        await db_api.removeAllRecords('subscriptions');
        await db_api.removeAllRecords('download_queue');
        fs.removeSync(work_dir);
    });

    describe('Checking for new videos', function() {
        it('Continues with the entries yt-dlp printed and says so in the log', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            stubYoutubeDL({entries: playlist_entries, stderr: unavailable_error + '\n', exit_code: 1});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForQueue(2);
            assert.deepStrictEqual(await queuedUrls(), playlist_entries.map(entry => entry['webpage_url']).sort());
            const warnings = logged('warn');
            assert.strictEqual(warnings.length, 1, warnings.join('\n'));
            for (const detail of ['2 entries', 'reported errors', 'code 1']) assert(warnings[0].includes(detail), warnings[0]);
        });

        it('Does not log the output of yt-dlp when it continues', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            stubYoutubeDL({entries: playlist_entries, stderr: unavailable_error + '\n', exit_code: 1});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForQueue(2);
            await settle();
            for (const line of log_lines) {
                for (const output of ['SIGNED-SECRET', playlist_entries[0]['title'], unavailable_error]) {
                    assert(!line.includes(output), line);
                }
            }
        });

        it('Does not queue or archive the videos yt-dlp reported as unavailable', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            stubYoutubeDL({entries: playlist_entries, stderr: unavailable_error + '\n', exit_code: 1});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForQueue(2);
            await settle();
            const urls = await queuedUrls();
            assert.strictEqual(urls.length, 2, urls.join(', '));
            assert(!urls.some(url => url.includes('unavail1')), urls.join(', '));
            assert(!(await archive_api.existsInArchive('youtube', 'unavail1', 'video', null, check_sub.id)));
            assert.strictEqual((await db_api.getRecords('files', {sub_id: check_sub.id})).length, 0);
        });

        it('Fails when yt-dlp exits non-zero and printed nothing usable, naming the exit code and a trimmed stderr', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            const noise = Array.from({length: 30}, (_, i) => `WARNING: [youtube] noise line ${i + 1}`);
            const stderr = [...noise, unavailable_error].join('\n') + '\n';
            stubYoutubeDL({stdout_text: 'a line that is not json SIGNED-SECRET\n', stderr: stderr, exit_code: 1});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForFailedCheck();
            await settle();
            assert.deepStrictEqual(await queuedUrls(), []);
            const errors = logged('error').join('\n');
            assert(errors.includes('code 1'), errors);
            assert(errors.includes('Private video'), errors);
            assert(!/noise line 1(\D|$)/.test(errors), errors);
            assert(!errors.includes('SIGNED-SECRET'), errors);
        });

        it('Trims standard error in the log when yt-dlp exits 0 but printed something that is not JSON', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            const noise = Array.from({length: 30}, (_, i) => `WARNING: [youtube] noise line ${i + 1}`);
            stubYoutubeDL({stdout_text: 'a line with {"unfinished\n', stderr: noise.join('\n') + '\n', exit_code: 0});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForFailedCheck();
            const errors = logged('error').join('\n');
            assert(errors.includes('noise line 30'), errors);
            assert(!/noise line 1(\D|$)/.test(errors), errors);
        });

        it('Fails when yt-dlp is killed after printing entries, so a cancelled check queues nothing', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            stubYoutubeDL({entries: playlist_entries, killed_by_signal: true});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForFailedCheck();
            await settle();
            assert.deepStrictEqual(await queuedUrls(), []);
        });

        it('Treats a clean exit as before: queues every entry and logs no errors', async function() {
            const check_sub = sub();
            await subscriptions_api.subscribe(check_sub, null, true);
            stubYoutubeDL({entries: playlist_entries, stderr: 'WARNING: [youtube] No supported JavaScript runtime could be found.\n', exit_code: 0});

            await subscriptions_api.getVideosForSub(check_sub.id);

            await waitForQueue(2);
            await settle();
            assert.deepStrictEqual(await queuedUrls(), playlist_entries.map(entry => entry['webpage_url']).sort());
            assert.deepStrictEqual(logged('warn'), []);
            assert.deepStrictEqual(logged('error'), []);
        });
    });

    describe('Adding a subscription', function() {
        // the app asks for the first entry only (--playlist-end 1) to learn the name
        const unnamed_sub = () => Object.assign(sub(), {name: undefined});

        it('Succeeds when yt-dlp exits non-zero after printing an entry', async function() {
            const new_sub = unnamed_sub();
            stubYoutubeDL({entries: playlist_entries.slice(0, 1), stderr: unavailable_error + '\n', exit_code: 1});

            const result = await subscriptions_api.subscribe(new_sub, null);

            assert.strictEqual(result['success'], true, log_lines.join('\n'));
            assert.strictEqual((await db_api.getRecord('subscriptions', {id: new_sub.id}))['name'], 'Test playlist');
        });

        it('Succeeds when the first video is unavailable, by asking yt-dlp for the first video it can extract', async function() {
            const new_sub = unnamed_sub();
            // with --playlist-end 1 yt-dlp tries only the first video: no entry, exit 1
            stubYoutubeDL({
                stderr: unavailable_error + '\n',
                exit_code: 1,
                with_max_downloads: {entries: playlist_entries.slice(1, 2), stderr: unavailable_error + '\n'}
            });

            const result = await subscriptions_api.subscribe(new_sub, null);

            assert.strictEqual(result['success'], true, log_lines.join('\n'));
            assert.strictEqual((await db_api.getRecord('subscriptions', {id: new_sub.id}))['name'], 'Test playlist');
            assert.deepStrictEqual(logged('error'), []);
            assert.deepStrictEqual(logged('warn'), []);
        });

        it('Succeeds, with no fallback run, when the first video is available', async function() {
            const new_sub = unnamed_sub();
            // a fallback run would find the stub's other branch and fail the add
            stubYoutubeDL({entries: playlist_entries.slice(0, 1), exit_code: 0, with_max_downloads: {entries: []}});

            const result = await subscriptions_api.subscribe(new_sub, null);

            assert.strictEqual(result['success'], true, log_lines.join('\n'));
        });

        it('Succeeds when yt-dlp exits cleanly but warns on stderr', async function() {
            const new_sub = unnamed_sub();
            stubYoutubeDL({entries: playlist_entries.slice(0, 1), stderr: 'WARNING: [youtube] No supported JavaScript runtime could be found.\n', exit_code: 0});

            const result = await subscriptions_api.subscribe(new_sub, null);

            assert.strictEqual(result['success'], true, log_lines.join('\n'));
        });

        it('Fails when yt-dlp exits non-zero and printed nothing usable', async function() {
            const new_sub = unnamed_sub();
            stubYoutubeDL({stderr: unavailable_error + '\n', exit_code: 1});

            const result = await subscriptions_api.subscribe(new_sub, null);

            assert.strictEqual(result['success'], false);
            const errors = logged('error');
            // the failure of the last run, then the line from subscribe itself
            assert.strictEqual(errors.length, 2, errors.join('\n'));
            assert(errors[0].includes('code 1') && errors[0].includes('Private video'), errors[0]);
        });
    });
});

describe('Tasks', function() {
    const tasks_api = require('../tasks');
    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('tasks');

        const dummy_task = {
            run: async () => { await utils.wait(500); return true; },
            confirm: async () => { await utils.wait(500); return true; },
            title: 'Dummy task',
            job: null
        };
        tasks_api.TASKS['dummy_task'] = dummy_task;

        await tasks_api.setupTasks();
    });
    it('Backup db', async function() {
        const backups_original = await utils.recFindByExt('appdata', 'bak');
        const original_length = backups_original.length;
        await tasks_api.executeTask('backup_local_db');
        const backups_new = await utils.recFindByExt('appdata', 'bak');
        const new_length = backups_new.length;
        assert(original_length === new_length-1);
    });

    it('Check for missing files', async function() {
        this.timeout(300000);
        await db_api.removeAllRecords('files', {uid: 'test'});
        const test_missing_file = {uid: 'test', path: 'test/missing_file.mp4'};
        await db_api.insertRecordIntoTable('files', test_missing_file);
        await tasks_api.executeTask('missing_files_check');
        const missing_file_db_record = await db_api.getRecord('files', {uid: 'test'});
        assert(!missing_file_db_record);
    });

    it('Check for duplicate files', async function() {
        this.timeout(300000);
        await db_api.removeAllRecords('files', {uid: 'test1'});
        await db_api.removeAllRecords('files', {uid: 'test2'});
        const test_duplicate_file1 = {uid: 'test1', path: 'test/missing_file.mp4'};
        const test_duplicate_file2 = {uid: 'test2', path: 'test/missing_file.mp4'};
        const test_duplicate_file3 = {uid: 'test3', path: 'test/missing_file.mp4'};
        await db_api.insertRecordIntoTable('files', test_duplicate_file1);
        await db_api.insertRecordIntoTable('files', test_duplicate_file2);
        await db_api.insertRecordIntoTable('files', test_duplicate_file3);

        await tasks_api.executeRun('duplicate_files_check');
        const task_obj = await db_api.getRecord('tasks', {key: 'duplicate_files_check'});
        assert(task_obj['data'] && task_obj['data']['uids'] && task_obj['data']['uids'].length >= 1, true);

        await tasks_api.executeTask('duplicate_files_check');
        const duplicated_record_count = await db_api.getRecords('files', {path: 'test/missing_file.mp4'}, true);
        assert(duplicated_record_count === 1);
    });

    it('Import unregistered files', async function() {
        this.timeout(300000);

        const success = await generateEmptyVideoFile('test/sample_mp4.mp4');

        // pre-test cleanup
        await db_api.removeAllRecords('files', {path: 'test/missing_file.mp4'});
        if (fs.existsSync('video/sample_mp4.info.json')) fs.unlinkSync('video/sample_mp4.info.json');
        if (fs.existsSync('video/sample_mp4.mp4'))       fs.unlinkSync('video/sample_mp4.mp4');

        // copies in files
        fs.copyFileSync('test/sample_mp4.info.json', 'video/sample_mp4.info.json');
        fs.copyFileSync('test/sample_mp4.mp4', 'video/sample_mp4.mp4');
        await tasks_api.executeTask('missing_db_records');
        const imported_file = await db_api.getRecord('files', {title: 'Sample File'});
        assert(success && !!imported_file);
        
        // post-test cleanup
        if (fs.existsSync('video/sample_mp4.info.json')) fs.unlinkSync('video/sample_mp4.info.json');
        if (fs.existsSync('video/sample_mp4.mp4'))       fs.unlinkSync('video/sample_mp4.mp4');
    });

    it('Schedule and cancel task', async function() {
        this.timeout(5000);
        const today_one_year = new Date();
        today_one_year.setFullYear(today_one_year.getFullYear() + 1);
        const schedule_obj = {
            type: 'timestamp',
            data: { timestamp: today_one_year.getTime() }
        }
        await tasks_api.updateTaskSchedule('dummy_task', schedule_obj);
        const dummy_task = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(!!tasks_api.TASKS['dummy_task']['job']);
        assert(!!dummy_task['schedule']);

        await tasks_api.updateTaskSchedule('dummy_task', null);
        const dummy_task_updated = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(!tasks_api.TASKS['dummy_task']['job']);
        assert(!dummy_task_updated['schedule']);
    });

    it('Schedule and run task', async function() {
        this.timeout(5000);
        const today_1_second = new Date();
        today_1_second.setSeconds(today_1_second.getSeconds() + 1);
        const schedule_obj = {
            type: 'timestamp',
            data: { timestamp: today_1_second.getTime() }
        }
        await tasks_api.updateTaskSchedule('dummy_task', schedule_obj);
        assert(!!tasks_api.TASKS['dummy_task']['job']);
        await utils.wait(2000);
        const dummy_task_obj = await db_api.getRecord('tasks', {key: 'dummy_task'});
        assert(dummy_task_obj['data']);
    });
});

describe('Archive', async function() {
    beforeEach(async function() {
        // await db_api.connectToDB();
        await db_api.removeAllRecords('archives');
    });

    afterEach(async function() {
        await db_api.removeAllRecords('archives');
    });

    it('Import archive', async function() {
        const archive_text = `
            testextractor1 testing1
            testextractor1 testing2
            testextractor2 testing1
            testextractor1 testing3

        `;
        const count = await archive_api.importArchiveFile(archive_text, 'video', 'test_user', 'test_sub');
        assert(count === 4)
        const archive_items = await db_api.getRecords('archives', {user_uid: 'test_user', sub_id: 'test_sub'});
        assert(archive_items.length === 4);
        assert(archive_items.filter(archive_item => archive_item.extractor === 'testextractor2').length === 1);
        assert(archive_items.filter(archive_item => archive_item.extractor === 'testextractor1').length === 3);

        const success = await db_api.removeAllRecords('archives', {user_uid: 'test_user', sub_id: 'test_sub'});
        assert(success);
    });

    it('Get archive', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');

        const archive_item1 = await db_api.getRecord('archives', {extractor: 'testextractor1', id: 'testing1'});
        const archive_item2 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing1'});

        assert(archive_item1 && archive_item2);
    });

    it('Archive duplicates', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_user');

        await archive_api.addToArchive('testextractor1', 'testing1', 'audio', 'test_user');

        const count = await db_api.getRecords('archives', {id: 'testing1'}, true);
        assert(count === 3);
    });

    it('Remove from archive', async function() {
        await archive_api.addToArchive('testextractor1', 'testing1', 'video', 'test_title', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing1', 'video', 'test_title', 'test_user');
        await archive_api.addToArchive('testextractor2', 'testing2', 'video', 'test_title', 'test_user');

        const success = await archive_api.removeFromArchive('testextractor2', 'testing1', 'video', 'test_user');
        assert(success);

        const archive_item1 = await db_api.getRecord('archives', {extractor: 'testextractor1', id: 'testing1'});
        assert(!!archive_item1);
        
        const archive_item2 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing1'});
        assert(!archive_item2);

        const archive_item3 = await db_api.getRecord('archives', {extractor: 'testextractor2', id: 'testing2'});
        assert(!!archive_item3);
    });
});

describe('Utils', async function() {
    it('Strip properties', async function() {
        const test_obj = {test1: 'test1', test2: 'test2', test3: 'test3'};
        const stripped_obj = utils.stripPropertiesFromObject(test_obj, ['test1', 'test3']);
        assert(!stripped_obj['test1'] && stripped_obj['test2'] && !stripped_obj['test3'])
    });

    it('Convert flat object to nested object', async function() {
        // No modfication
        const flat_obj0 = {'test1': {'test_sub': true}, 'test2': {test_sub: true}};
        const nested_obj0 = utils.convertFlatObjectToNestedObject(flat_obj0);
        assert(nested_obj0['test1'] && nested_obj0['test1']['test_sub']);
        assert(nested_obj0['test2'] && nested_obj0['test2']['test_sub']);

        // Standard setup
        const flat_obj1 = {'test1.test_sub': true, 'test2.test_sub': true};
        const nested_obj1 = utils.convertFlatObjectToNestedObject(flat_obj1);
        assert(nested_obj1['test1'] && nested_obj1['test1']['test_sub']);
        assert(nested_obj1['test2'] && nested_obj1['test2']['test_sub']);

        // Nested branches
        const flat_obj2 = {'test1.test_sub': true, 'test1.test2.test_sub': true};
        const nested_obj2 = utils.convertFlatObjectToNestedObject(flat_obj2);
        assert(nested_obj2['test1'] && nested_obj2['test1']['test_sub']);
        assert(nested_obj2['test1'] && nested_obj2['test1']['test2'] && nested_obj2['test1']['test2']['test_sub']);
    });
});

describe('Categories', async function() {
    beforeEach(async function() {
        // await db_api.connectToDB();
        const new_category = {
            name: 'test_category',
            uid: uuid(),
            rules: [],
            custom_output: ''
        };
        await db_api.removeAllRecords('categories', {name: 'test_category'});
        await db_api.insertRecordIntoTable('categories', new_category);
    });

    afterEach(async function() {
        await db_api.removeAllRecords('categories', {name: 'test_category'});
    });

    it('Categorize - includes', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category && category.name === 'test_category');
    });

    it('Categorize - not includes', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - equals', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category && category.name === 'test_category');
    });

    it('Categorize - not equals', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'not_equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - AND', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: 'and',
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(!category);
    });

    it('Categorize - OR', async function() {
        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: null,
            comparator: 'equals',
            property: 'uploader',
            value: 'Sample Uploader'
        });

        await db_api.pushToRecordsArray('categories', {name: 'test_category'}, 'rules', {
            preceding_operator: 'or',
            comparator: 'not_includes',
            property: 'title',
            value: 'Sample'
        });

        const category = await categories_api.categorize([sample_video_json]);
        assert(category);
    });
});

describe('Config', async function() {
    it('findChangedConfigItems', async function() {
        const old_config = {
            "YoutubeDLMaterial": {
                "test_object1": {
                    "test_prop1": true,
                    "test_prop2": false
                },
                "test_object2": {
                    "test_prop3": {
                        "test_prop3_1": true,
                        "test_prop3_2": false
                    },
                    "test_prop4": false
                },
                "test_object3": {
                    "test_prop5": {
                        "test_prop5_1": true,
                        "test_prop5_2": false
                    },
                    "test_prop6": false
                }
            }
        };

        const new_config = {
            "YoutubeDLMaterial": {
                "test_object1": {
                    "test_prop1": false,
                    "test_prop2": false
                },
                "test_object2": {
                    "test_prop3": {
                        "test_prop3_1": false,
                        "test_prop3_2": false
                    },
                    "test_prop4": true
                },
                "test_object3": {
                    "test_prop5": {
                        "test_prop5_1": true,
                        "test_prop5_2": false
                    },
                    "test_prop6": true
                }
            }
        };

        const changes = config_api.findChangedConfigItems(old_config, new_config);
        assert(changes[0]['key'] === 'test_prop1' && changes[0]['old_value'] === true && changes[0]['new_value'] === false);
        assert(changes[1]['key'] === 'test_prop3' &&
                changes[1]['old_value']['test_prop3_1'] === true &&
                changes[1]['new_value']['test_prop3_1'] === false &&
                changes[1]['old_value']['test_prop3_2'] === false &&
                changes[1]['new_value']['test_prop3_2'] === false);
        assert(changes[2]['key'] === 'test_prop4' && changes[2]['old_value'] === false && changes[2]['new_value'] === true);
        assert(changes[3]['key'] === 'test_prop6' && changes[3]['old_value'] === false && changes[3]['new_value'] === true);
    });
});

// The fixtures are POSIX shell scripts and Python detection is off on Windows, where yt-dlp.exe bundles its own Python
(process.platform === 'win32' ? describe.skip : describe)('yt-dlp binary updates', function() {
    // A local HTTP server stands in for GitHub, so the real fetch and file code runs offline.
    // The container's Python is simulated with a stub `python3` first on PATH.
    const os = require('os');
    const http = require('http');
    const { execFileSync } = require('child_process');
    const app_logger = require('../logger');
    const CONSTS = require('../consts');

    const yt_dlp_tags = ['2026.10.26', '2026.10.21', '2026.08.19'];
    let server = null;
    let base_url = null;
    let work_dir = null;
    let requested_paths = null;
    let broken_releases = null;
    let tags_down = false;
    let tag_pages = null;
    let tags_link_loops = false;
    let download_hold_ms = 0;
    let in_flight = 0;
    let max_in_flight = 0;
    let staged_snapshots = null;
    let log_lines = null;
    let saved = null;

    const setPython = (version) => {
        fs.writeFileSync(path.join(work_dir, 'bin', 'python3'), `#!/bin/sh\necho "Python ${version}"\n`, {mode: 0o755});
    };

    const fakeBinary = (version) => broken_releases.has(version)
        ? '#!/bin/sh\necho "ImportError: this release does not run here" >&2\nexit 1\n'
        : `#!/bin/sh\necho "${version}"\n`;

    before(async function() {
        server = http.createServer((req, res) => {
            requested_paths.push(req.url);
            const url = new URL(req.url, 'http://127.0.0.1');
            const tags_match = url.pathname.match(/^\/tags\/(.+)$/);
            const download_match = url.pathname.match(/^\/download\/([^/]+)\/(.+)$/);
            // every fork gets the same tag list, newest first, split over pages (as the GitHub tags API does)
            const pages = tag_pages || [yt_dlp_tags];
            // only releases from the known lists are served, so no part of the request is written to the response
            const release = download_match ? [].concat(...pages, yt_dlp_tags).find(tag => tag === download_match[1]) : undefined;
            if (tags_match && tags_down) {
                res.statusCode = 503;
                res.end('rate limited');
            } else if (tags_match) {
                const page = Number(url.searchParams.get('page') || 1);
                // normally the next page; a broken server can point back at the page it just served
                if (tags_link_loops) res.setHeader('Link', `<${base_url}${req.url}>; rel="next"`);
                else if (page < pages.length) res.setHeader('Link', `<${base_url}/tags/${tags_match[1]}?page=${page + 1}>; rel="next"`);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify((pages[page - 1] || []).map(name => ({name}))));
            } else if (release || url.pathname.startsWith('/latest/')) {
                const body = fakeBinary(release || 'latest');
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Length', Buffer.byteLength(body));
                if (!download_hold_ms) return res.end(body);
                // keep the download open long enough to see what the updater has on disk and what overlaps
                in_flight++;
                max_in_flight = Math.max(max_in_flight, in_flight);
                res.write(body.slice(0, 10));
                setTimeout(() => {
                    staged_snapshots.push(fs.readdirSync(work_dir).filter(name => name !== 'bin'));
                    in_flight--;
                    res.end(body.slice(10));
                }, download_hold_ms);
            } else {
                res.statusCode = 404;
                res.end();
            }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        base_url = `http://127.0.0.1:${server.address().port}`;
        work_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-update-'));
        fs.mkdirSync(path.join(work_dir, 'bin'));

        const binary_path = path.join('appdata', 'bin', 'yt-dlp');
        saved = {
            forks: JSON.parse(JSON.stringify(youtubedl_api.youtubedl_forks)),
            path_env: process.env.PATH,
            fork: config_api.getConfigItem('ytdl_default_downloader'),
            details: fs.existsSync(CONSTS.DETAILS_BIN_PATH) ? fs.readFileSync(CONSTS.DETAILS_BIN_PATH) : null,
            binary: fs.existsSync(binary_path) ? fs.readFileSync(binary_path) : null,
            logger_methods: {warn: app_logger.warn, error: app_logger.error, info: app_logger.info}
        };
        for (const fork in youtubedl_api.youtubedl_forks) {
            youtubedl_api.youtubedl_forks[fork]['tags_url'] = `${base_url}/tags/${fork}`;
            youtubedl_api.youtubedl_forks[fork]['download_url'] = `${base_url}/latest/${fork}`;
        }
        youtubedl_api.youtubedl_forks['yt-dlp']['versioned_download_url'] = `${base_url}/download/{version}/yt-dlp`;
        process.env.PATH = `${path.join(work_dir, 'bin')}${path.delimiter}${process.env.PATH}`;
    });

    beforeEach(function() {
        requested_paths = [];
        broken_releases = new Set();
        tags_down = false;
        tag_pages = null;
        tags_link_loops = false;
        download_hold_ms = 0;
        in_flight = 0;
        max_in_flight = 0;
        staged_snapshots = [];
        // every test starts with only the stub python3 directory in the work dir
        for (const name of fs.readdirSync(work_dir)) if (name !== 'bin') fs.removeSync(path.join(work_dir, name));
        log_lines = [];
        for (const level of ['warn', 'error', 'info']) {
            app_logger[level] = (message) => { log_lines.push(`${level}: ${message}`); };
        }
        config_api.setConfigItem('ytdl_default_downloader', 'yt-dlp');
    });

    afterEach(function() {
        Object.assign(app_logger, saved.logger_methods);
    });

    after(async function() {
        if (!saved) return;
        await new Promise(resolve => server.close(resolve));
        Object.assign(app_logger, saved.logger_methods);
        process.env.PATH = saved.path_env;
        Object.assign(youtubedl_api.youtubedl_forks, saved.forks);
        config_api.setConfigItem('ytdl_default_downloader', saved.fork);
        const binary_path = path.join('appdata', 'bin', 'yt-dlp');
        if (saved.details) fs.writeFileSync(CONSTS.DETAILS_BIN_PATH, saved.details);
        else fs.removeSync(CONSTS.DETAILS_BIN_PATH);
        if (saved.binary) fs.writeFileSync(binary_path, saved.binary, {mode: 0o755});
        else fs.removeSync(binary_path);
        fs.removeSync(work_dir);
    });

    describe('Choosing the release', function() {
        it('Python 3.10 gets the newest release that still supports it', async function() {
            setPython('3.10.12');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2026.10.21');
        });

        it('Python 3.11 and newer get the newest release', async function() {
            for (const python_version of ['3.11.0', '3.12.3']) {
                setPython(python_version);
                assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2026.10.26');
            }
        });

        it('youtube-dl and youtube-dlc ignore the Python version', async function() {
            setPython('3.10.12');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('youtube-dl'), '2026.10.26');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('youtube-dlc'), '2026.10.26');
        });

        it('Follows the tag pages until a compatible release turns up', async function() {
            tag_pages = [['2026.10.26'], ['2026.10.21', '2026.08.19']];
            setPython('3.10.12');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2026.10.21');
            assert(requested_paths.some(url => url.includes('page=2')), requested_paths.join(', '));

            // a compatible newest release ends the search on the first page
            requested_paths = [];
            setPython('3.12.3');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2026.10.26');
            assert.deepStrictEqual(requested_paths, ['/tags/yt-dlp']);
        });

        it('Keeps going past any fixed number of pages until the list ends', async function() {
            // eleven pages of incompatible releases, then a compatible one on page 12
            tag_pages = [...Array(11).fill(['2026.10.26']), ['2026.10.21']];
            setPython('3.10.12');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2026.10.21');
            assert.strictEqual(requested_paths.length, 12, requested_paths.join(', '));
        });

        it('Stops when a Link header points back at a page it already fetched', async function() {
            tag_pages = [['2026.10.26']];
            tags_link_loops = true;
            setPython('3.10.12');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), null);
            assert.strictEqual(requested_paths.length, 1, requested_paths.join(', '));
            const errors = log_lines.filter(line => line.startsWith('error:'));
            assert(errors.some(line => line.includes('Python 3.10.12')), errors.join('\n'));
        });

        it('Reports that nothing fits when no page has a compatible release', async function() {
            tag_pages = [['2026.10.26'], ['2026.10.21']];
            setPython('3.9.18');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), null);
            const errors = log_lines.filter(line => line.startsWith('error:'));
            assert(errors.some(line => line.includes('Python 3.9.18')), errors.join('\n'));
        });

        it('Python 3.9 gets the newest release that still supports it', async function() {
            tag_pages = [['2026.10.26', '2026.10.21', '2025.10.22', '2025.10.14']];
            setPython('3.9.18');
            assert.strictEqual(await youtubedl_api.getLatestUpdateVersion('yt-dlp'), '2025.10.14');
        });

        it('Says plainly that updates are held back because of the Python version', async function() {
            setPython('3.10.12');
            await youtubedl_api.getLatestUpdateVersion('yt-dlp');
            const held_back = log_lines.filter(line => line.includes('held back'));
            assert.strictEqual(held_back.length, 1);
            // names the Python version, the release that is installed and the newer one that is skipped
            for (const detail of ['Python 3.10.12', '2026.10.21', '2026.10.26']) assert(held_back[0].includes(detail), held_back[0]);
        });

        it('Stays quiet when nothing is held back', async function() {
            setPython('3.12.3');
            await youtubedl_api.getLatestUpdateVersion('yt-dlp');
            assert.deepStrictEqual(log_lines.filter(line => line.includes('held back')), []);
        });
    });

    describe('Installing the release', function() {
        const readDetails = () => fs.readJSONSync(CONSTS.DETAILS_BIN_PATH);

        it('Downloads the requested release, not the newest one, and records it', async function() {
            setPython('3.10.12');
            const binary_path = path.join(work_dir, 'yt-dlp');
            await youtubedl_api.updateYoutubeDL('2026.10.21', binary_path);
            assert(requested_paths.includes('/download/2026.10.21/yt-dlp'), requested_paths.join(', '));
            assert(!requested_paths.some(url => url.startsWith('/latest/')), requested_paths.join(', '));
            assert.strictEqual(execFileSync(binary_path, ['--version']).toString().trim(), '2026.10.21');
            assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
            // the verified download was moved into place, nothing is left beside it
            assert.deepStrictEqual(fs.readdirSync(work_dir).sort(), ['bin', 'yt-dlp']);
        });

        it('Two installs of the same binary at once do not disturb each other', async function() {
            setPython('3.10.12');
            download_hold_ms = 150;
            const binary_path = path.join(work_dir, 'yt-dlp');
            await Promise.all([
                youtubedl_api.updateYoutubeDL('2026.10.21', binary_path),
                youtubedl_api.updateYoutubeDL('2026.10.21', binary_path)
            ]);
            assert.deepStrictEqual(log_lines.filter(line => line.startsWith('error:')), []);
            assert.strictEqual(max_in_flight, 1, 'installs of one binary run one after the other');
            assert.strictEqual(execFileSync(binary_path, ['--version']).toString().trim(), '2026.10.21');
            assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
            assert.deepStrictEqual(fs.readdirSync(work_dir).sort(), ['bin', 'yt-dlp']);
        });

        it('Stages the download under a name that keeps the file extension', async function() {
            // on Windows the staged file must still end in .exe to be launched
            setPython('3.12.3');
            download_hold_ms = 100;
            const binary_path = path.join(work_dir, 'yt-dlp.exe');
            await youtubedl_api.updateYoutubeDL('2026.10.21', binary_path);
            const staged = [].concat(...staged_snapshots).filter(name => name !== 'yt-dlp.exe');
            assert.strictEqual(staged.length, 1, staged.join(', '));
            assert(staged[0].endsWith('.exe'), staged[0]);
            assert.deepStrictEqual(fs.readdirSync(work_dir).sort(), ['bin', 'yt-dlp.exe']);
        });

        describe('when no working install is possible', function() {
            const previous_script = '#!/bin/sh\necho "2026.10.21"\n';

            const installPrevious = (binary_path, version) => {
                fs.ensureDirSync(path.dirname(binary_path));
                fs.writeFileSync(binary_path, `#!/bin/sh\necho "${version}"\n`, {mode: 0o755});
                fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {'yt-dlp': {version: version, downloader: 'yt-dlp'}});
            };

            it('Keeps the previous binary and its recorded version, and logs the Python version and release', async function() {
                setPython('3.10.12');
                const binary_path = path.join(work_dir, 'yt-dlp');
                installPrevious(binary_path, '2026.10.21');
                broken_releases.add('2026.10.26');

                await youtubedl_api.updateYoutubeDL('2026.10.26', binary_path);

                assert.strictEqual(fs.readFileSync(binary_path, 'utf8'), previous_script);
                assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
                assert.deepStrictEqual(fs.readdirSync(work_dir).sort(), ['bin', 'yt-dlp']);
                const errors = log_lines.filter(line => line.startsWith('error:'));
                assert.strictEqual(errors.length, 1, errors.join('\n'));
                for (const detail of ['Python 3.10.12', '2026.10.26']) assert(errors[0].includes(detail), errors[0]);
            });

            it('An update check does not replace a working binary with one that cannot run', async function() {
                setPython('3.12.3');
                const binary_path = path.join('appdata', 'bin', 'yt-dlp');
                installPrevious(binary_path, '2026.10.21');
                broken_releases.add('2026.10.26');

                await youtubedl_api.checkForYoutubeDLUpdate();

                assert(requested_paths.includes('/download/2026.10.26/yt-dlp'), requested_paths.join(', '));
                assert.strictEqual(fs.readFileSync(binary_path, 'utf8'), previous_script);
                assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
            });

            it('Restores the previous binary when the recorded version cannot be written', async function() {
                setPython('3.10.12');
                const binary_path = path.join(work_dir, 'yt-dlp');
                installPrevious(binary_path, '2026.08.19');
                // a directory where the details file should be makes writing it fail
                fs.removeSync(CONSTS.DETAILS_BIN_PATH);
                fs.mkdirSync(CONSTS.DETAILS_BIN_PATH);
                try {
                    await youtubedl_api.updateYoutubeDL('2026.10.21', binary_path);
                } finally {
                    fs.removeSync(CONSTS.DETAILS_BIN_PATH);
                }

                assert.strictEqual(fs.readFileSync(binary_path, 'utf8'), '#!/bin/sh\necho "2026.08.19"\n');
                assert.deepStrictEqual(fs.readdirSync(work_dir).sort(), ['bin', 'yt-dlp']);
                const errors = log_lines.filter(line => line.startsWith('error:'));
                assert.strictEqual(errors.length, 1, errors.join('\n'));
                assert(errors[0].includes('2026.10.21'), errors[0]);
            });

            it('Running yt-dlp with no binary and no release to install fails cleanly', async function() {
                setPython('3.12.3');
                fs.removeSync(path.join('appdata', 'bin', 'yt-dlp'));
                fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {'yt-dlp': {version: '2026.10.21', downloader: 'yt-dlp'}});
                tags_down = true;

                const {child_process, callback} = await youtubedl_api.runYoutubeDL('https://example.com/video', []);

                assert.strictEqual(child_process, null);
                const {parsed_output, err} = await callback;
                assert.strictEqual(parsed_output, null);
                assert(String(err).includes('yt-dlp'), String(err));
            });

            it('An update check keeps the binary when no release can be determined', async function() {
                for (const python_version of ['3.10.12', '3.12.3']) {
                    setPython(python_version);
                    requested_paths = [];
                    log_lines = [];
                    const binary_path = path.join('appdata', 'bin', 'yt-dlp');
                    installPrevious(binary_path, '2026.10.21');
                    tags_down = true;

                    await youtubedl_api.checkForYoutubeDLUpdate();

                    assert(!requested_paths.some(url => url.startsWith('/latest/') || url.startsWith('/download/')), requested_paths.join(', '));
                    assert.strictEqual(fs.readFileSync(binary_path, 'utf8'), previous_script);
                    assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
                    const errors = log_lines.filter(line => line.startsWith('error:'));
                    assert(errors.some(line => line.includes(`Python ${python_version}`)), errors.join('\n'));
                }
            });
        });

        it('An update check on Python 3.10 swaps a binary that cannot run for the newest one that can', async function() {
            setPython('3.10.12');
            const binary_path = path.join('appdata', 'bin', 'yt-dlp');
            // the state of the outage: the newest release is installed, and does not run here
            fs.ensureDirSync(path.dirname(binary_path));
            fs.writeFileSync(binary_path, fakeBinary('2026.10.26'), {mode: 0o755});
            fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, {'yt-dlp': {version: '2026.10.26', downloader: 'yt-dlp'}});
            broken_releases.add('2026.10.26');

            await youtubedl_api.checkForYoutubeDLUpdate();

            assert.strictEqual(execFileSync(binary_path, ['--version']).toString().trim(), '2026.10.21');
            assert.strictEqual(readDetails()['yt-dlp']['version'], '2026.10.21');
            assert(!requested_paths.includes('/download/2026.10.26/yt-dlp'), requested_paths.join(', '));
        });
    });
});

const generateEmptyVideoFile = async (file_path) => {
    if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    return await exec(`ffmpeg -t 1 -f lavfi -i color=c=black:s=640x480 -c:v libx264 -tune stillimage -pix_fmt yuv420p "${file_path}"`);
}

const generateEmptyAudioFile = async (file_path) => {
    if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    return await exec(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame ${file_path}`);
}