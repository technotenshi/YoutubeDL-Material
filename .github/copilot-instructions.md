# Copilot instructions

Read `AGENTS.md` first. It covers the code map, commands, fork context, and working agreements. This file adds only review guidance that `AGENTS.md` does not state.

## Fork ground rules

- This fork has no release package and no supported Docker image for now. A manual workflow run pushes a development build (`nightly` and `sha-<commit>` tags) to the fork's ghcr namespace (#19). That package is public. The README says it is not a release.
- There is no supported standalone `docker-compose.yml`. The file in the repository root builds from the local `Dockerfile` and only works inside a clone. Do not ask for a published image reference or for the compose file to be released on its own.
- Links to upstream are intentional. Do not ask to repoint or remove them without a stated reason.

## Do not review as source

Skip generated files (translation JSON from `src/postbuild.mjs`, built frontend output) and runtime data when reviewing code. `AGENTS.md` says they stay out of commits, so flag any change that adds them instead of commenting on their contents.

## Verify before commenting

Check every claim about the README, other docs, or workflows against the current head of the pull request before commenting. Earlier review comments on this repository described text and workflow behavior that had already changed. Skip a comment if the current head no longer matches it.
