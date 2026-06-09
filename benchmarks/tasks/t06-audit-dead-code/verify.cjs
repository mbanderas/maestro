'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DEAD = ['legacyEscape', 'padCell', 'deepClone'];
const LIVE = ['normalizeId', 'buildKey', 'toCsvRow', 'stripBom'];

try {
  const auditPath = path.join(__dirname, 'AUDIT.md');
  assert.ok(fs.existsSync(auditPath), 'AUDIT.md exists in project root');

  const bullets = fs
    .readFileSync(auditPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s/.test(line));

  for (const name of DEAD) {
    assert.ok(
      bullets.some((line) => line.includes(name)),
      `dead function ${name} flagged in a bullet`
    );
  }
  for (const name of LIVE) {
    assert.ok(
      !bullets.some((line) => line.includes(name)),
      `live function ${name} must not be flagged`
    );
  }

  const legacy = fs.readFileSync(path.join(__dirname, 'src', 'legacy.js'), 'utf8');
  for (const name of [...DEAD, ...LIVE]) {
    assert.ok(legacy.includes(`function ${name}(`), `src/legacy.js unmodified: ${name} still defined`);
  }
  const app = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
  assert.ok(app.includes("require('./legacy')"), 'src/app.js unmodified');

  console.log('PASS');
} catch (err) {
  console.error('FAIL: ' + err.message);
  process.exit(1);
}
