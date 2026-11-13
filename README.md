# SiaoHerdr

A layout and a set of mods for [Herdr](https://github.com/herdrdev/herdr-app) (works with Herdr's own app, v0.1.14 and v0.1.15).

```
┌──────────┬──────────────────────────────────┬────────────────────┐
│ Folders  │ tabs                       筆記 檔案 變更              │
│ (click = ├──────────────────────────────────┤ notes / files /    │
│  scope)  │                                  │ changes, one at a  │
├──────────┤   terminal and agent panes       │ time               │
│ Agents   │                                  │                    │
│ + their  │                                  │                    │
│ subagents│                                  │                    │
├──────────┼──────────────────────────────────┴────────────────────┤
│ settings │ usage strip: session · 5 hours · this week            │
└──────────┴───────────────────────────────────────────────────────┘
```

- **Folders** — every space, grouped by machine; ＋ asks which machine (this Mac or one added with `hc machine add`); ⏏ on a machine's heading disconnects it.
- **Agents** — every agent with its status (needs you / working / done / idle), Claude Code's own subagents nested under the agent that started them with what each is doing; click one to open it.
- **Right column** — 筆記 (a project's `ClaudeDocs/` journal), 檔案 (files), 變更 (git changes), one at a time.
- **Usage strip** — Claude's official rate limits (5-hour and weekly) and the focused agent's model and context, read from Claude Code's statusline. Nothing is estimated: when it can't read them it says so.
- **Quick guide** — ⌘; puts a key on everything clickable.

## Install

Open Herdr once, then:

```sh
git clone https://github.com/shihte/siao-herdr.git
cd siao-herdr
sh Install.sh
```

Switch to the layout with ctrl-shift-b (or `herdr-app do layout.switch '{"name":"Siao"}'`).

`Install.sh` only adds its own files under `~/.config/herdr-app` (Herdr's own mods are never touched) and Claude Code hooks (in `~/.claude/settings.json`) for the subagent rows. Run it again to update.

### Optional skills (not installed by default)

| skill | what it is |
|---|---|
| `dispatcher` | Siao Dispatcher: a Claude Code session that only plans, hands work to subagents in their own git worktrees, and keeps the ledger (also a ＋ menu entry) |
| `notes` | the `ClaudeDocs/` working-journal skill and its hooks |

```sh
sh Install.sh --skills=all             # both
sh Install.sh --skills=notes           # just one
sh Install.sh --no-skills              # interface only, even if skills were installed before
```

### Usage strip

The strip reads what Claude Code's statusline writes. If you have `~/.claude/statusline.sh`, `Install.sh` appends one line to it; otherwise it tells you the line to add.

## License

Apache-2.0, like Herdr. `mods/SiaoNewMenu` is adapted from Herdr's own new-menu mod.
