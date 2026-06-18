<p align="center">
  <img src="assets/maestro-frontier-banner.png" width="100%" alt="Maestro Frontier: the mascot conducts a panel of local model CLIs through a judge model into a grounded synthesis">
</p>

<p align="center">
  <strong>Achieve Frontier AI performance in your CLI</strong> — by fusing the model CLIs you already run. Fan one prompt across a panel of 1-8 of your local CLIs in parallel, have a judge model you pick read every answer into a structured analysis, then a synthesizer you pick write one grounded answer that does not majority-vote. On a 100-task benchmark, every fusion panel outscored its individual member models. It runs on Maestro's discipline layer: verified done-claims, surgical scope, and a research-backed multi-agent gate.
</p>

<p align="center">
  <a href="https://github.com/mbanderas/maestro/actions/workflows/ci.yml"><img src="https://github.com/mbanderas/maestro/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/mbanderas/maestro/tags"><img src="https://img.shields.io/github/v/tag/mbanderas/maestro?label=version&amp;color=5b82d6" alt="Latest version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen" alt="Zero Dependencies">
</p>

<p align="center">
  <a href="#the-frontier-engine"><img src="https://img.shields.io/badge/Frontier-fusion%20engine-f59e0b" alt="Frontier fusion engine"></a>
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Gemini%20%7C%20Codex%20%7C%20Cursor-5b82d6" alt="Claude Code | Gemini | Codex | Cursor">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="macOS | Linux | Windows">
  <img src="https://img.shields.io/badge/install-plugins%20%2B%20portable-blueviolet" alt="Native plugins and portable installs">
  <a href="#contributing"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome"></a>
</p>

<p align="center">
  <sub>17 fixture tasks &middot; 147 valid A/B runs &middot; 11 voids excluded &amp; re-run &middot; 6 hooks, all tested &middot; ~10 KB always-on kernel &middot; plugin + portable installs</sub>
</p>

> **Install — run the command block for your tool, inside that tool.**
> Claude Code and Codex use native plugins. Cursor, Gemini, Cline,
> Windsurf, and other CLIs use the portable installer, which copies
> Maestro's runtime-agnostic files into the current project/workspace by
> default. Global/user installs are optional when you intentionally want
> cross-project behavior.

**Claude Code / Desktop** — native plugin (enforcement hooks, `/maestro:*` commands, skills, status line, Frontier auto-run):

```text
/plugin marketplace add mbanderas/maestro
/plugin install maestro@maestro
```

**Codex CLI / Desktop** — native Codex plugin via the Maestro repo
marketplace (skills, trusted hooks, and Frontier auto-run after you review
and trust the hooks):

```text
codex plugin marketplace add mbanderas/maestro
codex plugin add maestro@maestro
```

Start a new Codex thread after installing or changing plugin trust so the
bundled skills and hooks reload.

**Portable installs for other CLI / Desktop apps** — run the matching line
in that tool's terminal, or ask its agent to run it. These integrations are
prompt/skill/workflow shortcuts around the portable CLI unless the tool has
native hook support.

| Tool | Install (run inside the tool) |
|------|-------------------------------|
| Cursor | `npx github:mbanderas/maestro install --target cursor` |
| Gemini CLI | `npx github:mbanderas/maestro install --target gemini` |
| Cline | `npx github:mbanderas/maestro install --target cline` |
| Windsurf / Devin | `npx github:mbanderas/maestro install --target windsurf` |
| Not sure / auto-detect | `npx github:mbanderas/maestro install --target auto` |

Portable installs lay down `AGENTS.md` plus that tool's adapter or
integration file, `docs/orchestration.md`, the zero-dependency Frontier
engine, and the relevant command/skill files. Codex does not need that copy
path for normal use: the repo is its marketplace
(`.agents/plugins/marketplace.json`) and plugin
(`.codex-plugin/plugin.json`), bundling the Codex skills, hooks, Frontier
engine, settings CLI, commands, and `docs/codex.md`. The older
`maestro install --target codex` path remains a manual fallback when you
intentionally want project files instead of the plugin. Once published, swap
`github:mbanderas/maestro` for `@maestrofrontier/frontier` for portable npm
installs.

> **Want the bare `maestro` command on your `PATH`?** Native plugins can run
> the bundled engine from their plugin cache, and portable installs can run
> `node bin/maestro.cjs frontier ...` from the installed project root. Install
> globally only if you want to type `maestro` from any shell:
> `npm install -g github:mbanderas/maestro` (swap for
> `@maestrofrontier/frontier` once published), then fully restart the tool so
> it picks up the new `PATH`.

Frontier stays **off** until you arm it, then normal prompts auto-route until
disabled in runtimes with trusted hooks.

- Claude Code: `/maestro:frontier fusion opus-gpt` (or
  `/maestro:frontier off`).
- Codex: after installing the plugin and trusting hooks, ask the bundled
  `maestro-frontier` skill to arm the project scope, for example "Use
  Maestro Frontier with ChatGPT duo", "Show Maestro Frontier status", or
  "Turn Maestro Frontier off." The skill runs the plugin-bundled engine; no
  `npx` or global `maestro` binary is required.
- Shell/advanced: from a checkout or global install, the equivalent CLI form
  is:

```text
maestro frontier mode fusion --preset chatgpt-duo --scope codex-project
maestro frontier mode fusion --preset frontier-trio --judge chatgpt --synth chatgpt --scope codex-project
maestro frontier mode off --scope codex-project
```

Use `node bin/maestro.cjs frontier ...` in place of `maestro frontier ...`
when the binary is not on `PATH`. `codex-project` expands to the repo's
`codex-<8hex>` workspace scope, matching the trusted Codex plugin hook.
`maestro frontier run "<prompt>" ...` is still available for advanced/debug
one-offs, but arming mode is the normal autorun flow.

---

> **Agents:** start with [`docs/agent-map.md`](docs/agent-map.md) for
> repo navigation. This README is the user-facing product narrative.

## The Frontier Engine

**Achieve Frontier AI performance in your CLI.** Maestro Frontier is an
opt-in, zero-dependency multi-CLI fusion engine built from the AI CLIs
already on your machine. It fans a prompt out to a parallel panel of any
1-8 local CLIs you pick, has a judge model you choose read their answers
into a structured analysis (consensus, contradictions, unique insights,
blind spots; compare, not merge), then has a synthesizer you choose write
a grounded answer that does not majority-vote. The payoff is measured: on
a 100-task benchmark, fused panels beat the best of their individual
members — fusing the CLIs you already run buys frontier-tier results. It
is the project's new default identity; the doctrine, hooks, skills, and
benchmarks are unchanged; the discipline layer is its foundation.

It ships with the native plugins. Claude Code drives it with
`/maestro:frontier`, Codex drives it with the `maestro-frontier` skill, and
other CLIs can use `maestro frontier ...` or the `node bin/maestro.cjs
frontier ...` fallback. Three modes, switched at will, **`off` by default**
so installing or upgrading changes nothing until you opt in. **Arming it —
`single` or `fusion` — makes it auto-run on every prompt**: a
`UserPromptSubmit` hook routes each prompt through the engine and the live
session relays the synthesized answer. `off` is the disable path.

| Mode | Behavior |
|---|---|
| `off` | Normal Maestro. Engine never invoked; zero behavior change. The default, and the way to disable auto-run. |
| `single <model>` | Auto-runs every prompt through one local CLI and relays its answer. No panel, no judge, no synth. |
| `fusion <preset>` | Auto-runs every prompt through your panel -> a judge model's analysis -> a grounded synthesis, with graceful degradation and one-level recursion bounds. |

Claude Code examples:

```text
/maestro:frontier status                       # show current mode
/maestro:frontier single opus                  # arm one-CLI auto-run
/maestro:frontier fusion opus-gpt              # arm panel auto-run (Opus + GPT-5.5)
/maestro:frontier run "your prompt here"       # manual one-off (armed modes also auto-run)
/maestro:frontier off                          # disable auto-run; back to normal Maestro
```

In Codex, ask the bundled `maestro-frontier` skill for the same status,
single, fusion, run, or off operation; it resolves the plugin-bundled engine
when the bare `maestro` command is not on `PATH`.

Presets define the panel; the judge and synthesizer default to Opus 4.8
(`claude -p`), and you override either with `--judge` / `--synth`:

- **`opus-duo`**: two independent Opus runs, isolating the synthesis lift.
- **`opus-gpt`**: Opus + GPT-5.5 (via `codex exec`); the recommended default for bounded spend.
- **`chatgpt-duo`** (`gpt-duo` alias): two ChatGPT/Codex runs whose judge and synthesizer also run on ChatGPT/Codex: a Codex-only fusion that needs no `claude`.
- **`frontier-trio`**: Opus + GPT-5.5 + Gemini 3.1 Pro (via `gemini -p`).
- **`custom`**: 1-8 of the known models.

Three model CLIs ship as adapters today: Opus 4.8 (`claude`), GPT-5.5
(`codex`), and Gemini 3.1 Pro (`gemini`). Kimi, DeepSeek, GLM, and Qwen
adapters follow in an update soon.

Pass `--judge <model>` / `--synth <model>` to run those stages on any
model for any preset (e.g. `--judge opus --synth gpt-5.5`), so you can mix
the panel and the judge/synth freely. Degradation is graceful: a partial
panel failure still returns a synthesis plus `failed_models`; a judge
failure synthesizes from the raw responses; a hard failure returns a typed
`failure_reason`. A `FUSION_DEPTH` guard bounds recursion to one level.

Honest scope, measured rather than implied: the **engine is built,
unit-tested (degradation, recursion, budget, anti-majority all covered),
and verified end-to-end on real runs of `single` mode and the
`opus-gpt`, `opus-duo`, and `frontier-trio` presets**. The `chatgpt-duo`
preset and `--judge`/`--synth` selection share that same code path and
are unit-tested, but not yet live-run. The quality *lift* of local fusion
is **measured, not asserted**: on a 100-task suite (93 scored) every
fusion panel outscored its own member models, with the strongest fusion
leading the field. That fusion-vs-solo result is a separate axis from the
in-repo A/B harness, which measures Maestro doctrine ON vs OFF; numbers
are never mixed across the two.
Operational caveats: headless web access differs per CLI (Codex confirmed
live; Claude and Gemini are gated `webTools:false` in this build), and
each cold `claude -p` panel/judge/synth call is non-trivial in cost; use
small prompts, and prefer `opus-gpt` to bound spend. The budget cap is
opt-in (`tokenBudget`, default disabled). The engine is zero-dependency
CommonJS under [`frontier/`](frontier/); each CLI is resolved from your
`PATH` (`claude`, `codex`, `gemini`). Binary overrides and the full
operational reference are in
[`commands/frontier.md`](commands/frontier.md#binary-overrides).

## What You Get

Frontier is the headline; the discipline layer beneath it is what runs on
every task. Drop two markdown files into your repo and your agent gains
five things:

1. **Done means done.** Completion reports carry a verification status (`VERIFIED` / `UNVERIFIED` / `FAIL`) backed by an actual type-check, lint, or test run, with an optional hook enforcing it structurally.
2. **It stays in its lane.** Surgical-scope rules: every changed line traces back to what you asked for: no drive-by refactors, no formatting sweeps, no deleting code it couldn't verify was dead.
3. **Long runs that land.** Overnight tasks and recurring loops get checkpoint artifacts, explicit end conditions, iteration caps, and re-grounding rules. This repo's own benchmark loops run on exactly these rules.
4. **Multi-agent only when it pays.** A counted Decision Gate routes work single-agent by default and demands an explicit verdict line before the first edit; orchestration stays behind it.
5. **Receipts.** A reproducible A/B benchmark harness ships in-repo, with our own retractions and nulls. Rerun every number yourself.

The price, measured rather than implied: ON spends about 10% more than a
clean agent on a 10-module refactor and 38% more on a 16-file feature
(n=9 medians, t08/t12); you are buying verification and auditability, not
speed. The premium earns its keep on unattended work (overnight loops,
scheduled runs, CI agents) where nobody reads the 3am transcript and the
close-out claim is all you have.

## Discipline, Benchmarks, and Research

The discipline layer (verification, scope, honest status) applies to
every task, fusion or not. The full orchestration protocol lives in
[`docs/orchestration.md`](docs/orchestration.md). Benchmark data,
retractions, and methodology — including the honest reading that Maestro
ON has never beaten OFF on success rate in any measured cell and that the
early efficiency story did not survive replication — are in
[`docs/benchmarks.md`](docs/benchmarks.md) and
[`benchmarks/README.md`](benchmarks/README.md). The architecture is
grounded in 700+ sources; the key driver is that
[79% of multi-agent failures come from coordination, not model
capability](https://marklaursen.com/blog/why-your-multi-agent-ai-system-keeps-failing),
and that three optimized agents outperform seven.

## Runtime Adapters

Maestro separates **portable orchestration doctrine** from **runtime-specific adapters**. The core logic lives in `AGENTS.md` and works across any agent runtime; adapters are thin wrappers that import it and add only what is runtime-specific.

| File | Role | What it adds |
|---|---|---|
| `AGENTS.md` | Portable core | Full orchestration doctrine, runtime-agnostic |
| `CLAUDE.md` | Claude Code adapter | Subagent/team routing, hooks, context limits, tool scoping, long-horizon mapping (/loop, schedules) |
| `GEMINI.md` | Gemini adapter | Execution mapping, instruction precedence, verification notes, long-horizon note |
| `.cursorrules` | Cursor adapter | Kernel copy (Cursor does not support imports); full S2-S6 in docs/orchestration.md |
| [`docs/codex.md`](docs/codex.md) | Codex guide | AGENTS.md precedence and 32 KiB cap, Codex subagent mapping, Automations long-horizon mapping (Codex reads `AGENTS.md` natively) |

Maestro's tools run on **both Claude Code and Codex** — in Claude Code as
`/maestro:*` slash commands, and in Codex as plugin-bundled skills plus
trusted hooks. The portable `node settings/cli.cjs` and `maestro frontier ...`
CLIs also work on any other agent. The Codex skills
(`maestro-frontier`, `maestro-terse`, `maestro-settings`, `maestro-update`)
ship from the Maestro plugin; the older `maestro install --target codex` path
still works for manual project copies. When Frontier mode is on, the
`maestro-frontier` skill leads each Codex reply with `Maestro Frontier ON
(<label>)` (`single · <model>` or `fusion · <preset>`) — the Codex analog of
Claude Code's armed Frontier indicator; ask the skill to show status, or run
`maestro frontier status --scope codex-project` from a shell when using the
CLI directly.

GitHub Copilot, Cline, and Windsurf read `AGENTS.md` directly, so the portable core works there with no adapter. Maestro's always-on kernel (`AGENTS.md`) is ~10 KB, under Windsurf's 12,000-character limit and roughly a third of Codex's 32 KiB budget; the full multi-agent protocol loads on demand from `docs/orchestration.md`.

**Subagents vs Agent Teams (Claude Code):** Maestro's `CLAUDE.md` adapter
routes automatically. **Subagents** run within one session and report
results to the parent; this is the default for narrow independent work.
**[Agent teams](https://code.claude.com/docs/en/agent-teams)** coordinate
multiple sessions with peer-to-peer messaging, used only for long-running
parallel workstreams, competing-hypothesis debugging, or cross-layer
builds. Agent teams are experimental and Claude Code-only.

## Claude Code Tools

Optional Claude Code machinery; full install steps in the linked docs.

- **Verification Hook**: a `SubagentStop` hook enforcing S7.3 structurally: warns when a file-modifying subagent skips a checker or omits a status token. Never blocks. [`docs/hooks.md`](docs/hooks.md)
- **Hook Pack**: five more zero-dependency hooks (doctrine guard, loop guard, phase-scope, gate reminder, opt-in gate telemetry) enforcing the rest of the doctrine. [`docs/hooks.md`](docs/hooks.md)
- **Context Bar**: a status-line context-window progress bar that shifts green to amber to red and detects the model's window (including the 1M Opus tier). [`docs/context-bar.md`](docs/context-bar.md)
- **Terse Mode + Compress**: opt-in output-token reduction (`/maestro:terse`) and a memory-file compressor (`/maestro:compress`), adapted from the MIT-licensed Caveman plugin. [`docs/context-bar.md`](docs/context-bar.md)
- **Settings**: `/maestro:settings` changes any toggle in one line (`set terse off`, `frontier fusion opus-gpt`, `help`) or opens a keyboard picker with no arguments, plus a portable `node settings/cli.cjs status|list|help|set` for Codex and any other CLI. [`docs/settings.md`](docs/settings.md)

## Commands & Settings

Every Maestro slash command in Claude Code is namespaced `/maestro:<name>`.
The same tools run on Codex as plugin-bundled skills; on any CLI the same
actions also run through the portable scripts noted below.

| Command | What it does | Usage |
|---|---|---|
| `/maestro:settings` | See or change all toggles. With arguments it runs the change directly; with no arguments it opens a keyboard picker. | `/maestro:settings`, `… status`, `… list`, `… help`, `… set terse off`, `… frontier fusion opus-gpt` |
| `/maestro:frontier` | Drive the local multi-CLI fusion engine: switch mode, pick a model/preset, or run a prompt through it. | `… off`, `… single opus`, `… fusion opus-gpt`, `… status`, `… run "<prompt>"` |
| `/maestro:terse` | Switch terse output mode for the session (off by default). | `… lite`, `… full`, `… ultra`, `… off` |
| `/maestro:context-bar` | Toggle the status-line context progress bar (and the Maestro badges on it). | `/maestro:context-bar`, `… on`, `… off` |
| `/maestro:compress <file>` | Rewrite a natural-language memory file in terse form to cut input tokens; keeps a backup and validates deterministically. | `… path/to/NOTES.md` |

### Settings toggles

`/maestro:settings` and the portable `node settings/cli.cjs` cover three persisted toggles:

| Toggle | Values | What it controls |
|---|---|---|
| `terse` | `off`, `lite`, `full`, `ultra` | Output-token reduction. Shows an amber level badge (`ULTRA`) on the status bar. |
| `frontier` | `off`; `single:` `opus` / `gpt-5.5` / `gemini`; `fusion:` `opus-duo` / `opus-gpt` / `chatgpt-duo` / `frontier-trio` / `custom`, each with optional `--judge` / `--synth` | The local fusion engine. When armed it auto-runs on every prompt. The blue `f` panel badge means auto-run is on: `fO+C`, `fO+C+G`, `f*3` (`O`=Opus, `C`=ChatGPT/GPT-5.5, `G`=Gemini). |
| `context-bar` | `on`, `off` | The status-line context-window progress bar. |

Portable everywhere, Codex included: `node settings/cli.cjs status | list | help | set <key> <value>` (frontier also takes `--judge`, `--synth`, `--models a,b,c`, and `--scope <scope>`). Full references: [`docs/settings.md`](docs/settings.md) and [`docs/context-bar.md`](docs/context-bar.md).

## Updating Maestro

Maestro's marketplaces track `main`, so updating is a refresh rather than a
manual version edit.

### Claude Code

`/maestro:update` is the one-command path — it pulls the latest marketplace code, reports what changed, and tells you when to reload:

```text
/maestro:update
```

It can't run the reload for you (a slash command can't invoke another slash command), so it ends by prompting you to run `/reload-plugins` (or restart). The manual equivalent is two steps:

```text
/plugin marketplace update maestro
/reload-plugins
```

`/reload-plugins` applies the update in the running session; if Claude Code warns that a restart is required, restart it. Non-interactive equivalent of the pull: `claude plugin marketplace update maestro`.

### Codex

```text
codex plugin marketplace upgrade maestro
codex plugin add maestro@maestro
```

Open a new thread after reinstalling so Codex reloads bundled skills and hook
definitions.

### Cursor / Portable Installs

- **Git clone:** `git pull` inside the Maestro clone directory.
- **Downloaded copy:** re-run `npx github:mbanderas/maestro install --target auto --project .` from the project root, or re-download the tarball and re-copy `frontier/`, `bin/maestro.cjs`, plus your integration command file from the latest `main`.

### Gemini / other CLIs

Re-pull or re-copy `frontier/` and the relevant integration file from `main`. If your CLI supports custom commands and you have a `/update` wired, run that instead.

## Contributing

Contributions are welcome. Before opening a PR:

1. Read the research foundation. Maestro's constraints (4-agent cap, Decision Gate bias toward single-agent) are intentional and research-backed
2. Keep it zero-dependency: no npm packages, no external imports
3. Test with real tasks across Claude Code, Gemini, Codex, and Cursor
4. Docs changes: run `npx --yes markdownlint-cli2` from the repo root (no install footprint; config in `.markdownlint-cli2.jsonc`)

If you have benchmarks, case studies, or research that challenges or extends the current architecture, open an issue. The design should evolve with evidence.

## Related Projects

- **[Govyn](https://github.com/govynAI/govyn)**: Open-source AI agent governance proxy. Maestro orchestrates your agents; Govyn ensures they never hold real API keys, stay within budget, and follow policy. They are designed to work together.

## Community

Using Maestro Frontier, or running the discipline layer on your own agent? [Open a discussion](https://github.com/mbanderas/maestro/discussions) or [file an issue](https://github.com/mbanderas/maestro/issues).

## License

MIT
