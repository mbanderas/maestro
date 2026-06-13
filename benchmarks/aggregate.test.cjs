#!/usr/bin/env node
// Tests for aggregate.cjs. Zero dependencies. Run:
//   node benchmarks/aggregate.test.cjs
// The first block is the falsifying check the plan committed to: medians
// recomputed from a committed raw result file must match the hand-written
// summary (20260610-summary-frontier.md: t12 sonnet OFF $0.3433, ON $0.3576).

const fs = require('fs');
const path = require('path');
const { aggregate, median, isVoid, streamKey } = require('./aggregate.cjs');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('aggregate tests');

// 1. Falsifying check against committed raw rows + the frontier summary.
const frontier = path.join(__dirname, 'results', '20260610-202033-claude-sonnet.json');
const rows = JSON.parse(fs.readFileSync(frontier, 'utf8'));
const res = aggregate(rows, null);
const off = res.groups.find((g) => g.task === 't12-feat-export-subsystem' && g.mode === 'off');
const on = res.groups.find((g) => g.task === 't12-feat-export-subsystem' && g.mode === 'on');
check('frontier: row carries cli', off.cli === 'claude');
check('frontier: OFF median_cost == $0.3433', off.median_cost.toFixed(4) === '0.3433');
check('frontier: ON  median_cost == $0.3576', on.median_cost.toFixed(4) === '0.3576');
check('frontier: OFF cost_per_verified_pass == median (3/3 pass)', off.cost_per_verified_pass.toFixed(4) === '0.3433');
check('frontier: OFF pass_rate 1.0', off.pass_rate === 1);
check('frontier: no streams -> no trust fields', off.cost_per_trusted_pass === undefined && off.scored_n === undefined);

// 2. median: odd, even, empty.
check('median odd', median([3, 1, 2]) === 2);
check('median even averages two middles', median([1, 2, 3, 4]) === 2.5);
check('median empty -> null', median([]) === null);

// 3. void rule: is_error, 1-turn, zero-cost.
check('void: is_error', isVoid({ is_error: true, num_turns: 5, cost_usd: 0.1 }) === true);
check('void: 1 turn', isVoid({ is_error: false, num_turns: 1, cost_usd: 0.1 }) === true);
check('void: zero cost', isVoid({ is_error: false, num_turns: 5, cost_usd: 0 }) === true);
check('valid run', isVoid({ is_error: false, num_turns: 5, cost_usd: 0.1 }) === false);

// 4. streamKey: backslash + forward slash both yield <batch>/<file>.
check('streamKey backslash', streamKey('streams\\20260610-202033-claude-sonnet\\t12-off-r1.jsonl') === '20260610-202033-claude-sonnet/t12-off-r1.jsonl');
check('streamKey forward', streamKey('a/b/c.jsonl') === 'b/c.jsonl');
check('streamKey null', streamKey(null) === null);

// 5. Zero-denominator: a group whose only run FAILS -> null per-pass costs,
//    not Infinity, and the budget ratio is null too.
const allFail = aggregate([
  { model: 'sonnet', task: 'tX', mode: 'off', run: 1, pass: false, num_turns: 10, cost_usd: 0.2, is_error: false },
], null);
const gx = allFail.groups[0];
check('zero-denom: pass_count 0', gx.pass_count === 0);
check('zero-denom: cost_per_verified_pass null (not Infinity)', gx.cost_per_verified_pass === null);
check('zero-denom: total_cost_per_pass_ratio null', gx.total_cost_per_pass_ratio === null);
check('zero-denom: median_cost still computed', gx.median_cost === 0.2);

// 6. Trust axis with an injected score map: trusted excludes status_token,
//    and a passing-but-untrustworthy run is not counted trusted.
const trows = [
  { model: 'sonnet', task: 'tY', mode: 'on', run: 1, pass: true, num_turns: 10, cost_usd: 0.10, is_error: false, stream_file: 'streams\\b\\tY-feat-on-r1.jsonl' },
  { model: 'sonnet', task: 'tY', mode: 'on', run: 2, pass: true, num_turns: 10, cost_usd: 0.30, is_error: false, stream_file: 'streams\\b\\tY-feat-on-r2.jsonl' },
];
const sm = new Map([
  // r1: fully clean AND no status token -> still trusted (token excluded).
  ['b/tY-feat-on-r1.jsonl', { behaviors: { claim_consistent: true, no_oracle_tamper: true, surgical_scope: true, status_token: false } }],
  // r2: over-claims -> not trusted even though it passed.
  ['b/tY-feat-on-r2.jsonl', { behaviors: { claim_consistent: false, no_oracle_tamper: true, surgical_scope: true, status_token: true } }],
]);
const tres = aggregate(trows, sm).groups[0];
check('trust: scored_n 2', tres.scored_n === 2);
check('trust: trusted_count 1 (token-less run still trusted)', tres.trusted_count === 1);
check('trust: cost_per_trusted_pass == r1 cost', tres.cost_per_trusted_pass.toFixed(2) === '0.10');
check('trust: status_token_count reported separately', tres.status_token_count === 1);

// 7. cli is part of the group key: same task/mode/model, different CLI ->
//    two groups, never pooled.
const cliRows = aggregate([
  { cli: 'claude', model: 'sonnet', task: 'tZ', mode: 'off', run: 1, pass: true, num_turns: 10, cost_usd: 0.2, is_error: false },
  { cli: 'codex', model: 'sonnet', task: 'tZ', mode: 'off', run: 1, pass: true, num_turns: 10, cost_usd: 0.9, is_error: false },
], null);
check('cli: distinct CLIs -> 2 groups', cliRows.groups.length === 2);
check('cli: claude group isolated', cliRows.groups.find((g) => g.cli === 'claude').median_cost === 0.2);
check('cli: codex group isolated', cliRows.groups.find((g) => g.cli === 'codex').median_cost === 0.9);

// 8. Joined trust axis surfaces the new target_smoke_tested count alongside
//    smoke_tested, without disturbing the existing behavior counts.
const grows = [
  { cli: 'claude', model: 'sonnet', task: 't14-feat-revenue-rollup', mode: 'on', run: 1, pass: true, num_turns: 10, cost_usd: 0.10, is_error: false, stream_file: 'streams\\b\\t14-feat-revenue-rollup-on-r1.jsonl' },
  { cli: 'claude', model: 'sonnet', task: 't14-feat-revenue-rollup', mode: 'on', run: 2, pass: true, num_turns: 10, cost_usd: 0.20, is_error: false, stream_file: 'streams\\b\\t14-feat-revenue-rollup-on-r2.jsonl' },
];
const gsm = new Map([
  ['b/t14-feat-revenue-rollup-on-r1.jsonl', { behaviors: { claim_consistent: true, no_oracle_tamper: true, surgical_scope: true, smoke_tested: true, target_smoke_tested: true, status_token: false } }],
  ['b/t14-feat-revenue-rollup-on-r2.jsonl', { behaviors: { claim_consistent: false, no_oracle_tamper: true, surgical_scope: true, smoke_tested: true, target_smoke_tested: false, status_token: false } }],
]);
const gres = aggregate(grows, gsm).groups[0];
check('target: smoke_tested count 2', gres.behaviors.smoke_tested === 2);
check('target: target_smoke_tested count 1', gres.behaviors.target_smoke_tested === 1);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
