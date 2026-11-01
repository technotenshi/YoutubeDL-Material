# Priority Labels

Priority follows the Eisenhower Matrix. It is a third axis, separate from the category (`bug`, `enhancement`) and the triage state (`needs-triage`, `ready-for-agent`, and the rest in `triage-labels.md`).

Every triaged issue carries exactly one `priority:*` label. Set it when you create or triage the issue. An issue still in `needs-triage` may have no priority yet.

## The matrix

|               | Important                | Not important            |
| ------------- | ------------------------ | ------------------------ |
| **Urgent**     | `priority:do-now`        | `priority:next`          |
| **Not urgent** | `priority:schedule`      | `priority:drop`          |

## Definitions

- **Urgent**: broken in production now (crash, out of memory, data loss), or it has a deadline.
- **Important**: it affects the live ytdl instance, data safety, or security, or it is developer tooling that keeps the fork buildable, testable, reviewable and releasable (CI, tests, image build and publishing, review setup, contributor docs).

If you cannot tell whether something is urgent or important, ask the maintainer rather than guessing.

## Labels

| Label               | Urgent | Important | What to do                                                        |
| ------------------- | ------ | --------- | ----------------------------------------------------------------- |
| `priority:do-now`   | yes    | yes       | Work on it first.                                                 |
| `priority:next`     | yes    | no        | Work on it when no actionable `do-now` issue exists.              |
| `priority:schedule` | no     | yes       | Plan it. Work on it when no actionable `do-now` or `next` exists. |
| `priority:drop`     | no     | no        | Close it, usually as `wontfix`, or leave it until it matters.     |

"Actionable" is defined under "Picking the next issue".

Examples of `priority:drop`: log noise that hides nothing, and platforms the fork does not run on.

Missing detail is not a reason to drop an issue. Label it `needs-info` and keep the priority its known facts support. If you cannot tell how urgent or important it is, ask the maintainer.

## Picking the next issue

This project has one developer, so nobody else can take an issue. An issue is actionable when it is open, has no open blockers, is not `needs-info` or `needs-triage`, and the current worker can do it (an agent session takes `ready-for-agent`; the maintainer can take `ready-for-agent` or `ready-for-human`).

Work the highest priority that has an actionable issue, in this order:

1. `priority:do-now`
2. `priority:next`
3. `priority:schedule`
4. `priority:drop` (normally closed, not worked)

A blocked or waiting issue never holds up lower priorities. If every `do-now` issue is blocked or waiting, move on to `next`, and so on. Say which issues were skipped and why.

## Applying

- When you create an issue, add its `priority:*` label with the category and state labels.
- When you triage an issue, set the priority along with the category and state. If the priority changes later, remove the old label before adding the new one.
- List the next issues: `gh issue list --repo technotenshi/YoutubeDL-Material --state open --label priority:do-now`
- Change a priority: `gh issue edit <number> --repo technotenshi/YoutubeDL-Material --remove-label priority:schedule --add-label priority:do-now`

Labels must exist before they can be applied. Check with `gh label list`.
