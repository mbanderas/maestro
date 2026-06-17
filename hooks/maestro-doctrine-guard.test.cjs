#!/usr/bin/env node
// Tests for maestro-doctrine-guard.cjs. Zero dependencies.
// Run: node hooks/maestro-doctrine-guard.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-doctrine-guard.cjs');

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

const sid = () => `guard-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
const cleanup = [];
function markerFor(id) {
  return path.join(os.tmpdir(), `maestro-doctrine-guard-${id.replace(/[^a-zA-Z0-9-]/g, '_')}`);
}

// Two fixture cwds: one with doctrine autoloaded, one bare.
const cwdDoctrine = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-doc-'));
fs.writeFileSync(path.join(cwdDoctrine, 'CLAUDE.md'), '@AGENTS.md');
fs.writeFileSync(path.join(cwdDoctrine, 'AGENTS.md'), '# kernel');
const cwdBare = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-bare-'));

function denied(out) {
  try {
    const j = JSON.parse(out).hookSpecificOutput;
    return j.hookEventName === 'PreToolUse' && j.permissionDecision === 'deny';
  } catch { return false; }
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-doctrine-guard tests');

const read = (file, cwd, id) => ({
  session_id: id || sid(),
  cwd,
  tool_name: 'Read',
  tool_input: { file_path: path.join(cwd, file) }
});

// 1. Strict "always" mode: doctrine Read with doctrine at cwd -> deny.
const ALWAYS = { MAESTRO_DOCTRINE_GUARD: 'always' };
let out = runHook(read('AGENTS.md', cwdDoctrine), ALWAYS);
check('always: AGENTS.md read, doctrine autoloaded -> deny', denied(out));
check('deny reason carries greppable marker', out.includes('maestro-doctrine-guard:'));
check('deny reason instructs (in-context copy)', out.includes('in-context copy'));

out = runHook(read('CLAUDE.md', cwdDoctrine), ALWAYS);
check('always: CLAUDE.md read -> deny', denied(out));

// 2. Case-insensitive basename match (always mode).
out = runHook(read('agents.MD', cwdDoctrine), ALWAYS);
check('always: agents.MD (case variant) -> deny', denied(out));

// 2b. Default mode is "once": first read allowed, repeat denied.
const sd = sid(); cleanup.push(markerFor(sd));
out = runHook(read('AGENTS.md', cwdDoctrine, sd));
check('default (once): first read -> silent (allowed)', out === '');
out = runHook(read('AGENTS.md', cwdDoctrine, sd));
check('default (once): second read -> deny', denied(out));

// 3. Other files pass through, including the on-demand protocol layer.
out = runHook(read(path.join('docs', 'orchestration.md'), cwdDoctrine));
check('docs/orchestration.md -> silent (never guarded)', out === '');
out = runHook(read('README.md', cwdDoctrine));
check('README.md -> silent', out === '');

// 4. No doctrine at cwd: nothing was autoloaded, reads pass.
out = runHook(read('AGENTS.md', cwdBare));
check('AGENTS.md read, bare cwd -> silent', out === '');

// 5. Mode "once": first read allowed (marker written), repeat denied.
const s1 = sid(); cleanup.push(markerFor(s1));
out = runHook(read('AGENTS.md', cwdDoctrine, s1), { MAESTRO_DOCTRINE_GUARD: 'once' });
check('once: first read -> silent (allowed)', out === '');
check('once: marker written', fs.existsSync(markerFor(s1)));
out = runHook(read('AGENTS.md', cwdDoctrine, s1), { MAESTRO_DOCTRINE_GUARD: 'once' });
check('once: second read -> deny', denied(out));

// 6. Mode "once" isolates sessions.
const s2 = sid(); cleanup.push(markerFor(s2));
out = runHook(read('AGENTS.md', cwdDoctrine, s2), { MAESTRO_DOCTRINE_GUARD: 'once' });
check('once: new session -> first read allowed again', out === '');

// 7. Opt-out.
out = runHook(read('AGENTS.md', cwdDoctrine), { MAESTRO_DOCTRINE_GUARD: '0' });
check('MAESTRO_DOCTRINE_GUARD=0 -> silent', out === '');

// 8. Non-Read tools and malformed payloads fail open.
out = runHook({ session_id: sid(), cwd: cwdDoctrine, tool_name: 'Grep', tool_input: { pattern: 'x' } });
check('non-Read tool -> silent', out === '');
out = runHook({ session_id: sid(), cwd: cwdDoctrine, tool_name: 'Read', tool_input: {} });
check('missing file_path -> silent', out === '');
out = runHook('not json');
check('garbage stdin -> silent exit 0', out === '');

for (const m of cleanup) { try { fs.rmSync(m, { force: true }); } catch {} }
fs.rmSync(cwdDoctrine, { recursive: true, force: true });
fs.rmSync(cwdBare, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
