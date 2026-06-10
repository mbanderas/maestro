'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const cli = path.join(__dirname, 'src', 'cli.js');

function run(args) {
  const out = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return out.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
}

const EXPECTED = [
  'products: 3',
  'orders: 3',
  'revenue: $48.00',
  'top-customer: Ada ($40.00)',
];

try {
  const { summaryReport } = require('./src/reports/summary.js');
  assert.strictEqual(typeof summaryReport, 'function', 'summaryReport exported');
  assert.deepStrictEqual(summaryReport(), EXPECTED, 'summaryReport lines');
  assert.deepStrictEqual(run(['report-summary']), EXPECTED, 'CLI report-summary output');

  const config = require('./src/config.js');
  assert.ok(config.features.includes('reports'), "config.features includes 'reports'");

  const docs = fs.readFileSync(path.join(__dirname, 'docs', 'commands.md'), 'utf8');
  assert.ok(/report-summary/.test(docs), 'docs/commands.md documents report-summary');

  assert.deepStrictEqual(
    run(['list-products']),
    ['p1 Widget $2.50', 'p2 Gadget $10.00', 'p3 Gizmo $4.00'],
    'list-products unchanged'
  );
  assert.deepStrictEqual(
    run(['list-orders']),
    ['o1 c1 $20.00', 'o2 c2 $8.00', 'o3 c1 $20.00'],
    'list-orders unchanged'
  );
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
