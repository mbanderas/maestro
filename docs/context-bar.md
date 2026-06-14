# Context Bar, Terse Mode & Compress (Claude Code)

## Claude Code: Context Bar

Maestro ships an optional status line for Claude Code: a context-window progress bar showing how much of the model's context is used.

```text
████████░░░░░░░░░░░░ 42% 84k/200k · my-project
```

The bar updates live, shifts from green to amber to red as context fills, and detects the model's context window automatically, including the 1M-token Opus tier. It is **enabled by default** once installed.

**Install** on Windows / PowerShell:

```powershell
mkdir ~/.claude/statusline, ~/.claude/commands -Force
curl -o ~/.claude/statusline/context-bar.ps1 https://raw.githubusercontent.com/mbanderas/maestro/main/statusline/context-bar.ps1
curl -o ~/.claude/commands/context-bar.md https://raw.githubusercontent.com/mbanderas/maestro/main/commands/context-bar.md
```

**Install** on macOS / Linux (the bar requires [`jq`](https://jqlang.github.io/jq/); without it the status line shows the folder name only):

```bash
mkdir -p ~/.claude/statusline ~/.claude/commands
curl -o ~/.claude/statusline/context-bar.sh https://raw.githubusercontent.com/mbanderas/maestro/main/statusline/context-bar.sh
curl -o ~/.claude/commands/context-bar.md https://raw.githubusercontent.com/mbanderas/maestro/main/commands/context-bar.md
chmod +x ~/.claude/statusline/context-bar.sh
```

Then point Claude Code at the script by adding a `statusLine` block to `~/.claude/settings.json` (use the **absolute path** to the script):

```jsonc
// Windows
"statusLine": {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\you\\.claude\\statusline\\context-bar.ps1\""
}

// macOS / Linux
"statusLine": {
  "type": "command",
  "command": "bash /Users/you/.claude/statusline/context-bar.sh"
}
```

**Enable / disable:** the bar is on by default. Toggle it with the `/context-bar` slash command:

| Command | Effect |
|---|---|
| `/context-bar` | Toggle on/off |
| `/context-bar off` | Disable; status line shows the folder name only |
| `/context-bar on` | Re-enable |

The toggle is a flag file (`.context-bar-disabled`) next to the script. No settings edit, no restart. The change applies on the next status line refresh.

**Codex CLI:** this script does not apply. Codex CLI has no command-backed
status line; it only renders a fixed set of built-in items. It already
ships a native context-usage indicator. Enable it with the `/statusline`
picker, or set `context` in the `[tui].status_line` list in
`~/.codex/config.toml`.

## Claude Code: Terse Mode + Compress

Two token-efficiency tools, adapted from the MIT-licensed
[Caveman](https://github.com/JuliusBrussee/caveman) plugin with
attribution.

**Terse mode** cuts output tokens while keeping full technical
substance. Three levels — `lite` (no filler, full sentences), `full`
(drop articles, fragments OK), `ultra` (abbreviations, arrows,
maximum compression). **Off by default**: installing the plugin never
changes your output style.

- Turn on per session: `/maestro:terse [lite|full|ultra]`; off with
  `/maestro:terse off`, "stop terse", or "normal mode".
- Turn on permanently: set `{"terseLevel": "ultra"}` in the config
  file for your OS (key: `terseLevel`; `MAESTRO_TERSE_LEVEL` env var
  overrides the file):
  - **Windows:** `%APPDATA%\maestro\config.json`
  - **macOS / Linux:** `$XDG_CONFIG_HOME/maestro/config.json`,
    falling back to `~/.config/maestro/config.json`
  - The config file is **never created automatically**. Until it
    exists, terse mode stays off — two machines with identical hook
    installs can behave differently if only one has the file.
- The `maestro-terse-mode` hook injects the level-filtered ruleset
  (single source: `skills/terse/SKILL.md`) at SessionStart and a
  one-line reminder each turn — per-turn reinforcement survives
  context compaction, where one-shot instructions drift.
- Quality guardrails ship with it: code, commits, and PRs are always
  written normal, and Auto-Clarity drops terseness for security
  warnings, irreversible-action confirmations, and multi-step
  sequences.
- The context bar shows a `[TERSE:ULTRA]` badge while active. The
  flag file is read symlink-refusing, size-capped, and whitelisted —
  never rendering attacker-controlled bytes.

**`/maestro:compress <file>`** rewrites a natural-language memory
file (CLAUDE.md, todos, notes) in terse form to cut input tokens —
savings compound every turn the file is loaded (S8). Deterministic
validation (headings, byte-exact code blocks, URLs) with cherry-pick
repair; the original is kept as `<name>.original.md` and restored on
persistent failure. Files with secret-looking names (.env,
credentials, keys, `.ssh`/`.aws` paths) are refused outright —
compression sends file contents to the Anthropic API.
