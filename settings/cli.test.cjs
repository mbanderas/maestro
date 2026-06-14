#!/usr/bin/env node
// Maestro Settings — CLI integration tests. Spawns the real CLI for a
// status -> set -> status round-trip and confirms the frontier write is
// readable by frontier/config.cjs (the existing reader; no desync).
// Run: node settings/cli.test.cjs

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-cli-test-'));
const xdg = path.join(tmpBase, 'xdg');
const claude = path.join(tmpBase, 'claude');
fs.mkdirSync(xdg, { recursive: true });
fs.mkdirSync(claude, { recursive: true });

// Parent reads the same stores as the child.
process.env.XDG_CONFIG_HOME = xdg;
process.env.CLAUDE_CONFIG_DIR = claude;
delete process.env.MAESTRO_TERSE_LEVEL;

const env = Object.assign({}, process.env);
const CLI = path.join(__dirname, 'cli.cjs');

let failures = 0;
function check(name, cond) { if (!cond) { console.error('FAIL: ' + name); failures++; } }

function run(args) {
  return execFileSync(process.execPath, [CLI].concat(args), { env, encoding: 'utf8' });
}
function runFail(args) {
  try {
    execFileSync(process.execPath, [CLI].concat(args), { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return null;
  } catch (e) {
    return e;
  }
}

function main() {
  // initial status: everything off/default
  const s0 = run(['status']);
  check('status frontier off', /frontier\s+off/.test(s0));
  check('status terse off', /terse\s+off/.test(s0));

  // set frontier fusion -> echo
  const setOut = run(['set', 'frontier', 'fusion:opus-gpt']);
  check('set frontier echoes', /set frontier = fusion:opus-gpt/.test(setOut));

  // status reflects the set
  const s1 = run(['status']);
  check('status reflects fusion', /frontier\s+fusion opus-gpt/.test(s1));

  // --json round-trips
  const j = JSON.parse(run(['status', '--json']));
  check('json frontier mode/preset', j.frontier.mode === 'fusion' && j.frontier.preset === 'opus-gpt');

  // no desync: the existing reader sees what the CLI wrote
  delete require.cache[require.resolve('../frontier/config.cjs')];
  const frontier = require('../frontier/config.cjs');
  const direct = frontier.loadState();
  check('cli write read by frontier/config.cjs', direct.mode === 'fusion' && direct.preset === 'opus-gpt');

  // terse + context-bar round-trip
  run(['set', 'terse', 'ultra']);
  run(['set', 'context-bar', 'off']);
  const s2 = run(['status']);
  check('status terse ultra', /terse\s+ultra/.test(s2));
  check('status context-bar off', /context-bar\s+off/.test(s2));

  // no-desync: the REAL terse hook reads what the CLI wrote (not just the
  // settings module). This is the central constraint for the terse store.
  const HOOK = path.join(__dirname, '..', 'hooks', 'maestro-terse-mode.cjs');
  function hookSees() {
    return execFileSync(process.execPath, [HOOK], {
      env, encoding: 'utf8', input: '{"hook_event_name":"SessionStart"}',
    });
  }
  run(['set', 'terse', 'full']);
  check('terse hook reads CLI write', /level:\s*full/.test(hookSees()));
  run(['set', 'terse', 'off']);
  check('terse hook sees off (no injection)', hookSees().trim() === '');

  // judge/synth flags
  run(['set', 'frontier', 'fusion:opus-gpt', '--judge', 'opus', '--synth', 'gpt-5.5']);
  const j2 = JSON.parse(run(['status', '--json']));
  check('json judge/synth', j2.frontier.judgeModel === 'opus' && j2.frontier.synthModel === 'gpt-5.5');

  // bad input exits non-zero
  const e1 = runFail(['set', 'terse', 'loud']);
  check('bad terse exits 2', e1 && e1.status === 2);
  const e2 = runFail(['bogus']);
  check('bad command exits 2', e2 && e2.status === 2);
  const e3 = runFail(['set', 'frontier', 'single:nope']);
  check('bad model exits 2', e3 && e3.status === 2);

  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
  if (failures > 0) { console.error('\n' + failures + ' test(s) failed.'); process.exit(1); }
  console.log('settings/cli.test.cjs: all tests passed.');
}

main();
