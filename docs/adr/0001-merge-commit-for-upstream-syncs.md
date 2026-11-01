---
status: accepted
---

# Merge upstream syncs with a merge commit

PR #10 squash merged 16 Upstream commits into one fork commit. The files matched Upstream exactly, but git no longer saw those commits as merged, so the next Upstream sync would have replayed them. The `main` ruleset and the repo settings allowed only squash, so the GitHub button could not avoid this. Upstream syncs are now merged with "Create a merge commit" so Upstream's commits stay ancestors of `main`. Every other pull request stays squash.

## Considered options

- Squash only, with a rebase of fork commits onto Upstream at each sync. History stays fully linear, but each sync needs a force-push to `main` with the ruleset switched off and on, and every fork commit changes SHA each time.
- Squash only, accepting the loss. Rejected: it is the problem this decision fixes.

## Consequences

- `main` is linear except at Upstream sync points, where a merge commit appears. Upstream's own history already contains merge commits.
- The ruleset on `main` now allows `squash` and `merge`, and the repo allows merge commits. Nothing stops a non-sync PR from using a merge commit, so the choice is a convention.
- The Checkpoint is `git merge-base main upstream/master`. It moves only when an Upstream sync PR merges.
- On 2026-10-31 `main` was rebuilt once, with a force-push, to undo PR #10. See `docs/DECISIONS.md`.
