# Maestro Agent Map

This file is a cheap orientation layer for agents. Use it to choose
what to read next; do not treat it as authority. Live source files,
fixtures, and benchmark summaries remain the source of truth.

## First Stops

- `AGENTS.md` is the always-on doctrine kernel loaded by agent
  runtimes. Do not re-read it when it is already in context.
- `README.md` is the user-facing product narrative, install guide,
  runtime adapter map, hook docs, and benchmark summary. Use this map
  first when you only need repo navigation.
- `docs/orchestration.md` is the full S2-S6 multi-agent protocol. Read
  it only after a multi-agent gate verdict.
- `docs/codex.md` maps Maestro behavior onto Codex surfaces.
- `benchmarks/README.md` explains the hidden-oracle benchmark harness,
  run commands, scoring, and cross-CLI caveats.

## Code Areas

- `hooks/` contains the Claude Code hook pack and its zero-dependency
  tests. Hook tests run through `npm test`.
- `scripts/` contains helper scripts for compression, hook-test
  orchestration, benchmark verification, and downstream sync.
- `commands/` contains Claude slash-command markdown.
- `skills/` contains Claude/plugin-facing skills.
- `.agents/skills/` contains Codex-discoverable repo skills.
- `schemas/` contains optional JSON Schemas for specialist manifests
  and handoff packets.

## Benchmarks

- Prefer committed summaries in `benchmarks/results/*summary*.md` for
  conclusions, caveats, and reproduction commands.
- Use raw streams in `benchmarks/results/streams/**` and raw result
  JSON in `benchmarks/results/*.json` only for forensic scoring or
  re-parsing. They are intentionally excluded from default search by
  `.ignore`; use `rg --no-ignore` when you need them.
- Use `node scripts/reduce-trajectory.cjs <file-or-dir>` to turn raw
  benchmark JSON/JSONL into compact per-run audit facts before reading
  full trajectories.
- Fixture tasks live under `benchmarks/tasks/**`. The agent must not
  see `verify.cjs` during benchmark runs; the runner copies it only
  after the agent exits.

## Local Scratch

- Root `_*.md` files are long-horizon checkpoints or scratch notes and
  are gitignored. Keep one active checkpoint per long run in the root.
  Archive stale notes elsewhere instead of using them as orientation.

## Stable Prefix

- Keep always-loaded instruction files stable. Do not add volatile run
  notes, dated scratch state, benchmark deltas, machine-local paths, or
  personal state to `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or
  `.cursorrules`.
- Put durable rules in instruction files; put changing evidence in
  benchmark summaries, checkpoints, or docs. Stable prefixes improve
  provider cache reuse and reduce instruction churn.

## Verification

Run these before reporting completion after repo changes:

```bash
npm test
npm run lint
npm run bench-verify
```

There is no configured TypeScript or ESLint checker in this repo unless
`package.json` changes.
