#!/usr/bin/env node
// Tests for frontier-autorun.cjs. Zero external deps. The engine's claude
// adapter is stubbed via MAESTRO_CLAUDE_BIN pointing at a fake .cjs that
// emits claude-json, so single/fusion modes run end-to-end with no real
// CLI. State is controlled through XDG_CONFIG_HOME -> {xdg}/maestro/
// frontier-state.json (config.cjs honours XDG_CONFIG_HOME first, including
// on win32).
//
// Run: node hooks/frontier-autorun.test.cjs

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'frontier-autorun.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-autorun-test-'));
const xdgDir = path.join(tmp, 'xdg');
fs.mkdirSync(path.join(xdgDir, 'maestro'), { recursive: true });
const statePath = path.join(xdgDir, 'maestro', 'frontier-state.json');

// Fake claude bin: a .cjs node script emitting claude-json with a fixed
// result. dispatch runs a .cjs bin through node cross-platform, so single
// and fusion (panel/judge/synth all default to opus) resolve to this stub.
const fakeClaude = path.join(tmp, 'fake-claude.cjs');
fs.writeFileSync(fakeClaude,
  "#!/usr/bin/env node\n'use strict';\n" +
  "process.stdout.write(JSON.stringify({ is_error: false, result: 'FAKE_ENGINE_ANSWER' }));\n");

function setState(obj) { fs.writeFileSync(statePath, JSON.stringify(obj)); }
function clearState() { try { fs.unlinkSync(statePath); } catch {} }

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdgDir,
      MAESTRO_CLAUDE_BIN: fakeClaude,
      FUSION_DEPTH: '',
      ...env,
    },
  });
}

function ctx(out) {
  try { return JSON.parse(out).hookSpecificOutput.additionalContext; }
  catch { return null; }
}
function eventName(out) {
  try { return JSON.parse(out).hookSpecificOutput.hookEventName; }
  catch { return null; }
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok    ' + name); }
  else { failures++; console.error('  FAIL  ' + name); }
}

console.log('frontier-autorun tests');

// 1. mode=off -> no spawn, empty stdout (zero overhead).
setState({ mode: 'off' });
let out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello world' });
check('off -> empty stdout', out === '');

// 2. no state file -> treated as off -> empty stdout.
clearState();
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hello world' });
check('no state -> empty stdout', out === '');

// 3. single mode -> runs engine, injects answer + relay + header.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling' });
check('single -> UserPromptSubmit JSON', eventName(out) === 'UserPromptSubmit');
check('single -> injects engine answer', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));
check('single -> relay instruction present', /relay/i.test(ctx(out) || ''));
check('single -> preset header present', (ctx(out) || '').includes('single'));
check('single -> header names the model', (ctx(out) || '').includes('opus'));

// 4. fusion mode -> panel + judge + synth (all fake opus) -> injects synth.
setState({ mode: 'fusion', preset: 'opus-duo' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling in fusion' });
check('fusion -> injects synthesized answer', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));
check('fusion -> preset header present', (ctx(out) || '').includes('opus-duo'));

// 5. recursion guard: FUSION_DEPTH set -> no-op even when armed.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling' }, { FUSION_DEPTH: '1' });
check('FUSION_DEPTH=1 -> empty stdout (no engine)', out === '');

// 6. autorunMinChars gate: short prompt -> no-op.
setState({ mode: 'single', model: 'opus', autorunMinChars: 1000 });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' });
check('short prompt under minChars -> empty stdout', out === '');

// 7. autorunMinChars satisfied -> runs.
setState({ mode: 'single', model: 'opus', autorunMinChars: 3 });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling please' });
check('prompt over minChars -> injects answer', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 8. non-UserPromptSubmit event -> ignored.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'SessionStart' });
check('non-UserPromptSubmit -> empty stdout', out === '');

// 9. garbage stdin -> silent exit 0.
out = runHook('not json');
check('garbage stdin -> empty stdout', out === '');

// 10. large engine answer survives intact (no stdout truncation before exit).
const bigClaude = path.join(tmp, 'big-claude.cjs');
fs.writeFileSync(bigClaude,
  "#!/usr/bin/env node\n'use strict';\n" +
  "process.stdout.write(JSON.stringify({ is_error: false, result: 'X'.repeat(60000) }));\n");
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'long answer please' },
  { MAESTRO_CLAUDE_BIN: bigClaude });
check('large answer -> valid JSON (no truncation)', (() => {
  try { JSON.parse(out); return true; } catch { return false; }
})());
check('large answer -> full payload present', (ctx(out) || '').includes('X'.repeat(60000)));

// 11. recursion guard depth semantics: '0' is top-level (runs), '2' is a
// nested child (no-op). Mirrors run.cjs's parseInt(depth) >= 1 guard.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling' }, { FUSION_DEPTH: '0' });
check('FUSION_DEPTH=0 -> runs (not a child)', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling' }, { FUSION_DEPTH: '2' });
check('FUSION_DEPTH=2 -> no-op (nested child)', out === '');

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('all tests passed');
