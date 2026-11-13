#!/bin/sh
# Installs SiaoHerdr into ~/.config/herdr-app. Never touches Herdr's own mods.
#
#   sh Install.sh                        the interface (always), and updates the skills already installed
#   sh Install.sh --skills=all           also install every skill
#   sh Install.sh --skills=notes         just these (dispatcher, notes)
#   sh Install.sh --no-skills            the interface only
#
# The interface: layout, mods, the Siao chrome, the usage strip, subagent rows.
# The skills are optional:
#   dispatcher  Siao Dispatcher, the multi-agent coordinator (/SiaoDispatcher, ＋ menu entry)
#   notes       the ClaudeDocs/ working journal skill and its hooks
# Default: no skills.
set -e
Skills=""; Asked=0
for A in "$@"; do
  case "$A" in
    --skills=all) Skills="dispatcher,notes"; Asked=1 ;;
    --skills=*) Skills="${A#--skills=}"; Asked=1 ;;
    --no-skills) Skills=""; Asked=1 ;;
    *) echo "unknown option $A (see the top of Install.sh)"; exit 2 ;;
  esac
done
if [ $Asked = 0 ]; then
  # No skills unless asked for; ones installed earlier are kept up to date.
  [ -e "$HOME/.claude/skills/SiaoDispatcher" ] && Skills="$Skills,dispatcher"
  [ -e "$HOME/.claude/skills/notes" ] && Skills="$Skills,notes"
fi
Has() { case ",$Skills," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
Src="$(cd "$(dirname "$0")" && pwd)"
AppHome="${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app}"
[ -d "$AppHome" ] || { echo "$AppHome not found — open the Herdr app once first."; exit 1; }

mkdir -p "$AppHome/layouts" "$AppHome/mods" "$AppHome/bin" "$AppHome/skill" "$HOME/.claude/skills" "$HOME/.local/bin"
cp "$Src/layouts/Siao.json" "$AppHome/layouts/Siao.json"
for M in SiaoBrand SiaoSpaces SiaoTabs SiaoBoard SiaoNotes SiaoQuota SiaoMenu SiaoChanges SiaoHints SiaoPaneHead SiaoNewMenu; do
  # a clean copy each time
  [ -d "$AppHome/mods/$M" ] && find "$AppHome/mods/$M" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  mkdir -p "$AppHome/mods/$M"; cp -R "$Src/mods/$M/." "$AppHome/mods/$M/"
done
# Quick-guide key allocation, shared by every mod that draws keys
for M in SiaoBrand SiaoSpaces SiaoTabs SiaoBoard SiaoNotes SiaoQuota; do cp "$Src/mods/SiaoHints/hints.js" "$Src/mods/SiaoHints/rail.js" "$AppHome/mods/$M/"; done
# A mod reloads when its main.js changes, not when a shared file lands next to it, and the copies above
# arrive after main.js: touch main.js so every mod loads once more with the new shared files.
for M in SiaoBrand SiaoSpaces SiaoTabs SiaoBoard SiaoNotes SiaoQuota; do touch "$AppHome/mods/$M/main.js"; done
python3 "$Src/bin/SiaoChromeGen" "$AppHome"   # brand + footer (Herdr's workspace-chrome, renamed SiaoDesk)
# This is the line for Herdr's own app: no 預覽, no bottom drawers, no zh-TW dictionary (those need
# SiaoDesk, the patched build — branch main / stable).
for B in SiaoQuota SiaoStatusSave SiaoStatusLine SiaoRestart SiaoSubagents; do cp "$Src/bin/$B" "$AppHome/bin/"; chmod +x "$AppHome/bin/$B"; done
if Has dispatcher; then case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "Add $HOME/.local/bin to PATH, or the + menu will not find Siao Dispatcher.";; esac; fi

# Skill "dispatcher": /SiaoDispatcher and the ＋ menu's Siao Dispatcher
if Has dispatcher; then
  rm -rf "$AppHome/skill/SiaoDispatcher"; cp -R "$Src/skill/SiaoDispatcher" "$AppHome/skill/SiaoDispatcher"
  cp "$Src/bin/Siao" "$AppHome/bin/"; chmod +x "$AppHome/bin/Siao"; ln -sf "$AppHome/bin/Siao" "$HOME/.local/bin/Siao"
  rm -rf "$HOME/.claude/skills/SiaoDispatcher"; ln -s "$AppHome/skill/SiaoDispatcher" "$HOME/.claude/skills/SiaoDispatcher"
fi
# Skill "notes": the journal every agent writes into
if Has notes; then
  rm -rf "$HOME/.claude/skills/notes"; cp -R "$Src/skill/notes" "$HOME/.claude/skills/notes"; chmod +x "$HOME/.claude/skills/notes/scripts/lint.sh"
fi
echo "Skills: ${Skills#,}" | sed 's/: $/: none (sh Install.sh --skills=all to add them)/'

python3 - "$AppHome" "$Src" "$HOME" "$Skills" <<'EOF'
import json, sys, os
AppHome, Src, Home, Skills = sys.argv[1:5]
Skills = set(filter(None, Skills.split(",")))
def Load(P): return json.load(open(P)) if os.path.exists(P) else {}
def Save(P, D): json.dump(D, open(P, "w"), ensure_ascii=False, indent=2)
# programs.json / keys.json: merge, never overwrite
for Target, Snippet, Key in [(f"{AppHome}/programs.json", f"{Src}/programs.snippet.json", "programs"),
                             (f"{AppHome}/keys.json", f"{Src}/keys.snippet.json", "global")]:
    Add = json.load(open(Snippet))[Key]
    if Key == "programs" and "dispatcher" not in Skills: Add.pop("siao", None)
    D = Load(Target); D.setdefault(Key, {}).update(Add)
    D[Key].pop("cmd-f20", None)   # left + right ⌘ is a SiaoDesk key; here the guide is ⌘;
    Save(Target, D)
# notes skill hooks → ~/.claude/settings.json (SessionStart prints HANDOFF, PreCompact reminds, Stop lints)
Hooks = json.load(open(f"{Src}/skill/notes/hooks/claude-code-settings.json"))["hooks"] if "notes" in Skills else {}
for Ev in Hooks:
    for G in Hooks[Ev]:
        for H in G["hooks"]:
            H["command"] = H["command"].replace(".claude/skills/notes/scripts/lint.sh", f"{Home}/.claude/skills/notes/scripts/lint.sh")
S = Load(f"{Home}/.claude/settings.json"); S.setdefault("hooks", {})
for Ev, Groups in Hooks.items():
    Have = json.dumps(S["hooks"].get(Ev, []))
    for G in Groups:
        if json.dumps(G) not in Have: S["hooks"].setdefault(Ev, []).append(G)
# Subagents under each agent in SiaoBoard: bin/SiaoSubagents keeps ~/.cache/siao-subagents/<terminal>.json
Sub = f"{AppHome}/bin/SiaoSubagents"
# PreToolUse on every tool: a subagent's own tool calls are what it is doing (shown on its row).
for Ev, Matcher in [("PreToolUse", "*"), ("SubagentStart", None), ("SubagentStop", None), ("SessionStart", None)]:
    Mine = [G for G in S["hooks"].get(Ev, []) if Sub in json.dumps(G)]
    for G in Mine:
        if Matcher: G["matcher"] = Matcher
    if Mine: continue
    G = {"hooks": [{"type": "command", "command": Sub, "timeout": 5}]}
    if Matcher: G = {"matcher": Matcher, **G}
    S["hooks"].setdefault(Ev, []).append(G)
Save(f"{Home}/.claude/settings.json", S)
EOF

# Claude Code statusline → per-terminal session file (the usage strip, the focused agent's model / context,
# the restart button). Nobody's statusline yet: ours. One of your own: it has to pass Claude Code's JSON on.
python3 - "$AppHome" "$HOME" <<'PY'
import json, os, sys
AppHome, Home = sys.argv[1:3]
P = f"{Home}/.claude/settings.json"
S = json.load(open(P)) if os.path.exists(P) else {}
Mine = f"{AppHome}/bin/SiaoStatusLine"
Cmd = (S.get("statusLine") or {}).get("command", "")
if not Cmd:
    S["statusLine"] = {"type": "command", "command": Mine}
    os.makedirs(os.path.dirname(P), exist_ok=True)
    json.dump(S, open(P, "w"), ensure_ascii=False, indent=2)
    print("Claude Code statusline: SiaoStatusLine (model · context %).")
elif "SiaoStatus" not in Cmd and not any(os.path.isfile(os.path.expanduser(T)) and "SiaoStatusSave" in open(os.path.expanduser(T), errors="ignore").read() for T in Cmd.split()):
    print(f"Your statusline ({Cmd}) must also pass Claude Code's JSON to {AppHome}/bin/SiaoStatusSave $PPID for the usage strip, e.g. add:\n  printf '%s' \"$Input\" | {AppHome}/bin/SiaoStatusSave $PPID   (with Input=$(cat) at the top)")
PY

# herdr-app (Herdr's command): on PATH from Herdr's installer (~/.local/bin); a DMG or Homebrew install
# keeps it inside the app.
App=$(command -v herdr-app 2>/dev/null || true)
for C in "$HOME/.local/bin/herdr-app" "$HOME/Applications/Herdr.app/Contents/MacOS/Herdr" "/Applications/Herdr.app/Contents/MacOS/Herdr"; do
  [ -n "$App" ] && break; [ -x "$C" ] && App="$C"
done
if [ -z "$App" ]; then
  echo "Installed. herdr-app not found, so the mods were not checked; open Herdr and press ctrl-shift-b for the Siao layout."
  exit 0
fi
echo "Installed. Checking mods:"
for M in SiaoBrand SiaoChrome SiaoSpaces SiaoTabs SiaoBoard SiaoNotes SiaoQuota SiaoMenu SiaoChanges SiaoHints SiaoPaneHead SiaoNewMenu; do "$App" check "$AppHome/mods/$M" || echo "  ^ $M failed, see above"; done
echo "Switch layout:  ctrl-shift-b in Herdr, or  \"$App\" do layout.switch '{\"name\":\"Siao\"}'"
