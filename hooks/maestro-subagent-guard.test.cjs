#!/usr/bin/env node
// Tests for maestro-subagent-guard.cjs. Zero dependencies.
// Run: node hooks/maestro-subagent-guard.test.cjs

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-subagent-guard.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-guard-test-'));

function transcript(name, lines) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
  return p;
}

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-guard-state-'));

function runHook(payload) {
  return execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, MAESTRO_GUARD_STATE_DIR: stateDir }
  });
}

const readOnlyTx = transcript('readonly.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'foo' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Final report: found 3 usages.' }] } }
]);

const writerNoVerifyTx = transcript('writer-noverify.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } }
]);

const writerVerifiedTx = transcript('writer-verified.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npx tsc --noEmit && npx eslint . --quiet' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Done, checks pass. VERIFIED.' }] } }
]);

const verifyNoTokenTx = transcript('verify-notoken.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npx tsc --noEmit' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'All checks pass, work complete.' }] } }
]);

const tokenEarlyNotFinalTx = transcript('token-early.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Interim status: VERIFIED for module a.' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npx tsc --noEmit' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Wrapped up, everything looks good.' }] } }
]);

const lowercaseTokenTx = transcript('lowercase-token.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npx tsc --noEmit' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'I verified everything, done.' }] } }
]);

const bashWriterTx = transcript('bash-writer.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git commit -m "feat: thing"' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Committed.' }] } }
]);

const bashRedirectTx = transcript('bash-redirect.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'echo done > out.txt' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Output written.' }] } }
]);

const bashSedTx = transcript('bash-sed.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: "sed -i '' 's/a/b/' config.yml" } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Patched.' }] } }
]);

const npmInstallTx = transcript('npm-install.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm install lodash' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Dep added.' }] } }
]);

// Arrows and redirect-ish chars in PROSE or read-only commands must
// not flip a research agent into the writer path.
const arrowProseTx = transcript('arrow-prose.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'grep -r "foo" src' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Flow: A -> B -> C. Mapping X => Y. Research done.' }] } }
]);

// A read-only agent that silences stderr with 2>/dev/null must not be
// misread as a writer: /dev/null is not a file mutation.
const devNullReadTx = transcript('devnull-read.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status 2>/dev/null' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la 2>/dev/null' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Inspected the tree. Research done.' }] } }
]);

const spawnerTx = transcript('spawner.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm run watch', run_in_background: true } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Watcher started, report ready.' }] } }
]);

const alreadyWarnedTx = transcript('already-warned.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } },
  { type: 'system', text: 'Maestro guard:\n- No type-check/lint/test detected after file modifications.' },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'No checker configured. Final report: done.' }] } }
]);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-subagent-guard tests');

// 1. Read-only transcript, no agent_type: exempt from verify warning.
let out = runHook({ agent_transcript_path: readOnlyTx });
check('read-only transcript -> silent', out === '');

// 2. Explore agent_type: exempt regardless of transcript content.
out = runHook({ agent_type: 'Explore', agent_transcript_path: writerNoVerifyTx });
check('agent_type Explore -> silent', out === '');

// 3. Writer without verification: warning fires, with report-restate line.
out = runHook({ agent_transcript_path: writerNoVerifyTx });
check('writer without verify -> warns', out.includes('No type-check/lint/test'));
check('warning tells agent to restate report', out.includes('restate your complete final report'));
check('warning is valid hook JSON', (() => {
  // SubagentStop does not support additionalContext; the only
  // documented feedback channel is decision:block + reason.
  try {
    const p = JSON.parse(out);
    return p.decision === 'block' && typeof p.reason === 'string' &&
      p.reason.includes('Maestro guard:') && !('hookSpecificOutput' in p);
  } catch { return false; }
})());

// 4. Writer with verification and status token: silent.
out = runHook({ agent_transcript_path: writerVerifiedTx });
check('writer with verify + status token -> silent', out === '');

// 4b. Writer verified but final text has no status token: warns.
out = runHook({ agent_transcript_path: verifyNoTokenTx });
check('writer verified, no status token -> warns', out.includes('status token'));
check('no-token warning omits verify warning', !out.includes('No type-check/lint/test'));

// 4c. Token in earlier message but not in final text: still warns.
out = runHook({ agent_transcript_path: tokenEarlyNotFinalTx });
check('token early but not final -> warns', out.includes('status token'));

// 4d. Lowercase "verified" in prose is not a status token: warns.
out = runHook({ agent_transcript_path: lowercaseTokenTx });
check('lowercase token -> warns', out.includes('status token'));

// 5. Bash-pattern mutation (git commit) counts as writer.
out = runHook({ agent_transcript_path: bashWriterTx });
check('bash git-commit writer without verify -> warns', out.includes('No type-check/lint/test'));

// 5b. Bash redirect mutation counts as writer.
out = runHook({ agent_transcript_path: bashRedirectTx });
check('bash redirect writer without verify -> warns', out.includes('No type-check/lint/test'));

// 5c. sed -i counts as writer.
out = runHook({ agent_transcript_path: bashSedTx });
check('bash sed -i writer without verify -> warns', out.includes('No type-check/lint/test'));

// 5d. npm install counts as writer.
out = runHook({ agent_transcript_path: npmInstallTx });
check('bash npm-install writer without verify -> warns', out.includes('No type-check/lint/test'));

// 5e. Arrows in prose / read-only bash: still exempt (no false positive).
out = runHook({ agent_transcript_path: arrowProseTx });
check('arrow prose + read-only bash -> silent', out === '');

// 5f. Read-only bash using 2>/dev/null: exempt (the redirect target writes
//     nothing, so it is not a mutation).
out = runHook({ agent_transcript_path: devNullReadTx });
check('2>/dev/null read-only bash -> silent', out === '');

// 6. Fire once: marker already in transcript -> silent, no loop.
out = runHook({ agent_transcript_path: alreadyWarnedTx });
check('already-warned transcript -> silent (no loop)', out === '');

// 7. Fire once beats background-task warning too.
out = runHook({
  agent_transcript_path: alreadyWarnedTx,
  background_tasks: [{ id: 't1', status: 'running' }]
});
check('already-warned + bg task -> still silent', out === '');

// 8. Active background task + transcript shows spawning: warns, even
// for a read-only agent.
out = runHook({
  agent_transcript_path: spawnerTx,
  background_tasks: [{ id: 't1', status: 'running' }]
});
check('spawned + orphaned background task -> warns', out.includes('background task'));

// 8b. Active background tasks but agent spawned nothing: silent.
// background_tasks is machine-wide; unrelated sessions' tasks must
// not nag this agent.
out = runHook({
  agent_type: 'Explore',
  agent_transcript_path: readOnlyTx,
  background_tasks: [{ id: 't1', status: 'running' }]
});
check('no spawn evidence + bg tasks -> silent', out === '');

// 9. Missing transcript: silent (fails open, never blocks).
out = runHook({ agent_transcript_path: path.join(tmp, 'missing.jsonl') });
check('missing transcript -> silent', out === '');

// 10. Garbage stdin: exits 0, silent.
out = execFileSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
check('garbage stdin -> silent exit 0', out === '');

// 11. Marker-file once-guard: additionalContext never reaches the
// transcript file (observed live 2026-06-10), so a second stop with an
// UNCHANGED transcript must still be silent after one warning.
const repeatTx = transcript('writer-repeat.jsonl', [
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'b.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } }
]);
out = runHook({ agent_transcript_path: repeatTx });
check('repeat stop: first fire warns', out.includes('No type-check/lint/test'));
out = runHook({ agent_transcript_path: repeatTx });
check('repeat stop: second fire silent (marker file)', out === '');

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(stateDir, { recursive: true, force: true });

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
