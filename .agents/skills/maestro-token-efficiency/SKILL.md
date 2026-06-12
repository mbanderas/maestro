---
name: maestro-token-efficiency
description: Use when improving Maestro token efficiency, Codex fit, benchmark context hygiene, or agent orientation without weakening verification quality.
---

# Maestro Token Efficiency

Use this skill for Maestro repo changes that affect agent context,
instruction loading, benchmark search hygiene, or Codex behavior.

1. Read `docs/agent-map.md` first for navigation.
2. Prefer benchmark summary files over raw streams unless doing
   forensic scoring. Use `rg --no-ignore` for raw stream audits.
3. Preserve Maestro's quality bar: no weaker verification status, no
   hidden-oracle exposure, and no default behavior change without
   benchmark evidence.
4. For Codex-specific behavior, check `docs/codex.md` and current
   official Codex docs before changing durable guidance.
5. Keep always-loaded instruction files stable. Put volatile run notes,
   dated scratch state, machine-local paths, and benchmark deltas in
   summaries or checkpoints, not `AGENTS.md`/adapters.

Before completion after edits, run:

```bash
npm test
npm run lint
npm run bench-verify
```
