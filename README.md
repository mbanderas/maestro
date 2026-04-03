# Maestro

Research-grounded multi-agent orchestrator directives for AI coding agents. One file drop-in.

**Full research writeup:** [Why Your Multi-Agent AI System Keeps Failing (And What the Research Actually Says)](https://marklaursen.com/blog/why-your-multi-agent-ai-system-keeps-failing/)

## What This Does

AI coding agents default to single-agent sequential execution. One context window does everything — planning, coding, reviewing — which means context decay on long tasks, no parallelism, and self-review instead of adversarial review.

Maestro rewires that default. It turns the main agent instance into a **switchboard operator** that:

1. **Evaluates** every task through a decision gate (single-agent vs multi-agent)
2. **Spawns a Planner** to decompose complex tasks into parallel and sequential work
3. **Launches specialist agents** with scoped context and clear acceptance criteria
4. **Routes cross-talk** between specialists when one agent's output affects another
5. **Gates delivery** through a Staff Engineer agent performing adversarial review

Simple tasks still run single-agent. The system only decomposes when decomposition helps.

## Install

Pick the file that matches your tool:

### Claude Code

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/mbanderas/maestro/main/CLAUDE.md
```

Drop `CLAUDE.md` in your project root. Claude Code reads it automatically.

### Codex (CLI + Desktop)

```bash
curl -o AGENTS.md https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
```

Drop `AGENTS.md` in your repo root. Codex reads it automatically on session start. For global defaults across all repos:

```bash
curl -o ~/.codex/AGENTS.md https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
```

### Cursor

Paste the contents of `CLAUDE.md` into your `.cursorrules` file.

### Other Tools

`AGENTS.md` is an [open standard](https://agents.md) under the Linux Foundation, supported by Codex, Cursor, Amp, Jules (Google), and Factory. If your tool reads `AGENTS.md`, use that file. Otherwise, paste the contents into whatever rules or system prompt file your tool supports.

## Two Files, Same Architecture

| File | Optimized For | Key Differences |
|---|---|---|
| `CLAUDE.md` | Claude Code | Claude-specific context management (167K window, 2,000-line file read cap, 50K char tool result truncation, Task tool sub-agents) |
| `AGENTS.md` | Codex + AGENTS.md-compatible tools | Tool-agnostic language, Codex context management (192K window), no tool-specific references |

Both files implement the identical orchestrator architecture: Decision Gate → Planner → Specialists → Cross-Talk → Staff Engineer. The rules and research basis are the same. Only the implementation-specific details differ.

## How It Works

### The Decision Gate

Every task hits a binary gate before any work starts:

| Condition | Mode |
|---|---|
| ≤3 coupled files, <10 tool calls, sequential logic | Single-agent |
| 5+ files, independent subtasks, 15+ messages estimated, multi-domain | Multi-agent |
| User says "just do it yourself" | Single-agent (override) |
| User says "parallelize this" | Multi-agent (override) |
| Uncertain | Single-agent (safe default) |

### Multi-Agent Flow

```
User Task
    │
    ▼
┌──────────────┐
│ ORCHESTRATOR  │ ← Main agent instance. Routes only.
│ (this file)   │    Zero planning. Zero execution. Zero review.
└──────┬───────┘
       │
       ▼ Step 1: Always first
┌──────────────┐
│   PLANNER    │ → Execution graph, dependencies, parallel groups
└──────┬───────┘
       │
       ▼ Step 2: Per the plan
┌──────────── Parallel Group ────────────┐
│ Specialist A   Specialist B   Spec. C  │ ← Scoped context only
└──────────────────┬─────────────────────┘
                   │
       ▼ Step 3: Cross-talk check + sequential groups
                   │
       ▼ Step 4: Final gate
┌──────────────┐
│STAFF ENGINEER│ → Adversarial review. PASS or FAIL + issues.
└──────┬───────┘
       │
       ▼
   Delivery
```

### Agent Count Ceiling

Maximum 4 specialists per parallel group. This is a hard limit derived from research showing coordination effectiveness plateaus at 3–4 agents and degrades beyond that.

### The Orchestrator's Only Job

Route messages between agents. Detect when Agent A's output impacts Agent B. Facilitate cross-talk with minimum viable context. That's it. The Orchestrator does not plan (Planner does that), does not execute (Specialists do that), and does not review (Staff Engineer does that).

## What's Included

Both files contain the full system:

- **Decision Gate** — when to multi-agent vs single-agent
- **Planner protocol** — how to decompose tasks
- **Specialist management** — scoped spawning, context isolation
- **Cross-talk detection** — the switchboard routing logic
- **Staff Engineer gate** — adversarial final review
- **Universal Rules** — production-grade patterns for all agents:
  - Context decay prevention
  - File read and tool result truncation awareness
  - Forced verification (type-check + lint before claiming "Done!")
  - Edit integrity (re-read before/after every edit)
  - Semantic search limitations (text search ≠ AST)
  - Senior dev code quality standard

## Research Basis

Every rule traces to specific research findings. For the full analysis with visualizations and detailed breakdowns, read the companion blog post: **[Why Your Multi-Agent AI System Keeps Failing](https://marklaursen.com/blog/why-your-multi-agent-ai-system-keeps-failing/)**.

Summary table:

| Finding | Source | Rule It Produced |
|---|---|---|
| 79% of multi-agent failures are coordination, not capability | MAST (NeurIPS 2025) | Orchestrator does routing only — no execution mixing |
| 3 optimized agents outperform 7; pruning cuts cost 53–68% | DyLAN (COLM 2024) | Agent count ceiling of 4; decompose into fewer broader tasks |
| Coordination plateaus at 3–4 agents | DeepMind Scaling Study (2025) | Hard maximum per parallel group |
| Sequential reasoning degrades 39–70% with multi-agent | DeepMind Scaling Study (2025) | Decision gate: sequential tasks stay single-agent |
| Tool-heavy tasks (16+ tools) suffer multi-agent overhead | DeepMind Scaling Study (2025) | Planner can flag single-agent-recommended subtasks |
| Agents self-organize communication with lateral channels | SELFORG (2025) | Peer model, not hierarchy — orchestrator is switchboard, not boss |
| Context compaction, file read caps, tool result truncation | fakeguru/claude-md | Universal Rules: context integrity patterns (CLAUDE.md version) |

## Token Efficiency: Desktop vs Cloud

**Desktop (Claude Code / Codex CLI):** Sub-agents run in parallel. Wall-clock time savings are significant for independent tasks. Token cost = N agents × per-agent context, but each agent's context is smaller and more focused than the single-agent alternative. Net: faster and often cheaper because focused context = fewer wasted tokens and less rework from context decay.

**Cloud (Codex Cloud):** Same parallel execution model. Token cost is the same. Multi-agent uses more total tokens but produces better output on complex tasks because each agent operates within its competence window. For simple tasks, multi-agent in cloud is pure overhead — which is why the Decision Gate exists.

**Rule of thumb:** If the task would take a single agent 15+ messages with growing context, multi-agent is more token-efficient even in cloud because it avoids the rework spiral that context decay causes.

## Known Limitations

- Sub-agents are flat (one level deep in Claude Code; Codex spawns on explicit request). No hierarchy chains — which is a feature, not a bug.
- Cross-talk detection relies on the Orchestrator reading specialist outputs and inferring impact. It is not real-time monitoring. Cross-talk is checked between parallel groups, not during execution.
- The Staff Engineer review is only as good as its prompt and the project's tooling. Projects without type-checkers or linters get weaker verification.
- Very small tasks (quick fixes, single-file edits) will feel slower if the Decision Gate incorrectly routes to multi-agent. The gate is biased toward single-agent to prevent this.
- Codex enforces a 32 KiB cap on AGENTS.md by default. The Maestro AGENTS.md is well under this limit. If you extend it, monitor file size or use nested directory AGENTS.md files to split instructions.

## Rules File vs Prompt — When to Use Which

Maestro is designed as a drop-in file for projects that don't already have agent rules. If your project has no existing CLAUDE.md or AGENTS.md, drop Maestro in and it works.

If you already have a mature rules file with project-specific guardrails (test commands, directory conventions, dependency policies, deployment rules), Maestro's orchestration logic may not belong in that same file. Rules files work best as guardrails and navigation — "always this, never that, go here for this." Orchestration directives are behavioral — they change *how the agent operates*, not what the project expects.

In that case, use Maestro's content as a **prompt template** instead of a rules file replacement. Dispatch the orchestrator behavior through your prompt workflow (per-task or via a wrapper/skill) and keep your rules file focused on project constraints. This gives you per-task control over when orchestration kicks in, and avoids diluting your existing rules with 300 lines of behavioral overrides.

Both approaches use the same content. The difference is where it lives — always-on in the rules file, or dispatched per-task through the prompt.

## See Also

**[Govyn](https://github.com/govynai/govyn)** — Governance proxy for AI agents. Maestro spawns multiple agents, each making LLM API calls. Govyn sits between those agents and the API, enforcing per-agent budgets, cost tracking, loop detection, and policy rules. Agents never hold real API keys — the proxy is the only path to the provider. Maestro handles orchestration; Govyn handles cost control and governance. [govynai.com](https://www.govynai.com)

## License

MIT
