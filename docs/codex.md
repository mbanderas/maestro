# Maestro on Codex

Codex reads `AGENTS.md` natively, no adapter file needed. This page
maps Maestro's concepts onto Codex specifics. All behavior below was
verified against the official Codex docs
([AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md),
[config reference](https://developers.openai.com/codex/config-reference#configtoml),
[plugin-bundled hooks](https://developers.openai.com/codex/hooks#plugin-bundled-hooks),
[Automations](https://developers.openai.com/codex/app/automations.md),
[Subagents](https://developers.openai.com/codex/subagents.md))
on 2026-06-12.

## AGENTS.md semantics

Codex discovers instruction files in this order:

1. **Global:** `~/.codex/AGENTS.override.md` if present, else
   `~/.codex/AGENTS.md`.
2. **Project:** walking from the Git root down to the current working
   directory, checking each level for `AGENTS.override.md`, then
   `AGENTS.md`.

Files are concatenated root-down with blank lines between them; files
closer to your current directory appear later in the combined prompt
and therefore override earlier guidance. Codex skips empty files,
discovers once per run, and stops adding files once the combined set
hits `project_doc_max_bytes` (32 KiB by default).

Practical consequences for Maestro:

- **Placement:** put Maestro's `AGENTS.md` at the repository root. If
  you already have a project `AGENTS.md`, append Maestro's content to
  it (Codex concatenates by directory level, not by file).
- **Budget:** Maestro's always-on kernel is ~11 KB, a third of the
  default 32 KiB cap, leaving room for your project instructions
  (the full S2-S6 protocol lives in `docs/orchestration.md`, read on
  demand). If you layer nested `AGENTS.md` files, watch the cap:
  Codex silently stops adding files beyond it.
- **Global install:** putting Maestro in `~/.codex/AGENTS.md` applies
  the doctrine to every project; per-repo files then layer on top and
  win where they conflict.

## Config, hooks, and trust

Codex user config lives at `~/.codex/config.toml`. Project overrides can
live in `.codex/config.toml`, but Codex loads project-local config,
hooks, and rules only for trusted projects. Untrusted projects skip
those local surfaces.

Codex also supports plugin-bundled lifecycle hooks. Enabled plugins can
ship hooks alongside user, project, and managed hooks; the default plugin
hook file is `hooks/hooks.json`, and manifests can reference `./` paths
or inline hook definitions. Treat plugin hooks as executable code:
review and trust the plugin before enabling them. Codex sets
`PLUGIN_ROOT` and `PLUGIN_DATA` for plugin hooks, and also sets
`CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility.

Maestro's verify gate runs on Codex too. The `verify` setting
(`off`/`warn`/`block`, default `warn`) persists portably through the Maestro
CLI and the `maestro-settings` skill, and the `maestro-verify-gate.cjs` `Stop`
hook now parses Codex rollout transcripts with the same three signals it derives
from Claude's (a file edit, a checker run, an honest status token). So once the
plugin hooks are installed and trusted, `verify block` enforces S7.3 on the
Codex `Stop` event — which honors `decision:"block"` — exactly as on Claude
Code. (Codex omits the `stop_hook_active` re-entry flag; the gate's block-once
marker is the re-entry guard there.)

For Codex CLI/Desktop, install Maestro as a native Codex plugin:

```text
codex plugin marketplace add mbanderas/maestro
codex plugin add maestro@maestro
```

The repo is a Codex marketplace because it ships
`.agents/plugins/marketplace.json`; the plugin itself is described by
`.codex-plugin/plugin.json`. That manifest points at the plugin-bundled Codex
skills (`./codex-skills/`); the hook bundle lives at Codex's default plugin hook path
`./hooks/hooks.json`, so Codex can install the plugin without `npx`. Restart
Codex or start a new thread after changing plugin installation/trust state,
then review and trust the bundled hooks before expecting autorun.

`maestro install --target codex` remains as a portable/manual fallback when
you specifically want to copy files into a project instead of installing the
Codex plugin.

## Token telemetry

The Claude Code `maestro-gate-telemetry` SessionEnd hook records per-session
token usage to `~/.claude/maestro-telemetry.jsonl`. `scripts/codex-telemetry.cjs`
extends the same measurement to Codex so overhead is comparable across both
CLIs (S9).

Codex writes one rollout transcript per session at
`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (verified on macOS
2026-06-22). Token usage rides on `event_msg` lines with
`payload.type == "token_count"`; the **last** `total_token_usage` is the
session cumulative. The script appends a row with `source:"codex"` and the
same token field names the Claude hook writes, mapped to the same semantics:
`input_tokens` is **uncached** new input (Codex's `input_tokens` minus
`cached_input_tokens`), `cache_read_tokens` is the cached input, and
`cache_creation_tokens` is `null` (Codex reports no cache-write metric).
`reasoning_output_tokens` and `total_tokens` are kept as Codex extras.

Codex supports a full plugin lifecycle hook set — `SessionStart`,
`SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`,
`PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, and `Stop`
(which honors `decision:"block"`) — installed via `hooks/hooks.json`. There is,
however, **no `SessionEnd` event**, and this telemetry mirrors the Claude
`SessionEnd` hook, so on Codex it stays **manual** (the closest per-turn callout
is `notify`, fired as `turn-ended`, but it is typically already bound to another
integration). Run the script directly or from your own wrapper:

```text
node scripts/codex-telemetry.cjs <rollout.jsonl>   # append a telemetry row
node scripts/codex-telemetry.cjs --latest          # newest rollout under ~/.codex/sessions
node scripts/codex-telemetry.cjs <file> --print     # print the row, write nothing
```

It reads only local files and never makes network calls. Override the output
path with `MAESTRO_TELEMETRY_FILE` and the sessions directory with
`CODEX_SESSIONS_DIR`. Rollouts can be hundreds of MB; the parser streams them
line-by-line with bounded memory.

## Multi-agent routing (S2-S6 mapping)

Codex supports subagent workflows in the CLI and app, but current Codex
docs specify that subagents spawn only when the user explicitly asks for
them. Practical mapping for Maestro:

- If the user did **not** explicitly ask for subagents, parallel
  agents, or delegation, emit the counted S1 verdict and continue
  single-agent even when the portable gate would otherwise route to
  S2-S6.
- If the user explicitly asked for subagents/parallel work and the S1
  gate returns multi-agent, map Maestro's Planner, Specialists, and
  Staff Engineer to Codex subagents. Keep specialist prompts scoped and
  cap parallel groups at 4 as usual.
- Claude Code agent teams do not transfer to Codex. Codex subagents are
  the only Codex-native mapping for Maestro specialists.

## Long-horizon operation (S10 mapping)

Claude Code maps S10 to `/loop`, `/schedule`, and `ScheduleWakeup`.
The Codex analog is **Automations** (Codex app, automations pane):
recurring prompts that run in the background on minute-based, daily,
weekly, or cron schedules.

| Maestro S10 concept | Codex mechanism |
|---|---|
| Self-paced session loop | **Thread automations**, heartbeat-style recurring wake-up calls attached to the current thread, preserving conversation context |
| Durable scheduled routine | **Standalone/project automations**, independent runs; findings land in the Triage inbox (auto-archived when there is nothing to report) |
| Checkpoint artifact | Same convention: one `_<task>.md` in the repo root (gitignore `_*`), read first on every run, holding phase status, findings with sources, decisions with rationale |
| Scripted/CI iteration | `codex exec "<prompt>"` non-interactive runs |

S10 rules apply unchanged: hard caps on iterations, completion criteria
declared up front, externalized state (the thread is not durable
memory), and an explicit final report instead of a zombie loop. For
project-scoped automations note the Codex requirement that the local
app is running and the project is on disk.

## Frontier autorun and scope

Frontier is off until you arm it. For Codex, the normal workflow is:

```text
maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
maestro frontier mode off --scope codex-project
```

Once the Maestro Codex plugin hook is installed, enabled, and trusted,
normal Codex prompts route through Frontier until you turn it off.
`maestro frontier run "<prompt>" ...` remains available for advanced/debug
one-offs, but it is not the everyday Codex flow.

Project/workspace scope is the recommended default for repo installs:
it keeps one repository's armed state from leaking into another. In a
Codex plugin context Maestro resolves this automatically to a
`codex-<8hex>` workspace scope. From a shell in the repo, pass
`--scope codex-project` (or `codex-workspace`) to resolve the same project
scope. Global/user scope is optional: choose an explicit name such as
`--scope codex-global` only when you deliberately want the same state across
projects.

Use the same active scope for all lifecycle commands:

```text
maestro frontier status --scope codex-project
maestro frontier mode off --scope codex-project
maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
```

## What differs from Claude Code

Claude Code-specific UI such as the Maestro context bar does not apply:
Codex CLI ships a native
context-usage indicator (`/statusline` picker, or `context` in
`[tui].status_line` in `~/.codex/config.toml`).

## Skills and the Frontier ON indicator

Codex skills can live in personal `$HOME/.agents/skills`, repo
`.agents/skills`, or installed plugins. The normal Codex path is the Maestro
plugin, which bundles `maestro-frontier`, `maestro-settings`, `maestro-terse`,
and `maestro-update` from `./codex-skills/`. The portable
`maestro install --target codex` fallback still installs those same skills to
`.agents/skills/<name>/SKILL.md` for project installs or
`~/.agents/skills/<name>/SKILL.md` for global/user installs.

When `maestro frontier status --scope codex-project` reports mode != off,
the `maestro-frontier` skill instructs Codex to lead its reply with
`Maestro Frontier ON (<label>)` — `single · <model>` or `fusion · <preset>`. When
mode is off, no indicator line appears.
