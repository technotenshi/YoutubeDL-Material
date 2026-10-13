/* eslint-disable no-undef */
/*
Live-network checks. These call real services (YouTube, Twitch, GitHub releases) and are expected
to break when those services change or block automated clients, so they are NOT part of `npm test`.

Run with `npm run test:live` from backend/. In CI this runs from .github/workflows/live-checks.yml
on a schedule and on demand, never on pull requests, and never gates a merge.

Offline coverage of the same code paths lives in test/tests.js, using the fixtures in test/fixtures.
*/
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const youtubedl_api = require('../../youtube-dl');
const downloader_api = require('../../downloader');
const twitch_api = require('../../twitch');
const config_api = require('../../config');
const CONSTS = require('../../consts');

const options = {
    ui_uid: uuid()
};

describe('Live - YouTube', function() {
    this.timeout(300000);
    const video_url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const playlist_url = 'https://www.youtube.com/playlist?list=PLbZT16X07RLhqK-ZgSkRuUyiz9B_WLdNK';

    it('Get video info', async function() {
        const args = await downloader_api.generateArgs(video_url, 'video', options, null, true);
        const info = await downloader_api.getVideoInfoByURL(video_url, args);
        assert(!!info && info.length > 0);
        assert(info[0]['id'] === 'jNQXAC9IVRw');
    });

    it('Get playlist info', async function() {
        const args = await downloader_api.generateArgs(playlist_url, 'video', options, null, true);
        const info = await downloader_api.getVideoInfoByURL(playlist_url, args);
        assert(!!info && info.length > 1);
    });
});

describe('Live - youtube-dl binary', function() {
    this.timeout(300000);
    beforeEach(async function () {
        if (fs.existsSync(CONSTS.DETAILS_BIN_PATH)) fs.unlinkSync(CONSTS.DETAILS_BIN_PATH);
        await youtubedl_api.checkForYoutubeDLUpdate();
    });

    it('Check latest version', async function() {
        const original_fork = config_api.getConfigItem('ytdl_default_downloader');
        const latest_version = await youtubedl_api.getLatestUpdateVersion(original_fork);
        assert(latest_version > CONSTS.OUTDATED_YOUTUBEDL_VERSION);
    });

    it('Update youtube-dl', async function() {
        const original_fork = config_api.getConfigItem('ytdl_default_downloader');
        const binary_path = path.join('test', 'test_binary');
        for (const youtubedl_fork in youtubedl_api.youtubedl_forks) {
            config_api.setConfigItem('ytdl_default_downloader', youtubedl_fork);
            const latest_version = await youtubedl_api.checkForYoutubeDLUpdate();
            await youtubedl_api.updateYoutubeDL(latest_version, binary_path);
            assert(fs.existsSync(binary_path));
            if (fs.existsSync(binary_path)) fs.unlinkSync(binary_path);
        }
        config_api.setConfigItem('ytdl_default_downloader', original_fork);
    });

    it('Run process', async function() {
        const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
        const args = await downloader_api.generateArgs(url, 'video', {}, null, true);
        const {child_process} = await youtubedl_api.runYoutubeDL(url, args);
        assert(child_process);
    });
});

describe('Live - Twitch', function() {
    this.timeout(300000);
    // Twitch deletes most past broadcasts after 60 days, so this ID will expire.
    // Pick a current one and set LIVE_TWITCH_VOD_ID (or update the default) when it does.
    const vod_id = process.env.LIVE_TWITCH_VOD_ID || '2888890850';
    const chat_path = path.join('test', 'live_sample.twitch_chat.json');

    afterEach(function() {
        if (fs.existsSync(chat_path)) fs.unlinkSync(chat_path);
    });

    it('Download VOD chat', async function() {
        const chat = await twitch_api.downloadTwitchChatByVODID(vod_id, 'live_sample', null, null, null, './test');
        assert(Array.isArray(chat) && chat.length > 0);
        assert(fs.existsSync(chat_path));
    });
});
