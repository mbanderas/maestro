#!/usr/bin/env node
// Tests for maestro-receipt-gate.cjs. Zero dependencies, synthetic transcripts.
// Run: node hooks/maestro-receipt-gate.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-receipt-gate.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-receipt-test-'));
const STATE = path.join(tmp, 'state');
fs.mkdirSync(STATE);

// On-disk impl so the hook's mutated-file symbol read works for body-only
// edits (the edit text need not contain the function name).
const WORK = path.join(tmp, 'work');
const IMPL = path.join(WORK, 'src', 'core', 'csv.js');
fs.mkdirSync(path.dirname(IMPL), { recursive: true });
const DISK_IMPL = "function parseCsvLine(line){ const out=[]; let field=''; return out; }\nmodule.exports = { parseCsvLine };";
fs.writeFileSync(IMPL, DISK_IMPL);

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}
// Opt-in flag on by default in the harness (the runner sets it for the
// receipt-gate cell); individual cases override to test the default-off path.
function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, MAESTRO_GUARD_STATE_DIR: STATE, MAESTRO_RECEIPT_GATE: '1', ...env }
  });
}
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const text = t => ({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });

const IMPL_CONTENT = "function parseCsvLine(line){ const out=[]; return out; }\nmodule.exports = { parseCsvLine };";
const writeImpl = () => tool('Write', { file_path: IMPL, content: IMPL_CONTENT });
const genericSmoke = () => tool('Bash', { command: 'node src/cli.js show-rows' });
const inlineSmoke = () => tool('Bash', { command: 'node -e "const {parseCsvLine}=require(\'./src/core/csv.js\'); console.log(parseCsvLine(\'a,b\'))"' });

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`); }
}
const blocked = out => { try { const o = JSON.parse(out); return o.decision === 'block' && /Maestro receipt gate:/.test(o.reason); } catch { return false; } };

console.log('maestro-receipt-gate tests');

// 1. Mutation + completion claim + only generic CLI smoke -> BLOCK.
let out = runHook({ cwd: WORK, transcript_path: transcript('t1.jsonl', [
  writeImpl(), genericSmoke(), text('Implemented parseCsvLine; output looks right. Done.')
]) });
check('generic-smoke claim -> block', blocked(out));

// 2. Mutation + checker run + claim -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t2.jsonl', [
  writeImpl(), tool('Bash', { command: 'npm test' }), text('Implemented. Done.')
]) });
check('checker -> silent', out === '');

// 3. Mutation + inline target smoke (require + call new symbol) + claim -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t3.jsonl', [
  writeImpl(), inlineSmoke(), text('Implemented. Done.')
]) });
check('inline target smoke -> silent', out === '');

// 4. Honest abstention: mutation, no completion claim, UNVERIFIED -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t4.jsonl', [
  writeImpl(), text('No checker configured here. UNVERIFIED: cannot confirm correctness.')
]) });
check('honest UNVERIFIED, no claim -> silent', out === '');

// 5. No mutation (read-only) + claim -> silent (nothing to gate).
out = runHook({ cwd: WORK, transcript_path: transcript('t5.jsonl', [
  tool('Bash', { command: 'cat src/core/csv.js' }), text('Looks done.')
]) });
check('no mutation -> silent', out === '');

// 6. VERIFIED token without a receipt -> block (VERIFIED counts as a claim).
out = runHook({ cwd: WORK, transcript_path: transcript('t6.jsonl', [
  writeImpl(), genericSmoke(), text('All wired up. VERIFIED.')
]) });
check('VERIFIED without receipt -> block', blocked(out));

// 7. Running the impl file itself is not a receipt (no require in cmd, impl
//    excluded from smoke scripts) -> block.
out = runHook({ cwd: WORK, transcript_path: transcript('t7.jsonl', [
  writeImpl(), tool('Bash', { command: 'node src/core/csv.js' }), text('Implemented. Done.')
]) });
check('impl-run is not a receipt -> block', blocked(out));

// 8. Written smoke SCRIPT (require + call, no module.exports) then run -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t8.jsonl', [
  writeImpl(),
  tool('Write', { file_path: path.join(WORK, 'csv.smoke.js'),
    content: "const { parseCsvLine } = require('./src/core/csv.js');\nconsole.log(parseCsvLine('a,b'));" }),
  tool('Bash', { command: 'node csv.smoke.js' }),
  text('Implemented and smoke-tested. Done.')
]) });
check('written smoke script -> silent', out === '');

// 9. stop_hook_active -> silent (never re-enter).
out = runHook({ cwd: WORK, transcript_path: transcript('t9.jsonl', [
  writeImpl(), genericSmoke(), text('Done.')
]), stop_hook_active: true });
check('stop_hook_active -> silent', out === '');

// 10. Default-off: blockable transcript but opt-in flag unset -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t10.jsonl', [
  writeImpl(), genericSmoke(), text('Done.')
]) }, { MAESTRO_RECEIPT_GATE: '' });
check('flag unset (default) -> silent', out === '');

// 11. Fire once: same transcript twice -> first blocks, second silent (marker).
const tx11 = transcript('t11.jsonl', [writeImpl(), genericSmoke(), text('Done.')]);
const first = runHook({ cwd: WORK, transcript_path: tx11 });
const second = runHook({ cwd: WORK, transcript_path: tx11 });
check('fire once: first blocks', blocked(first));
check('fire once: second silent', second === '');

// 12. Garbage stdin -> silent exit 0.
out = execFileSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8',
  env: { ...process.env, MAESTRO_GUARD_STATE_DIR: STATE, MAESTRO_RECEIPT_GATE: '1' } });
check('garbage stdin -> silent', out === '');

// 13. Missing transcript -> silent.
out = runHook({ cwd: WORK, transcript_path: path.join(tmp, 'nope.jsonl') });
check('missing transcript -> silent', out === '');

// 14. BODY-ONLY edit of the existing exported stub (edit text has no function
//     name) + a valid inline smoke -> silent. The function name is learned
//     from the on-disk file, not the edit text.
const bodyOnly = tool('Edit', { file_path: IMPL,
  old_string: "throw new Error('x')",
  new_string: "  const out = [];\n  let field = '';\n  for (const ch of line) { field += ch; }\n  out.push(field);\n  return out;" });
out = runHook({ cwd: WORK, transcript_path: transcript('t14.jsonl', [
  bodyOnly, inlineSmoke(), text('Filled in the parser body. Done.')
]) });
check('body-only edit + inline smoke -> silent', out === '');

// 15. BODY-ONLY edit + destructured written smoke script -> silent.
out = runHook({ cwd: WORK, transcript_path: transcript('t15.jsonl', [
  bodyOnly,
  tool('Write', { file_path: path.join(WORK, 'check.js'),
    content: "const { parseCsvLine } = require('./src/core/csv.js');\nconst row = parseCsvLine('\"a,b\",c');\nif (row.length !== 2) throw new Error('bad');\nconsole.log('ok');" }),
  tool('Bash', { command: 'node check.js' }),
  text('Implemented and verified. Done.')
]) });
check('body-only edit + destructured smoke script -> silent', out === '');

// 16. BODY-ONLY edit + only generic CLI smoke -> block (still no receipt even
//     though the symbol is now known from disk).
out = runHook({ cwd: WORK, transcript_path: transcript('t16.jsonl', [
  bodyOnly, genericSmoke(), text('Filled in the body. Done.')
]) });
check('body-only edit + generic smoke -> block', blocked(out));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
