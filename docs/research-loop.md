# Maestro Standing Research Loop

Quarterly runbook for re-grounding Maestro in current evidence. The
doctrine's numerics (4-specialist cap, Decision Gate thresholds) are
research-backed and frozen — this loop exists to find evidence that
*confirms, refines, or contradicts* them, and to absorb new harness
capabilities. It is the mechanism behind the README's promise that the
design evolves with evidence.

## Foundation citations to carry forward

Every sweep starts from these. Verify IDs before citing follow-ups —
do not trust memory or secondary summaries:

| Paper | ID | Carries |
|---|---|---|
| MAST | [arXiv:2503.13657](https://arxiv.org/abs/2503.13657) | 41-87% failure rates; 79% coordination failures; failure taxonomy |
| DyLAN | [arXiv:2310.02170](https://arxiv.org/abs/2310.02170) | 3 optimized agents outperform 7 |
| Towards a Science of Scaling Agent Systems | [arXiv:2512.08296](https://arxiv.org/abs/2512.08296) | Google Research/MIT (NOT DeepMind; do not confuse with 2502.14546); architecture-task fit dominates; sequential tasks degrade 39-70% |
| Agent Scaling via Diversity | [arXiv:2602.03794](https://arxiv.org/abs/2602.03794) | 2 diverse agents match 16 homogeneous |
| LoopTrap | [arXiv:2605.05846](https://arxiv.org/abs/2605.05846) | Termination poisoning; hard caps as mitigation |

## Phases

1. **Research sweep (counter-evidence mandate).** Fan out read-only
   research subagents ("report in under 200 words" per S9) plus direct
   web search. Targets: (a) citations and follow-ups to the foundation
   papers — hunt evidence AGAINST the 3-4-agent optimum and the MAST
   coordination-failure taxonomy as hard as evidence for them;
   (b) new multi-agent coordination / topology / verifier / long-horizon
   work from the last quarter; (c) vendor guidance (Anthropic
   engineering posts, Codex, Gemini). Open every source before citing;
   record title, venue, date, ID in the checkpoint. No paywalled
   guesses.
2. **Harness ground truth.** Re-read `~/.claude/cache/changelog.md` and
   official docs for current semantics of the features the CLAUDE.md
   adapter maps (/loop, ScheduleWakeup, Monitor, schedules, Workflow,
   agent teams, worktrees, hook payloads). Record what the doctrine
   currently ignores or gets stale.
3. **Decide.** Evidence bar: a change to doctrine requires a citable
   paper, an official vendor doc, or verified harness behavior.
   Judgment-only changes may fill silent gaps (additions where doctrine
   says nothing) — never rewrite research-backed numerics on judgment.
   Record WHY for every keep/change/reject in the checkpoint.
4. **Implement.** Surgical scope, max 5 files per phase, conventional
   commits, never push unless separately authorized. Maintain parity:
   repo `AGENTS.md` byte-identical with the global mirror; `.cursorrules`
   receives the same doctrine changes; `GEMINI.md`/`docs/codex.md` only
   when something verified applies.
5. **Verify + sync + report.** All `hooks/*.test.cjs` pass; parity diff
   exits 0; re-read changed docs end-to-end; run the downstream sync
   script (file copies only, no downstream commits). Final report:
   findings with citations, changes with rationale, rejections with
   rationale (especially anything touching the cap or gate numerics),
   commit list, sync output. Then stop — no zombie loop (S10).

Checkpoint artifact: `_research-augment.md` in the repo root
(gitignored via `_*`). Read it first on every iteration; resume the
next unfinished phase; never redo completed phases.

## Run it as a session loop

Paste after `/clear` in the Maestro repo (fill in the current date):

```text
/loop Maestro research-and-augment loop — fully autonomous, self-paced,
multi-iteration. Today: <DATE>. Repo: <path to maestro>. Follow
docs/research-loop.md exactly: phases 1-5, checkpoint
_research-augment.md (read first, resume next unfinished phase),
counter-evidence mandate on the 3-4-agent optimum and MAST taxonomy,
evidence bar as written (citable paper / vendor doc / verified harness
behavior; judgment fills silent gaps only; frozen numerics stay
frozen), parity + sync + final report per phase 5. Make all decisions
yourself; never ask the user. END the loop (no wakeup) after the final
report.
```

## Run it as a quarterly cloud routine

One-time setup (creates a billed scheduled agent — run it yourself
when you want the standing routine):

```text
/schedule create a quarterly routine named "maestro-research-augment":
cron "0 9 1 1,4,7,10 *" (09:00 on the 1st of Jan/Apr/Jul/Oct), repo
mbanderas/maestro, prompt: "Run docs/research-loop.md exactly — phases
1-5 with the checkpoint, counter-evidence mandate, and evidence bar as
written. Commit to a branch and open a PR with the final report;
never push to main."
```

The cloud variant must end in a PR, not a push — the evidence-bar
decisions deserve human review once a quarter.
