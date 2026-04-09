<p align="center">
  <strong>Maestro</strong><br>
  Research-grounded multi-agent orchestrator for AI coding agents
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Gemini%20%7C%20Codex%20%7C%20Cursor-5b82d6" alt="Claude Code | Gemini | Codex | Cursor">
</p>

---

Maestro installs as plain markdown files your AI agent reads on startup — no packages, no build steps, no SDK. Download the files for your runtime into the project root and your agent picks them up automatically.

| Runtime | Files to add |
|---|---|
| Claude Code | [`AGENTS.md`](AGENTS.md) + [`CLAUDE.md`](CLAUDE.md) |
| Gemini | [`AGENTS.md`](AGENTS.md) + [`GEMINI.md`](GEMINI.md) |
| Codex | [`AGENTS.md`](AGENTS.md) |
| Cursor | [`.cursorrules`](.cursorrules) |

Copy-paste install commands are in [Quick Start](#quick-start) below.

> **Already have a `CLAUDE.md`, `AGENTS.md`, or `.cursorrules`?** Don't overwrite them — you'll lose your project context. See [Quick Start](#quick-start) for how to merge Maestro into your existing setup.

Maestro is built on [peer-reviewed research](https://marklaursen.com/blog/why-your-multi-agent-ai-system-keeps-failing) showing that **79% of multi-agent failures come from coordination breakdowns, not model capability** — and that **three optimized agents outperform seven**.

## Why Maestro Exists

Most multi-agent frameworks add agents to make things faster. The research says the opposite: adding agents usually makes things worse.

| Finding | Source |
|---|---|
| Multi-agent systems fail 41-87% of the time | [MAST](https://arxiv.org/abs/2503.13657), NeurIPS 2025 |
| 79% of failures come from coordination, not capability | [MAST](https://arxiv.org/abs/2503.13657), NeurIPS 2025 |
| 3 optimized agents outperform 7 (53-68% cost reduction) | [DyLAN](https://arxiv.org/abs/2310.02170), COLM 2024 |
| Sequential reasoning degrades 39-70% under multi-agent | [DeepMind](https://arxiv.org/abs/2502.14546), 2025 |
| Coordination gains plateau at 3-4 agents | [DeepMind](https://arxiv.org/abs/2502.14546), 2025 |

Maestro implements the architecture this research points to — not a framework that wraps agents in boilerplate, but a routing layer that only activates multi-agent coordination when the task actually demands it.

## Architecture

```
                          +------------------+
                          |   Decision Gate  |
                          | (single vs multi)|
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |                             |
             Single Agent                  +-----+------+
             (most tasks)                  |   Planner  |
                                           +-----+------+
                                                 |
                                    +------------+------------+
                                    |            |            |
                              +-----------+ +-----------+ +-----------+
                              |Specialist | |Specialist | |Specialist |
                              |    A      | |    B      | |    C      |
                              +-----------+ +-----------+ +-----------+
                                    |            |            |
                                    +---Cross-Talk Routing----+
                                                 |
                                    +------------+------------+
                                    | Staff Engineer Review   |
                                    | (adversarial verify)    |
                                    +-------------------------+
```

**Decision Gate** — Routes each task to single-agent or multi-agent execution based on complexity, parallelizability, and token cost. Most tasks stay single-agent.

**Planner** — Decomposes complex tasks into parallel and sequential subtasks with clear boundaries and acceptance criteria.

**Specialists** — Execute focused subtasks with scoped context, hard-capped at 4 per parallel group based on the DyLAN and DeepMind findings.

**Cross-Talk Routing** — Detects when one specialist's output affects another and routes the minimum necessary context between them.

**Staff Engineer Review** — Performs adversarial final verification to catch contradictions, breakage, and architectural drift.

## Quick Start

### Claude Code

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/CLAUDE.md
```

Claude Code reads `CLAUDE.md` on startup. The `@AGENTS.md` import inside it pulls in the orchestration doctrine. Your next task routes through Maestro's Decision Gate.

**Already have a `CLAUDE.md`?** Don't overwrite it. Instead, download just `AGENTS.md` and add `@AGENTS.md` to the top of your existing `CLAUDE.md` to import the doctrine. You can optionally merge the runtime rules from Maestro's [`CLAUDE.md`](CLAUDE.md) into yours.

### Gemini

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/GEMINI.md
```

**Already have a `GEMINI.md`?** Don't overwrite it. Download just `AGENTS.md` and add `@AGENTS.md` to the top of your existing `GEMINI.md`. You can optionally merge the runtime rules from Maestro's [`GEMINI.md`](GEMINI.md) into yours.

### Codex

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
```

Codex reads `AGENTS.md` directly — no adapter file needed.

**Already have an `AGENTS.md`?** Don't overwrite it — that file likely contains your project context. Instead, append the contents of Maestro's [`AGENTS.md`](AGENTS.md) to your existing file, or paste it into a section of your `AGENTS.md` so Codex reads both your project context and the orchestration doctrine.

### Cursor

```bash
curl -O https://raw.githubusercontent.com/mbanderas/maestro/main/.cursorrules
```

**Already have a `.cursorrules`?** Don't overwrite it. Cursor does not support file imports, so append the contents of Maestro's [`.cursorrules`](.cursorrules) to your existing file.

## How It Works

1. You give your AI coding agent a task as normal
2. The **Decision Gate** evaluates complexity — simple tasks run single-agent with no overhead
3. For complex tasks, the **Planner** decomposes work into parallel and sequential subtasks
4. **Specialists** execute subtasks with scoped context, communicating through structured handoffs
5. The **Staff Engineer** reviews the combined output adversarially
6. You get the result — faster for complex tasks, identical for simple ones

## Context Architecture

Maestro minimizes token cost through progressive context loading — agents start from the smallest artifact that can orient their work and expand to live code only when needed.

**Orientation artifacts** — Optional project maps or subsystem indexes that give the Planner and Specialists a cheap structural overview before reading code. Workers start from narrow context instead of rediscovering the repo from scratch.

**Blast-radius-aware routing** — The Decision Gate considers file centrality when choosing execution mode. Tasks touching dependency hubs (shared interfaces, core modules) bias toward single-agent or tighter review. Tasks isolated in narrow subsystems decompose more safely.

**Index-first retrieval** — When a verified orientation artifact exists, agents read it before broad file discovery. This eliminates repeated repo exploration across specialists — one of the largest sources of wasted tokens in multi-agent workflows.

**Orientation is not authority** — Generated maps and project indexes are navigation aids, not source of truth. Agents always verify against live code before acting, preventing stale context from becoming silent corruption.

These features follow the same principle as the rest of Maestro: reducing coordination cost and context duplication is more effective than adding capability.

## Runtime Adapters

Maestro separates **portable orchestration doctrine** from **runtime-specific adapters**. The core logic — Decision Gate, Planner, Specialists, Cross-Talk, Staff Engineer, Universal Rules, Compression — lives in `AGENTS.md` and works across any agent runtime.

Runtime adapters are thin wrappers that import the shared doctrine and add only what is specific to that runtime:

| File | Role | What it adds |
|---|---|---|
| `AGENTS.md` | Portable core | Full orchestration doctrine, runtime-agnostic |
| `CLAUDE.md` | Claude Code adapter | Subagent/team routing, hooks, context limits, tool scoping |
| `GEMINI.md` | Gemini adapter | Execution mapping, instruction precedence, verification notes |
| `.cursorrules` | Cursor adapter | Full doctrine (Cursor does not support imports) |

**Design principle:** runtime-specific features stay in adapters unless they generalize across environments. This keeps the shared doctrine portable and prevents provider-specific details from bloating the core files.

Adding a new runtime adapter means creating a thin file that imports `AGENTS.md` and maps Maestro concepts to the runtime's capabilities.

### Claude Code: Subagents vs Agent Teams

Claude Code offers two mechanisms for parallel work — subagents and [agent teams](https://code.claude.com/docs/en/agent-teams) — and Maestro's `CLAUDE.md` adapter automatically routes to the right one based on the task:

- **Subagents** run within a single session — they execute a scoped task and report results back to the parent agent. Maestro defaults to subagents for most parallel work: narrow, independent tasks where only the result matters.
- **[Agent teams](https://code.claude.com/docs/en/agent-teams)** coordinate multiple independent Claude Code sessions with shared task lists and direct inter-agent messaging. Unlike subagents, teammates communicate peer-to-peer and self-coordinate. Maestro routes to agent teams only when peer-to-peer coordination is materially useful — long-running parallel workstreams, competing-hypothesis debugging, or cross-layer feature builds where agents need to discuss and challenge each other's work.

This routing is automatic. Maestro's Decision Gate evaluates the task, and the Claude adapter selects the execution mode — subagents by default, teams only when the collaboration overhead is justified by the task's complexity.

Agent teams are **experimental and Claude Code-only** — they are not available in Gemini, Codex, Cursor, or other runtimes. Maestro's portable core uses the general concept of "specialists" which each runtime maps to its own execution model.

## When to Use Maestro

Maestro helps most on tasks that are:

- **Genuinely too complex for one pass** — large refactors, multi-file features, cross-cutting concerns
- **Parallelizable** — independent subtasks that don't need sequential reasoning
- **Benefiting from adversarial review** — where a second perspective catches issues

Maestro does **not** help (and intentionally avoids) tasks where:

- A single agent already handles it well (the Decision Gate blocks unnecessary multi-agent)
- The work is purely sequential reasoning (planning, step-by-step proofs)
- The task involves fewer than ~10 files

This is by design. The research shows coordination overhead makes simple tasks worse, not better.

## Why Not CrewAI / LangGraph / AutoGen?

| | Maestro | CrewAI / LangGraph / AutoGen |
|---|---|---|
| **Setup** | Copy 1-2 files, done | Install packages, write Python/TS, configure agents |
| **Dependencies** | Zero | Framework + SDK + runtime |
| **Where it runs** | Inside your existing AI coding agent | Standalone process you build and deploy |
| **Agent count** | Hard cap at 4 parallel (research-backed) | Unlimited (user decides) |
| **Default behavior** | Single-agent unless complexity warrants multi | Always multi-agent |
| **Design philosophy** | Fewer agents, structured coordination | More agents, flexible topologies |

Maestro is not a framework. It's an orchestration layer for AI coding agents that already exist. You don't write agent code — you copy a couple of files and your existing agent gains multi-agent capabilities.

If you need a standalone multi-agent application with custom tools, APIs, and deployment pipelines, use a framework. If you want your AI coding agent to handle complex tasks better without changing your workflow, use Maestro.

## Research Foundation

Maestro's architecture is grounded in 700+ sources across computer science, library science, safety engineering, and knowledge theory. The key papers:

| Paper | Year | Venue | Key Finding |
|---|---|---|---|
| [MAST](https://arxiv.org/abs/2503.13657) | 2025 | NeurIPS Spotlight | 41-87% failure rates; 79% from coordination |
| [DyLAN](https://arxiv.org/abs/2310.02170) | 2024 | COLM | 3 agents outperform 7; dynamic topology selection |
| [DeepMind Scaling Study](https://arxiv.org/abs/2502.14546) | 2025 | arXiv | 3 scaling laws for multi-agent systems |
| [MetaGPT](https://arxiv.org/abs/2308.00352) | 2023 | — | Structured handoffs score 3.9/4 vs unstructured 2.1/4 |
| [Voyager](https://arxiv.org/abs/2305.16291) | 2023 | NeurIPS | Skill library pattern for capability organization |
| [GTD](https://arxiv.org/abs/2504.05767) | 2025 | arXiv | 0.3% degradation under failure with redundant topologies |
| [SELFORG](https://arxiv.org/abs/2502.11811) | 2025 | arXiv | Shapley-based contribution estimation |

For the full analysis, read [Why Your Multi-Agent AI System Keeps Failing](https://marklaursen.com/blog/why-your-multi-agent-ai-system-keeps-failing).

## Contributing

Contributions are welcome. Before opening a PR:

1. Read the research foundation — Maestro's constraints (4-agent cap, Decision Gate bias toward single-agent) are intentional and research-backed
2. Keep it zero-dependency — no npm packages, no external imports
3. Test with real tasks across Claude Code, Gemini, Codex, and Cursor

If you have benchmarks, case studies, or research that challenges or extends the current architecture, open an issue. The design should evolve with evidence.

## Related Projects

- **[Govyn](https://github.com/govynAI/govyn)** — Open-source AI agent governance proxy. Maestro orchestrates your agents; Govyn ensures they never hold real API keys, stay within budget, and follow policy. They are designed to work together.

## Community

Questions, ideas, or war stories about multi-agent coordination? [Open a discussion](https://github.com/mbanderas/maestro/discussions) or [file an issue](https://github.com/mbanderas/maestro/issues).

## License

MIT
