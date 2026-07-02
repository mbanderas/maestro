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

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { workspaceHash } = require('../frontier/config.cjs');

const HOOK = path.join(__dirname, 'frontier-autorun.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-autorun-test-'));
const xdgDir = path.join(tmp, 'xdg');
fs.mkdirSync(path.join(xdgDir, 'maestro'), { recursive: true });
const ccScope = 'cc-' + workspaceHash(process.cwd());
const statePath = path.join(xdgDir, 'maestro', 'frontier-state.' + ccScope + '.json');
const codexWorkspace = path.join(tmp, 'codex-workspace');
fs.mkdirSync(path.join(codexWorkspace, '.git'), { recursive: true });
const codexScope = 'codex-' + workspaceHash(codexWorkspace);
const codexStatePath = path.join(xdgDir, 'maestro', 'frontier-state.' + codexScope + '.json');
const legacyStatePath = path.join(xdgDir, 'maestro', 'frontier-state.json');

// Fake claude bin: a .cjs node script emitting claude-json with a fixed
// result. dispatch runs a .cjs bin through node cross-platform, so single
// and fusion (panel/judge/synth all default to opus) resolve to this stub.
const fakeClaude = path.join(tmp, 'fake-claude.cjs');
fs.writeFileSync(fakeClaude,
  "#!/usr/bin/env node\n'use strict';\n" +
  "process.stdout.write(JSON.stringify({ is_error: false, result: 'FAKE_ENGINE_ANSWER' }));\n");

function setState(obj) { fs.writeFileSync(statePath, JSON.stringify(obj)); }
function setCodexState(obj) { fs.writeFileSync(codexStatePath, JSON.stringify(obj)); }
function clearState() { try { fs.unlinkSync(statePath); } catch {} }
function clearCodexState() { try { fs.unlinkSync(codexStatePath); } catch {} }
function setLegacyState(obj) { fs.writeFileSync(legacyStatePath, JSON.stringify(obj)); }
function clearLegacyState() { try { fs.unlinkSync(legacyStatePath); } catch {} }

function runHook(payload, env) {
  return execFileSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdgDir,
      MAESTRO_CLAUDE_BIN: fakeClaude,
      FUSION_DEPTH: '',
      MAESTRO_SCOPE: '',
      CLAUDE_PLUGIN_ROOT: path.join(tmp, 'claude-plugin-root'),
      CLAUDECODE: '',
      CLAUDE_PROJECT_DIR: '',
      PLUGIN_ROOT: '',
      PLUGIN_DATA: '',
      ...env,
    },
  });
}

// Like runHook but returns both streams — the cost advisory writes to stderr.
function runHookCapture(payload, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdgDir,
      MAESTRO_CLAUDE_BIN: fakeClaude,
      FUSION_DEPTH: '',
      MAESTRO_SCOPE: '',
      CLAUDE_PLUGIN_ROOT: path.join(tmp, 'claude-plugin-root'),
      CLAUDECODE: '',
      CLAUDE_PROJECT_DIR: '',
      PLUGIN_ROOT: '',
      PLUGIN_DATA: '',
      ...env,
    },
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '' };
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

// 12. Codex plugin env: off by default for a project/workspace scope.
clearCodexState();
clearLegacyState();
out = runHook(
  { hook_event_name: 'UserPromptSubmit', cwd: codexWorkspace, prompt: 'codex default off' },
  {
    CLAUDE_PLUGIN_ROOT: '',
    PLUGIN_ROOT: path.join(tmp, 'plugin-root'),
    PLUGIN_DATA: path.join(tmp, 'plugin-data'),
  }
);
check('codex plugin no state -> empty stdout', out === '');

// 13. Codex plugin env: armed project/workspace state autoruns.
setCodexState({ mode: 'single', model: 'opus' });
out = runHook(
  { hook_event_name: 'UserPromptSubmit', cwd: codexWorkspace, prompt: 'codex armed prompt' },
  {
    CLAUDE_PLUGIN_ROOT: '',
    PLUGIN_ROOT: path.join(tmp, 'plugin-root'),
    PLUGIN_DATA: path.join(tmp, 'plugin-data'),
  }
);
check('codex plugin armed -> UserPromptSubmit JSON', eventName(out) === 'UserPromptSubmit');
check('codex plugin armed -> injects engine answer', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 14. Codex project scope is distinct from legacy default and Claude cc scope.
clearCodexState();
setLegacyState({ mode: 'single', model: 'opus' });
setState({ mode: 'single', model: 'opus' });
out = runHook(
  { hook_event_name: 'UserPromptSubmit', cwd: codexWorkspace, prompt: 'codex isolation prompt' },
  {
    CLAUDE_PLUGIN_ROOT: '',
    PLUGIN_ROOT: path.join(tmp, 'plugin-root'),
    PLUGIN_DATA: path.join(tmp, 'plugin-data'),
  }
);
check('codex plugin ignores legacy/default and cc armed states', out === '');
clearLegacyState();
clearState();

// 15. Recursion guard exits before requiring the Frontier engine.
const requireSentinel = path.join(tmp, 'engine-required.txt');
const requireGuard = path.join(tmp, 'require-guard.cjs');
fs.writeFileSync(requireGuard,
  "'use strict';\n" +
  "const fs = require('fs');\n" +
  "const Module = require('module');\n" +
  "const orig = Module._load;\n" +
  "Module._load = function(request) {\n" +
  "  if (String(request).includes('frontier/run.cjs')) fs.writeFileSync(process.env.REQUIRE_SENTINEL, 'required');\n" +
  "  return orig.apply(this, arguments);\n" +
  "};\n");
setCodexState({ mode: 'single', model: 'opus' });
out = runHook(
  { hook_event_name: 'UserPromptSubmit', cwd: codexWorkspace, prompt: 'codex recursive prompt' },
  {
    CLAUDE_PLUGIN_ROOT: '',
    PLUGIN_ROOT: path.join(tmp, 'plugin-root'),
    PLUGIN_DATA: path.join(tmp, 'plugin-data'),
    FUSION_DEPTH: '1',
    NODE_OPTIONS: '--require=' + JSON.stringify(requireGuard),
    REQUIRE_SENTINEL: requireSentinel,
  }
);
check('FUSION_DEPTH=1 codex -> empty stdout', out === '');
check('FUSION_DEPTH=1 -> engine module not required', !fs.existsSync(requireSentinel));

// 16. Banner instruction: single mode context includes the branded banner line.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain pooling' });
check('banner: context includes ⚡ Frontier',
  (ctx(out) || '').includes('⚡ Frontier'));
check('banner: context includes model count',
  (ctx(out) || '').includes('1 models'));
check('banner: context includes seconds',
  /\d+s/.test(ctx(out) || ''));
check('banner: context includes relay instruction',
  (ctx(out) || '').includes('Begin your response with this exact'));

// 17. Banner instruction: fusion mode context includes the preset header.
setState({ mode: 'fusion', preset: 'opus-duo' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain fusion pooling' });
check('banner fusion: context includes opus-duo',
  (ctx(out) || '').includes('opus-duo'));
check('banner fusion: context includes ⚡ Frontier',
  (ctx(out) || '').includes('⚡ Frontier'));

// 18. Loop / agentic-resume guard: armed engine does NOT fan loop prompts.
setState({ mode: 'fusion', preset: 'opus-duo' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/loop 5m /babysit-prs' });
check('loop guard: /loop prompt -> empty stdout', out === '');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'resume <<autonomous-loop>> now' });
check('loop guard: autonomous-loop sentinel -> empty stdout', out === '');
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'AUTONOMOUS LOOP RESUME — read the checkpoint' });
check('loop guard: AUTONOMOUS LOOP resume -> empty stdout', out === '');

// 19. Loop guard must NOT over-match an ordinary prompt that merely says "loop".
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'explain the event loop in node' });
check('loop guard: ordinary "event loop" prompt still runs', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 20. Loop guard opt-out: a raw `/loop ...` prompt is BOTH loop-shaped and
// command-shaped, so fanning it takes both opt-outs (autorunFanLoops for the
// loop guard, autorunOnCommands for the command guard). A non-slash loop
// prompt needs only autorunFanLoops.
setState({ mode: 'single', model: 'opus', autorunFanLoops: true, autorunOnCommands: true });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/loop 5m /babysit-prs' });
check('loop guard opt-out: autorunFanLoops + autorunOnCommands -> runs', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));
setState({ mode: 'single', model: 'opus', autorunFanLoops: true });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'AUTONOMOUS LOOP RESUME — read the checkpoint' });
check('loop guard opt-out: autorunFanLoops alone fans non-slash loop prompt', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 21. Cost advisory (run time): a Fable panel armed past the subscription
// cutoff emits a one-line [frontier] notice on STDERR only — never into the
// relayed answer on stdout. Clock is controlled via MAESTRO_FRONTIER_NOW.
setState({ mode: 'fusion', preset: 'fable-duo' });
let cap = runHookCapture(
  { hook_event_name: 'UserPromptSubmit', prompt: 'fable cost after cutoff' },
  { MAESTRO_FRONTIER_NOW: '2026-08-01T00:00:00Z' });
check('advisory: fires on stderr after cutoff',
  /\[frontier\].*Usage Credits/.test(cap.stderr));
check('advisory: names the 2026-07-07 cutoff', cap.stderr.includes('2026-07-07'));
check('advisory: run still injects the engine answer',
  (ctx(cap.stdout) || '').includes('FAKE_ENGINE_ANSWER'));
check('advisory: never leaks into stdout / the relayed answer',
  !cap.stdout.includes('[frontier]'));

// 22. Dormant before cutoff: same Fable panel, clock before freeUntil -> silent.
cap = runHookCapture(
  { hook_event_name: 'UserPromptSubmit', prompt: 'fable cost before cutoff' },
  { MAESTRO_FRONTIER_NOW: '2026-07-01T00:00:00Z' });
check('advisory: dormant before cutoff (no stderr notice)',
  !cap.stderr.includes('Usage Credits'));
check('advisory: dormant run still injects the answer',
  (ctx(cap.stdout) || '').includes('FAKE_ENGINE_ANSWER'));

// 23. Non-Fable panel after cutoff -> no advisory (opus/gpt/gemini uncharged).
setState({ mode: 'fusion', preset: 'opus-duo' });
cap = runHookCapture(
  { hook_event_name: 'UserPromptSubmit', prompt: 'opus panel after cutoff' },
  { MAESTRO_FRONTIER_NOW: '2026-08-01T00:00:00Z' });
check('advisory: non-fable panel silent after cutoff',
  !cap.stderr.includes('Usage Credits'));

// 23b. Stage breadcrumbs: a fusion run emits one [frontier] line per stage
// event on STDERR (the live surface for CLI verbose view + Codex), never
// stdout (the fused-answer channel).
setState({ mode: 'fusion', preset: 'opus-duo' });
cap = runHookCapture({ hook_event_name: 'UserPromptSubmit', prompt: 'breadcrumb run' });
check('breadcrumbs: panel start on stderr', /\[frontier\] panel start \(2 models\)/.test(cap.stderr));
check('breadcrumbs: judge start on stderr', /\[frontier\] judge start/.test(cap.stderr));
check('breadcrumbs: synth start on stderr', /\[frontier\] synth start/.test(cap.stderr));
check('breadcrumbs: stdout stays clean', !cap.stdout.includes('[frontier]'));

// 24. Command guard: armed engine never fans plugin/slash command prompts —
// raw typed form and the transcript XML form (both tag orders).
setState({ mode: 'fusion', preset: 'opus-duo' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/maestro:frontier off' });
check('command guard: raw slash command -> empty stdout', out === '');
out = runHook({
  hook_event_name: 'UserPromptSubmit',
  prompt: '<command-name>/maestro:frontier</command-name>\n<command-message>frontier</command-message>\n<command-args>off</command-args>',
});
check('command guard: XML form (command-name first) -> empty stdout', out === '');
out = runHook({
  hook_event_name: 'UserPromptSubmit',
  prompt: '<command-message>loop</command-message>\n<command-name>/loop</command-name>\n<command-args>check the deploy</command-args>',
});
check('command guard: XML form (command-message first) -> empty stdout', out === '');
out = runHook({
  hook_event_name: 'UserPromptSubmit',
  prompt: '<command-name>/loop</command-name>',
});
check('command guard: /loop inside command-name -> empty stdout', out === '');

// 25. Command guard must NOT over-match: a path-like first token (second
// slash breaks the full-token match) or a mid-text command mention still fans.
setState({ mode: 'single', model: 'opus' });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/etc/hosts is broken, why?' });
check('command guard: /etc/hosts prompt still runs', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'see /maestro:frontier for details' });
check('command guard: mid-text command mention still runs', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 26. Command guard opt-out: autorunOnCommands:true re-enables fanning commands.
setState({ mode: 'single', model: 'opus', autorunOnCommands: true });
out = runHook({ hook_event_name: 'UserPromptSubmit', prompt: '/maestro:frontier off' });
check('command guard opt-out: autorunOnCommands -> runs', (ctx(out) || '').includes('FAKE_ENGINE_ANSWER'));

// 27. Loop guard XML fix: even with commands allowed (autorunOnCommands:true),
// the loop guard catches /loop wrapped in <command-name> tags (F3.4 — `>`
// precedes /loop so (^|\s) alone never matched).
setState({ mode: 'fusion', preset: 'opus-duo', autorunOnCommands: true });
out = runHook({
  hook_event_name: 'UserPromptSubmit',
  prompt: '<command-name>/loop</command-name>\n<command-args>5m /babysit-prs</command-args>',
});
check('loop guard: XML-wrapped /loop skipped despite autorunOnCommands', out === '');

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) { console.error(failures + ' failure(s)'); process.exit(1); }
console.log('all tests passed');
