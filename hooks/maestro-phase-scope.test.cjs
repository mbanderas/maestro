#!/usr/bin/env node
// Tests for maestro-phase-scope.cjs. Zero dependencies.
// Run: node hooks/maestro-phase-scope.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-phase-scope.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-scope-test-'));

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

const userMsg = text => ({ type: 'user', message: { content: [{ type: 'text', text }] } });
const toolResult = () => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const edit = f => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }] } });

const edits = n => Array.from({ length: n }, (_, i) => edit(`src/f${i}.ts`));

const smallTurnTx = transcript('small.jsonl', [userMsg('fix the bug'), edit('a.ts'), toolResult(), edit('b.ts')]);
const bigTurnTx = transcript('big.jsonl', [userMsg('refactor'), ...edits(6)]);
const twoTurnsTx = transcript('two-turns.jsonl', [
  userMsg('phase one'), ...edits(4),
  userMsg('phase two'), edit('src/f4.ts'), edit('src/f5.ts')
]);
const warnedTx = transcript('warned.jsonl', [
  userMsg('refactor'), ...edits(6),
  { type: 'system', text: 'Maestro phase-scope guard: 6 distinct files modified' }
]);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-phase-scope tests');

// 1. Two files this turn: silent.
let out = runHook({ transcript_path: smallTurnTx, tool_name: 'Edit', tool_input: { file_path: 'b.ts' } });
check('2 files in turn -> silent', out === '');

// 2. Six distinct files this turn: warns with valid PostToolUse JSON.
out = runHook({ transcript_path: bigTurnTx, tool_name: 'Edit', tool_input: { file_path: 'src/f5.ts' } });
check('6 files in turn -> warns', out.includes('max-5-files-per-phase'));
check('warning is valid PostToolUse JSON', (() => {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName === 'PostToolUse'; }
  catch { return false; }
})());

// 3. Six files split across two user turns: silent (only current turn counts).
out = runHook({ transcript_path: twoTurnsTx, tool_name: 'Edit', tool_input: { file_path: 'src/f5.ts' } });
check('6 files across 2 turns -> silent', out === '');

// 4. Triggering call not yet in transcript still counts (5 in transcript + 1 new).
out = runHook({ transcript_path: transcript('five.jsonl', [userMsg('go'), ...edits(5)]), tool_name: 'Write', tool_input: { file_path: 'src/new.ts' } });
check('current call pushes over cap -> warns', out.includes('6 distinct files'));

// 5. Fire once: marker already in this turn -> silent.
out = runHook({ transcript_path: warnedTx, tool_name: 'Edit', tool_input: { file_path: 'src/f7.ts' } });
check('already-warned turn -> silent', out === '');

// 6. Cap override via env.
out = runHook({ transcript_path: smallTurnTx, tool_name: 'Edit', tool_input: { file_path: 'c.ts' } }, { MAESTRO_PHASE_FILE_CAP: '2' });
check('cap=2 with 3 files -> warns', out.includes('max-2-files-per-phase'));

// 7. Missing transcript: only the current call counts, silent.
out = runHook({ transcript_path: path.join(tmp, 'missing.jsonl'), tool_name: 'Edit', tool_input: { file_path: 'a.ts' } });
check('missing transcript -> silent', out === '');

// 8. Garbage stdin: silent exit 0.
out = execFileSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
check('garbage stdin -> silent exit 0', out === '');

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
