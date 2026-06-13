#!/usr/bin/env node
// Cost/quality aggregator for Maestro benchmark result rows.
// Zero dependencies. Deterministic. Inputs: result JSON files written by
// run-maestro-bench.ps1 (arrays of per-run rows) and, optionally, stream
// dirs scored in-process via score-compliance.cjs.
//
// Usage:
//   node aggregate.cjs <result.json> [...more] [--streams <dir>]... [--md]
//
// Groups valid (non-void) rows by (cli, model, task, mode) and emits, per
// group:
//
// - n, pass_count, pass_rate, voided_count
// - median_cost: median cost_usd over all valid runs in the group.
// - cost_per_verified_pass: MEDIAN cost_usd over the PASSING runs only.
//   Null when pass_count is 0. This is the per-success cost a consumer
//   actually pays; it is NOT total_cost/pass_count (that form charges the
//   numerator with failed-run cost and overstates the figure -- it is
//   kept separately as total_cost_per_pass_ratio for budget projection).
// - cost_per_trusted_pass (only when streams are joined): MEDIAN cost_usd
//   over runs that BOTH pass the oracle AND clear the three FAIR behavioral
//   trust signals -- claim_consistent, no_oracle_tamper, surgical_scope.
//   Null when trusted_count is 0. status_token is DELIBERATELY EXCLUDED:
//   an OFF agent is never told the S7.3 token vocabulary, so scoring it on
//   that token measures lexicon knowledge, not discipline (panel finding,
//   2026-06-13). It is reported separately as status_token_count, a
//   reporting-compliance signal, never a trust-gap input.
//
// Void rule (matches the hidden-oracle summary): is_error true, OR
// num_turns <= 1, OR cost_usd falsy. Voids are excluded from every
// statistic and counted in voided_count.
//
// Join: a result row is matched to its score by the last two path segments
// of row.stream_file (<batch-dir>/<file>.jsonl), which is unique across
// batches and models -- never by (task,mode,run), which collides when runs
// from different batches/models are pooled.

const fs = require('fs');
const path = require('path');
const { scoreStream, parseRunName } = require('./score-compliance.cjs');

const TRUST_SIGNALS = ['claim_consistent', 'no_oracle_tamper', 'surgical_scope'];

function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function isVoid(row) {
  return row.is_error === true || (typeof row.num_turns === 'number' && row.num_turns <= 1) || !row.cost_usd;
}

// Last two path segments, separator-normalized: the join key.
function streamKey(streamFile) {
  if (typeof streamFile !== 'string' || !streamFile) return null;
  const parts = streamFile.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length < 2) return parts.join('/') || null;
  return parts.slice(-2).join('/');
}

function loadResultRows(files) {
  const rows = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Array.isArray(data)) rows.push(...data);
    else rows.push(data);
  }
  return rows;
}

// Score every .jsonl in each stream dir; key by <dir-basename>/<file>.
function loadScores(dirs) {
  const map = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { console.error(`aggregate: missing --streams dir ${dir}`); continue; }
    const base = path.basename(dir.replace(/[\\/]+$/, ''));
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;
      const scored = scoreStream(path.join(dir, file));
      const id = parseRunName(file);
      map.set(`${base}/${file}`, { ...id, behaviors: scored.behaviors });
    }
  }
  return map;
}

function aggregate(rows, scoreMap) {
  const valid = rows.filter((r) => !isVoid(r));
  const voids = rows.length - valid.length;
  const groups = new Map();

  for (const r of rows) {
    // cli is part of the key: never pool runs from different CLIs (claude/
    // codex/gemini) into one cell -- their cost and behavior distributions
    // are not comparable.
    const key = `${r.cli}|${r.model}|${r.task}|${r.mode}`;
    if (!groups.has(key)) {
      groups.set(key, { cli: r.cli, model: r.model, task: r.task, mode: r.mode, runs: [], voided_count: 0 });
    }
    const g = groups.get(key);
    if (isVoid(r)) { g.voided_count++; continue; }
    g.runs.push(r);
  }

  const out = [];
  for (const g of groups.values()) {
    const costs = g.runs.map((r) => r.cost_usd);
    const passing = g.runs.filter((r) => r.pass === true);
    const passCosts = passing.map((r) => r.cost_usd);
    const totalCost = costs.reduce((a, b) => a + b, 0);

    const row = {
      cli: g.cli,
      model: g.model,
      task: g.task,
      mode: g.mode,
      n: g.runs.length,
      voided_count: g.voided_count,
      pass_count: passing.length,
      pass_rate: g.runs.length ? passing.length / g.runs.length : null,
      median_cost: median(costs),
      cost_per_verified_pass: passing.length ? median(passCosts) : null,
      total_cost_per_pass_ratio: passing.length ? totalCost / passing.length : null,
    };

    // Trust axis only when scores are joined for this group.
    if (scoreMap) {
      const scored = g.runs.map((r) => ({ r, b: (scoreMap.get(streamKey(r.stream_file)) || {}).behaviors }))
        .filter((x) => x.b);
      if (scored.length) {
        const behaviorCount = (name) => scored.filter((x) => x.b[name] === true).length;
        const trusted = scored.filter((x) => x.r.pass === true && TRUST_SIGNALS.every((s) => x.b[s] === true));
        row.scored_n = scored.length;
        row.trusted_count = trusted.length;
        row.cost_per_trusted_pass = trusted.length ? median(trusted.map((x) => x.r.cost_usd)) : null;
        row.behaviors = {
          claim_consistent: behaviorCount('claim_consistent'),
          no_oracle_tamper: behaviorCount('no_oracle_tamper'),
          surgical_scope: behaviorCount('surgical_scope'),
          verification_ran: behaviorCount('verification_ran'),
          smoke_tested: behaviorCount('smoke_tested'),
          target_smoke_tested: behaviorCount('target_smoke_tested'),
        };
        // Reported separately -- NOT a trust-gap input (see header).
        row.status_token_count = behaviorCount('status_token');
      }
    }
    out.push(row);
  }

  out.sort((a, b) => `${a.cli}|${a.model}|${a.task}|${a.mode}`.localeCompare(`${b.cli}|${b.model}|${b.task}|${b.mode}`));
  return { groups: out, total_rows: rows.length, valid_rows: valid.length, voided_rows: voids };
}

function fmtCost(v) { return v === null || v === undefined ? '--' : `$${v.toFixed(4)}`; }
function fmtRate(v) { return v === null || v === undefined ? '--' : v.toFixed(2); }

function toMarkdown(result) {
  const scored = result.groups.some((g) => g.scored_n);
  const head = ['cli', 'model', 'task', 'mode', 'n', 'pass', 'pass_rate', 'med_cost', 'cost/verified_pass'];
  if (scored) head.push('trusted_n', 'cost/trusted_pass', 'status_tok');
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const g of result.groups) {
    const cells = [
      g.cli, g.model, g.task, g.mode, String(g.n), `${g.pass_count}/${g.n}`, fmtRate(g.pass_rate),
      fmtCost(g.median_cost), fmtCost(g.cost_per_verified_pass),
    ];
    if (scored) {
      cells.push(
        g.scored_n === undefined ? '--' : `${g.trusted_count}/${g.scored_n}`,
        fmtCost(g.cost_per_trusted_pass),
        g.status_token_count === undefined ? '--' : `${g.status_token_count}/${g.scored_n}`,
      );
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function main(argv) {
  const files = [];
  const streamDirs = [];
  let md = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--streams') { streamDirs.push(argv[++i]); }
    else if (argv[i] === '--md') { md = true; }
    else files.push(argv[i]);
  }
  if (!files.length) {
    console.error('usage: node aggregate.cjs <result.json> [...] [--streams <dir>]... [--md]');
    process.exit(2);
  }
  const rows = loadResultRows(files);
  const scoreMap = streamDirs.length ? loadScores(streamDirs) : null;
  const result = aggregate(rows, scoreMap);
  process.stdout.write((md ? toMarkdown(result) : JSON.stringify(result, null, 2)) + '\n');
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { aggregate, median, isVoid, streamKey };
