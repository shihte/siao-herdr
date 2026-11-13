# Installing SiaoHerdr (for AI agents)

You are installing SiaoHerdr, a layout and mods for the Herdr app, on the user's machine. Follow these
steps in order and report what each one printed. Do not change anything the steps don't mention.

**Never open new app windows** while installing or testing (no second Herdr window, no separate test
instance). To look at something, open a new tab in the Herdr the user already has open, and close it
afterwards.

## 1. Check the prerequisites

- macOS or Linux (Windows is not supported).
- `git` and `python3` on PATH.
- Herdr is installed **and has been opened at least once**: `~/.config/herdr-app/mods/workspace-chrome`
  must exist (or `$HERDR_APP_HOME/mods/workspace-chrome` if the user sets that).
  If Herdr is missing, tell the user to install it from https://github.com/herdrdev/herdr-app
  (`curl -fsSL https://releases.herdr.dev/app/install.sh | sh`, or `brew install --cask herdr-app`),
  open it once, then continue. Don't install Herdr yourself without asking.

## 2. Get the code

```sh
git clone https://github.com/shihte/siao-herdr.git ~/siao-herdr   # or `git -C ~/siao-herdr pull` if it is already there
```

## 3. Ask about the optional skills, then install

Ask the user once whether they want the optional Claude Code skills (default: none):

- `dispatcher` — Siao Dispatcher, a coordinator session that hands work to subagents in git worktrees.
- `notes` — the `ClaudeDocs/` working-journal skill (adds hooks to `~/.claude/settings.json`).

Then run exactly one of:

```sh
sh ~/siao-herdr/Install.sh                       # interface only (the default)
sh ~/siao-herdr/Install.sh --skills=all          # interface + both skills
sh ~/siao-herdr/Install.sh --skills=notes        # interface + the named skill(s), comma separated
```

What it changes: files under `~/.config/herdr-app` (layout `Siao`, mods `Siao*`, `bin/Siao*`, entries
merged into `programs.json` and `keys.json`), Claude Code hooks for the subagent rows in
`~/.claude/settings.json`, and a Claude Code `statusLine` only if the user had none. Herdr's own mods are
never touched.

## 4. Check the result

- Every line after `Installed. Checking mods:` should say `check passed`. If one says `failed`, show the
  user the error above it.
- If it printed `Your statusline (...) must also pass Claude Code's JSON ...`, the user already has a
  statusline of their own: show them that message and let them decide; don't edit their script unasked.
- Tell the user to switch to the layout with **ctrl-shift-b** in Herdr (or run the `do layout.switch`
  command the installer printed).

## Updating and removing

- Update: `git -C ~/siao-herdr pull && sh ~/siao-herdr/Install.sh` (installed skills are kept up to date).
- Remove: switch Herdr back to its own layout (`herdr-app do layout.switch '{"name":"main"}'`), then delete
  `~/.config/herdr-app/mods/Siao*`, `~/.config/herdr-app/layouts/Siao.json` and `~/.config/herdr-app/bin/Siao*`.
