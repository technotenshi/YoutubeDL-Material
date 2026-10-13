# Decision log

## 2026-10-12 — Prepare pinned upstream synchronization on a separate branch

- Created `sync/upstream-master` from local `main` at `100e6f81746c7e0a1219762a61fff30bd7c4d23b`, then fast-forwarded only the new branch to `28234c0d4ba65059be18f3692f6f5e5b1170b1a6` after isolated validation. Fetched the pinned commit directly from `https://github.com/Tzahi12345/YoutubeDL-Material.git`, without adding a remote.
- Confirmed the original commit is an ancestor of the pin and the diff contains exactly nine expected files: `README.md` and XLF catalogs for `cs`, `et`, `hu`, `is`, `pt-BR`, `ru`, `tr`, and `zh-Hant`. No dependency, workflow, backend, or runtime changes were introduced.
- Validation used a temporary detached worktree, checksum-verified Node 16.20.2 for Darwin x64, npm 9.9.4, and a separate temporary npm cache. Parsed all eight XLF files successfully; translation IDs are unique in the seven populated changed catalogs.
- Plain `npm ci --no-audit --no-fund` failed on both the pinned and original commits with identical lockfile errors (`Missing: ajv@6.15.0 from lock file`, twice). The package manifest and lockfile are byte-identical across these commits. Per npm documentation, retried the pinned commit using `npm ci --legacy-peer-deps --no-audit --no-fund`: passed, installing 1,417 packages. This temporary compatibility option does not enforce peer dependency contracts. No `.npmrc`, manifest, lockfile, or dependency upgrades were made.
- `npm run build` passed, including the `prebuild` localization conversion and production Angular build (build hash `afb81c9e190bdc2b`). It emitted non-fatal engine/deprecation, unsupported legacy browser, Material theme/Sass, CSS selector, and CommonJS optimization warnings. No backend or browser tests were run; the changed scope is README/localization only.
- Parsed all 31 packaged translation/support JSON files and confirmed each generated source JSON matches its packaged counterpart. All seven populated changed locales are present in `supported_locales.json`; the empty Icelandic template is excluded from that list (its empty JSON asset is still packaged). There are 28 supported locales total. The English source JSON is absent as expected.
- Review: Standards axis found no violations or code smells. Spec/content axis flagged a known upstream localization defect: two newly translated Estonian entries, “Add an arg” and “Arg”, contain Chinese text (`新增參數`, `參數`; `src/assets/i18n/messages.et.xlf:2177` and `:2186`). The population/packaging checks still pass. Preserved these labels to retain the exact requested upstream commit; correcting them would require a separate follow-up change.
- Security verification: gitleaks scanned copies of all nine changed files with redaction enabled, finding no leaks. Semgrep `p/default` with `--metrics=off --error` scanned all nine files using 47 applicable rules, finding no issues. Semgrep initially failed certificate discovery; setting `SSL_CERT_FILE=/etc/ssl/cert.pem` allowed it to complete.
- Verified `main`, `master`, and `update` retain their recorded original tips and `AGENTS.md` retains SHA-256 `41c2eca953fd39b76eeea429ac23399810f2a6421c97e558e7fc81d230a2fbd9`. `git diff --check` is clean. This decision log remains uncommitted on the sync branch for review. No push, PR, deployment, or infrastructure mutation was performed.
- Removed the temporary validation worktree normally without force, then removed its temporary tools, cache, generated output, logs, and backup copy after verification.

Documentation for the compatibility option: [npm ci](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-ci.md).

## 2026-10-12 — Open fork PR and preserve linear main history

- User confirmed `sync/upstream-master` was pushed and authorized creating a PR into this fork's `main`.
- Created https://github.com/technotenshi/YoutubeDL-Material/pull/10 with head `sync/upstream-master` at `28234c0d4ba65059be18f3692f6f5e5b1170b1a6` and base `main` at `100e6f81746c7e0a1219762a61fff30bd7c4d23b`. GitHub reports the expected nine-file diff and 16 commits ahead, zero behind.
- User prefers linear history. The PR description requests a squash merge into `main`, since the sync branch retains upstream merge commits. No merge or auto-merge was performed; merge method is selected when merging.
- Included the previous local validation results and known Estonian translation issue in the PR description. This decision log remains local and uncommitted.

## 2026-10-12 Keep default backend mocha offline, move live checks to a separate workflow (#37)

- `npm test` in `backend/` no longer calls YouTube, Twitch, or GitHub release endpoints. YouTube metadata comes from recorded yt-dlp output in `backend/test/fixtures/ytdlp/` (provenance in `backend/test/fixtures/README.md`). The Twitch chat test substitutes the CLI invocation and asserts on the command built and on how the output file is handled.
- Seams: `getVideoInfoByURL(url, args, download_uid, customInfoHandler)` mirrors the custom handler the download step already used; `downloadTwitchChatByVODID(..., customCLIRunner)` stands in for TwitchDownloaderCLI. `runYoutubeDL` now checks for or downloads the yt-dlp binary only when it will spawn it, so a custom handler works on a clean checkout.
- The tests that need the network (yt-dlp binary update checks, running the real process, live video, playlist and Twitch VOD) live in `backend/test/live/` and run with `npm run test:live`. The `youtube-dl` describe block moved there as a whole because its tests reach GitHub and YouTube.
- `.github/workflows/live-checks.yml` runs them weekly and on demand, never on pull requests, with `contents: read`, and `continue-on-error`. The Twitch VOD ID expires with Twitch's retention window; override with `LIVE_TWITCH_VOD_ID` or update the default.
- Mocha stays informational, not a required status check. The job name `Backend - mocha (16)` is unchanged.
- Verified by running the full suite on Node 16.20.2 with all network denied through macOS `sandbox-exec` and no yt-dlp binary present: 66 passing, 0 failing. The live YouTube and binary checks were run once with network and passed. The live Twitch check was not run, because TwitchDownloaderCLI is not available for this host; the GitHub runner installs it.
- Follow-up on PR #38: the mocha job failed before running any test, in the archived `FedericoCarboni/setup-ffmpeg@v3` step ("Failed to read version from readme"). The same step failed on `main` and on every earlier run, so the tests had never reached CI. `mocha.yml` now installs ffmpeg from the runner's apt packages instead. The job name is unchanged.

## 2026-10-12 Add repo-wide Copilot instructions (#27)

- Added `.github/copilot-instructions.md`, the file GitHub reads for repository-wide Copilot instructions. Copilot reads it from the pull request head branch, so changes to it can be tested in their own PR.
- It holds the ground rules that Copilot's review comments on PR #25 got wrong or stale (a standalone compose install and stale README text), and points to `AGENTS.md` for everything else. See the file for the rules.
- Codex and the standards reviewer both flagged that restating the upstream attribution and commit exclusion rules from `AGENTS.md` breaks the no duplication goal. The file now keeps only the review framing (links to upstream are intentional, skip generated files and runtime data) and issue #27's acceptance criteria were amended to match.
- Length: GitHub removed the 4000 character cap on custom instructions for Copilot code review (changelog, 2026-06-12), so file size is not a constraint.
- Pending: the Copilot review on the PR that adds this file must not repeat the PR #25 claims. Copilot reads the instructions from the head branch, so this is checked before merge. Record the result on #27.

## 2026-10-12 Build workflow runs only for app build inputs

- `.github/workflows/build.yml` (the app build, check name `continuous integration / build`) now runs only when `src/`, `backend/`, the root package files, `angular.json`, `tsconfig.json`, `.browserslistrc`, or the workflow itself change. Docs and other workflow only changes skip it.
- Dropped the `feat/*` push trigger. It ran the build twice for a PR from a `feat/*` branch, once for the push and once for `pull_request`. Pushes to `main` and `v*` tags still build; path filters are not evaluated for tag pushes, so releases always build.
- No ruleset requires this check, so a skipped run cannot block a merge. If it becomes a required check, a skipped path filtered workflow stays pending and blocks merging.
- `docker-pr.yml` already had its own path filter for the Docker image build. `mocha.yml` and the security workflows still run on every PR.

## 2026-10-12 Add a code-review agent skill for Copilot (#31)

- Added `.github/skills/code-review/SKILL.md`. GitHub documents that a review-focused directory name such as `code-review` is how to make sure Copilot code review reads a skill. It is the path Copilot reads for project skills.
- It is a short checklist of what to look for: untrusted input reaching downloader arguments (#15), the publishing fork guard (#19 to #22), workflow hygiene, docs matching the current head, generated and runtime files, and translations edited in the XLF sources. It links to `AGENTS.md` and `.github/copilot-instructions.md` instead of repeating them, and tells the reviewer to state when there are no critical or high issues.
- `allowed-tools` is omitted on purpose, so the skill pre-approves no shell tools.
- `gh skill publish .github/skills --dry-run` validates it with no errors. It still warns that no tag protection ruleset exists, which is a repository setting and unrelated to the skill. The command only discovers `skills/*/SKILL.md` style layouts, so pass the `.github/skills` directory explicitly.
- Copilot's review of the PR found two overstated rules, both confirmed against the files and fixed. The publishing guard is on the Docker image jobs only: `build.yml` has an unguarded app release job that runs for `v*` tags, and #22 allows an optional Docker Hub mirror with a scoped secret. The trigger rule now covers branch triggers only, because `build.yml` uses `v*` tags and `live-checks.yml` uses a schedule and manual dispatch.
- Pending: a Copilot review of a PR that touches a workflow must show an attribution that names this skill. GitHub's documentation says Copilot code review reads agent skills from the pull request head branch, not the base branch, so this can be checked before merge on a throwaway PR that contains the skill and a workflow change. Reviews are requested manually unless automatic review is enabled (#33). Record the result on #31.
