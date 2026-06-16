#!/usr/bin/env node
// Tests for maestro-toolbudget-advisory.cjs. Zero dependencies.
// Run: node hooks/maestro-toolbudget-advisory.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-toolbudget-advisory.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-toolbudget-test-'));
const LOG = path.join(tmp, 'advisory.jsonl');
const MARKERS = path.join(tmp, 'markers');

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}

// Base env: hermetic log + marker dir, low budget so fixtures stay small.
function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      MAESTRO_TOOLBUDGET_LOG: LOG,
      MAESTRO_TOOLBUDGET_MARKERDIR: MARKERS,
      MAESTRO_TOOLBUDGET_THRESHOLD: '3',
      ...env
    }
  });
}

function rows() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function reset() {
  try { fs.writeFileSync(LOG, ''); } catch { /* fresh */ }
  fs.rmSync(MARKERS, { recursive: true, force: true });
}

const userMsg = text => ({ type: 'user', message: { content: [{ type: 'text', text }] } });
const explore = n => Array.from({ length: n }, () => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'x' } }] } }));
const edit = f => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }] } });

// ---- PREREGISTERED OFF/ON FIXTURE (threshold = 3) --------------------------
// OFF: 3 exploration calls before the first edit -> at budget, no advisory.
const offTx = transcript('off.jsonl', [userMsg('quick fix'), ...explore(3)]);
// ON: 4 exploration calls before the first edit -> over budget, one advisory.
const onTx = transcript('on.jsonl', [userMsg('quick fix'), ...explore(4)]);
// ON with the first edit already recorded in the transcript (priorEdit stop).
const onEditInTx = transcript('on-edit-in.jsonl', [userMsg('quick fix'), ...explore(4), edit('a.ts')]);
// Two turns: 4 explores in turn 1, 1 explore in turn 2 -> only turn 2 counts.
const twoTurnTx = transcript('two-turn.jsonl', [
  userMsg('phase one'), ...explore(4), edit('a.ts'),
  userMsg('phase two'), ...explore(1)
]);
// ---------------------------------------------------------------------------

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-toolbudget-advisory tests');

// 1. ON: over budget -> exactly one advisory row, and ZERO stdout.
reset();
let out = runHook({ session_id: 's1', cwd: '/proj/demo', transcript_path: onTx, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
check('ON: zero prompt tokens (empty stdout)', out === '');
let r = rows();
check('ON: exactly one advisory row', r.length === 1);
check('ON: row is the advisory, counts only', r[0] && r[0].kind === 'toolbudget-advisory' && r[0].explore_calls === 4 && r[0].threshold === 3 && r[0].project === 'demo');
check('ON: never blocks (no decision in stdout)', !out.includes('permissionDecision') && !out.includes('deny'));

// 2. OFF: at budget -> no advisory row, empty stdout.
reset();
out = runHook({ session_id: 's2', cwd: '/proj/demo', transcript_path: offTx, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
check('OFF: empty stdout', out === '');
check('OFF: no advisory row', rows().length === 0);

// 3. ON with edit already in transcript: priorEdit stops the count at 4.
reset();
out = runHook({ session_id: 's3', cwd: '/proj/demo', transcript_path: onEditInTx, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
r = rows();
check('ON (edit in transcript): one row, explore=4', r.length === 1 && r[0].explore_calls === 4);

// 4. Once per turn: second edit, same turn/session -> no extra row.
reset();
runHook({ session_id: 's4', cwd: '/proj/demo', transcript_path: onTx, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
runHook({ session_id: 's4', cwd: '/proj/demo', transcript_path: onTx, tool_name: 'Edit', tool_input: { file_path: 'b.ts' } });
check('once per turn: still one row after a second edit', rows().length === 1);

// 5. Turn isolation: only the current turn's exploration counts.
reset();
out = runHook({ session_id: 's5', cwd: '/proj/demo', transcript_path: twoTurnTx, tool_name: 'Edit', tool_input: { file_path: 'b.ts' } });
check('two turns: turn-two under budget -> no row', rows().length === 0);

// 6. Disabled via MAESTRO_TOOLBUDGET=0 -> no row, empty stdout.
reset();
out = runHook({ session_id: 's6', cwd: '/proj/demo', transcript_path: onTx, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }, { MAESTRO_TOOLBUDGET: '0' });
check('disabled: empty stdout', out === '');
check('disabled: no advisory row', rows().length === 0);

// 7. Default threshold is 20: 21 explores over budget, 20 at budget.
reset();
const def21 = transcript('def21.jsonl', [userMsg('go'), ...explore(21)]);
out = runHook({ session_id: 's7', cwd: '/proj/demo', transcript_path: def21, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }, { MAESTRO_TOOLBUDGET_THRESHOLD: '' });
check('default threshold 20: 21 explores -> one row', rows().length === 1 && rows()[0].threshold === 20);
reset();
const def20 = transcript('def20.jsonl', [userMsg('go'), ...explore(20)]);
out = runHook({ session_id: 's7b', cwd: '/proj/demo', transcript_path: def20, tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }, { MAESTRO_TOOLBUDGET_THRESHOLD: '' });
check('default threshold 20: 20 explores -> no row', rows().length === 0);

// 8. Non-edit triggering tool is ignored.
reset();
out = runHook({ session_id: 's8', cwd: '/proj/demo', transcript_path: onTx, tool_name: 'Read', tool_input: { file_path: 'x' } });
check('non-edit trigger: empty stdout, no row', out === '' && rows().length === 0);

// 9. Missing transcript -> empty stdout, no row.
reset();
out = runHook({ session_id: 's9', cwd: '/proj/demo', transcript_path: path.join(tmp, 'nope.jsonl'), tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
check('missing transcript -> silent, no row', out === '' && rows().length === 0);

// 10. Garbage stdin -> empty stdout, exit 0.
reset();
out = execFileSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, MAESTRO_TOOLBUDGET_LOG: LOG, MAESTRO_TOOLBUDGET_MARKERDIR: MARKERS } });
check('garbage stdin -> silent exit 0', out === '' && rows().length === 0);

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
