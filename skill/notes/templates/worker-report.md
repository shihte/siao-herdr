# Worker report — what a subagent returns to the orchestrator

A worker does not write to the shared journal or the handoff (SKILL §9). It returns
this block; the orchestrator appends it as a chapter (or branch chapter) unchanged,
adding only the chapter number and `Opened:` date. Keep it under ~40 lines; raw
output beyond that goes in a file the report points at.

```markdown
## <leave blank — orchestrator numbers it>. <the question or task, as a question>
Opened: <date> · Status: <open|solved|partial|stuck|abandoned>
Worker: <agent/worktree id> · Branch of: <§N, if this is one arm of a fork, else omit>

Expected: <one sentence — what you expected before starting>

### Found
- [verified: <how>] ...
- [inferred] ...

### Ruled out
- <path> — [verified: <how it was eliminated>]

### Assumptions I'm resting on
- [assumed] ...            <- the orchestrator will carry these into the handoff

### Changes to the tree
- written / committed / pushed: <which, per file or component>   <- never "done"

### Needs a human
- <decision only the user can make, and what you assumed meanwhile>

### Status: <vocabulary word> — <why, one line>
```

Rules for the worker:
- No secrets, no credentials, no third-party personal data (SKILL §3). Redact as
  `<REDACTED:kind>`.
- No status claims about anything outside your own task — you can't see the rest.
- Every number carries how and when it was measured (SKILL §4a).
- If you ran out of budget, status is `partial` or `stuck`, never silently `solved`.

Rules for the orchestrator:
- Append as-is; don't paraphrase. If you disagree with a worker's finding, that's a
  new line tagged `[inferred]` or a new chapter, not an edit to theirs.
- Fold "Assumptions" and "Needs a human" into the handoff on the next rewrite.
- Two workers on the same fork → their reports are §Na and §Nb; you write the merge
  chapter (MODES §8).
