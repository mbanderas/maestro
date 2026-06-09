'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, 'src');

try {
  const util = require('./src/util.js');
  const { reportLine } = require('./src/report.js');
  const { logEntry } = require('./src/log.js');

  assert.strictEqual(typeof util.formatDate, 'function', 'formatDate exported');
  assert.strictEqual(util.fmtDt, undefined, 'fmtDt no longer exported');

  const d = new Date(2026, 5, 10);
  assert.strictEqual(util.formatDate(d), '2026-06-10', 'formatDate output');
  assert.strictEqual(reportLine('build', d), '2026-06-10 build', 'reportLine unchanged');
  assert.strictEqual(logEntry('ok', d), '[2026-06-10] ok', 'logEntry unchanged');

  for (const file of fs.readdirSync(srcDir)) {
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
    assert.ok(!/fmtDt/.test(text), `no fmtDt identifier left in src/${file}`);
  }
  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
