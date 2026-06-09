#!/usr/bin/env node
// Tests for maestro-gate-telemetry.cjs. Zero dependencies.
// Run: node hooks/maestro-gate-telemetry.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-gate-telemetry.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-tel-test-'));
const fakeHome = path.join(tmp, 'home');
fs.mkdirSync(fakeHome, { recursive: true });
const telFile = path.join(fakeHome, '.claude', 'maestro-telemetry.jsonl');

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}

// Redirect os.homedir() for the child: USERPROFILE on Windows, HOME on POSIX.
function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, ...env }
  });
}

function readRows() {
  if (!fs.existsSync(telFile)) return [];
  return fs.readFileSync(telFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

const spawn = name => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { prompt: 'go' } }] } });
const multiTx = transcript('multi.jsonl', [
  { type: 'user', message: { content: [{ type: 'text', text: 'build the feature' }] } },
  spawn('Task'),
  spawn('Agent'),
  { type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }
]);
const singleTx = transcript('single.jsonl', [
  { type: 'user', message: { content: [{ type: 'text', text: 'fix typo' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } }
]);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-gate-telemetry tests');

// 1. Opt-in not set: no file written.
runHook({ transcript_path: multiTx, cwd: 'C:\\proj\\demo', session_id: 's0', reason: 'other' }, { MAESTRO_TELEMETRY: '' });
check('no opt-in -> no telemetry file', !fs.existsSync(telFile));

// 2. Opt-in, multi-agent session: row with gate=multi, agent_count=2.
runHook({ transcript_path: multiTx, cwd: path.join(tmp, 'demo-project'), session_id: 's1', reason: 'prompt_input_exit' }, { MAESTRO_TELEMETRY: '1' });
let rows = readRows();
check('opt-in writes one row', rows.length === 1);
check('gate=multi with 2 agents', rows[0].gate === 'multi' && rows[0].agent_count === 2);
check('reason recorded', rows[0].reason === 'prompt_input_exit');
check('project is basename only (no path)', rows[0].project === 'demo-project');

// 3. Single-agent session appends a second row.
runHook({ transcript_path: singleTx, cwd: path.join(tmp, 'demo-project'), session_id: 's2', reason: 'clear' }, { MAESTRO_TELEMETRY: '1' });
rows = readRows();
check('second session appends', rows.length === 2);
check('gate=single with 0 agents', rows[1].gate === 'single' && rows[1].agent_count === 0);

// 4. Missing transcript: still records (gate=single, count 0), no crash.
runHook({ transcript_path: path.join(tmp, 'missing.jsonl'), cwd: tmp, session_id: 's3', reason: 'logout' }, { MAESTRO_TELEMETRY: '1' });
rows = readRows();
check('missing transcript -> row with 0 agents', rows.length === 3 && rows[2].agent_count === 0);

// 5. Garbage stdin with opt-in: exit 0, no new row.
runHook('not json', { MAESTRO_TELEMETRY: '1' });
check('garbage stdin -> no crash, no row', readRows().length === 3);

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
