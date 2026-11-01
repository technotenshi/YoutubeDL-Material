# Test fixtures

These keep `npm test` offline. Live-service checks are in `../live/` and run with `npm run test:live`.

## ytdlp/video.info.json and ytdlp/playlist.info.json

Recorded output of `getVideoInfoByURL` (yt-dlp `--dump-json`), one array element per entry.

- Tool: yt-dlp 2026.08.19 (`_version.version` in each entry)
- Captured: 2026-10-12, by calling `downloader.getVideoInfoByURL` with the arguments `generateArgs(url, 'video', options, null, true)` produces
- Video: https://www.youtube.com/watch?v=jNQXAC9IVRw
- Playlist: https://www.youtube.com/playlist?list=PLbZT16X07RLhqK-ZgSkRuUyiz9B_WLdNK (2 entries, the first two available when captured)

Trimmed after capture to keep the files small and free of expiring signed URLs. Removed top-level keys: `requested_formats`, `thumbnails`, `automatic_captions`, `subtitles`, `requested_subtitles`, `heatmap`, `chapters`, `_format_sort_fields`. In `formats`, only the entries named by `format_id` remain, without `url`, `manifest_url`, `fragment_base_url`, `fragments`, `http_headers`, `downloader_options`. Everything else is as yt-dlp emitted it, including the `description` of the video, which is unrelated to the video itself because the uploader set it that way. The app reads `format_id`, `formats[].filesize`, `title`, `_filename`, `webpage_url` and the other kept fields.

To refresh: run `getVideoInfoByURL` for each URL against current yt-dlp, trim as above, and update the version and date here.

## twitch/chatdownload.json

Hand-written sample in the shape `TwitchDownloaderCLI chatdownload` writes (`comments[].content_offset_seconds`, `commenter.name`, `message.body`, `message.user_color`). It is not a recording of a real VOD; the names are placeholders. It covers only the fields `twitch.js` reads.

## ytdlp/playlist-slicing.sh

Not a fixture the tests read: the recipe behind the stub's `with_max_downloads` branch in `test/tests.js` (`Adding a subscription`). It runs a real yt-dlp (2026.10.26) in a throwaway container against a local RSS feed whose first item is a 404 and whose other items are playable, and prints exit code and entry count for the add command and its variants. Recorded 2026-11-01:

- `--dump-json` (no limit): exit 1, 2 entries.
- `--dump-json --playlist-end 1` (what the app asks for when adding a subscription): exit 1, 0 entries. The unavailable first item uses up the one slot.
- `--dump-json --playlist-end 2`: exit 1, 1 entry.
- `--dump-json --max-downloads 1`: exit 101, 1 entry (the first item that can be extracted; 101 means the limit was reached).

The feed uses yt-dlp's generic extractor, not YouTube. Playlist slicing and per-entry error handling are in yt-dlp's core, but a real YouTube playlist with an unavailable first video has not been run.
