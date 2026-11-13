---
name: notes
description: Keep a chaptered working journal in ClaudeDocs/ while doing multi-session project work — written as you go, with a rewritten HANDOFF for current state and extracted reference docs. Use at the start of any task likely to outlive one context window or one session (multi-day work, >3 experiments, "we'll continue later", a repo that already has ClaudeDocs/), when starting a distinct sub-task, when stuck (to check what was already tried), right after a breakthrough, and when asked to set up, resume, restructure or close project notes. Also use for its other entry points — reconstructing notes from git history, backfilling from the current session, importing an existing docs/ or TODO, auditing or linting notes, checking whether an old handoff is still true, answering "did we already try X", forking two approaches and merging them, writing a digest or exporting decisions to ADRs/CHANGELOG, building an incident timeline. NOT for meeting notes, personal notes, user-facing docs, or one-shot tasks that finish in a single session.
---

# Keep the journal while you work, not after

Notes written at the end are a summary of the path that worked. Notes written
*during* the work are working memory: what was tried, what died and how, what is
still unverified — the expensive part, and the part a later session (or a later
you, after compaction) cannot reconstruct.

This skill is self-contained: it covers the shape of the documents, when to write
in them, how to write a claim so it can be trusted later, and how to resume from
them. It depends on no other skill, tool or convention — only a filesystem and
`grep`.

## 0. At a glance

```
SESSION START  ClaudeDocs/ exists?  →  read HANDOFF.md fully, OVERVIEW.md,
               then `grep -n '^## ' ClaudeDocs/NOTES_*.md` for chapter headings.
               Open only the chapters HANDOFF points at. Never read a whole journal.
               Doesn't exist and work will outlive this session?  →  §3 "Starting from nothing".

DURING         New sub-task      → open a numbered chapter FIRST, with what you expect.
               Surprise          → write it now, while you remember what you believed.
               Hypothesis died   → record what was ruled out AND how.
               Stuck             → §7: scan headings before trying the next idea.
               Breakthrough      → §7: new chapter naming the chapters it invalidates.
               Settled reference → extract (format spec, constants, design values).

SESSION END    Status line on the open chapter.
or CONTEXT     Rewrite HANDOFF.md from verified state (§8). Don't append to it.
SWITCH         scripts/lint.sh ClaudeDocs  → fix what it flags. Commit ClaudeDocs/ with the code.

DIRECT         /notes <verb> [args] — table in §12 (start · resume · chapter · status · handoff ·
               verify · query · fork · arm · merge · reconstruct · backfill · import · audit ·
               lint · extract · human · digest · export · timeline · close · lessons · help).

OTHER ENTRY    No journal but there is git history / an old docs/ / a session to catch up →
POINTS         §12 and MODES.md (reconstruct · backfill · import · adopt · audit ·
               verify-handoff · query · branch/merge · restructure · digest · export ·
               timeline · close · handoff-now).
```

Files in this skill: `SKILL.md` (this), `MODES.md` (the other entry points),
`scripts/lint.sh` (mechanical checks), `templates/worker-report.md` (what a subagent
returns), `hooks/claude-code-settings.json` (SessionStart/PreCompact/Stop hooks).

## 1. When this applies

Start the journal when **any** of these hold: the task will plausibly exceed one
context window; the user signals continuation ("tomorrow", "next session", "keep
going later"); the work is an investigation with more than ~3 hypotheses to test;
you are about to run experiments whose results you'd hate to lose; the repo already
has a `ClaudeDocs/` directory.

Skip it for a single-session task you can finish without a handoff. Creating a
journal for a 20-minute fix is noise; the test is "would anyone resume this?".

Creating `ClaudeDocs/` needs no permission — it is cheap, local and reversible.
Mention it once in the reply the first time; don't ask.

## 2. Session start: resume protocol

Reading is budgeted. A journal is only useful if resuming from it costs less than
re-deriving, so read in this order and stop as soon as you have enough:

1. `HANDOFF.md` — whole file. It should be under 100 lines; if it isn't, that is
   itself a finding (see §8).
2. `OVERVIEW.md` — the index: what each file is for, which data/spec is current.
3. Chapter headings only: `grep -n '^## ' ClaudeDocs/NOTES_*.md`.
   Open chapters: `grep -n 'Status: open\|Status: stuck\|Status: partial'`.
4. Open the one or two chapters the handoff points at. Not the rest.

Then **verify the handoff's load-bearing claims before acting on them** — is the
service actually running, does the test suite actually pass, is the fix actually
deployed? A handoff is a claim written by a previous session, not ground truth.
If a claim is wrong, the first chapter of this session records the discrepancy.

If the user asks you to "resume" and there is no `ClaudeDocs/`, say so, check for
other state (git log, a `docs/`, a TODO file) and offer to start the journal from
what you find — don't pretend to a continuity you don't have.

## 3. Document architecture

### Three roles

| Role | What it is | Mutability | Grows |
|---|---|---|---|
| **Journal** `NOTES_<SUBJECT>.md` | The chaptered log. Where work is recorded | Append-only | continuously |
| **Handoff** `HANDOFF.md` | Current state: dangers, what's done, stuck, next | **Rewritten** whole | at boundaries |
| **Reference** `SPEC_*.md`, `DECISIONS.md`, `ClaudeDesign/` | Stable extracted knowledge | Rarely; superseded with a banner | rarely |

Plus one **index**, `OVERVIEW.md`: one line per file saying what it is for and
which dataset/spec is current. Add it the moment there are more than three files.
The journal is primary; the other two are derived from it. A project with only a
handoff has lost its history; one with only a journal makes every newcomer read
3,000 lines to find out where things stand.

`NEXT_STEPS` is part of the handoff, not a fourth role. If it wants its own file,
it is rewritten on the same schedule as `HANDOFF.md` and obeys the same rules.

### The directory is `ClaudeDocs/` at the project root, always

Not `docs/` — that belongs to the project's own audience and may be walked by a
doc generator or publish step. One fixed, unusual name across every project
removes the collision check entirely. Don't inspect the repo to decide.

For work that has no repo (a research write-up, an analysis in a scratch
directory), `ClaudeDocs/` goes in the working directory of that work, same rules.

**Discoverability:** if the root already has a `CLAUDE.md` or `AGENTS.md`, add
one line to it: `Working journal: ClaudeDocs/ — read HANDOFF.md first.` Don't
create such a file only for this; the fixed directory name is the convention.

**Git:** `ClaudeDocs/` is committed with the code by default — the point is that
it travels with the repo and survives the machine. Never add it to `.gitignore`
silently; if the repo is public and the notes contain internal detail, raise it
with the user once.

### Secrets never enter the journal

The investigation shape below asks for raw output verbatim. That yields to this
rule, with no exceptions: no tokens, keys, cookies, session IDs, passwords,
connection strings, private hostnames the user hasn't published, or personal data
about third parties. Redact in place as `<REDACTED:kind>` and keep the shape of
the output. A journal gets committed, grepped, pasted into chats and read by
future agents; it is the worst place for a credential.

### Status lives in exactly one document

**Only the handoff may state current status.** Not journal headers, not spec
headers, not the index. Status claims are written once and never re-read while the
work moves underneath them: a journal opened with "nothing has been built yet"
still says that after twelve chapters of building, and the next reader believes it
because a header looks like metadata rather than a claim.

- A journal header says what the subject **is** and how to read the file.
- A spec header says what the spec **covers**.
- The index says what each file is **for**, and points at the handoff for state.

If you catch yourself writing "currently", "not yet", "so far", "nothing has
been X" anywhere but the handoff — move it there.

### "Written" is not "deployed"

Distinguish these explicitly, every time, in handoffs and status lines:

| | means |
|---|---|
| **written** | exists in the working tree |
| **committed** | in this repo's history |
| **pushed** | on a remote |
| **deployed** | the running artifact has it |
| **reachable** | someone outside can get to it |

A fix that is committed but not deployed is not fixed for anyone but you. For a
security fix, "fixed" without "not deployed" is the most dangerous sentence a
handoff can contain. Check the running artifact (image build time, the process's
actual env, the endpoint's actual response); don't infer it from the repo.

### Superseded documents get a banner, first line of the file

When a decision overturns a spec or reference, the old file gets a banner at the
very top: **what is dead, what replaced it (link), what still holds.** The last
part is what keeps the 80% that is still correct usable. Do it in the same edit
that makes the old decision wrong — a banner planned for later doesn't exist.
Never delete a superseded document.

### Reference extraction

Extract to a reference file when knowledge becomes *settled and consulted
repeatedly*: a file format, a table of constants, an environment quirk, an API's
real behaviour, a decision with its rejected alternatives. The general trigger is
the third lookup. Two kinds are worth extracting on the **first** settlement,
because every later task needs them:

- **Decisions** (`DECISIONS.md`, or `DECISIONS/NNNN-slug.md` once there are
  many): context, options rejected and why, decision, consequences, status
  (`accepted` / `superseded by NNNN`). Never edit a decision's content; supersede it.
- **Design values** (colours, type scale, spacing, framework choice, component
  conventions): `ClaudeDesign/` at the project root, sibling to `ClaudeDocs/`,
  with an `OVERVIEW.md` and one file per visual surface (`HOMEPAGE.md`,
  `APP_FAMILY.md`). A hex value buried in chapter prose is a value nobody finds.

The journal still gets the chapter that records *how* the decision was reached;
the reference file gets the result. Reference files carry no status claims.

Two more derived files, each optional until the need appears:

- **`RUNS_<SUBJECT>.csv`** — for experiment-heavy work. Prose doesn't scale past a
  dozen runs. Columns: `run_id, date, chapter, params, seed, data_version, metric,
  note`. The chapter holds the interpretation and cites run ids; the table holds
  the numbers. Append-only like a journal.
- **`LESSONS.md`** — cross-project, kept outside any one repo (e.g.
  `~/.claude/LESSONS.md`, or the user's memory if they prefer). Every "what would
  have found this sooner" line from §7 is appended here as well as to the journal,
  because the journal stays with the project and the lesson shouldn't. One line
  each, dated, with the project name. Read it at the start of a new project.

### Naming

`<ROLE-PREFIX>_<SUBJECT>.md`, uniform within a project, so a directory listing
sorts into roles and `grep` over one role works. **Split by subject, never by
date** — `NOTES_PHYSICS.md`, not `NOTES_WEEK2.md`. Split a journal when it
covers two clearly separate subsystems or stops being greppable (~1,000 lines),
and add/update the index in the same move.

```
ClaudeDocs/
  OVERVIEW.md          index: what each file is for, which data is current
  HANDOFF.md           current state — rewritten, ≤100 lines
  NOTES_PARSER.md      journal, one subject
  NOTES_RENDERING.md   journal, another subject
  SPEC_FILE_FORMAT.md  reference
  DECISIONS.md         reference
ClaudeDesign/          only if design values have been settled
  OVERVIEW.md
  HOMEPAGE.md
```

### Starting from nothing

```
1. mkdir ClaudeDocs/; create NOTES_<SUBJECT>.md opening with one paragraph:
   what this project is and what "done" looks like. No status.
2. Open chapter 1 BEFORE doing the work, stating what you expect.
3. Add HANDOFF.md the first time you stop mid-problem (or at first session end).
4. Extract a reference file the third time you look something up
   (first time for decisions and design values).
5. Split the journal when grep beats reading; add OVERVIEW.md in the same move.
```

Step 2 is the one people skip, and it is what makes everything after it work.

## 4. Chapters

One chapter = one question you set out to answer or one task you set out to
finish. Not one day, session or commit.

```markdown
## 12. Why does the exporter drop half the keyframes?
Opened: 2026-11-08 · Status: open

Expected: the sampler's stride is wrong and we'll see every other frame skipped.

### Found
- [verified: ran export with --trace, counted 412/824 frames] drop is exactly 50%
- [inferred] from the trace, the drop is in the writer, not the sampler

### Ruled out
- Sampler stride — [verified] stride=1 in the dumped config, drop persists.

### Status: solved — writer flushes on even frame indices only (off-by-one in
`FlushIfDue`). Fix written, not committed. Supersedes nothing.
```

Rules that make chapters useful later:

- **Number them and never renumber.** The number is a permanent address, so §33
  can say "overturns §28" and both stay readable.
- **Date the chapter when you open it.** One line, cheap, and it survives
  squashed history and uncommitted journals. Dates are for judging staleness,
  not for organising — files are still split by subject.
- **Title with the question, not the topic.** "Why does X drop keyframes" is
  findable by someone with the same symptom; "Keyframe handling" is not.
- **Write the expectation before the result.** It is the only way a surprise is
  detectable later.
- **Label evidence** with the tags in §4a. §7's "is anything here unverified?"
  depends on these existing.
- **Append; never edit a past chapter's conclusion.** Write a new chapter that
  supersedes it and say so in both places (a one-line "→ superseded by §N" under
  the old status is the only edit allowed to an old chapter). The correction is
  the content; a silently cleaned document invites the next person into the trap.
- **Every chapter ends with a status line** from a fixed vocabulary:
  `open` · `solved` · `partial` · `stuck` · `abandoned` · `superseded by §N`
  — each with "and why". A chapter without a verdict reads as finished.

### Forks

When two approaches are both plausible and you will pursue both — in series, or in
parallel through subagents or worktrees — don't force them into one linear chapter.

- The **fork chapter** `## 14. Fork: stream or buffer the export?` says why you're
  forking instead of choosing, and writes the **success criterion each arm must
  meet** before either arm runs.
- **Arm chapters** take a letter: `## 14a. Streaming`, `## 14b. Buffered`. Ordinary
  chapters plus one line: `Branch of: §14 · Worktree/agent: <where>`. Each arm keeps
  its own `[assumed]` lines — arms usually rest on different assumptions, and that
  difference is often what decides them.
- A **merge chapter** closes the fork: `## 15. Merge: 14b wins` — judged against the
  criterion from §14, not a new one; what from the losing arm is worth keeping; the
  losing arm's status set to `abandoned — see §15`. An unmerged fork is one nobody
  can tell is still open; `lint.sh` flags arms with no later `Merge:` chapter.
- Numbering: after §14a/§14b the next linear chapter is §15, not §14c. Never nest
  arms; if an arm forks again, it gets a new fork chapter. Full procedure, including
  the handoff's view of an open fork: `MODES.md` §8.

Bad entry, for contrast: *"Looked at the config, seemed fine. Tried a few things
with the writer, no luck yet."* — carries nothing. What was checked, what would
have counted as not fine, which things, which outcome.

## 4a. Writing a claim

Every sentence in a journal that states a fact about the world is a claim a later
reader will act on without re-checking. These rules are what make that safe.

### Evidence tags

Prefix every factual line with exactly one tag. Four are enough; don't invent more.

| Tag | Means | Example |
|---|---|---|
| `[verified: <how>]` | You observed it this session, and `<how>` is enough for someone to repeat it | `[verified: curl -I on prod, 200 + new header]` |
| `[inferred]` | Follows from verified evidence but was not itself observed | `[inferred] the drop is in the writer, since the sampler count is correct` |
| `[assumed]` | Taken on faith to make progress. Must be revisited | `[assumed] the test fixture matches the prod schema` |
| `[reported: <who>]` | A person, a doc, a comment or an earlier session said so | `[reported: README]` · `[reported: user]` · `[reported: §9]` |

A line from a previous session is `[reported: §N]` until this session re-checks
it — even if it was `[verified]` back then. Verification does not transfer across
sessions, because the world moves.

Scan for debt with `grep -n '\[assumed\]' ClaudeDocs/`. An `[assumed]` that has
survived three chapters is overdue.

### Observation and interpretation stay on separate lines

Raw output, numbers, addresses, error text: one line, verbatim (redacted per §3).
What you think it means: the next line, tagged `[inferred]`. Merging them
("the server rejected it because the token expired") hides which half was seen and
which half was guessed — and the guessed half is the one that turns out wrong.

### Numbers carry their measurement

A number without how and when it was measured is a trap: it is specific enough to
be trusted and stale enough to be wrong. `42 tests pass` → `[verified: pytest -q,
2026-11-08] 42 passed, 0 failed, 3 skipped`. Same for latencies, sizes, counts of
anything. If you didn't measure it this session, it's `[reported: §N]`.

### Trust boundaries

Not every source gets the same weight, and the tag records which you used:

- **Your own observation this session** — `[verified]`. The only first-class source.
- **The user** — `[reported: user]`. Usually right about intent and history, often
  wrong about current state of machines ("it's deployed", "the tests pass"). Check
  state claims; take intent claims.
- **Documentation, comments, commit messages** — `[reported: <doc>]`. Describe what
  someone meant to be true. Code and running systems describe what is true.
- **Earlier chapters and the previous handoff** — `[reported: §N]` until re-checked.
- **Tool output** — `[verified]` only if you read it; a command you ran but whose
  output you skimmed is `[assumed]`.

### Corrections stay in place

When a claim turns out wrong, don't delete or rewrite it. Under the original line
add `→ wrong, see §N` and write the correction where you found it, as a new
chapter or a new line tagged `[verified]`. The pair — the wrong claim and why it
was wrong — is what stops the next reader making the same mistake. A document
with its errors cleaned out is one that will produce them again.

### Say what it does not show

A result line is incomplete without its limit: the control that wasn't run, the
input range that wasn't covered, the environment it wasn't tested in. "Works on
the sample file" and "works" are different claims; write the one you can defend.

## 5. When to write

The trigger is a **boundary**, not a clock:

- **Starting a sub-task** → open the chapter first, with the expectation.
- **Something surprised you** → immediately, while you remember what you believed
  five minutes ago. Highest-value entry in any journal; most reliably lost.
- **A hypothesis died** → what was ruled out *and how*. Without the how, the next
  session can't tell eliminated from untested.
- **Something settled** (a format, a constant, a decision, a design value) →
  extract per §3, don't leave it only in prose.
- **Before a context switch, compaction, or session end** → status line, then
  rewrite the handoff (§8). Do this *before* the context is lost, not after you
  notice it was.
- **Stuck or breakthrough** → §7.

Don't write an entry for every command. If it produced no information it isn't a
journal entry; shell history has it. And don't duplicate git: "changed the parser
to handle X" is a commit message — the journal entry is *why X was necessary and
what it broke*.

## 6. Match the shape to the project type

Different work has different expensive-to-lose information. Starting points, not
forms to fill in mechanically. Two things belong in every type: **what was ruled
out**, and **the status line**.

**Investigation / debugging / reverse engineering** — expensive thing: *paths tried*.
```
Symptom · Hypotheses (each: how tested, verdict) ·
Evidence (addresses, offsets, raw output verbatim — redacted per §3, tagged
per §4a, interpretation on separate lines) · Status
```

**Building a feature** — expensive thing: *why it's shaped this way*.
```
What it must do · Approach chosen, approaches rejected and why ·
Interfaces touched · Known gaps and deliberate omissions
```

**Decision** (architecture, library, design values) — expensive thing: *the
settled value and its scope*.
```
Options considered and why rejected · Decision · Scope (which surfaces/components) ·
Extracted to: DECISIONS.md §N / ClaudeDesign/<file>.md
```

**Research / experiments** — expensive thing: *the setup and the noise floor*.
```
Question · Setup (exact params, seeds, data version, hardware) · Baseline and noise
floor · Result with the control alongside · What this does NOT show
```

**Data analysis** — expensive thing: *the cleaning decisions*.
```
Source and snapshot date · Rows dropped and why · Transformations ·
Finding, with the caveat that limits it
```

**Migration / refactor** — expensive thing: *coverage*.
```
Inventory (scope, counted) · Done / remaining · Behavioural differences accepted ·
Rollback position
```

**Incident / ops** — expensive thing: *the timeline*.
```
Timeline with timestamps · Observed vs inferred · Mitigation applied ·
Follow-ups, each owned
```

## 7. Review when stuck and after a breakthrough

The journal only pays off if it is re-read, and the two moments that make
re-reading mandatory are the two where you'd rather push forward.

### When stuck

Before the next idea: `grep -n '^## ' <journal>` and scan. Ask:

- **Has this been tried?** Repeating a failed experiment is the commonest waste in
  long projects, and being stuck narrows attention until it happens.
- **Is anything `[assumed]`?** An assumption three chapters back is the leading
  candidate for the thing now blocking you.
- **What did I stop believing?** If the current approach rests on a conclusion a
  later chapter overturned, it is already dead and you haven't noticed.

A minute of scanning regularly saves hours. Being stuck is the signal to read.

### After a breakthrough

A breakthrough retroactively changes earlier chapters. Record it as a **new
chapter that explicitly lists the chapters it invalidates**, add the one-line
"→ superseded by §N" under each of their status lines, and ask which "failed"
experiments failed for the reason you now understand — those are worth re-running.

Also capture, while fresh: **what would have found this sooner?** Usually a
missing tool or check. Writing it down is how a project's methods improve; skip it
and you relearn the lesson.

## 8. The handoff

The only document that is **replaced** rather than added to. Rewrite it whenever
you're about to append to it — the urge to append is the signal it's stale — and
at every session end or context switch.

```markdown
# HANDOFF — <project>
Rewritten: 2026-11-08 by <session/agent id>

## Read this first (anything that hurts if acted on in ignorance)
- Security fix in §14 is committed, NOT deployed. Do not open the proxy until it is.

## State — verified this session
| component | written | committed | pushed | deployed | checked how |
|---|---|---|---|---|---|

## Open problems → journal
- Exporter drops frames — NOTES_PARSER.md §12, status: partial

## Next, in order, with why
1. ...

## Needs a human (decisions only the user can make — and what I assumed meanwhile)
- Keep the legacy endpoint or drop it? Assumed: keep, behind a flag. Blocks §16.

## Unverified (could not check this session, and why)
- ...
```

"Needs a human" is where unattended work parks its questions instead of either
stalling or deciding silently: the question, the interim assumption, and what it
blocks. The user reads one list on return rather than hunting through chapters.

Rewriting means starting from what is true now:

1. **Verify before you write.** Every state claim is checked in this session, not
   recalled. Recalled state is how a handoff drifts while each edit looks correct.
2. **Lead with what would hurt someone.** Undeployed security fixes, half-done
   destructive steps, configs that fail on next start. Not accomplishments.
3. **Say what is not deployed**, explicitly, even when everything is committed.
4. **Move history out** to the journal — check it's there before deleting.
5. **Mark what you couldn't verify**, with the reason. An honest gap beats a
   confident guess because the next person can close it.

Hard cap **100 lines**. A handoff past that has been appended to; read it as a
bug report about itself and rewrite.

## 9. More than one writer

Append-only journals and rewritten handoffs both assume a single writer at a
time. When subagents or parallel sessions share a project:

- **One writer per journal file.** Give each parallel worker its own subject file
  (`NOTES_<SUBJECT>.md` by the subject it owns), or have workers report back in
  the fixed block in `templates/worker-report.md` and let the orchestrator append
  it unchanged. Never two appenders on one file.
- **Only the orchestrator (or the last session standing) rewrites `HANDOFF.md`.**
  Workers put their state in their chapter's status line; the orchestrator
  consolidates.
- Chapter numbers are per file, so cross-file references name the file:
  "overturns NOTES_PARSER.md §28".

## 10. Closing a project

When the work is done: rewrite the handoff one last time so its first section says
so and the state table shows deployed/reachable as actually checked; leave the
journal intact (it is the record of what was tried); and move anything still
consulted into reference files. Don't delete `ClaudeDocs/` — the next person to
touch this code will have the same questions.

## 11. Hooks — turning two rules into mechanisms

The two moments this skill most needs you to act are the two you are least able
to notice: the start of a fresh session (nothing in context says a journal
exists) and the moment before compaction (the context is about to be summarised
and the handoff with it). `hooks/claude-code-settings.json` wires both:
`SessionStart` prints `HANDOFF.md` into context; `PreCompact` prints a reminder to
rewrite it; `Stop` runs `lint.sh`. Offer to install it the first time a project
gets a `ClaudeDocs/`; don't edit the user's settings without asking.

## 12. Other entry points

The default is "journal as you work". Everything below is a different way in,
detailed in `MODES.md` with the honesty banner each one must leave behind —
a journal built after the fact is a different artifact from one written during
the work, and the next reader has to be able to tell.

| Situation | Mode (MODES.md §) |
|---|---|
| Repo has history, no notes — "reconstruct the notes from git" | **reconstruct** §1. Git holds only the path that worked; the result is a chaptered summary with every claim `[reported: git <sha>]`, and the handoff is built from live state, never from git |
| Mid-session, nothing written yet — "catch the notes up" | **backfill** §2. The one after-the-fact mode that still has the dead ends, because they're in context — do it before compaction |
| Existing `docs/`, `TODO.md`, CHANGELOG, issues | **import** §3. Point at them; don't move them; verify their status claims before they reach the handoff |
| Someone else's notes system already in the repo | **adopt** §4. Map their files to the three roles; never duplicate or rename |
| "Check the notes", "lint" | **audit** §5. `scripts/lint.sh` then the semantic checks; findings become a chapter |
| Acting on a handoff you didn't write today | **verify-handoff** §6. Confirm each state line; a drifted handoff is the session's first chapter |
| "Did we already try X?" | **query** §7. Answer *eliminated* / *attempted, inconclusive* / *no record* — never "we didn't try it" |
| Two viable approaches | **branch / merge** §8 (summary in §4 above) |
| One huge file → three roles | **restructure** §9. Keep numbers, verify extracted status, banner the old file |
| Two diverged `ClaudeDocs/` (worktrees, agents) | **merge-journals** §10. Concatenate by subject; the only sanctioned renumbering, with a mapping table |
| "Write me a progress report" | **digest** §11. Derived, dated, never promotes `[assumed]` to fact, never replaces the handoff |
| "Make ADRs / update the CHANGELOG from the notes" | **export** §12. Journal is upstream; strip tags; nothing `open`/`stuck` ships |
| Incident, "what happened when" | **timeline** §13. Observed lines first, one timezone, gaps are events |
| "We're done" | **close** §14. Final handoff, close every open status, lessons → `LESSONS.md` |
| Context switch, `/compact`, "write the handoff now" | **handoff-now** §15 |

Pick the mode from what the user has, not from what they call it: "set up notes
for this repo" on a repo with 400 commits is `reconstruct` plus "starting from
nothing", and the reply should say which parts are reconstructed.

### Direct invocation

When the skill is invoked with arguments (`/notes <verb> [args]` in Claude Code, or
the same string passed as args elsewhere), the first word is the mode and the rest
is its input. No guessing: an unknown verb gets this table back, not a best effort.

| Invocation | Does |
|---|---|
| `/notes` (no args) | Default: `ClaudeDocs/` exists → resume (§2); doesn't → start (§3), if the task warrants it |
| `/notes start [subject]` | Create `ClaudeDocs/` and `NOTES_<SUBJECT>.md`, open §1 with the expectation |
| `/notes resume` | §2 read order, then verify-handoff if the handoff is older than a day |
| `/notes chapter <question>` | Open a new numbered chapter titled `<question>`, write the expectation, stop |
| `/notes status <word> [why]` | Put a status line on the open chapter |
| `/notes handoff` | handoff-now (MODES §15) |
| `/notes verify` | verify-handoff (MODES §6): check every state claim, report holds / drifted / unchecked |
| `/notes query <text>` | MODES §7: eliminated / inconclusive / no record, with chapter refs |
| `/notes fork <question>` | Open a fork chapter; prompts for the success criterion if not given |
| `/notes arm <N> <name>` | Open arm chapter `§Na`/`§Nb`… under fork §N |
| `/notes merge <N> <winner> [why]` | Write the merge chapter for fork §N, set the losing arm abandoned |
| `/notes reconstruct [path\|range]` | MODES §1 from git history; `range` is a git revision range, default all |
| `/notes backfill` | MODES §2 from the current session |
| `/notes import <paths…>` | MODES §3 |
| `/notes adopt` | MODES §4: map an existing notes system, write `OVERVIEW.md` |
| `/notes audit` | MODES §5: `lint.sh` + semantic checks → audit chapter |
| `/notes lint` | `scripts/lint.sh ClaudeDocs` only, print the output, fix nothing |
| `/notes extract <what>` | Move a settled fact/decision/design value to the right reference file |
| `/notes human <question> [assumed: …]` | Add to the handoff's "Needs a human" |
| `/notes restructure` | MODES §9 |
| `/notes merge-journals <other ClaudeDocs path>` | MODES §10 |
| `/notes digest [audience]` | MODES §11 → `DIGEST_<date>.md` |
| `/notes export adr\|changelog\|docs [target path]` | MODES §12 |
| `/notes timeline [sources…]` | MODES §13 |
| `/notes close` | MODES §14 |
| `/notes lessons` | Show `LESSONS.md`; `/notes lessons add <text>` appends a dated line |
| `/notes help` | Print this table |

Verbs are matched on the first word only, case-insensitive; `/notes fork:` and
`/notes fork` are the same. Anything after the verb is passed through verbatim
(a chapter title keeps its punctuation). Direct invocation never skips the
mode's honesty banner or the verify step — the verb picks the procedure, it
doesn't shorten it.

## 13. Anti-patterns

- **A status claim outside the handoff.** It outlives its truth and looks like
  metadata, so nobody re-reads it.
- **"Fixed" when you mean "committed".** The running thing still has the bug.
- **A handoff with a history section.** It has become a second journal; every
  claim in it will go stale at once. Rewrite; history goes to the journal.
- **A bare count.** "42 tests pass" is true for a day. Measure it in the session
  you write it, or label it a snapshot with its date.
- **Claiming live without requesting it.** DNS, tunnels and certificates fail
  quietly. Curl it.
- **Writing it all at the end.** Clean narrative of the path that worked; nothing
  about the paths that didn't.
- **Narrating instead of recording.** "Looked at the config, seemed fine" — what
  did you check, and what would have counted as not fine?
- **Unlabelled evidence.** Without `[verified]`/`[assumed]`, the stuck-review in
  §7 has nothing to grep for.
- **A credential in the journal.** See §3; there is no "just this once".
- **One unbounded file.** Past a few thousand lines nobody reads it, so nobody
  maintains it. Split by subject.
- **Editing history clean.** The corrections are the content.
- **Reading the whole journal at session start.** Spends the context the journal
  exists to save. Handoff → index → headings → targeted chapters.
- **Renumbering chapters.** Breaks every back-reference at once. (The one
  exception, with a mapping table: `MODES.md` §10.)
- **A reconstructed journal without its banner.** A reader who can't tell "built
  from git last Tuesday" from "written during the work" will trust the wrong
  things — the first has no dead ends in it and never will.
- **A fork with no merge chapter.** Two arms, both apparently live, for ever.
- **Deciding silently when the user is away.** Park it in "Needs a human" with the
  interim assumption; don't stall and don't bury the choice in a chapter.
