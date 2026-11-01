const fs = require('fs-extra');
const fetch = require('node-fetch');
const path = require('path');
const execa = require('execa');
const kill = require('tree-kill');
const crypto = require('crypto');
const Mutex = require('async-mutex').Mutex;

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
        'versioned_download_url': 'https://github.com/yt-dlp/yt-dlp/releases/download/{version}/yt-dlp',
        'tags_url': 'https://api.github.com/repos/yt-dlp/yt-dlp/tags'
    }
}

// The oldest Python each release needs, for forks whose downloaded file runs on the system Python.
// A release must satisfy every entry whose `since` it is at or after. Forks not listed have no limit.
const PYTHON_REQUIREMENTS = {
    'yt-dlp': [
        // 2025.10.22 removed Python 3.9 support
        {since: '2025.10.22', min_python: [3, 10]},
        // 2026.10.26 removed Python 3.10 support
        {since: '2026.10.26', min_python: [3, 11]}
    ]
};


exports.runYoutubeDL = async (url, args, customDownloadHandler = null) => {
    let callback = null;
    let child_process = null;
    if (customDownloadHandler) {
        callback = runYoutubeDLCustom(url, args, customDownloadHandler);
    } else {
        // the binary is only needed when we actually spawn it
        const output_file_path = getYoutubeDLPath();
        if (!fs.existsSync(output_file_path)) await exports.checkForYoutubeDLUpdate();
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
        // callers expect the usual result shape, and treat a null output as a failed run
        return {child_process: null, callback: Promise.resolve({parsed_output: null, err: err})};
    }
    const child_process = execa(getYoutubeDLPath(youtubedl_fork), [url, ...args], {maxBuffer: Infinity});
    const callback = new Promise(async resolve => {
        try {
            const {stdout, stderr} = await child_process;
            const parsed_output = utils.parseOutputJSON(stdout.trim().split(/\r?\n/), stderr);
            resolve({parsed_output, err: stderr});
        } catch (e) {
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
    kill(child_process.pid, 'SIGKILL');
}

exports.checkForYoutubeDLUpdate = async () => {
    const selected_fork = config_api.getConfigItem('ytdl_default_downloader');
    const output_file_path = getYoutubeDLPath();
    // get current version
    let has_recorded_details = fs.existsSync(CONSTS.DETAILS_BIN_PATH) && !!fs.readJSONSync(CONSTS.DETAILS_BIN_PATH)[selected_fork];
    if (!has_recorded_details) {
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
    }
}

exports.updateYoutubeDL = async (latest_update_version, custom_output_path = null) => {
    await fs.ensureDir(path.join('appdata', 'bin'));
    const default_downloader = config_api.getConfigItem('ytdl_default_downloader');
    await downloadLatestYoutubeDLBinaryGeneric(default_downloader, latest_update_version, custom_output_path);
}

async function downloadLatestYoutubeDLBinaryGeneric(youtubedl_fork, new_version, custom_output_path = null) {
    const file_ext = is_windows ? '.exe' : '';
    const fork_details = exports.youtubedl_forks[youtubedl_fork];
    const output_path = custom_output_path || getYoutubeDLPath(youtubedl_fork);

    // forks with a release-specific URL are installed as exactly the release that was asked for, and only if it runs
    if (fork_details['versioned_download_url']) {
        await installVerifiedBinary(youtubedl_fork, new_version, output_path);
        return;
    }

    // build the URL
    const download_url = `${fork_details['download_url']}${file_ext}`;

    try {
        await utils.fetchFile(download_url, output_path, `${youtubedl_fork} ${new_version}`);
        fs.chmod(output_path, 0o777);

        updateDetailsJSON(new_version, youtubedl_fork, output_path);
    } catch (e) {
        logger.error(`Failed to download new ${youtubedl_fork} version: ${new_version}`);
        logger.error(e);
        return;
    }
} 

// one install at a time per binary: overlapping installs would share files and could remove each other's work
const install_locks = new Map();

function getInstallLock(output_path) {
    const key = path.resolve(output_path);
    if (!install_locks.has(key)) install_locks.set(key, new Mutex());
    return install_locks.get(key);
}

// Downloads a release to a uniquely named temporary file next to the real one and runs it once to print its version.
// Only a binary that ran is put in place, so a working binary is never replaced by one that cannot run.
async function installVerifiedBinary(youtubedl_fork, release, output_path) {
    const file_ext = is_windows ? '.exe' : '';
    const python_version = await getPythonVersion(youtubedl_fork);
    const python_label = python_version ? `Python ${python_version.join('.')}` : 'a Python of unknown version';
    // without a known release there is nothing safe to install: 'latest' could be one this Python cannot run
    if (!release) {
        logger.error(`Could not determine which ${youtubedl_fork} release to install for ${python_label}. The existing ${youtubedl_fork} binary was kept.`);
        return;
    }
    const download_url = `${exports.youtubedl_forks[youtubedl_fork]['versioned_download_url'].replace('{version}', release)}${file_ext}`;

    await getInstallLock(output_path).runExclusive(async () => {
        // keeps the extension last, since Windows only launches a file that still ends in .exe
        const output_ext = path.extname(output_path);
        const unique_suffix = crypto.randomBytes(6).toString('hex');
        const staging_path = `${output_path.slice(0, output_path.length - output_ext.length)}.${unique_suffix}.download${output_ext}`;
        const backup_path = `${staging_path}.bak`;
        const had_previous = await fs.pathExists(output_path);
        let replaced = false;

        try {
            await utils.fetchFile(download_url, staging_path, `${youtubedl_fork} ${release}`);
            await fs.chmod(staging_path, 0o777);
            await execa(path.resolve(staging_path), ['--version'], {timeout: 60000});

            // the binary and its recorded version change together: if recording fails, the previous binary is put back
            if (had_previous) await fs.copyFile(output_path, backup_path);
            await fs.rename(staging_path, output_path);
            replaced = true;
            updateDetailsJSON(release, youtubedl_fork, output_path);
        } catch (e) {
            logger.error(`Failed to install ${youtubedl_fork} ${release} on ${python_label}: ${e.shortMessage || e.message}. ` +
                         `The previous ${youtubedl_fork} binary was kept.`);
            if (replaced) {
                try {
                    if (had_previous) await fs.rename(backup_path, output_path);
                    else await fs.remove(output_path);
                } catch (restore_error) {
                    logger.error(`Could not put the previous ${youtubedl_fork} binary back at '${output_path}': ${restore_error.message}`);
                }
            }
        } finally {
            await fs.remove(staging_path);
            await fs.remove(backup_path);
        }
    });
}

exports.getLatestUpdateVersion = async (youtubedl_fork) => {
    try {
        let tags_url = exports.youtubedl_forks[youtubedl_fork]['tags_url'];
        let newest_tag = null;
        let python_version = null;
        // tags come newest first; look further back only while every release so far needs a newer Python,
        // until the list ends. A page that was already fetched is not fetched again, so a bad Link header cannot loop.
        const fetched_urls = new Set();
        for (let page = 1; tags_url && !fetched_urls.has(tags_url); page++) {
            fetched_urls.add(tags_url);
            const res = await fetch(tags_url, {method: 'Get'});
            const tags = await res.json();
            if (!tags || !tags[0]) {
                if (page === 1) {
                    logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
                    return null;
                }
                break;
            }
            if (page === 1) {
                newest_tag = tags[0];
                python_version = await getPythonVersion(youtubedl_fork);
            }
            const compatible_tag = tags.find(tag => isRunnableOnPython(youtubedl_fork, tag['name'], python_version));
            if (compatible_tag) {
                if (compatible_tag !== newest_tag) {
                    logger.warn(`${youtubedl_fork} updates are held back to ${compatible_tag['name']} because this container runs Python ${python_version.join('.')}. ` +
                                `Newer releases, such as ${newest_tag['name']}, need a newer Python.`);
                }
                return compatible_tag['name'];
            }
            tags_url = getNextPageUrl(res.headers.get('link'), tags_url);
        }
        logger.error(`No ${youtubedl_fork} release found that runs on Python ${python_version.join('.')}.`);
        return null;
    } catch (err) {
        logger.error(`Failed to check ${youtubedl_fork} version for an update.`)
        logger.error(err);
        return null;
    }
}

// the URL of the next page from a Link header, if there is one on the same host as the current page
function getNextPageUrl(link_header, current_url) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(link_header || '');
    if (!match) return null;
    const next_url = new URL(match[1], current_url);
    return next_url.origin === new URL(current_url).origin ? next_url.href : null;
}

// Python version that runs the downloaded zipapp, as [major, minor, patch], or null when it cannot be told.
// The Windows yt-dlp.exe bundles its own Python, so the system one does not matter there.
async function getPythonVersion(youtubedl_fork) {
    if (!PYTHON_REQUIREMENTS[youtubedl_fork] || is_windows) return null;
    try {
        const {stdout} = await execa('python3', ['--version']);
        const match = stdout.match(/Python (\d+)\.(\d+)(?:\.(\d+))?/);
        return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
    } catch (e) {
        logger.warn(`Could not determine the Python version that runs ${youtubedl_fork}: ${e.shortMessage || e.message}`);
        return null;
    }
}

function isRunnableOnPython(youtubedl_fork, release, python_version) {
    const requirements = PYTHON_REQUIREMENTS[youtubedl_fork];
    if (!requirements || !python_version) return true;
    const applicable = requirements.filter(requirement => compareVersions(release, requirement.since) >= 0);
    return applicable.every(requirement => compareVersions(python_version, requirement.min_python) >= 0);
}

// compares dotted versions (as strings or arrays of numbers) part by part, e.g. '2026.10.26' vs '2026.10.21'
function compareVersions(a, b) {
    const to_parts = (version) => Array.isArray(version) ? version : String(version).split('.').map(Number);
    const parts_a = to_parts(a);
    const parts_b = to_parts(b);
    for (let i = 0; i < Math.max(parts_a.length, parts_b.length); i++) {
        const diff = (parts_a[i] || 0) - (parts_b[i] || 0);
        if (diff !== 0) return Math.sign(diff);
    }
    return 0;
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
    // write beside the file and rename over it, so a failed write cannot leave half a file behind
    const temp_path = `${CONSTS.DETAILS_BIN_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
        fs.writeJSONSync(temp_path, details_json);
        fs.renameSync(temp_path, CONSTS.DETAILS_BIN_PATH);
    } finally {
        fs.removeSync(temp_path);
    }
}
