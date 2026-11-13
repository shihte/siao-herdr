#!/usr/bin/env bash
# lint.sh — mechanical checks for a ClaudeDocs/ directory.
# Usage: scripts/lint.sh [ClaudeDocs]      exit 0 = clean, 1 = findings, 2 = usage
# Checks only what a regex can check. Semantic review is MODES.md §5 (audit).

set -u
Dir="${1:-ClaudeDocs}"
[ -d "$Dir" ] || { echo "usage: $0 [ClaudeDocs-dir]  (no such dir: $Dir)"; exit 2; }

Out=$(mktemp); trap 'rm -f "$Out"' EXIT
Report() { printf '%s\n' "$*" | tee -a "$Out"; }

Handoff="$Dir/HANDOFF.md"
Journals=$(ls "$Dir"/NOTES_*.md 2>/dev/null)

# 1. Handoff exists, is dated, is short, leads with dangers
if [ -f "$Handoff" ]; then
  Lines=$(wc -l < "$Handoff")
  [ "$Lines" -gt 100 ] && Report "HANDOFF: $Lines lines (>100) — it has been appended to; rewrite it"
  grep -qiE '^Rewritten: *[0-9]{4}-[0-9]{2}-[0-9]{2}' "$Handoff" || Report "HANDOFF: no 'Rewritten: YYYY-MM-DD' line"
  grep -qiE '^## .*(read this first|danger|hurt)' "$Handoff" || Report "HANDOFF: no 'Read this first' section — dangers must lead"
  grep -qiE '^## .*(history|background|how we got here)' "$Handoff" && Report "HANDOFF: has a history section — that belongs in the journal"
  grep -qiE 'deployed|not deployed' "$Handoff" || Report "HANDOFF: never says what is or isn't deployed"
else
  Report "HANDOFF.md missing"
fi

# 2. Status language outside the handoff
for F in "$Dir"/*.md; do
  case "$F" in "$Handoff"|*/DIGEST_*) continue;; esac
  grep -nE '\b(currently|not yet|so far|nothing has been|as of now|still needs to be)\b' "$F" \
    | grep -vE 'Status:|\[reported|\[verified|\[inferred|\[assumed|→ (wrong|superseded)' \
    | sed "s|^|STATUS-OUTSIDE-HANDOFF ${F##*/}:|" | while read -r L; do Report "$L"; done
done

# 3. Journals: chapters without a status line, unmerged forks, stale [assumed]
for J in $Journals; do
  Name=${J##*/}
  awk -v name="$Name" '
    /^## [0-9]+[a-z]?\./ {
      if (inchap && !hasstatus) printf "NO-STATUS %s: %s\n", name, title
      inchap=1; hasstatus=0; title=$0
      sub(/^## /,"",title)
      if (match(title,/^[0-9]+[a-z]\./)) { n=substr(title,1,RLENGTH-2); forks[n]=1 }
      if (title ~ /^[0-9]+\. *Merge:/) { for (k in forks) delete forks[k] }
      next
    }
    /^### Status:|^Status:/ { hasstatus=1 }
    END {
      if (inchap && !hasstatus) printf "NO-STATUS %s: %s\n", name, title
      for (k in forks) printf "OPEN-FORK %s: chapter %s has branches but no later \"Merge:\" chapter\n", name, k
    }' "$J" | while read -r L; do Report "$L"; done

  # [assumed] lines more than 3 chapters old (by position)
  awk -v name="$Name" '
    /^## [0-9]+[a-z]?\./ { ch++ }
    /\[assumed\]/ { a[NR]=ch; t[NR]=$0 }
    END { for (n in a) if (ch - a[n] >= 3) printf "STALE-ASSUMED %s:%d (chapter %d of %d): %s\n", name, n, a[n], ch, substr(t[n],1,80) }' "$J" \
    | while read -r L; do Report "$L"; done

  # chapters with no Opened: date
  awk -v name="$Name" '
    /^## [0-9]+[a-z]?\./ { if (inchap && !dated) printf "NO-DATE %s: %s\n", name, title; inchap=1; dated=0; title=$0; next }
    /^Opened: *[0-9]{4}-[0-9]{2}-[0-9]{2}/ { dated=1 }
    END { if (inchap && !dated) printf "NO-DATE %s: %s\n", name, title }' "$J" | while read -r L; do Report "$L"; done
done
[ -z "$Journals" ] && Report "no NOTES_*.md journal found"

# 4. Index covers every file
Overview="$Dir/OVERVIEW.md"
Count=$(ls "$Dir"/*.md | wc -l)
if [ "$Count" -gt 3 ]; then
  [ -f "$Overview" ] || Report "OVERVIEW.md missing with $Count files present"
  if [ -f "$Overview" ]; then
    for F in "$Dir"/*.md; do
      B=${F##*/}; [ "$B" = "OVERVIEW.md" ] && continue
      grep -q "$B" "$Overview" || Report "OVERVIEW: does not mention $B"
    done
  fi
fi

# 5. Secret-shaped strings (common shapes only — eyeball the rest)
grep -nE 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY|(password|passwd|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'\'']?[^[:space:]"'\''<]{8,}|://[^/[:space:]:]+:[^@[:space:]]{4,}@' \
  "$Dir"/*.md "$Dir"/*.csv 2>/dev/null | grep -v 'REDACTED' | sed 's|^|SECRET-SHAPED |' | while read -r L; do Report "$L"; done

# 6. Superseded banners
grep -lniE 'superseded' "$Dir"/SPEC_*.md "$Dir"/DECISIONS*.md 2>/dev/null | while read -r F; do
  head -3 "$F" | grep -qi 'superseded' || Report "BANNER ${F##*/}: mentions supersession but not in its first 3 lines"
done

Findings=$(wc -l < "$Out")
if [ "$Findings" -eq 0 ]; then echo "lint: clean ($Dir)"; exit 0; fi
echo "lint: $Findings finding(s)"; exit 1
