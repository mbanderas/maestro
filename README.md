<p align="center">
  <strong>Maestro</strong><br>
  Research-grounded multi-agent orchestrator for AI coding agents
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/dependencies-zero-brightgreen" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex%20%7C%20Cursor-5b82d6" alt="Claude Code | Codex | Cursor">
</p>

---

Drop a single file into Claude Code, Codex, or Cursor and transform sequential single-agent execution into a coordinated multi-agent pipeline. No dependencies. No config. No SDK.

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/mbanderas/maestro/main/CLAUDE.md
```

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

**Decision Gate** — Evaluates whether a task actually needs multiple agents. Biased toward single-agent to prevent unnecessary coordination overhead. Most tasks stay single-agent.

**Planner** — Decomposes complex tasks into parallel and sequential work when the Decision Gate approves multi-agent execution.

**Specialists** — Execute focused subtasks with scoped context. Hard-capped at 4 per parallel group based on the DyLAN and DeepMind findings on coordination plateaus.

**Cross-Talk Routing** — Manages structured communication between specialists when outputs affect one another. Uses a shared context bus, not message relay through a boss agent.

**Staff Engineer Review** — Performs adversarial final verification. A separate agent with a different role (reviewer vs. builder) catches issues a single perspective misses.

## Quick Start

### Claude Code

Copy `CLAUDE.md` into your project root. That's it.

```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/mbanderas/maestro/main/CLAUDE.md
```

Claude Code reads `CLAUDE.md` automatically on startup. Your next task will route through Maestro's Decision Gate.

### Codex

```bash
curl -o AGENTS.md https://raw.githubusercontent.com/mbanderas/maestro/main/AGENTS.md
```

### Cursor

```bash
curl -o .cursorrules https://raw.githubusercontent.com/mbanderas/maestro/main/.cursorrules
```

## How It Works

1. You give your AI coding agent a task as normal
2. The **Decision Gate** evaluates complexity. Simple tasks run single-agent (no overhead)
3. For complex tasks, the **Planner** decomposes work into parallel and sequential subtasks
4. **Specialists** execute subtasks with scoped context, communicating through structured handoffs
5. The **Staff Engineer** reviews the combined output adversarially
6. You get the result — faster for complex tasks, identical for simple ones

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
| **Setup** | Drop one file, done | Install packages, write Python/TS, configure agents |
| **Dependencies** | Zero | Framework + SDK + runtime |
| **Where it runs** | Inside your existing AI coding agent | Standalone process you build and deploy |
| **Agent count** | Hard cap at 4 parallel (research-backed) | Unlimited (user decides) |
| **Default behavior** | Single-agent unless complexity warrants multi | Always multi-agent |
| **Design philosophy** | Fewer agents, structured coordination | More agents, flexible topologies |

Maestro is not a framework. It's an orchestration layer for AI coding agents that already exist. You don't write agent code — you drop a file and your existing agent gains multi-agent capabilities.

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
3. Test with real tasks across Claude Code, Codex, and Cursor

If you have benchmarks, case studies, or research that challenges or extends the current architecture, open an issue. The design should evolve with evidence.

## Related Projects

- **[Govyn](https://github.com/govynAI/govyn)** — Open-source AI agent governance proxy. Maestro orchestrates your agents; Govyn ensures they never hold real API keys, stay within budget, and follow policy. They are designed to work together.

## Community

Questions, ideas, or war stories about multi-agent coordination? [Open a discussion](https://github.com/mbanderas/maestro/discussions) or [file an issue](https://github.com/mbanderas/maestro/issues).

## License

MIT
