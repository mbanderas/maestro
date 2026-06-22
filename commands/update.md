---
description: Update the Maestro plugin to the latest marketplace code and instruct the user to reload or restart
argument-hint: ""
allowed-tools: Bash, Read
---

Pull the latest Maestro plugin code from the marketplace and guide the user
through applying it to the running session.

Maestro pins no plugin version — the marketplace clone always tracks the newest
committed code, so a marketplace update followed by a session reload resolves
the latest without any manual version bump.

## Steps

1. **Pull the latest plugin code** via Bash:

   ```bash
   claude plugin marketplace update maestro
   ```

   This is the non-interactive CLI form of the marketplace update. Capture
   stdout/stderr. If the command exits non-zero, report the error verbatim and
   stop. If `claude` is not on PATH, tell the user to run this command in their
   terminal manually and skip to step 3.

2. **Report what changed** — after a successful update, show the latest commits:

   ```bash
   git -C "${CLAUDE_PLUGIN_ROOT}" log --oneline -5 2>/dev/null || true
   ```

   If the plugin root is not a git checkout (e.g. a marketplace zip install),
   note the version is whatever the marketplace published and skip this step.

3. **Reload the running session** — the plugin binary is pinned at session
   start, so the new code is NOT live yet. Tell the user:

   > Run `/reload-plugins` in this session to apply the update without
   > restarting. If that command warns or is unavailable, restart Claude Code —
   > the updated plugin loads automatically on next launch.

   Do not attempt to run `/reload-plugins` via Bash; it is an in-session
   slash command that must be entered by the user in the Claude Code UI.

4. **Post-restart re-sync** — on restart the `SessionStart` hook fires and
   re-syncs any wired copies (e.g. the statusline context-bar script).
   This happens automatically; no manual step is needed.

5. **Confirm** — report: update pulled, session reload required via
   `/reload-plugins` or restart.

Notes:

- `/reload-plugins` applies the new code in-session; a full restart is
  always a safe fallback.
- Do NOT tell the user to run `/plugin update maestro` — that command does not
  exist in Claude Code.
- If step 2 errors (zip install with no `.git`, exit 128), do NOT go hunting
  through the plugin cache with `ls`/`cat`/`grep`/`find` — just skip it and
  report the marketplace-published version. Step 1 succeeding is the update.
- Do not edit any files.
