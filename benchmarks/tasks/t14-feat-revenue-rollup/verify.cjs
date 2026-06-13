'use strict';

// Hidden oracle for t14-feat-revenue-rollup. Lands in the work dir only
// after the agent exits. Pristine fixture FAILS (revenueByMonth is a stub
// that throws); a correct implementation PASSES.
//
// The crafted orders below exercise the two documented traps that are NOT
// observable by running the CLI:
//   - UTC bucketing: orders near a month edge in a non-UTC offset must move
//     to the UTC month (wall-clock slicing mis-buckets them).
//   - excluded statuses: cancelled/refunded contribute nothing, and a month
//     whose only orders are excluded is omitted entirely.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const node = process.execPath;

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

// Crafted orders. Comments give the UTC instant each normalizes to.
const ORDERS = [
  { id: 'o1', placedAt: '2026-01-31T23:30:00-05:00', amountCents: 1500, status: 'paid' },      // 2026-02-01T04:30Z -> 2026-02
  { id: 'o2', placedAt: '2026-02-15T12:00:00Z', amountCents: 2500, status: 'paid' },           // 2026-02
  { id: 'o3', placedAt: '2026-02-20T10:00:00Z', amountCents: 999, status: 'cancelled' },       // excluded
  { id: 'o4', placedAt: '2026-01-10T08:00:00+09:00', amountCents: 1000, status: 'paid' },       // 2026-01-09T23:00Z -> 2026-01
  { id: 'o5', placedAt: '2026-03-01T00:30:00+02:00', amountCents: 3333, status: 'paid' },       // 2026-02-28T22:30Z -> 2026-02
  { id: 'o6', placedAt: '2026-03-05T00:00:00Z', amountCents: 1, status: 'refunded' },           // excluded
  { id: 'o7', placedAt: '2026-03-10T00:00:00Z', amountCents: 50, status: 'paid' },              // 2026-03
  { id: 'o8', placedAt: '2026-03-12T00:00:00Z', amountCents: 200, status: 'pending' },          // 2026-03 (pending included)
  { id: 'o9', placedAt: '2026-04-02T00:00:00Z', amountCents: 500, status: 'cancelled' },        // 2026-04 only-excluded -> omitted
];

const EXPECTED = [
  { month: '2026-01', cents: 1000 },
  { month: '2026-02', cents: 7333 },
  { month: '2026-03', cents: 250 },
];

// Check 0: existing command keeps working (regression guard).
{
  const cli = path.join(__dirname, 'src', 'cli.js');
  const r = spawnSync(node, [cli, 'list-orders'], { encoding: 'utf8', cwd: __dirname });
  if (r.status !== 0) fail(`list-orders exited ${r.status}; stderr: ${(r.stderr || '').trim()}`);
  if (!r.stdout || !r.stdout.trim()) fail('list-orders produced no output');
}

// Load the implementation under test.
let revenueByMonth;
try {
  ({ revenueByMonth } = require('./src/core/revenue.js'));
} catch (e) {
  fail('cannot require src/core/revenue.js: ' + e.message);
}
if (typeof revenueByMonth !== 'function') fail('revenueByMonth is not a function');
if (revenueByMonth.length !== 1) fail(`revenueByMonth signature changed: arity ${revenueByMonth.length}, want 1`);

// Check 1: correct rollup. Call on a copy so the impl cannot mutate ours.
let out;
try {
  out = revenueByMonth(ORDERS.map((o) => ({ ...o })));
} catch (e) {
  fail('revenueByMonth threw (stub not implemented?): ' + e.message);
}
if (!Array.isArray(out)) fail(`revenueByMonth must return an array; got ${typeof out}`);

// Check 2: shape, integer cents, exact values, exact order.
if (out.length !== EXPECTED.length) {
  fail(`wrong number of months: got ${JSON.stringify(out)}, want ${JSON.stringify(EXPECTED)}`);
}
for (let i = 0; i < EXPECTED.length; i++) {
  const got = out[i] || {};
  const want = EXPECTED[i];
  if (got.month !== want.month) {
    fail(`month[${i}]: got ${JSON.stringify(got.month)}, want ${want.month} (UTC bucketing) -- full: ${JSON.stringify(out)}`);
  }
  if (!Number.isInteger(got.cents)) {
    fail(`cents for ${want.month} is not an integer: ${JSON.stringify(got.cents)} (money is integer cents)`);
  }
  if (got.cents !== want.cents) {
    fail(`cents for ${want.month}: got ${got.cents}, want ${want.cents} (UTC bucketing + excluded statuses)`);
  }
}

// Check 3: ascending, unique months (defensive; EXPECTED already is).
const months = out.map((r) => r.month);
for (let i = 1; i < months.length; i++) {
  if (months[i] <= months[i - 1]) fail(`months not strictly ascending: ${JSON.stringify(months)}`);
}

// Check 4: no console.log in src/core (logging does not belong in the core).
{
  const fs = require('node:fs');
  const core = path.join(__dirname, 'src', 'core');
  for (const f of fs.readdirSync(core)) {
    if (!f.endsWith('.js')) continue;
    if (/console\.log/.test(fs.readFileSync(path.join(core, f), 'utf8'))) {
      fail(`console.log found in src/core/${f}`);
    }
  }
}

console.log('PASS');
