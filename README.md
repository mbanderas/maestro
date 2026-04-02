# Maestro

Multi-agent orchestrator directives for Claude Code. One file. One `curl` command.

## What This Does

Claude Code defaults to single-agent sequential execution. One context window does everything — planning, coding, reviewing — which means context decay on long tasks, no parallelism, and self-review instead of adversarial review.

This CLAUDE.md rewires that default. It turns the main Claude Code instance into a **switchboard operator** that:

1. **Evaluates** every task through a decision gate (single-agent vs multi-agent)
2. **Spawns a Planner** to decompose complex tasks into parallel and sequential work
3. **Launches specialist agents** with scoped context and clear acceptance criteria
4. **Routes cross-talk** between specialists when one agent's output affects another
5. **Gates delivery** through a Staff Engineer agent performing adversarial review

Simple tasks still run single-agent. The system only decomposes when decomposition helps.

## Install

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/mbanderas/maestro/main/CLAUDE.md
```

Or clone and copy:

```bash
git clone https://github.com/mbanderas/maestro.git
cp maestro/CLAUDE.md /path/to/your/project/
```

Claude Code reads `CLAUDE.md` from the project root automatically. No other configuration needed.

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
│ ORCHESTRATOR  │ ← Main Claude Code instance. Routes only.
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

The CLAUDE.md contains everything:

- **Decision Gate** — when to multi-agent vs single-agent
- **Planner protocol** — how to decompose tasks
- **Specialist management** — scoped spawning, context isolation
- **Cross-talk detection** — the switchboard routing logic
- **Staff Engineer gate** — adversarial final review
- **Universal Rules** — production-grade patterns for all agents:
  - Context decay prevention
  - File read budget awareness
  - Tool result truncation handling
  - Forced verification (type-check + lint before claiming "Done!")
  - Edit integrity (re-read before/after every edit)
  - Semantic search limitations (grep ≠ AST)
  - Senior dev code quality standard

## Compatibility

| Tool | Status |
|---|---|
| Claude Code (desktop) | Native — reads CLAUDE.md from project root |
| Claude Code (Codex) | Native — reads CLAUDE.md from repo |
| Cursor | Paste contents into `.cursorrules` |
| Other agents | Paste into your tool's system prompt or rules file |

## Research Basis

Every rule in the CLAUDE.md traces to specific findings:

| Finding | Source | Rule It Produced |
|---|---|---|
| 79% of multi-agent failures are coordination, not capability | MAST (NeurIPS 2025) | Orchestrator does routing only — no execution mixing |
| 3 optimized agents outperform 7; pruning cuts cost 53–68% | DyLAN (COLM 2024) | Agent count ceiling of 4; decompose into fewer broader tasks |
| Coordination plateaus at 3–4 agents | DeepMind Scaling Study (2025) | Hard maximum per parallel group |
| Sequential reasoning degrades 39–70% with multi-agent | DeepMind Scaling Study (2025) | Decision gate: sequential tasks stay single-agent |
| Tool-heavy tasks (16+ tools) suffer multi-agent overhead | DeepMind Scaling Study (2025) | Planner can flag single-agent-recommended subtasks |
| Agents self-organize communication with lateral channels | SELFORG (2025) | Peer model, not hierarchy — orchestrator is switchboard, not boss |
| Context compaction, file read caps, tool result truncation | fakeguru/claude-md | Universal Rules section: context integrity patterns |

## Token Efficiency: Desktop vs Cloud

**Desktop (Claude Code):** Sub-agents run in parallel. Wall-clock time savings are significant for independent tasks. Token cost = N agents × per-agent context, but each agent's context is smaller and more focused than the single-agent alternative. Net: faster and often cheaper because focused context = fewer wasted tokens and less rework from context decay.

**Cloud (Codex):** Same parallel execution model. Token cost is the same. The tradeoff: multi-agent uses more total tokens but produces better output on complex tasks because each agent operates within its competence window. For simple tasks, multi-agent in cloud is pure overhead — which is why the Decision Gate exists.

**Rule of thumb:** If the task would take a single agent 15+ messages with growing context, multi-agent is more token-efficient even in cloud because it avoids the rework spiral that context decay causes.

## Known Limitations

- Sub-agents cannot spawn their own sub-agents (Claude Code constraint). The architecture is flat: Orchestrator → Specialists. This is actually a feature — it prevents hierarchy chains that the research shows degrade performance.
- Cross-talk detection relies on the Orchestrator reading specialist outputs and inferring impact. It is not real-time monitoring. Cross-talk is checked between parallel groups, not during execution.
- The Staff Engineer review is only as good as its prompt and the project's tooling. Projects without type-checkers or linters get weaker verification.
- Very small tasks (quick fixes, single-file edits) will feel slower if the Decision Gate incorrectly routes to multi-agent. The gate is biased toward single-agent to prevent this.

## License

MIT
