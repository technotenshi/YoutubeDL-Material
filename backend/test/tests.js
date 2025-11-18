/* eslint-disable no-undef */
const assert = require('assert');
const path = require('path');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Downloader', () => {
    let sandbox;
    let downloader;
    let stubs;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        stubs = buildDownloaderStubs(sandbox);
        downloader = proxyquire('../downloader', stubs.overrides);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('createDownload stores a queued download in the DB with defaults applied', async () => {
        const download = await downloader.createDownload('https://example.com/watch?v=1', 'video', { foo: 'bar' }, 'user-123');

        sinon.assert.calledOnce(stubs.db.insertRecordIntoTable);
        const [, insertedRecord] = stubs.db.insertRecordIntoTable.firstCall.args;
        assert.strictEqual(insertedRecord.url, 'https://example.com/watch?v=1');
        assert.strictEqual(insertedRecord.user_uid, 'user-123');
        assert.strictEqual(insertedRecord.type, 'video');
        assert.strictEqual(download.uid, insertedRecord.uid);
    });

    it('downloadQueuedFile registers downloaded metadata and triggers Twitch chat download when enabled', async () => {
        const fileFolderPath = path.join(stubs.configValues.ytdl_users_base_path, 'demo', 'video');
        const absoluteFile = path.join(fileFolderPath, 'Sample Video.mp4');

        const downloadRecord = {
            uid: 'download-1',
            url: 'https://www.twitch.tv/videos/12345',
            type: 'video',
            paused: false,
            options: { customFileFolderPath: null, cropFileSettings: null },
            args: ['--print-json'],
            category: null,
            user_uid: 'demo',
            sub_id: null,
            files_to_check_for_progress: []
        };
        stubs.db.getRecord.resolves(downloadRecord);

        stubs.fs.existsSync.withArgs(absoluteFile).returns(true);
        stubs.utils.removeFileExtension.callsFake(filename => filename.replace('.mp4', ''));

        const parsed_output = [{
            _filename: absoluteFile,
            title: 'Sample Video',
            uploader: 'Uploader',
            extractor: 'twitch',
            id: 'vod123'
        }];

        stubs.ytdl.runYoutubeDL.resolves({
            child_process: { pid: 42 },
            callback: Promise.resolve({ parsed_output, err: null })
        });

        stubs.files.registerFileDB.resolves({ uid: 'file-001' });

        const intervalStub = sandbox.stub(global, 'setInterval').returns('interval-id');
        const clearIntervalStub = sandbox.stub(global, 'clearInterval');

        const result = await downloader.downloadQueuedFile(downloadRecord.uid);

        assert.deepStrictEqual(result, ['file-001']);
        sinon.assert.calledWith(intervalStub, sinon.match.func, 1000);
        sinon.assert.calledWith(clearIntervalStub, 'interval-id');
        sinon.assert.calledOnce(stubs.twitch.downloadTwitchChatByVODID);

        const expectedFilePathNoExt = absoluteFile.replace('.mp4', '');
        const expectedFileName = expectedFilePathNoExt.substring(fileFolderPath.length, expectedFilePathNoExt.length);
        sinon.assert.calledWith(
            stubs.twitch.downloadTwitchChatByVODID,
            '12345',
            expectedFileName,
            'video',
            'demo'
        );
        sinon.assert.calledOnce(stubs.files.registerFileDB);
        sinon.assert.calledOnce(stubs.archive.addToArchive);
        sinon.assert.calledOnce(stubs.notifications.sendDownloadNotification);

        const finalUpdateCall = stubs.db.updateRecord.getCall(stubs.db.updateRecord.callCount - 1);
        assert.strictEqual(finalUpdateCall.args[0], 'download_queue');
        assert.deepStrictEqual(finalUpdateCall.args[1], { uid: downloadRecord.uid });
        assert.strictEqual(finalUpdateCall.args[2].finished, true);
    });
});

describe('youtube-dl binary updates', () => {
    let sandbox;
    let ytdl;
    let stubs;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        stubs = buildYoutubeDLStubs(sandbox);
        ytdl = proxyquire('../youtube-dl', stubs.overrides);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('updateYoutubeDL downloads the binary and updates metadata atomically', async () => {
        await ytdl.updateYoutubeDL('2024.04.01');

        sinon.assert.calledWith(stubs.fs.ensureDir, path.join('appdata', 'bin'));
        sinon.assert.calledWith(
            stubs.utils.fetchFile,
            'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
            path.join('appdata', 'bin', 'yt-dlp'),
            'yt-dlp 2024.04.01'
        );
        sinon.assert.calledWith(stubs.fs.chmod, path.join('appdata', 'bin', 'yt-dlp'), 0o777);
        sinon.assert.calledWith(
            stubs.fs.writeJSONSync,
            'details.json',
            sinon.match({
                'yt-dlp': sinon.match({
                    version: '2024.04.01',
                    downloader: 'yt-dlp'
                })
            })
        );
    });
});

function buildDownloaderStubs(sandbox) {
    const logger = createLoggerStub(sandbox);

    const configValues = {
        ytdl_audio_folder_path: path.join('/tmp', 'audio'),
        ytdl_video_folder_path: path.join('/tmp', 'video'),
        ytdl_users_base_path: path.join('/tmp', 'users'),
        ytdl_twitch_auto_download_chat: true,
        ytdl_generate_nfo_files: false,
        ytdl_custom_args: '',
        ytdl_default_file_output: '%(title)s',
        ytdl_include_thumbnail: false,
        ytdl_download_rate_limit: null,
        ytdl_default_downloader: 'yt-dlp',
        ytdl_use_default_downloading_agent: true,
        ytdl_custom_downloading_agent: null,
        ytdl_use_cookies: false,
        ytdl_max_concurrent_downloads: 2
    };

    const config = {
        getConfigItem: sandbox.stub().callsFake(key => configValues[key]),
        setConfigItem: sandbox.stub()
    };

    const db = {
        database_initialized: false,
        database_initialized_bs: { subscribe: sandbox.stub().returns({ unsubscribe: () => {} }) },
        insertRecordIntoTable: sandbox.stub().resolves(true),
        getRecord: sandbox.stub().resolves(null),
        getRecords: sandbox.stub().resolves([]),
        updateRecord: sandbox.stub().resolves(true),
        removeRecord: sandbox.stub().resolves(true),
        removeAllRecords: sandbox.stub().resolves(true),
        pushToRecordsArray: sandbox.stub().resolves(true),
        pullFromRecordsArray: sandbox.stub().resolves(true),
        bulkInsertRecordsIntoTable: sandbox.stub().resolves(true)
    };

    const fs = {
        ensureDirSync: sandbox.stub(),
        ensureDir: sandbox.stub().resolves(),
        existsSync: sandbox.stub().returns(false),
        pathExists: sandbox.stub().resolves(false),
        renameSync: sandbox.stub(),
        chmod: sandbox.stub(),
        writeJSONSync: sandbox.stub(),
        readJSONSync: sandbox.stub().returns({}),
        readFileSync: sandbox.stub().returns('{}'),
        writeFileSync: sandbox.stub(),
        readdir: sandbox.stub(),
        statSync: sandbox.stub().returns({ size: 0 })
    };

    const utils = {
        removeFileExtension: sandbox.stub().callsFake(filepath => filepath),
        getExpectedFileSize: sandbox.stub().returns(0),
        cropFile: sandbox.stub().resolves(),
        formatDateString: sandbox.stub().returns('2020-01-01'),
        injectArgs: sandbox.stub().callsFake((args) => args),
        filterArgs: sandbox.stub().callsFake((args) => args),
        searchObjectByString: sandbox.stub(),
        fetchFile: sandbox.stub(),
        parseOutputJSON: sandbox.stub(),
        wait: sandbox.stub().resolves()
    };

    const files = {
        registerFileDB: sandbox.stub().resolves({ uid: 'file-001' }),
        createPlaylist: sandbox.stub().resolves({ uid: 'playlist-001' })
    };

    const archive = {
        addToArchive: sandbox.stub().resolves()
    };

    const twitch = {
        downloadTwitchChatByVODID: sandbox.stub().resolves()
    };

    const notifications = {
        sendDownloadNotification: sandbox.stub()
    };

    const ytdl = {
        runYoutubeDL: sandbox.stub().resolves({ child_process: null, callback: Promise.resolve({ parsed_output: [], err: null }) }),
        killYoutubeDLProcess: sandbox.stub()
    };

    const nodeId3 = { write: sandbox.stub().returns(true) };
    const categories = { categorize: sandbox.stub().resolves(null) };

    const overrides = {
        './logger': logger,
        './db': db,
        './config': config,
        './twitch': twitch,
        './utils': utils,
        './files': files,
        './notifications': notifications,
        './archive': archive,
        './youtube-dl': ytdl,
        './categories': categories,
        './consts': { DETAILS_BIN_PATH: 'details.json', OUTDATED_YOUTUBEDL_VERSION: '0' },
        'fs-extra': fs,
        'node-id3': nodeId3,
        'xmlbuilder2': { create: sandbox.stub().returns({ end: () => '<xml />' }) }
    };

    return { overrides, db, fs, utils, files, archive, twitch, notifications, ytdl, config, configValues };
}

function buildYoutubeDLStubs(sandbox) {
    const logger = createLoggerStub(sandbox);
    const fs = {
        ensureDir: sandbox.stub().resolves(),
        existsSync: sandbox.stub().returns(false),
        readJSONSync: sandbox.stub().returns({}),
        writeJSONSync: sandbox.stub(),
        chmod: sandbox.stub()
    };
    const utils = {
        fetchFile: sandbox.stub().resolves()
    };
    const config = {
        getConfigItem: sandbox.stub().callsFake((key) => {
            if (key === 'ytdl_default_downloader') return 'yt-dlp';
            return null;
        })
    };

    const overrides = {
        './logger': logger,
        'fs-extra': fs,
        './utils': utils,
        './config.js': config,
        './consts': { DETAILS_BIN_PATH: 'details.json', OUTDATED_YOUTUBEDL_VERSION: '0' }
    };

    return { overrides, fs, utils };
}

function createLoggerStub(sandbox) {
    return {
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
        debug: sandbox.stub(),
        verbose: sandbox.stub()
    };
}
