#!/usr/bin/env node
// Maestro Frontier -- unit tests for runlock.cjs (active-run registry).
// Zero dependencies. Registry dir isolated via MAESTRO_FRONTIER_RUNS_DIR so
// the suite never touches a real machine-wide registry.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-runlock-test-'));
process.env.MAESTRO_FRONTIER_RUNS_DIR = dir;

const runlock = require('./runlock.cjs');

let failures = 0;
function check(name, cond) {
  if (cond) process.stdout.write('PASS  ' + name + '\n');
  else { failures++; process.stderr.write('FAIL  ' + name + '\n'); }
}

const DEAD_PID = 2147483647; // 0x7FFFFFFF -- no such process

// runsDir honors the env override.
check('runsDir uses env override', runlock.runsDir() === dir);

// isAlive.
check('isAlive(self) true', runlock.isAlive(process.pid) === true);
check('isAlive(dead) false', runlock.isAlive(DEAD_PID) === false);
check('isAlive(bad) false',
  runlock.isAlive(0) === false && runlock.isAlive(-1) === false && runlock.isAlive(NaN) === false);

// register -> list -> release round-trip.
const entry = runlock.registerRun({ runId: 'frontier-test-1', kind: 'frontier', cwd: process.cwd() });
check('registerRun returns entry',
  !!entry && entry.pid === process.pid && entry.runId === 'frontier-test-1' && entry.kind === 'frontier');
check('entry file written', fs.existsSync(path.join(dir, process.pid + '.json')));
let active = runlock.listActiveRuns();
check('listActiveRuns finds the live entry', active.length === 1 && active[0].pid === process.pid);
runlock.releaseRun();
check('releaseRun removes the entry file', !fs.existsSync(path.join(dir, process.pid + '.json')));
check('listActiveRuns empty after release', runlock.listActiveRuns().length === 0);

// runId falls back to the env marker when not passed.
process.env.MAESTRO_FRONTIER_RUN_ID = 'frontier-from-env';
const e2 = runlock.registerRun({ cwd: process.cwd() });
check('registerRun uses env marker for runId', !!e2 && e2.runId === 'frontier-from-env');
runlock.releaseRun();
delete process.env.MAESTRO_FRONTIER_RUN_ID;

// Dead-pid entry is pruned (and its file deleted) on read.
fs.writeFileSync(path.join(dir, DEAD_PID + '.json'),
  JSON.stringify({ pid: DEAD_PID, runId: 'stale', kind: 'frontier', cwd: process.cwd() }));
active = runlock.listActiveRuns();
check('dead-pid entry pruned from results', active.length === 0);
check('dead-pid entry file deleted', !fs.existsSync(path.join(dir, DEAD_PID + '.json')));

// Unparseable entry: no throw, pruned, fail-open.
fs.writeFileSync(path.join(dir, 'garbage.json'), 'not json');
active = runlock.listActiveRuns();
check('garbage entry does not throw and is pruned',
  active.length === 0 && !fs.existsSync(path.join(dir, 'garbage.json')));

// cwd filter.
runlock.registerRun({ runId: 'frontier-test-2', kind: 'frontier', cwd: process.cwd() });
check('cwd filter match returns entry', runlock.listActiveRuns({ cwd: process.cwd() }).length === 1);
check('cwd filter mismatch excludes', runlock.listActiveRuns({ cwd: path.join(dir, 'other') }).length === 0);
runlock.releaseRun();

// Fail-open: listing a non-existent dir returns [].
process.env.MAESTRO_FRONTIER_RUNS_DIR = path.join(dir, 'does-not-exist');
check('missing dir -> [] (fail-open)', runlock.listActiveRuns().length === 0);
process.env.MAESTRO_FRONTIER_RUNS_DIR = dir;

fs.rmSync(dir, { recursive: true, force: true });

if (failures) { process.stderr.write(failures + ' failure(s)\n'); process.exit(1); }
process.stdout.write('all tests passed\n');
