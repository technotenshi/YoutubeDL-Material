# Copilot instructions

Read `AGENTS.md` first. It covers the code map, commands, and working agreements. This file adds only the ground rules that `AGENTS.md` does not state.

## Fork ground rules

- This fork publishes no Docker image and no release package for now.
- There is no supported standalone `docker-compose.yml`. The file in the repository root builds from the local `Dockerfile` and only works inside a clone. Do not ask for a published image reference or for the compose file to be released on its own.
- Upstream attribution is preserved on purpose. Links to `Tzahi12345/YoutubeDL-Material` are intentional where attribution requires them. Do not ask to repoint or remove them without a stated reason.

## Do not review as source

- Generated files: translation JSON produced by `src/postbuild.mjs`, and built frontend output in `backend/public/`.
- Runtime data: databases, cookies, downloaded media, and logs.
- Flag any change that commits generated files or runtime data. They must never be committed.

## Verify before commenting

Check every claim about the README, other docs, or workflows against the current head of the pull request before commenting. Earlier review comments on this repository described text and workflow behavior that had already changed. Skip a comment if the current head no longer matches it.
