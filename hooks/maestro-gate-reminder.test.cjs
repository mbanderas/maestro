#!/usr/bin/env node
// Tests for maestro-gate-reminder.cjs. Zero dependencies.
// Run: node hooks/maestro-gate-reminder.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-gate-reminder.cjs');

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

const sid = () => `gate-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
const cleanup = [];
function markerFor(id) {
  return path.join(os.tmpdir(), `maestro-gate-reminder-${id.replace(/[^a-zA-Z0-9-]/g, '_')}`);
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-gate-reminder tests');

// 1. First prompt of a session: emits gate checklist as additionalContext.
const s1 = sid(); cleanup.push(markerFor(s1));
let out = runHook({ session_id: s1, prompt: 'add an export subsystem' });
check('first prompt -> fires', out.includes('GATE: files='));
check('valid UserPromptSubmit JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'UserPromptSubmit'; }
  catch { return false; }
})());
check('default mode names the spawn imperative', out.includes('Agent/Task tool'));

// 2. Second prompt, same session: silent (fire-once).
out = runHook({ session_id: s1, prompt: 'continue' });
check('same session again -> silent', out === '');

// 3. New session: fires again.
const s2 = sid(); cleanup.push(markerFor(s2));
out = runHook({ session_id: s2, prompt: 'fix a bug' });
check('new session -> fires again', out.includes('GATE: files='));

// 4. Opt-out env: silent, writes no marker.
const s3 = sid(); cleanup.push(markerFor(s3));
out = runHook({ session_id: s3, prompt: 'task' }, { MAESTRO_GATE_REMINDER: '0' });
check('MAESTRO_GATE_REMINDER=0 -> silent', out === '');
check('opt-out leaves no marker', !fs.existsSync(markerFor(s3)));

// 5. Verdict-only mode keeps the counted verdict and drops the spawn imperative.
const s4 = sid(); cleanup.push(markerFor(s4));
out = runHook(
  { session_id: s4, prompt: 'large refactor' },
  { MAESTRO_GATE_REMINDER_MODE: 'verdict-only' }
);
check('verdict-only mode -> fires', out.includes('GATE: files='));
check('verdict-only mode omits spawn imperative', !out.includes('Agent/Task tool'));
check('verdict-only mode labels itself', out.includes('verdict-only'));

// 6. Invalid mode falls back to the original spawn behavior.
const s5 = sid(); cleanup.push(markerFor(s5));
out = runHook(
  { session_id: s5, prompt: 'large refactor' },
  { MAESTRO_GATE_REMINDER_MODE: 'bogus' }
);
check('invalid mode falls back to spawn', out.includes('Agent/Task tool'));

// 7. Opt-out wins even when a mode is set.
const s6 = sid(); cleanup.push(markerFor(s6));
out = runHook(
  { session_id: s6, prompt: 'task' },
  { MAESTRO_GATE_REMINDER: '0', MAESTRO_GATE_REMINDER_MODE: 'verdict-only' }
);
check('opt-out wins over mode', out === '');
check('opt-out with mode leaves no marker', !fs.existsSync(markerFor(s6)));

// 8. Missing session_id: silent.
out = runHook({ prompt: 'task' });
check('no session_id -> silent', out === '');

// 9. Garbage stdin: silent exit 0.
out = runHook('not json');
check('garbage stdin -> silent exit 0', out === '');

for (const m of cleanup) { try { fs.rmSync(m, { force: true }); } catch {} }

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
