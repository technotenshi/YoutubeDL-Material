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
