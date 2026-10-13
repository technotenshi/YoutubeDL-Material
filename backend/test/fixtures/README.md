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
