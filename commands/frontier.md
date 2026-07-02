---
description: Maestro Frontier local multi-CLI engine: arm a mode (off/single/fusion) so it auto-runs every prompt, pick a model/preset, or run a one-off prompt
argument-hint: "<off | single <model> | fusion <preset> | status | run <prompt> | adopt>"
allowed-tools: Bash, Read
---

Drive the Maestro Frontier engine: a zero-dependency local multi-CLI
fusion engine (parallel panel of local CLIs -> a judge model's
analysis -> grounded synthesis). Default mode is `off`: the engine is opt-in and
never runs until you switch it on. Arming it (`single` or `fusion`)
makes it **auto-run on every prompt** — a `UserPromptSubmit` hook
(`hooks/frontier-autorun.cjs`) routes each prompt through the engine and
the live session relays the synthesized answer. `off` disables auto-run.
Autorun blocks the turn until the engine returns; the hook carries a
600s timeout (`hooks/hooks.json`), and the engine keeps itself inside
that window with an internal 540s run budget — a stage that would start
over budget is skipped and the run degrades gracefully to the best
answer already in hand (judge skipped -> synthesis on raw responses;
synthesis skipped -> longest panel response). Any engine error degrades
the same way.
Plugin/slash command prompts (e.g. `/maestro:frontier off`, `/clear`)
bypass autorun entirely — they are host directives, not questions
(opt out with `autorunOnCommands: true` in frontier state).

Requested action: `$ARGUMENTS`

Map the argument to one engine CLI call and run it. The engine is
self-contained; do not edit its state file yourself.

1. Mode switch (persists across sessions; default `off`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode off
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode single --model <model>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset <preset>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset custom --models <a,b,c>
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier mode fusion --preset <preset> --judge <model> --synth <model>
   ```

   Models: `opus` (Claude Opus 4.8), `fable` (Claude Fable 5), `sonnet-5`
   (Claude Sonnet 5), `gpt-5.5` (Codex), `gemini` (Gemini 3.1 Pro).
   Presets: `opus-duo`, `opus-gpt`, `gpt-duo`, `frontier-trio`,
   `fable-duo`, `fable-gpt`, `fable-trio`, `sonnet-duo`, `sonnet-gpt`,
   `sonnet-trio`, `frontier-quad` (fable+opus+gpt+gemini), `frontier-quint`
   (adds sonnet-5), `custom`. The judge + synthesizer default to Opus, but
   the family presets self-judge (`gpt-duo` on GPT-5.5, `fable-*` on Fable,
   `sonnet-*` on Sonnet 5 — each a single-family fusion), and
   `--judge`/`--synth` override the model for any preset, so you can mix
   freely (e.g. `--judge opus --synth gpt-5.5`). `frontier-quad`/`-quint`
   keep the global Opus judge/synth (Fable/Sonnet stay panelists).

2. Show current mode/preset:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier status
   ```

3. Run a prompt through the current mode (prompt as the argument, or
   piped on stdin). This is a manual one-off; when the engine is armed
   (`single`/`fusion`) the autorun hook already runs every prompt for
   you, so `run` is mainly for scripting or an explicit re-run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier run "<prompt>"
   ```

   - `off`: prints a notice and exits without spawning anything;
     normal Maestro behavior is unchanged.
   - `single`: dispatches the one selected CLI and prints its answer.
   - `fusion`: runs the panel in parallel, then the judge and
     synthesizer models; prints the final answer (a one-line run meta of
     preset, models, analysis present, and failed models goes to stderr).
   - A run or arm that involves **Fable 5** on or after **2026-07-07**
     also prints a one-line `[frontier] …` cost advisory to stderr (Fable
     draws Usage Credits past that date instead of subscription). It never
     blocks the run — **relay that advisory line to the user** if present.

4. Adopt a previously-armed **global** mode into this workspace
   (per-workspace isolation means a workspace never inherits the old
   global state automatically — this copies it in once, on demand):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt
   node "${CLAUDE_PLUGIN_ROOT}/bin/maestro.cjs" frontier adopt --force
   ```

   Reads the legacy global `frontier-state.json` read-only and writes it
   into this workspace's `frontier-state.cc-<hash>.json`. It refuses to
   overwrite an existing workspace state unless `--force`, never touches
   the legacy file, and only targets a Claude Code `cc-*` scope. If
   there is no legacy state (`missing-legacy`) it does nothing — arm the
   workspace with `mode` instead.

5. Report the result, matched to the action:
   - `run`: report the engine's stdout verbatim.
   - `adopt`: confirm the adopted mode/preset, or relay the
     `ERROR [<reason>]` (e.g. `exists` — suggest `--force`; `missing-legacy`
     — nothing to adopt). Arming now auto-runs on every prompt.
   - arming a mode (`single`/`fusion`): confirm the mode, then tell the
     user plainly that the engine now **auto-runs on every prompt** —
     they just chat normally and the synthesized answer is relayed.
     Do NOT tell the user to call `run` manually; arming already routes
     every prompt through the engine (`run` is only a scripted one-off).
   - `off`: confirm auto-run is disabled and normal Maestro resumes.
   - `status`: report the current mode/preset.

   On an error the engine prints `ERROR [<failure_reason>]: <detail>`
   to stderr and exits non-zero; relay the failure_reason.

   Whenever the engine prints a `[frontier] …` advisory line to stderr
   (e.g. the Fable 5 Usage-Credits cost notice), surface it to the user
   verbatim alongside your answer — it is informational, never a failure.

Notes:

- **Arming in Claude Code is per-workspace.** State is stored in a
  workspace-scoped file (`frontier-state.cc-<hash>.json`, keyed to the
  git project root). Arming in one workspace does not affect any other.
  After upgrading Maestro, each Claude Code workspace starts `off` and
  must be re-armed — no automatic migration into workspace scopes.
  `adopt` (step 4) is the explicit opt-in to copy a prior global mode in.
- Real `single`/`fusion` runs spawn local CLIs and cost tokens; each
  cold `claude -p` panel/judge/synth call is non-trivial. Use small
  prompts. `off` is free.
- **Fable 5 cost:** under a Claude subscription, Fable 5 is covered (up to
  ~50% of your weekly usage limit) only through **2026-07-07**; on or after
  that date it draws Usage Credits and burns usage faster than Opus 4.8.
  The engine surfaces this as a non-blocking `[frontier] …` stderr advisory
  when a Fable-bearing panel runs past the cutoff — it never gates a run.
  The claude-family panelists (`opus`, `fable`, `sonnet-5`) all share the
  one `claude` CLI, so `frontier-quint` can make up to five `claude` calls
  per run on a single subscription — mind the rate limit.
- Headless web access varies per CLI (Codex confirmed; Claude and
  Gemini gated off in this build). The engine sets a per-adapter
  `webTools` flag accordingly; see the risk burndown.
- `gemini` works well as a panel member, but on Windows it is a poor
  `--judge`/`--synth` choice: it takes its prompt as an argument and the
  judge/synth prompts contain newlines, which the win32 arg-safety guard
  refuses, so the stage then degrades (judge omitted, synth falls back).
  Use `opus` or `gpt-5.5` for judge/synth on Windows. (No such limit on
  macOS/Linux, where args are passed directly.)

## Binary overrides

The engine is zero-dependency CommonJS under `frontier/`. Each CLI is
resolved from your `PATH`: `claude` (Opus 4.8, Fable 5, Sonnet 5 — one
CLI, distinct `--model`), `codex` (GPT-5.5), and `gemini` (Gemini 3.1
Pro). When a binary is not on `PATH`, or you want a specific build, point
at it with an environment variable:

- `MAESTRO_CLAUDE_BIN` sets the `claude` binary path (all Claude models).
- `MAESTRO_CODEX_BIN` sets the `codex` binary path.
- `MAESTRO_GEMINI_BIN` sets the `gemini` binary path.

## Concurrency — fusion is safe to run in one workspace

Frontier follows the Mixture-of-Agents (multi-model ensemble) shape: one
prompt fans to a panel, a judge maps agreement and contradiction, a
synthesizer writes the grounded answer. The panel/judge/synth members
are **read-only, one-shot `-p` subprocesses** — they emit text to stdout
(or a unique tmp last-message file) and exit; they never commit, never
edit the repo, and never run an autonomous loop. Read-only is **enforced
at spawn**, not assumed: each adapter's `baseArgs` carries its CLI's
read-only mode (`claude --permission-mode plan`, `codex --sandbox
read-only --ask-for-approval never`, `gemini --approval-mode plan`; see
`frontier/config.cjs`), and the engine consumes only each member's
stdout text — any filesystem change a member made would be unread
side-effect. A write/bypass flag here would turn each panel member into a
parallel write-loop on an agentic prompt, so those flags are forbidden in
config and asserted against in `frontier/config.test.cjs`. So arming
`fusion` (e.g. `opus-duo`) and letting two or more model CLIs work the
same workspace at once is **safe by construction** — there is no shared
branch or checkpoint for them to race. This is categorically different
from two independent autonomous *build* loops on one branch, which IS the
S10-forbidden "loops never spawn loops" state.

The autorun hook adds a second guard: it **refuses to fan an
autonomous-loop or scheduled-resume directive** (a `/loop` invocation, the
`<<autonomous-loop>>` / `<<autonomous-loop-dynamic>>` sentinels, or an
"AUTONOMOUS LOOP" resume prompt). Even with read-only members, fanning a
loop prompt across N CLIs double-executes the loop's intent — the exact
case where fusion looked like a second loop racing the host session.
Override with `autorunFanLoops: true` in frontier state.

To make that distinction machine-checkable, every Frontier run stamps
itself and all of its children with `MAESTRO_FRONTIER_RUN_ID`
(`frontier-<base36 ts>-<rand>`), generated once per top-level run and
inherited unchanged by nested calls — propagated to each child over the
same `process.env` channel as `FUSION_DEPTH`. A coordinated, read-only
Frontier subprocess therefore carries this variable; a rogue independent
write-loop does not. When re-grounding (S7.0/S10) and you see a sibling
`claude`/`codex`/`gemini` process in the workspace, a set
`MAESTRO_FRONTIER_RUN_ID` means it is a coordinated panel/judge/synth
member to leave alone — not a second loop to stop for. To check from
outside a process, list the live coordinated runs in this workspace:

```bash
node "<plugin>/frontier/runlock.cjs"   # prints active Frontier runs as JSON
```

The engine records each run there (pid + runId + cwd) for exactly its
duration and prunes dead entries on read, so an empty list means no
Frontier run is in flight.

### "Working together" is orchestration, not peer-joining

Fusion is a Mixture-of-Agents (multi-model ensemble) shape: ONE
orchestrator fans a prompt to a panel it spawns, then judges and
synthesizes. That is the whole of "models working together" — there is
no IPC or message bus, and one already-running interactive session
cannot see, join, drive, or message another. The marker is for
**non-interference** (don't misread a coordinated panelist as a rogue
loop), not **cooperation**. Two independent *interactive write sessions*
on one branch + one shared checkpoint is still the S10-forbidden race;
the marker does not — and must not — make that safe. Serialize live
writers with separate branches/worktrees + per-task `_<task>.md`
checkpoints, or use the clean multi-instance pattern: one writer (the
builder) plus read-only, fresh-context adversarial reviewers feeding
findings back — which is itself what a fusion panel embodies.

### No overlap with multi-agent orchestration

The panel/judge/synth CLIs are one-shot, read-only subprocesses the
engine spawns and reaps per run; they are never a pool that the
Agent/Task tool draws from, and they cannot be repurposed into task
workers. Multi-agent orchestration (S2-S6) uses the in-session
Agent/Task tool — a separate mechanism. The two coordination env
markers never leak between them: `FUSION_DEPTH` is set only as a
per-child env in `dispatch.cjs` (never on the parent `process.env`), and
`MAESTRO_FRONTIER_RUN_ID` is set only inside the short-lived run process
(autorun hook / `maestro frontier run`), which exits afterward — so
neither reaches the long-lived host session or an orchestration
subagent. The one real interaction is cost: with the engine armed, the
autorun hook fuses *every* prompt, so running heavy orchestration with
fusion armed pays a per-prompt fusion tax. Turn the engine `off` while
orchestrating if you do not want that.
