#!/usr/bin/env node
// Tests for maestro-gate-reminder.cjs. Zero dependencies.
// Run: node hooks/maestro-gate-reminder.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-gate-reminder.cjs');

// Isolate the maestro config dir so the live frontier badge is computed
// against an empty state (badge 'off'), not the host's real armed scope --
// otherwise the byte-size assertion below depends on host state. configDir()
// honors XDG_CONFIG_HOME first on every platform (frontier/config.cjs).
const CFG = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-reminder-cfg-'));

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: CFG, ...env }
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

// Must match maestro-gate-telemetry.cjs verdictRe exactly: the reminder
// only earns its keep if a model copying its template emits a line the
// telemetry oracle can parse. Keep these two in sync.
const verdictRe = /(?:GATE|Maestro)[:\s·].*?files=\S+\s+concerns=\S+\s*->\s*(single|multi)-agent/;
function additionalContext(o) { return JSON.parse(o).hookSpecificOutput.additionalContext; }

// 1. First prompt of a session: emits a MINIMAL gate reminder as additionalContext.
const s1 = sid(); cleanup.push(markerFor(s1));
let out = runHook({ session_id: s1, prompt: 'add an export subsystem' });
check('first prompt -> fires', out.includes('files=<n> concerns=<m> -> single-agent|multi-agent'));
check('points to the cached full spec, does not restate it', additionalContext(out).includes('AGENTS.md S1'));
check('injects a live frontier badge', /frontier (off|on \()/.test(additionalContext(out)));
check('parseable: template with numbers filled matches telemetry verdictRe', (() => {
  const filled = additionalContext(out).replace('<n>', '5').replace('<m>', '2');
  return verdictRe.test(filled);
})());
check('minimal: default (frontier off) injection <= 180 bytes', (() => {
  return Buffer.byteLength(additionalContext(out), 'utf8') <= 180;
})());
check('valid UserPromptSubmit JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'UserPromptSubmit'; }
  catch { return false; }
})());

// 2. Second prompt, same session: silent (fire-once).
out = runHook({ session_id: s1, prompt: 'continue' });
check('same session again -> silent', out === '');

// 3. New session: fires again.
const s2 = sid(); cleanup.push(markerFor(s2));
out = runHook({ session_id: s2, prompt: 'fix a bug' });
check('new session -> fires again', out.includes('files=<n> concerns=<m>'));

// 4. Opt-out env: silent, writes no marker.
const s3 = sid(); cleanup.push(markerFor(s3));
out = runHook({ session_id: s3, prompt: 'task' }, { MAESTRO_GATE_REMINDER: '0' });
check('MAESTRO_GATE_REMINDER=0 -> silent', out === '');
check('opt-out leaves no marker', !fs.existsSync(markerFor(s3)));

// 5. Missing session_id: silent.
out = runHook({ prompt: 'task' });
check('no session_id -> silent', out === '');

// 6. Garbage stdin: silent exit 0.
out = runHook('not json');
check('garbage stdin -> silent exit 0', out === '');

for (const m of cleanup) { try { fs.rmSync(m, { force: true }); } catch {} }

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
