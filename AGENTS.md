# Project instructions

## Working agreements

- Read `~/HARNESS.md` before planning multi-step work. Read `docs/DECISIONS.md` when present; record architectural or operational decisions there.
- Preserve uncommitted work. Destructive Git operations require explicit approval; add remotes or push only when asked.
- Deployments, container restarts, DNS changes, and other infrastructure mutations require explicit approval in the current session.
- Back up before material changes, keep scripts idempotent, and report verification actually performed. Validate Bash changes with `bash -n` and ShellCheck; use `set -Eeuo pipefail`, quote variables, and check installed CLI help before choosing syntax.
- Frame obstacles with a path to resolve or mitigate them.

## Documentation lookup

For library, framework, SDK, API, CLI, or cloud-service questions, use Context7 for current documentation, including syntax, configuration, setup, migration, and library-specific debugging. Start with `resolve-library-id` unless given an exact `/org/project` ID, select the most relevant reputable match (version-specific when requested), then call `query-docs` per concept. Prefer this over web search. General programming, business-logic debugging, refactoring, and code review do not require Context7 solely because libraries appear in the code.

## Fork context

- This repository is a fork of `Tzahi12345/YoutubeDL-Material`; the configured `origin` is `technotenshi/YoutubeDL-Material`. An `upstream` remote (`https://github.com/Tzahi12345/YoutubeDL-Material.git`) tracks the original project's `master` only, with no tags. Check actual remotes before Git operations, and pass `--repo technotenshi/YoutubeDL-Material` to `gh` if its default repo is not the fork.
- Upstream URLs remain in release updating, README links, and container configuration. Preserve attribution and review these references when implementing fork-specific release behavior.
- The in-app updater in `backend/app.js` downloads upstream releases and replaces application files. Account for that behavior when maintaining fork changes.

## Code map

- `src/app/`: Angular 15 / Angular Material frontend. `app-routing.module.ts` defines hash routes; `posts.services.ts` centralizes API requests, shared state, and route guarding.
- `backend/app.js`: Express application, API routes, startup, static frontend serving, and application updates.
- `backend/routes/downloads.js`: the downloads list and single-download request handlers, split out of `app.js` so tests can call them without starting the app.
- `backend/downloader.js`: download queue and lifecycle; `backend/youtube-dl.js`: downloader binaries and invocation.
- `backend/db.js`: local JSON/lowdb and MongoDB storage; `backend/authentication/auth.js`: authentication. Subscriptions, tasks, files, archives, categories, notifications, and Twitch support have adjacent modules.
- `Public API v1.yaml`: API schema. `src/api-types/` contains generated models; update the schema and regenerate models for contract changes rather than editing generated types alone.
- `src/assets/i18n/`: localization sources. `src/postbuild.mjs` runs as the **prebuild** hook and generates localization JSON.
- `Dockerfile`, `docker-utils/`, `backend/entrypoint.sh`, `docker-compose.yml`, and `chart/`: packaging and deployment. `chrome-extension/` and root `main.js` contain browser-extension and Electron integration.

## Development and verification

Consult `DEVELOPMENT.md`, both `package.json` files, `angular.json`, and `.github/workflows/` for commands and configuration. Frontend and backend have separate dependency installs and lockfiles.

- Root `npm run build` builds the frontend into `backend/public/`; its prebuild hook also writes generated localization files. Review resulting changes before committing.
- Root `npm start` serves frontend development; `npm start` from `backend/` runs the backend through globally available PM2. Backend paths are relative to its working directory, so run it from `backend/`.
- Backend config is `backend/appdata/default.json`; `YTDL_MODE=debug` selects `src/assets/default.json`. The backend's `debug` script uses Windows `set` syntax; use the platform-appropriate environment assignment on Unix.
- CI uses Node 16; Docker pins backend Node 16.14.2. Root engine metadata still specifies Node 12.3.1 and conflicts with the rest of the project. Confirm the intended toolchain before changing dependencies or runtime versions.
- Backend `npm test` uses Mocha. Tests create/delete database, log, media, and downloader files, require FFmpeg, and include network-dependent binary checks. Use an isolated disposable backend workspace rather than live instance data. MongoDB cases include skipped tests; a passing suite does not prove both storage modes work.
- Root `npm test` uses Karma/Jasmine; `npm run e2e` uses Protractor. Verify prerequisites before relying on these older configurations.
- Root `npm run lint` references `ng lint`, but `angular.json` currently has no lint target. Report this limitation rather than claiming lint passed.
- Match surrounding formatting when editing existing files; `.editorconfig` specifies spaces and two-space indentation, while several backend files use four spaces. Avoid unrelated formatting churn.
- Keep runtime databases, cookies, downloaded media, logs, installed dependencies, and generated frontend output out of commits. Treat existing ignore rules as a starting point and inspect the final diff.

Initialization scanned source and configuration only; dependencies were absent and builds/tests were not run.

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on `technotenshi/YoutubeDL-Material` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Priority labels

Eisenhower Matrix priorities: `priority:do-now`, `priority:next`, `priority:schedule`, `priority:drop`. Set exactly one when creating or triaging an issue. See `docs/agents/priority-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
