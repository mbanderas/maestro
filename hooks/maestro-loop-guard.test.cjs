#!/usr/bin/env node
// Tests for maestro-loop-guard.cjs. Zero dependencies.
// Run: node hooks/maestro-loop-guard.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-loop-guard.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-loop-test-'));
const emptyRuns = fs.mkdtempSync(path.join(tmp, 'empty-runs-'));

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}

function runHook(payload, env) {
  // Hermetic: default to an empty registry dir and strip the
  // coordinated-child suppress signals so host env never leaks into a case;
  // cases opt in explicitly via the `env` arg.
  const base = { ...process.env, MAESTRO_FRONTIER_RUNS_DIR: emptyRuns };
  delete base.MAESTRO_FRONTIER_RUN_ID;
  delete base.FUSION_DEPTH;
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...base, ...env }
  });
}

const wakeup = n => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input: { delaySeconds: 1200, reason: `tick ${n}` } }] } });

const plainTx = transcript('plain.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Regular work, no loop.' }] } }
]);
const loopTx = transcript('loop.jsonl', [wakeup(1), wakeup(2), wakeup(3)]);
const warnedTx = transcript('warned.jsonl', [
  wakeup(1),
  { type: 'system', text: 'Maestro loop guard:\n- Session is looping but no checkpoint artifact' }
]);

const cwdBare = fs.mkdtempSync(path.join(tmp, 'bare-'));
const cwdCheckpointed = fs.mkdtempSync(path.join(tmp, 'ckpt-'));
fs.writeFileSync(path.join(cwdCheckpointed, '_mytask.md'), '# checkpoint');

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-loop-guard tests');

// 1. No loop evidence: silent regardless of missing checkpoint.
let out = runHook({ transcript_path: plainTx, cwd: cwdBare, session_crons: [] });
check('no loop evidence -> silent', out === '');

// 2. Looping (wakeups) without checkpoint: warns.
out = runHook({ transcript_path: loopTx, cwd: cwdBare });
check('loop without checkpoint -> warns', out.includes('checkpoint artifact'));
check('warning is valid Stop hook JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'Stop'; }
  catch { return false; }
})());

// 3. Looping with checkpoint present and under cap: silent.
out = runHook({ transcript_path: loopTx, cwd: cwdCheckpointed });
check('loop with checkpoint, under cap -> silent', out === '');

// 4. Session cron counts as loop evidence even with no wakeups.
out = runHook({ transcript_path: plainTx, cwd: cwdBare, session_crons: [{ id: 'c1' }] });
check('session cron without checkpoint -> warns', out.includes('checkpoint artifact'));

// 5. Iteration cap exceeded (env override): warns even with checkpoint.
out = runHook({ transcript_path: loopTx, cwd: cwdCheckpointed }, { MAESTRO_LOOP_MAX_ITER: '2' });
check('wakeups over cap -> warns', out.includes('iteration cap'));

// 6. Fire once: marker already in transcript -> silent.
out = runHook({ transcript_path: warnedTx, cwd: cwdBare });
check('already-warned transcript -> silent (no loop)', out === '');

// 7. stop_hook_active: silent, never re-enters.
out = runHook({ transcript_path: loopTx, cwd: cwdBare, stop_hook_active: true });
check('stop_hook_active -> silent', out === '');

// 8. Missing transcript but active cron: checkpoint warning still works.
out = runHook({ transcript_path: path.join(tmp, 'missing.jsonl'), cwd: cwdBare, session_crons: [{ id: 'c1' }] });
check('missing transcript + cron -> still warns on checkpoint', out.includes('checkpoint artifact'));

// 9. Garbage stdin: silent exit 0.
out = execFileSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
check('garbage stdin -> silent exit 0', out === '');

// 10. Coordinated Frontier child (MAESTRO_FRONTIER_RUN_ID set): silent even
//     when looping without a checkpoint -- a read-only panelist is not a loop.
out = runHook({ transcript_path: loopTx, cwd: cwdBare }, { MAESTRO_FRONTIER_RUN_ID: 'frontier-abc' });
check('frontier child (run-id) -> silent', out === '');

// 11. Coordinated Frontier child (FUSION_DEPTH>=1): silent.
out = runHook({ transcript_path: loopTx, cwd: cwdBare }, { FUSION_DEPTH: '1' });
check('frontier child (fusion-depth) -> silent', out === '');

// 12. Active Frontier run in the registry (same cwd): surfaced to a looping
//     session so it does not mistake the panel subprocesses for a 2nd loop.
const runsDir = fs.mkdtempSync(path.join(tmp, 'runs-'));
fs.writeFileSync(path.join(runsDir, process.pid + '.json'),
  JSON.stringify({ pid: process.pid, runId: 'frontier-xyz', kind: 'frontier', cwd: cwdCheckpointed }));
out = runHook({ transcript_path: loopTx, cwd: cwdCheckpointed }, { MAESTRO_FRONTIER_RUNS_DIR: runsDir });
check('active frontier run surfaced', out.includes('coordinated Frontier run'));
check('surfaced run names the run-id', out.includes('frontier-xyz'));

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
