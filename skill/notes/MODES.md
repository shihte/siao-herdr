# Invocation modes

The default mode — journal as you work — is in `SKILL.md`. This file covers the other
ways the skill gets invoked: when the journal doesn't exist yet and has to be built
from some other record, when it exists but is in bad shape, and when something has to
be derived *from* it.

Every mode obeys the same rules as the default (status only in the handoff, evidence
tags, no secrets, append-only journals). What differs is the **input** and the
**honesty banner** each mode must leave behind, because a journal built after the
fact is not the same artifact as one written during the work, and the next reader
must be able to tell.

Dispatch:

| User says something like | Mode |
|---|---|
| "build notes from the git history", "we never kept notes, reconstruct them" | **reconstruct** (§1) |
| "we forgot to journal this session, catch the notes up" | **backfill** (§2) |
| "we have a docs/ and a TODO.md, bring them into ClaudeDocs" | **import** (§3) |
| repo already has `notes/`, `.ai/`, `MEMORY.md`, someone else's system | **adopt** (§4) |
| "check the notes", "are the notes healthy", "lint" | **audit** (§5) |
| "is the handoff still true?", before acting on an old handoff | **verify-handoff** (§6) |
| "did we already try X?", "have we ruled out Y?" | **query** (§7) |
| "try both approaches", "fork this", two viable paths | **branch / merge** (§8) |
| "the journal is huge", "turn this one file into proper notes" | **restructure** (§9) |
| "two worktrees have their own notes, combine them" | **merge-journals** (§10) |
| "write me a progress report from the notes" | **digest** (§11) |
| "turn the decisions into ADRs", "update the CHANGELOG from the notes" | **export** (§12) |
| "what happened and when", incident, outage, "reconstruct the timeline" | **timeline** (§13) |
| "we're done", "wrap up", "close out the project" | **close** (§14) |
| "write the handoff now", context switch, before `/compact` | **handoff-now** (§15) |

---

## 1. reconstruct — build a journal from git history

**When:** a repo with history and no `ClaudeDocs/`; the user wants the "why" behind
the code recovered.

**What git can and cannot give you.** Git holds the path that *worked*: what changed,
when, in what order, with whatever the commit message says. It does not hold
expectations, failed experiments that were never committed, or the reasoning between
commits. A reconstructed journal is therefore a **chaptered summary, not a journal**,
and it must say so in its header:

```markdown
# NOTES_<SUBJECT> — RECONSTRUCTED from git on 2026-11-08
Built from `git log` after the fact. Contains no expectations and no
uncommitted dead ends. Every claim is [reported: git <sha>] unless re-verified.
Chapters from live work start at §<N+1>.
```

**Procedure:**

1. **Get the record.** `git log --reverse --date=short --format='%h %ad %an %s' --stat`
   (add `--all` if branches matter). For >~200 commits don't go per-commit; first
   cluster by directory (`git log --format= --name-only | cut -d/ -f1-2 | sort | uniq -c`)
   and reconstruct per subsystem.
2. **Cluster commits into episodes.** An episode is a run of commits that share a
   subject: same paths touched, within a time gap of less than a few days, or bracketed
   by a merge/tag. Episode boundaries are the chapter boundaries.
3. **One chapter per episode, titled as the question the episode answered.** Infer it
   from the diff and message — "Why did the parser move from regex to a state machine?"
   — and tag the title `[inferred]` if the message doesn't say. Where you cannot infer
   a why, write `Why: not recoverable from history` rather than inventing one.
4. **Reverts and re-dos are the gold.** A commit followed by its revert is a ruled-out
   path *with the how* (the revert message). `git log --grep=revert -i`, and look for
   the same file rewritten twice in a week. These go in `### Ruled out`.
5. **Tag everything** `[reported: git <sha>]`. Dates come from commit dates. Authors
   are `[reported: git]` too — don't attribute reasoning to a named person.
6. **Note what history hides:** force-pushes (`git reflog` if local), squash merges
   (one commit, many decisions), long gaps (work happened elsewhere or didn't), vendored
   drops. Each gets a line so the next reader knows where the record is thin.
7. **Status lines** are all `solved — [reported: git]` or `abandoned — [reported: revert <sha>]`.
   Never `open` or `stuck` — git doesn't know what's stuck.
8. **The handoff is NOT built from git.** Build it from the running state, verified in
   this session (SKILL §8). Git tells you what was committed; it cannot tell you what is
   deployed or whether tests pass today.
9. Add `OVERVIEW.md` with the reconstruction date and the sha range covered.

**Don't:** reconstruct motives from commit *authors*' names, treat commit messages
as verified claims about behaviour, or let the reconstructed chapters' numbering
collide with live ones — live work continues the sequence.

---

## 2. backfill — catch up a journal from the current conversation

**When:** mid-session you realise the work has outgrown one session and nothing was
written. Unlike `reconstruct`, this input *does* contain the dead ends — they are
still in your context, which is exactly why it must happen now and not next session.

1. Create the journal (SKILL §3 "Starting from nothing") with a header line:
   `Chapters 1–N backfilled on <date> from the session transcript; live journaling from §N+1.`
2. Walk the session in order. Each distinct question or task you tackled is a chapter.
   Write the **expectation you had at the time** as best you recall, and mark it
   `[reported: recollection]` — a recalled expectation is weaker than a written one and
   must say so.
3. Tool output still visible in context is `[verified: <command>]`. Output that was
   compacted away is `[reported: transcript]`.
4. Every path you tried and dropped goes in `### Ruled out`, with how. This is the
   whole point of backfilling instead of waiting.
5. Then write the handoff from verified state, and continue journaling live.

If compaction already happened, backfill what survives and say what was lost.

---

## 3. import — bring existing notes into the structure

**When:** the project already has informal notes — `docs/`, `TODO.md`, `NOTES.txt`,
a `CHANGELOG`, an issue tracker, PR descriptions.

- **Don't move or rewrite the project's own files.** `docs/` belongs to its audience.
  `OVERVIEW.md` points at them as reference-tier sources with one line each.
- **Status claims found in them go to the handoff only after verification.** A
  `TODO.md` saying "auth is done" is `[reported: TODO.md]` until you check.
- **Decisions found in them** are extracted to `DECISIONS.md` with `[reported: <file>]`
  and the original's date.
- **Open issues / PRs** become the handoff's "Open problems" list, by reference (id +
  one line), not by copying their bodies.
- Start the journal at §1 with a chapter recording the import: what was found, what was
  trusted, what wasn't.

---

## 4. adopt — the repo already has someone else's notes system

**When:** a `notes/`, `.ai/`, `MEMORY.md`, `agent-notes/`, or a team convention exists.

The `ClaudeDocs/` rule still holds — create it — but **do not duplicate**. Map their
files onto the three roles in `OVERVIEW.md` ("their `MEMORY.md` is the handoff; their
`decisions/` is reference"), write the journal in `ClaudeDocs/`, and leave their
handoff as the handoff if the team maintains it. If their system has no
append-only journal, yours is the first; say so. Never rename, move, or reformat
files you didn't create.

If the user's own convention conflicts with a rule here (they keep status in file
headers, say), their convention wins inside their files; the rule still governs
yours. Record the mapping once and stop relitigating it.

---

## 5. audit — check an existing ClaudeDocs/

Run `scripts/lint.sh ClaudeDocs/` for the mechanical checks, then the semantic ones:

- Does every chapter end with a status line from the vocabulary?
- Are there `[assumed]` lines older than three chapters? List them.
- Does any file other than `HANDOFF.md` make a state claim? (`lint` greps for the
  words; you read for the meaning.)
- Does `OVERVIEW.md` list every file, and does every listed file exist?
- Are there superseded specs without a banner? Chapters marked superseded without a
  pointer to what superseded them?
- Is the handoff under 100 lines, dated, and does its first section hold the dangers?
- Any secrets-shaped strings? (`lint` catches the common shapes; eyeball the rest.)

Output: a new journal chapter `## N. Journal audit <date>` listing findings with
severity, then fix the handoff in the same session. Don't "fix" old chapters — append
corrections per SKILL §4a.

---

## 6. verify-handoff — is the handoff still true?

Before acting on any handoff you did not write this session (and as the first step
of a resume when the handoff is more than a day old):

1. For every line in **State** and **Read this first**: what command or check would
   confirm it? Run it.
2. Record each as `holds` / `drifted: <what's actually true>` / `could not check: <why>`.
3. If anything drifted, that's the first chapter of the session, and the handoff is
   rewritten before other work starts — a drifted handoff is the most expensive
   document in the directory because every decision made on it inherits the error.

---

## 7. query — "did we already try X?"

The one mode where the answer is only as good as the discipline that preceded it.

1. `grep -n -i '<keyword>' ClaudeDocs/NOTES_*.md` — headings first (`'^## '`), then
   `### Ruled out` sections, then body.
2. Distinguish three answers and say which you have:
   - **Eliminated** — a chapter ruled it out *with a how*: cite `§N`, repeat the how.
   - **Attempted, inconclusive** — tried, status `stuck`/`partial`/`abandoned` without
     a clean elimination: cite it and say what was missing.
   - **Not found** — which means *untested*, not *eliminated*. Say "no record", never
     "we didn't try it" (the record may be thin, see §1's banner).
3. If the answer turns out to matter, the current chapter cites the one you found.

---

## 8. branch / merge — two viable paths at once

**Branching** is for when two approaches are each plausible and you'll pursue both
(in series or in parallel via subagents/worktrees). It is not for every alternative
considered — those go in a chapter's "rejected and why".

- The fork is a chapter: `## 14. Fork: stream the export or buffer it?` — states why
  you're forking rather than choosing, and the **success criterion each branch must
  meet**, written before either runs.
- Branch chapters take a letter suffix: `## 14a. Streaming`, `## 14b. Buffered`. They
  are ordinary chapters (expectation, found, ruled out, status) with one extra line:
  `Branch of: §14 · Worktree/agent: <where this is running>`.
- Each branch keeps its own `[assumed]` lines — branches usually rest on different
  assumptions, and that difference is often what decides them.
- The fork is closed by a **merge chapter**: `## 15. Merge: 14b wins` — which branch
  survives, why (against the criterion from §14, not a new one), what from the losing
  branch is worth keeping (a test, a measurement), and the losing branch's status set to
  `abandoned — see §15`. A fork without a merge chapter is a fork nobody can tell is
  still open. `lint` flags `§Na`/`§Nb` with no later `Merge:` heading.
- In the handoff, an open fork is listed once under Open problems with both branch
  refs; the state table gets a row per branch only while they're both live.
- Numbering: suffixes are per fork; the next linear chapter after §14a/§14b is §15, not
  §14c. Never nest (`§14a-i`); if a branch forks again it gets a new fork chapter.

---

## 9. restructure — one big file into the three roles

**When:** a single `JOURNAL.md`/`NOTES.md` has grown past greppability, mixes status
with history, or someone wants "proper" notes.

1. Don't renumber. If chapters split across subject files, each file keeps its
   original numbers (gaps are fine) and `OVERVIEW.md` says so; cross-refs become
   `NOTES_X.md §N`.
2. Pull every state claim out into `HANDOFF.md` — then **verify each** before it stays.
3. Pull settled knowledge (specs, constants, decisions, design values) into reference
   files; leave a one-line `→ extracted to SPEC_X.md` where it was.
4. Add `OVERVIEW.md`. Add a chapter recording the restructure and what moved where.
5. The old file is not deleted; it gets a top banner pointing at the new layout, and
   stays until the user removes it.

---

## 10. merge-journals — notes from two worktrees or two agents

Two copies of `ClaudeDocs/` diverged (parallel worktrees, a long-lived branch, two
subagents that each kept a journal).

- Journals are append-only, so merging is **concatenation by subject, in time order**,
  with a `Source: <worktree/agent>` line on each imported chapter. Conflicting
  numbers: keep the orchestrator's sequence, renumber only the *imported* chapters,
  and leave a mapping table in the merge chapter (`their §7 → our §21`). This is the
  single exception to never-renumber, and the mapping is what makes it survivable.
- Two handoffs are **not merged** — one is rewritten from verified state, the other
  is discarded after its dangers are checked and carried over.
- Reference files that both changed: a superseded banner on one, or a merged file with
  both decisions recorded — never a silent pick.

---

## 11. digest — a human-readable report from the notes

For a stakeholder, a teammate, or the user who wants the story without the evidence
trail.

- Output is a **derived document**, written to `ClaudeDocs/DIGEST_<date>.md` or
  delivered directly; its first line says it was generated from the journal on
  `<date>` and is not a source of truth. It never replaces the handoff.
- Strip evidence tags; keep the distinction they carried in plain words ("confirmed",
  "we believe", "unverified"). Never promote `[assumed]` to fact in a digest — that
  is how a digest becomes a lie.
- Structure by outcome, not by chapter: what works, what's open, what was ruled out
  (briefly — the ruled-out list is what makes a digest useful to another engineer),
  what's next.
- Length: a page. The person who wants more has the journal.

---

## 12. export — from the journal outward

The journal is upstream of other documents; this mode moves content downstream.

- **→ ADRs**: each `DECISIONS.md` entry becomes `docs/adr/NNNN-slug.md` (or wherever
  the project keeps them) in the project's ADR format, status `accepted`/`superseded`.
  Context and rejected options come from the journal chapter the decision cites.
- **→ CHANGELOG**: solved chapters since the last release, one line each, written for
  users (the *what*, not the *why*). Nothing with status `open`/`stuck`/`partial`.
- **→ user-facing docs**: reference files (`SPEC_*.md`) are the source; the journal
  never is. Strip tags and history.
- Exported documents don't link back to `ClaudeDocs/` unless the project's docs are
  internal — your working notes aren't part of a public API's documentation.
- Exporting changes nothing in `ClaudeDocs/` except a journal line recording what was
  exported where and when.

---

## 13. timeline — incident / "what happened when"

The incident shape in SKILL §6, fed from several clocks:

1. Collect timestamps from every source available: logs, `git log --date=iso`, deploy
   records, chat/alert timestamps, the user's account. Normalise to one timezone and
   **say which**.
2. One line per event: `HH:MM:SS [source] observed: …` — observed only. Inferences
   ("this is when the leak started") go on their own line tagged `[inferred]`, after
   the observations that support them.
3. Gaps are events: `12:40–13:10 no records from any source`.
4. Mitigation lines record what was done *and whether it was verified to have taken
   effect* — "restarted the pod" is not "the pod came back healthy".
5. Follow-ups each get an owner or are explicitly unowned; unowned follow-ups go in the
   handoff's "Needs a human".

---

## 14. close — wrapping a project up

1. Rewrite the handoff a final time: first section says the work is complete and what
   "complete" was checked against; state table shows `deployed`/`reachable` as actually
   verified in this session, not assumed from the last deploy.
2. Walk the journal headings for `open`/`stuck`/`partial` statuses. Each is either
   closed with a status line now, or listed in the handoff as deliberately left open.
3. Move anything still consulted into reference files.
4. Collect every "what would have found this sooner" line (SKILL §7) into a closing
   chapter, and append each to the cross-project `LESSONS.md` (SKILL §3) if one is
   kept.
5. Leave `ClaudeDocs/` in place. The next person to touch the code will have the same
   questions you had.

---

## 15. handoff-now — forced rewrite

The user says "write the handoff", a context switch is coming, you're about to run
`/compact`, or the `PreCompact` hook fired. Do SKILL §8 in full — verify, lead with
dangers, state the deploy column, move history out, mark unverified — then put a
status line on the open chapter. Takes a few minutes; the alternative is a session
that resumes from a reconstruction.
