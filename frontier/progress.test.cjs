'use strict';

// Tests for frontier/progress.cjs — the live statusline progress file.
// Isolates writes by pointing XDG_CONFIG_HOME at a temp dir so configDir()
// (frontier/config.cjs) resolves there instead of the real ~/.config|APPDATA.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-progress-'));
process.env.XDG_CONFIG_HOME = tmpRoot;

const progress = require('./progress.cjs');

const SCOPE = 'cc-deadbeef';

function read(scope) {
  const p = progress.progressPath(scope);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test.afterEach(() => progress.clearProgress(SCOPE));
test.after(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {} });

test('progressPath mirrors statePath naming (default + scoped)', () => {
  const def = progress.progressPath('default');
  assert.ok(def.endsWith('frontier-progress.json'), def);
  const scoped = progress.progressPath(SCOPE);
  assert.ok(scoped.endsWith('frontier-progress.' + SCOPE + '.json'), scoped);
  assert.ok(scoped.includes(path.join('maestro', 'frontier-progress')));
});

test('writeProgress writes a valid record with fresh ts + pid', () => {
  const before = Date.now();
  assert.strictEqual(progress.writeProgress(SCOPE, { phase: 'judge' }), true);
  const rec = read(SCOPE);
  assert.strictEqual(rec.phase, 'judge');
  assert.strictEqual(rec.done, 0);
  assert.strictEqual(rec.total, 0);
  assert.strictEqual(rec.pid, process.pid);
  assert.ok(rec.ts >= before && rec.ts <= Date.now(), 'ts within bounds');
});

test('writeProgress clamps done/total to 0..99 and floors negatives', () => {
  progress.writeProgress(SCOPE, { phase: 'panel', done: -5, total: 1000 });
  const rec = read(SCOPE);
  assert.strictEqual(rec.done, 0);
  assert.strictEqual(rec.total, 99);
});

test('writeProgress rejects an unknown phase (returns false, no file)', () => {
  assert.strictEqual(progress.writeProgress(SCOPE, { phase: 'bogus' }), false);
  assert.throws(() => read(SCOPE)); // file absent
});

test('makeProgressWriter maps engine events to phases', () => {
  const w = progress.makeProgressWriter(SCOPE);

  w({ phase: 'panel-start', models: ['opus', 'gpt-5.5', 'gemini'] });
  let rec = read(SCOPE);
  assert.strictEqual(rec.phase, 'panel');
  assert.strictEqual(rec.total, 3);
  assert.strictEqual(rec.done, 0);

  w({ phase: 'panel-progress', done: 2, total: 3 });
  rec = read(SCOPE);
  assert.deepStrictEqual([rec.phase, rec.done, rec.total], ['panel', 2, 3]);

  w({ phase: 'judge-start', model: 'opus' });
  assert.strictEqual(read(SCOPE).phase, 'judge');

  w({ phase: 'synth-start', model: 'opus' });
  assert.strictEqual(read(SCOPE).phase, 'synth');

  progress.clearProgress(SCOPE);
  w({ phase: 'single-start', model: 'opus' });
  assert.strictEqual(read(SCOPE).phase, 'single');
});

test('makeProgressWriter maps escalate-start to the escalate phase', () => {
  const w = progress.makeProgressWriter(SCOPE);
  w({ phase: 'escalate-start', model: 'gemini' });
  const rec = read(SCOPE);
  assert.strictEqual(rec.phase, 'escalate');
  assert.strictEqual(rec.model, 'gemini');
});

test('writeProgress whitelists the model name (pass) and omits it (reject)', () => {
  progress.writeProgress(SCOPE, { phase: 'judge', model: 'gpt-5.5' });
  assert.strictEqual(read(SCOPE).model, 'gpt-5.5');
  for (const bad of ['no spaces', 'a'.repeat(25), 'evil;rm -rf', '', 42, null]) {
    progress.writeProgress(SCOPE, { phase: 'judge', model: bad });
    assert.strictEqual('model' in read(SCOPE), false, 'model leaked: ' + String(bad));
  }
});

test('writeProgress forwards a sane startTs and drops an insane one', () => {
  const now = Date.now();
  progress.writeProgress(SCOPE, { phase: 'synth', startTs: now });
  assert.strictEqual(read(SCOPE).startTs, now);
  for (const bad of [0, -5, NaN, 'soon', undefined]) {
    progress.writeProgress(SCOPE, { phase: 'synth', startTs: bad });
    assert.strictEqual('startTs' in read(SCOPE), false, 'startTs leaked: ' + String(bad));
  }
});

test('startTs is captured once and stable across successive writes', async () => {
  const w = progress.makeProgressWriter(SCOPE);
  w({ phase: 'panel-start', models: ['opus', 'gemini'] });
  const first = read(SCOPE).startTs;
  assert.ok(Number.isFinite(first) && first > 0, 'startTs missing on first write');
  await new Promise((r) => setTimeout(r, 15));
  w({ phase: 'panel-progress', done: 1, total: 2, model: 'opus' });
  assert.strictEqual(read(SCOPE).startTs, first);
  w({ phase: 'synth-start', model: 'opus' });
  const last = read(SCOPE);
  assert.strictEqual(last.startTs, first);
  assert.ok(last.ts > first || last.ts >= first, 'ts still fresh per write');
});

test('panel-progress passes the completing member model through', () => {
  const w = progress.makeProgressWriter(SCOPE);
  w({ phase: 'panel-progress', done: 2, total: 3, model: 'gpt-5.5' });
  const rec = read(SCOPE);
  assert.deepStrictEqual([rec.phase, rec.done, rec.total, rec.model], ['panel', 2, 3, 'gpt-5.5']);
});

test('makeProgressWriter ignores terminal/unknown events (no write)', () => {
  const w = progress.makeProgressWriter(SCOPE);
  for (const phase of ['panel-done', 'degraded', 'done', 'mystery']) {
    w({ phase });
  }
  assert.throws(() => read(SCOPE)); // nothing written
});

test('writer never throws on garbage input', () => {
  const w = progress.makeProgressWriter(SCOPE);
  assert.doesNotThrow(() => { w(null); w(undefined); w({}); w({ phase: 42 }); w('x'); });
});

test('clearProgress removes the file and is safe when absent', () => {
  progress.writeProgress(SCOPE, { phase: 'synth' });
  assert.doesNotThrow(() => read(SCOPE));
  progress.clearProgress(SCOPE);
  assert.throws(() => read(SCOPE));
  assert.doesNotThrow(() => progress.clearProgress(SCOPE)); // idempotent
});
