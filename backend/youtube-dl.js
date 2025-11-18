const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');
const execa = require('execa');
const kill = require('tree-kill');

const logger = require('./logger');
const utils = require('./utils');
const CONSTS = require('./consts');
const config_api = require('./config.js');

const is_windows = process.platform === 'win32';

exports.youtubedl_forks = {
    'youtube-dl': {
        'download_url': 'https://github.com/ytdl-org/youtube-dl/releases/latest/download/youtube-dl',
        'tags_url': 'https://api.github.com/repos/ytdl-org/youtube-dl/tags'
    },
    'youtube-dlc': {
        'download_url': 'https://github.com/blackjack4494/yt-dlc/releases/latest/download/youtube-dlc',
        'tags_url': 'https://api.github.com/repos/blackjack4494/yt-dlc/tags'
    },
    'yt-dlp': {
        'download_url': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
        'tags_url': 'https://api.github.com/repos/yt-dlp/yt-dlp/tags'
    }
}

exports.runYoutubeDL = async (url, args, customDownloadHandler = null) => {
    logger.info(`Preparing to download URL '${url}' (${args.length} args) using ${customDownloadHandler ? 'custom handler' : 'default process'}.`);
    const output_file_path = getYoutubeDLPath();
    if (!fs.existsSync(output_file_path)) {
        logger.info('Binary missing locally, triggering update check before running youtube-dl.');
        await exports.checkForYoutubeDLUpdate();
    }
    let callback = null;
    let child_process = null;
    if (customDownloadHandler) {
        logger.debug('Invoking custom youtube-dl handler.');
        callback = runYoutubeDLCustom(url, args, customDownloadHandler);
    } else {
        ({callback, child_process} = await runYoutubeDLProcess(url, args));
    }

    return {child_process, callback};
}

// Run youtube-dl directly (not cancellable)
const runYoutubeDLCustom = async (url, args, customDownloadHandler) => {
    const downloadHandler = customDownloadHandler;
    return new Promise(resolve => {
        downloadHandler(url, args, {maxBuffer: Infinity}, async function(err, output) {
            const parsed_output = utils.parseOutputJSON(output, err);
            if (err) {
                logger.error(`Custom handler download failed for URL '${url}': ${err}`);
            } else {
                logger.info(`Custom handler finished download for URL '${url}'.`);
            }
            resolve({parsed_output, err});
        });
    });
}

// Run youtube-dl in a subprocess (cancellable)
const runYoutubeDLProcess = async (url, args, youtubedl_fork = config_api.getConfigItem('ytdl_default_downloader')) => {
    const youtubedl_path = getYoutubeDLPath(youtubedl_fork);
    const binary_exists = fs.existsSync(youtubedl_path);
    if (!binary_exists) {
        const err = `Could not find path for ${youtubedl_fork} at ${youtubedl_path}`;
        logger.error(err);
        return;
    }
    logger.info(`Spawning ${youtubedl_fork} process for URL '${url}' with ${args.length} args.`);
    const child_process = execa(getYoutubeDLPath(youtubedl_fork), [url, ...args], {maxBuffer: Infinity});
    const callback = new Promise(async resolve => {
        try {
            const {stdout, stderr} = await child_process;
            const parsed_output = utils.parseOutputJSON(stdout.trim().split(/\r?\n/), stderr);
            logger.info(`youtube-dl process for '${url}' completed successfully.`);
            resolve({parsed_output, err: stderr});
        } catch (e) {
            logger.error(`youtube-dl process for '${url}' exited with error.`);
            logger.error(e);
            resolve({parsed_output: null, err: e})
        }
    });
    return {child_process, callback}
}

function getYoutubeDLPath(youtubedl_fork = config_api.getConfigItem('ytdl_default_downloader')) {
    const binary_file_name = youtubedl_fork + (is_windows ? '.exe' : '');
    const binary_path = path.join('appdata', 'bin', binary_file_name);
    return binary_path;
}

exports.killYoutubeDLProcess = async (child_process) => {
    if (!child_process) {
        logger.warn('killYoutubeDLProcess called without a valid child process.');
        return;
    }
    logger.info(`Killing youtube-dl process with pid ${child_process.pid}.`);
    kill(child_process.pid, 'SIGKILL');
}

exports.checkForYoutubeDLUpdate = async () => {
    logger.info('Checking for youtube-dl binary updates.');
    const selected_fork = config_api.getConfigItem('ytdl_default_downloader');
    const output_file_path = getYoutubeDLPath();
    // get current version
    let current_app_details_exists = fs.existsSync(CONSTS.DETAILS_BIN_PATH);
    if (!current_app_details_exists[selected_fork]) {
        logger.warn(`Failed to get youtube-dl binary details at location '${CONSTS.DETAILS_BIN_PATH}'. Generating file...`);
        updateDetailsJSON(CONSTS.OUTDATED_YOUTUBEDL_VERSION, selected_fork, output_file_path);
    }
    const current_app_details = JSON.parse(fs.readFileSync(CONSTS.DETAILS_BIN_PATH));
    const current_version = current_app_details[selected_fork]['version'];
    const current_fork = current_app_details[selected_fork]['downloader'];

    const latest_version = await exports.getLatestUpdateVersion(selected_fork);
    // if the binary does not exist, or default_downloader doesn't match existing fork, or if the fork has been updated, redownload
    // TODO: don't redownload if fork already exists
    if (!fs.existsSync(output_file_path) || current_fork !== selected_fork || !current_version || current_version !== latest_version) {
        logger.warn(`Updating ${selected_fork} binary to '${output_file_path}', downloading...`);
        await exports.updateYoutubeDL(latest_version);
    } else {
        logger.info(`${selected_fork} binary already at latest version ${current_version}.`);
    }
}

exports.updateYoutubeDL = async (latest_update_version, custom_output_path = null) => {
    logger.info(`Updating youtube-dl binary to version ${latest_update_version}.`);
    await fs.ensureDir(path.join('appdata', 'bin'));
    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    await downloadLatestYoutubeDLBinaryGeneric(default_downloader, latest_update_version, custom_output_path);
    logger.info(`youtube-dl binary update complete for version ${latest_update_version}.`);
}

async function downloadLatestYoutubeDLBinaryGeneric(youtubedl_fork, new_version, custom_output_path = null) {
    const file_ext = is_windows ? '.exe' : '';

    // build the URL
    const download_url = `${exports.youtubedl_forks[youtubedl_fork]['download_url']}${file_ext}`;
    const output_path = custom_output_path || getYoutubeDLPath(youtubedl_fork);

    try {
        logger.info(`Downloading ${youtubedl_fork} binary version ${new_version} from ${download_url}.`);
        await utils.fetchFile(download_url, output_path, `${youtubedl_fork} ${new_version}`);
        fs.chmod(output_path, 0o777);

        updateDetailsJSON(new_version, youtubedl_fork, output_path);
        logger.info(`Successfully downloaded ${youtubedl_fork} version ${new_version} to ${output_path}.`);
    } catch (e) {
        logger.error(`Failed to download new ${youtubedl_fork} version: ${new_version}`);
        logger.error(e);
        return;
    }
} 

exports.getLatestUpdateVersion = async (youtubedl_fork) => {
    const tags_url = exports.youtubedl_forks[youtubedl_fork]['tags_url'];
    logger.info(`Checking ${youtubedl_fork} repository for the latest release.`);
    return new Promise(resolve => {
        fetch(tags_url, {method: 'Get'})
        .then(async res => res.json())
        .then(async (json) => {
            if (!json || !json[0]) {
                logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
                resolve(null);
                return;
            }
            const latest_update_version = json[0]['name'];
            logger.info(`Latest ${youtubedl_fork} version detected: ${latest_update_version}.`);
            resolve(latest_update_version);
        })
        .catch(err => {
            logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
            logger.error(err);
            resolve(null);
        });
    });
}

function updateDetailsJSON(new_version, fork, output_path) {
    const file_ext = is_windows ? '.exe' : '';
    const details_json = fs.existsSync(CONSTS.DETAILS_BIN_PATH) ? fs.readJSONSync(CONSTS.DETAILS_BIN_PATH) : {};
    if (!details_json[fork]) details_json[fork] = {};
    const fork_json = details_json[fork];
    fork_json['version'] = new_version;
    fork_json['downloader'] = fork;
    fork_json['path'] = output_path; // unused
    fork_json['exec'] = fork + file_ext; // unused
    fs.writeJSONSync(CONSTS.DETAILS_BIN_PATH, details_json);
    logger.debug(`Updated binary details JSON for fork ${fork} (${new_version}).`);
}
