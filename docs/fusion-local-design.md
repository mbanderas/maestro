# Local Fusion — Design & Implementation Plan

A local multi-CLI fusion engine, built from local AI CLIs orchestrated
by Maestro. No API. Opus 4.8 1M = judge + synthesizer; Codex CLI
(GPT-5.5) and Gemini 3.1 Pro CLI = parallel panel. Implements a
**fan-out → structured judge-analysis → grounded synthesis** contract.

- Status: **design + plan only** (no implementation; no edits to product repos).
- Audit: Staff Engineer **PASS** (cycle 2; cycle 1 FAILed with 4 issues, all fixed — see §7).
- Date: 2026-06-14.

---

## 1. Fusion contract (the spec to reproduce)

Three stages, **not** a majority vote:

1. **Fan-out.** Prompt dispatched to a panel of 1-8 models **in parallel**.
   Each panel model has `web_search` + `web_fetch`, looping up to
   `max_tool_calls` (default 8, range 1-16) before returning text.
2. **Judge.** ONE judge model reads ALL panel responses and emits a
   structured analysis JSON. Judge also has web tools. Judge **compares**
   (consensus = higher-confidence; surfaces contradictions; preserves
   unique insights; flags blind spots) — it does **not** merge.
3. **Synthesis.** The outer model writes the final answer **grounded** in
   the analysis JSON. The synthesis step itself adds lift (Opus+Opus panel
   beat solo Opus by 6.7 pts → lift is partly synthesis, not just diversity).

Analysis JSON (verbatim):

```json
{
  "consensus": ["points all/most panel models agreed on"],
  "contradictions": [{ "topic": "...", "stances": [{ "model": "...", "stance": "..." }] }],
  "partial_coverage": [{ "models": ["..."], "point": "only some models covered this" }],
  "unique_insights": [{ "model": "...", "insight": "only one model raised this" }],
  "blind_spots": ["topics no panel model addressed"]
}
```

Success result: `{ status:"ok", analysis, responses:[{model, content}] }`.

Degradation / error modes (must be reproduced 1:1):

| Mode | Behavior |
|---|---|
| Partial panel fail (≥1 ok) | `status:"ok"` + `failed_models:[{model, reason}]` |
| Judge fail (error / empty / invalid JSON) | `status:"ok"`, **omit** `analysis`, synth from raw `responses` |
| Hard fail (no useful output) | `status:"error"` + typed `failure_reason` |

`failure_reason ∈ { all_panels_failed, insufficient_credits, rate_limited,
fusion_invocation_capped, unexpected_error }`.

Recursion: a fusion-depth signal (`FUSION_DEPTH`) — panel + judge
**cannot** recursively invoke fusion; bounded to **one level**
(`fusion_invocation_capped` = 2nd call in same turn rejected).

Contamination control: `excluded_domains` (web_search) / `blocked_domains`
(web_fetch) exclude lists.

Params: `analysis_models` (panel, 1-8), `model` (judge), `max_tool_calls` (8),
`max_completion_tokens`, `reasoning {effort,max_tokens}`, `temperature`.

Benchmark (DRACO, 100 deep-research tasks): Opus 4.8 + GPT-5.5 + Gemini 3.1
Pro, synth-by-Opus = **68.3%** vs solo Opus 58.8% / solo GPT-5.5 60.0% /
solo Gemini 3.1 Pro 45.4%. Budget panel 64.7% at ~50% cost. Diversity helps;
synthesis itself helps.

### Fusion-primitive → local-primitive map

| Fusion primitive | Local equivalent |
|---|---|
| Panel model (parallel) | local CLI process: `codex exec`, `gemini -p`, `claude -p` |
| Panel web_search/web_fetch | CLI-native web tools; parity varies (§3.4) |
| `max_tool_calls` loop | CLI's own agentic loop, bounded by per-CLI flag + timeout |
| Judge model | Opus 4.8 1M via `claude -p` |
| analysis JSON | identical schema, parsed from judge stdout |
| Outer synthesizer | Opus 4.8 1M writes final from analysis |
| status / failed_models / judge-omit | `FusionResult` discriminator |
| `x-...-fusion-depth` header | `FUSION_DEPTH` env var on spawned CLIs |
| excluded/blocked domains | passed to CLI web-tool layer (uniform via MCP shim, §3.4) |

---

## 2. Inventory (read-only; file:line verified)

### AgentFactory Dual-CLI (TypeScript) — closest foundation

- `dual-cli/headless.ts:37-173` — `runHeadless({kind, prompt, configStore,
  timeoutMs, cwd, reveal}) -> HeadlessRunResult{ok, exitCode, stdout, stderr,
  durationMs, *TokensEst, binary, args}`. Spawns ONE CLI (l.84); `promptVia`
  `'arg'` (l.71) / `'stdin'` (l.131); 256KB rolling stdout buffer (l.155);
  SIGTERM→SIGKILL@2s timeout (l.137). **Reusable as the per-panel call
  primitive** — captures machine-readable stdout. Exposes only static
  `config.args` + prompt + wall-clock `timeoutMs` (no `max_tool_calls` /
  `max_completion_tokens` knobs).
- `workers/spawn-cli.ts:8-40` — Windows `.cmd`/`.bat` hardening
  (CVE-2024-27980): wraps in `cmd.exe /d /s /c` + `quoteForCmd`. Reusable.
- `workers/adapter-config.ts:26-59` — adapters: **codex** enabled
  (`exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox`,
  stdin); **claude** enabled (`-p --output-format text
  --dangerously-skip-permissions`, arg); **gemini** `enabled:false`
  (`-p`, arg) stub (l.43). **No web-tool flags in any adapter.**
- `dual-cli/role-plans.ts:25-308` — planner→builder→critic roles, JSON prompt
  schemas. No judge/synth role; a 4th role needs a new field + stage.
- `dual-cli/context-bus.ts:58-70` — `computeVerdict` = state-flag
  (planner/critic stub?), **not** consensus/synthesis. Replaced for Fusion.
- Concurrency: **none** in `dual-cli/` (no Promise.all / p-limit / Worker);
  dispatch is strictly sequential `await`. Max-iter cap `orchestrator.ts:77-79`.
- `package.json`: **`p-limit` is not a dependency** (better-sqlite3, cors,
  express, ws, node-pty). A new concurrency dep would be required — avoided (§3.5).

### TheBunker workshop (Node/Express + node-pty + React) — GUI surface

- `workshop/lib/dispatch.js:125-187` — `buildCliInvocation`: claude
  `--dangerously-skip-permissions -p --model --append-system-prompt @persona`
  (prompt = last positional l.165); codex `--full-auto --system-prompt-file`;
  gemini only in `launchCommandForCli` (`--yolo`, interactive l.205).
  **No web-tool flags.**
- `workshop/lib/terminal-contract.js:31-48,193-374` — PTY lifecycle: output
  is **terminal text only**, no machine-readable/JSON capture; completion =
  PTY exit code (l.92,201).
- `workshop/lib/chief.js:40-41,187-258` — Chief = single long-lived
  interactive tile; **not** a fan-out dispatcher.
- `lib/comms-workshop-bridge.js` (TheBunker **root** `lib/`) — **exists**: an
  in-process comms→workshop dispatch seam. Calls workshop chief-tools
  `dispatch` (**1 task → 1 tile**, default specialist `cto-agent`); poll-based
  fan-in (`POLL_MS=5000`, `MAX 6h`, state-machine is sole authority, no event
  bus); relays terminal state to the comms bus. It is 1:1, comms-coupled, and
  its output substrate is PTY text — **not** N-panel-per-prompt JSON fan-out.
- Fan-in/cap: `workshop/lib/queue-scheduler.js:47,162,187` —
  `DEFAULT_MAX_AGENT_TILES=2` per-workspace concurrency cap; each task binds 1 tile.
- `workshop/public/workshop.jsx:535-556` — UI renders 1 tile = 1 task.

### Reuse vs. gap summary

| Need | AgentFactory | TheBunker | Claude Code plugin |
|---|---|---|---|
| Drive CLI headlessly, capture machine-readable output | ✓ `runHeadless` | ✗ PTY text only | ✗ none |
| Gemini adapter present | ✓ stub (disabled) | partial (interactive) | ✗ |
| Windows `.cmd` hardening | ✓ | n/a | ✗ |
| Parallel fan-out N>1 | ✗ gap | ✗ gap | ✗ gap |
| Judge + synthesis stage | ✗ gap | ✗ gap | ✗ gap |
| Dispatch/relay seam | (build) | ✓ but 1:1 + PTY | ✗ |
| Web-tool parity | ✗ gap | ✗ gap | (host-provided) |

---

## 3. Design — local Fusion engine

### 3.1 Recommended delivery surface

**Extend AgentFactory Dual-CLI into an N-CLI fusion engine** (new
`dual-cli/fusion/` subdir). Rationale:

- `runHeadless` is already the exact panel-call primitive (spawn CLI, capture
  **machine-parseable** stdout, timeout, token estimate). Bunker's PTY output
  is terminal text — the wrong substrate for parseable panel responses.
- Gemini adapter stub already present (enable it); Windows `.cmd` hardening
  already done; TypeScript strict already enforced; token estimation present.
- Least new surface: add a bounded-parallel fan-out wrapper + judge + synth
  stages. No HTTP, no PTY, no GUI plumbing.

Layered roadmap for the other two surfaces (not either/or):

- **TheBunker** = later **consumer** — GUI tiles showing N panels + a synthesis
  pane, calling this engine as a library. (Its dispatch seam exists but is
  1 task→1 tile, comms-coupled, PTY-text — repurposing it for N-panel JSON
  fan-out is more new surface than building on `runHeadless`.)
- **Claude Code plugin** = later **thin wrapper** — a `/fusion` entrypoint over
  the same engine, using the engine's "tool mode" (§3.3) to mirror Fusion's
  analysis-to-caller shape exactly. (This very Maestro session is, in effect,
  a manual local-fusion: Opus orchestrating CLI subagents.)

### 3.2 Components (`dual-cli/fusion/`)

| File | Responsibility |
|---|---|
| `schema.ts` | `PanelResponse`, `FailedModel`, `Analysis` (verbatim), `FusionResult`, `FailureReason` |
| `config.ts` | panel list, judge kind, concurrency, per-adapter `webTools` flag, per-adapter flag-templates for `max_tool_calls`/`max_completion_tokens`, timeout, token budget, `excluded_domains` |
| `semaphore.ts` | hand-rolled bounded-concurrency limiter (~15 LOC; no new dep) |
| `dispatch.ts` | bounded-parallel fan-out over adapters via `runHeadless`; inject `FUSION_DEPTH`; map → `PanelResponse[]`; classify failures |
| `judge.ts` | build judge prompt embedding all panel responses; call Opus; strict-parse `Analysis`; parse/spawn fail → `undefined` (degrade) |
| `synthesize.ts` | grounded synth from analysis (or raw responses); prompt **explicitly forbids majority-vote** |
| `run.ts` | `runFusion(opts) -> FusionResult`; wires dispatch→judge→synth; degradation + recursion + cost |
| `cli.ts` | bin entrypoint: `fusion "<prompt>" --panel codex,gemini --judge claude --concurrency 2` |

Default config matches the terminal objective: `panel=[codex, gemini]`,
`judge=claude (Opus 4.8 1M)`, `synth=claude (Opus 4.8 1M)`.

### 3.3 Data contracts

```ts
interface PanelResponse {
  model: string; content: string; ok: boolean;
  durationMs: number; tokensEst: number; toolCalls?: number; error?: string;
}
interface FailedModel { model: string; reason: string; }
interface Analysis {
  consensus: string[];
  contradictions: { topic: string; stances: { model: string; stance: string }[] }[];
  partial_coverage: { models: string[]; point: string }[];
  unique_insights: { model: string; insight: string }[];
  blind_spots: string[];
}
type FailureReason =
  | 'all_panels_failed' | 'insufficient_credits' | 'rate_limited'
  | 'fusion_invocation_capped' | 'unexpected_error';
type FusionResult =
  | { status: 'ok'; analysis?: Analysis; responses: PanelResponse[]; failed_models?: FailedModel[]; final: string }
  | { status: 'error'; error: string; failure_reason: FailureReason };
```

**Documented divergence from Fusion.** Fusion returns `analysis` + `responses`
to an *external* outer caller that writes the final answer. Locally, Opus is
both judge-orchestrator and synthesizer, so the engine folds synthesis in and
`FusionResult` carries `final`. An optional **tool mode** returns
`analysis` + `responses` *without* `final`, mirroring Fusion's exact shape for
the Claude Code plugin case. This is declared, not hidden.

### 3.4 Control flow

```text
runFusion(prompt, cfg):
  if FUSION_DEPTH >= 1: return { status:'error', failure_reason:'fusion_invocation_capped' }
  panel = await dispatchPanel(prompt, cfg)          // bounded-parallel; FUSION_DEPTH=1 on children
  ok     = panel.filter(p => p.ok)
  failed = panel.filter(p => !p.ok)
  if ok.length === 0:
      return { status:'error', failure_reason: classify(failed) }
                                                    // rate-limit string→rate_limited;
                                                    // quota→insufficient_credits;
                                                    // spawn crash→unexpected_error;
                                                    // else→all_panels_failed
  analysis = try { await judge(prompt, ok) } catch/invalid { undefined }   // degrade: omit
  final    = await synthesize(prompt, analysis ?? ok)                      // grounded
  return { status:'ok', analysis, responses: ok,
           failed_models: failed.length ? failed.map(toFailedModel) : undefined, final }
```

Maps 1:1 to Fusion's degradation ladder and one-level recursion bound.

### 3.5 Cross-cutting strategies

- **Web-tool parity (highest-risk divergence).** Claude CLI has native
  WebSearch/WebFetch (good parity); Gemini CLI has google-search grounding
  (good); Codex headless web access is **unverified** and must be proven.
  Strategy: a per-adapter `webTools` capability flag; **M0 empirically verifies
  each CLI's headless web access (GO/NO-GO)**; any CLI that lacks it is gated
  `webTools:false` and the gap is documented as an explicit Fusion divergence
  (a panel member without web silently violates fan-out semantics — so it is
  made explicit, never silent). Phase 2 adds one shared local **MCP
  web_search/web_fetch server** all CLIs call, giving uniform parity and a
  single `excluded_domains` config (mirrors Fusion's one-line exclude benefit).
- **Concurrency.** Hand-rolled bounded semaphore (default = panel size,
  cap 4) — avoids FD/CPU exhaustion. No `p-limit` dep (absent from
  `package.json`); `Promise.all` is the codebase idiom.
- **Cost.** Pre-flight sum `tokensEst` (already in `headless.ts:114`) vs
  `cfg.tokenBudget`; abort fan-out if projected to exceed. Per-adapter
  `max_completion_tokens` and `max_tool_calls` injected as **per-CLI flag
  templates** in `config.ts` (`runHeadless` has no such knobs); where a CLI
  has no equivalent flag, the bound is timeout-only and documented as such.
- **Recursion.** `FUSION_DEPTH` env injected into spawned panel/judge CLIs; a
  spawned CLI that re-invokes the fusion CLI sees `depth>=1` →
  `fusion_invocation_capped`. One level.

---

## 4. Implementation plan

**Plan Decision Gate (S1, for the eventual build — NOT executed this run):**
`GATE: files≈11 concerns=4 -> multi-agent — 5+ files across 2+ concerns;
independent subtasks (schema/dispatch vs judge/synth vs CLI/config).`

| Milestone | Files | Acceptance |
|---|---|---|
| **M0 Spike + web GO/NO-GO** | `adapter-config.ts` (enable gemini) | `gemini -p` / `codex exec` / `claude -p` each return non-empty text headlessly on Windows via `runHeadless`; each CLI's headless web access empirically confirmed; per-adapter `webTools` set accordingly |
| **M1 Schema + config** | `fusion/schema.ts`, `fusion/config.ts` | `tsc` strict, no `any`; unit tests for validators; defaults = `[codex,gemini]` panel, claude judge+synth |
| **M2 Dispatch + semaphore** | `fusion/semaphore.ts`, `fusion/dispatch.ts` | parallel wall-time < Σ serial; partial-fail → `failed_models`; all-fail → `error` with correct `failure_reason` (forced-fail adapter test) |
| **M3 Judge** | `fusion/judge.ts` | valid panel → valid `Analysis`; corrupt judge output → graceful `undefined` (degrade), no throw (golden test) |
| **M4 Synthesize** | `fusion/synthesize.ts` | analysis-present and analysis-absent both yield `final`; prompt asserted to forbid majority-vote |
| **M5 Runner + CLI** | `fusion/run.ts`, `fusion/cli.ts` | end-to-end real run (codex+gemini panel, Opus judge+synth) returns `final`; `FUSION_DEPTH>=1` → `fusion_invocation_capped`; budget exceed → abort |
| **M6 Web parity hardening** | `fusion/config.ts`, `fusion/dispatch.ts` | shared MCP web shim; panel responses cite fresh sources; `excluded_domains` honored |
| **M7 Tests + docs** | tests, README, parity matrix | `tsc` + `eslint --quiet` clean; tests pass |

### Risks (ranked)

1. **Web-tool parity across 3 CLIs** — HIGH. Codex/Gemini web flags differ;
   may need the MCP shim for true parity. De-risked by the M0 GO/NO-GO gate;
   gaps documented as explicit divergences.
2. **Codex/Gemini headless auth + Windows `.cmd` quirks** — MED. `spawn-cli.ts`
   hardening reused; M0 spike de-risks.
3. **Judge JSON reliability from a CLI** (vs API structured output) — MED.
   Strict-parse + degrade path is Fusion-faithful; few-shot the schema;
   retry-once.
4. **Cost/latency of N parallel agentic web loops** — MED. Semaphore + token
   budget + `max_tool_calls` caps.
5. **Recursion via a CLI re-calling fusion** — LOW. `FUSION_DEPTH` guard.

Out of scope this artifact: any edit to AgentFactory or TheBunker source
(design + plan only). The eventual build is a **harness/multi-CLI mutation** —
report PENDING_REVIEW; never count it as green evidence until run.

---

## 5. What this reproduces vs. Fusion

| Fusion behavior | Local engine |
|---|---|
| Parallel panel fan-out | bounded-parallel `runHeadless` over adapters |
| Per-panel web tools | native per-CLI (M0-verified) → shared MCP shim (M6) |
| Judge analysis JSON (compare-not-merge) | `judge.ts` strict-parsed `Analysis` |
| Grounded synthesis (not majority vote) | `synthesize.ts`, anti-majority prompt |
| Partial-fail → ok + failed_models | ✓ |
| Judge-fail → omit analysis, synth from raw | ✓ |
| Hard-fail → error + typed reason | ✓ all 5 reasons |
| One-level recursion bound | `FUSION_DEPTH` |
| Domain exclusion | `excluded_domains` via web layer / MCP |
| Analysis-to-outer-caller shape | optional **tool mode** (plugin) |

Known divergences (declared): synth folded into engine (default mode);
web-tool parity depends on per-CLI capability (gated + documented).

---

## 6. Recommendation

Build **local Fusion as an N-CLI engine inside AgentFactory Dual-CLI**
(`dual-cli/fusion/`), default panel `[codex (GPT-5.5), gemini (3.1 Pro)]` with
**Opus 4.8 1M as judge + synthesizer**. It reuses the most existing infra
(`runHeadless`, gemini stub, Windows hardening, token estimation) and adds the
least new surface (fan-out wrapper + judge + synth). Expose it as a library +
thin CLI; layer a Bunker GUI consumer and a Claude Code `/fusion` plugin over
the same engine later.

---

## 7. Audit trail (Staff Engineer, 2 cycles)

**Cycle 1: FAIL** — 4 issues, all fixed:

| # | Sev | Issue | Fix |
|---|---|---|---|
| 1 | BLOCKER | Inventory falsely claimed `comms-workshop-bridge.js` does not exist | It exists at TheBunker root `lib/`; inventory corrected (§2); recommendation unchanged (1:1, comms-coupled, PTY-text) |
| 2 | MAJOR | `p-limit` assumed but not installed | Hand-rolled semaphore (`semaphore.ts`), no new dep (§3.5) |
| 3 | MAJOR | Codex headless web access hand-waved | Empirical web check moved to **M0 GO/NO-GO**; per-adapter `webTools` gate + documented divergence (§3.5) |
| 4 | MINOR | `runHeadless` exposes no `max_tool_calls`/`max_completion_tokens` | Per-adapter flag-templates in `config.ts`; timeout-only fallback documented (§3.5) |

**Cycle 2: PASS** — all 4 fixes verified against primary sources; Fusion's
3-stage semantics, full degradation ladder, and one-level recursion bound
confirmed reproduced; no new blockers.
