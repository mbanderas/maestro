#!/usr/bin/env node
// Tests for frontier/dispatch.cjs. Zero dependencies.
// Run: node frontier/dispatch.test.cjs
// All CLI adapters are stubbed as .cjs node scripts — no real claude/codex/gemini.
// Cases (h)/(i) additionally exercise the win32 cmd.exe-wrap shim path with a
// real .cmd stub (win32 only) and the promptVia:'arg' metachar guard.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { spawnOne, fanOut, unsafeForShellArg } = require(path.join(__dirname, 'dispatch.cjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-dispatch-test-'));

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok    ' + name); }
  else { failures++; console.error('  FAIL  ' + name); }
}

/** Write a stub .cjs to tmp dir; returns absolute path. */
function stub(name, body) {
  const p = path.join(tmp, name + '.cjs');
  fs.writeFileSync(p, '#!/usr/bin/env node\n\'use strict\';\n' + body);
  fs.chmodSync(p, 0o755);
  return p;
}

/** Minimal adapter factory. */
function adapter(bin, extra) {
  return Object.assign({
    model:      'test-model',
    bin,
    baseArgs:   [],
    promptVia:  'stdin',
    webTools:   false,
    output:     'stdout',
    parse:      'claude-json',
  }, extra || {});
}

console.log('dispatch tests');

// ------------------------------------------------------------------ //
// (a) claude-json happy path
// ------------------------------------------------------------------ //
const stubA = stub('a-claude-json', `
process.stdout.write(JSON.stringify({is_error:false, result:'HELLO'}));
`);

(async () => {

const a = await spawnOne('prompt', adapter(stubA, { parse: 'claude-json', output: 'stdout', promptVia: 'stdin' }));
check('(a) claude-json ok=true',          a.ok === true);
check('(a) claude-json content===HELLO',  a.content === 'HELLO');
check('(a) tokensEst > 0',               a.tokensEst > 0);
check('(a) durationMs is number',        typeof a.durationMs === 'number');
check('(a) no error field',              a.error === undefined);

// ------------------------------------------------------------------ //
// (b) failure: exit 1, stderr 'boom' — use parse:'text' so stdout
// emptiness doesn't trigger a json-parse-fail error first; the exit-
// code + stderr path then applies as specified.
// ------------------------------------------------------------------ //
const stubB = stub('b-fail', `
process.stderr.write('boom');
process.exit(1);
`);

const b = await spawnOne('prompt', adapter(stubB, { parse: 'text', output: 'stdout' }));
check('(b) fail ok=false',              b.ok === false);
check('(b) error includes exit 1',      b.error && b.error.includes('exit 1'));
check('(b) error includes boom',        b.error && b.error.includes('boom'));

// ------------------------------------------------------------------ //
// (c) FUSION_DEPTH injection
// ------------------------------------------------------------------ //
const stubC = stub('c-fusion-depth', `
process.stdout.write(JSON.stringify({is_error:false, result: process.env.FUSION_DEPTH}));
`);

const c = await spawnOne('prompt', adapter(stubC, { parse: 'claude-json', output: 'stdout', promptVia: 'stdin' }), { fusionDepth: 1 });
check('(c) FUSION_DEPTH injected',      c.ok === true && c.content === '1');

// ------------------------------------------------------------------ //
// (d) last-message-file + parse 'text'
// ------------------------------------------------------------------ //
const stubD = stub('d-last-msg', `
const fs = require('fs');
const idx = process.argv.indexOf('--output-last-message');
if (idx !== -1) {
  fs.writeFileSync(process.argv[idx + 1], 'FILED');
}
process.stdout.write('noise stdout ignored');
`);

const d = await spawnOne('prompt', adapter(stubD, {
  parse: 'text',
  output: 'last-message-file',
  promptVia: 'stdin',
}));
check('(d) last-message-file ok=true',         d.ok === true);
check('(d) last-message-file content=FILED',   d.content === 'FILED');

// ------------------------------------------------------------------ //
// (e) promptVia 'arg': args include promptFlag and prompt value
// ------------------------------------------------------------------ //
const stubE = stub('e-prompt-arg', `
process.stdout.write(JSON.stringify({is_error:false, result: process.argv.slice(2).join(' ')}));
`);

const e = await spawnOne('PX', adapter(stubE, {
  parse: 'claude-json',
  output: 'stdout',
  promptVia: 'arg',
  promptFlag: '-p',
}));
check('(e) promptVia arg ok=true',         e.ok === true);
check('(e) content includes -p',           e.content.includes('-p'));
check('(e) content includes PX',           e.content.includes('PX'));

// ------------------------------------------------------------------ //
// (f) fanOut bounded-parallel + order preserved
// ------------------------------------------------------------------ //
// Stub sleeps ~500ms then emits its model id as result. The sleep is kept
// well above per-process spawn jitter (notably high/cold on Windows CI) so the
// parallel(~1x) vs serial(~2x) signal survives: parallel elapses ~500ms+jitter,
// serial would elapse ~1000ms+, comfortably either side of the 900ms threshold.
const stubF = stub('f-parallel', `
const id = process.env.STUB_ID || 'x';
setTimeout(() => {
  process.stdout.write(JSON.stringify({is_error:false, result: id}));
}, 500);
`);

const cfgF = {
  adapters: {
    a: adapter(stubF, { model: 'a', env: { STUB_ID: 'a' } }),
    b: adapter(stubF, { model: 'b', env: { STUB_ID: 'b' } }),
  },
  timeoutMs: 5000,
  concurrency: 2,
};

const t0 = Date.now();
const fResults = await fanOut('prompt', ['a', 'b'], cfgF, { fusionDepth: 1, concurrency: 2 });
const elapsed = Date.now() - t0;

check('(f) fanOut returns 2 results',        fResults.length === 2);
check('(f) order: results[0].model===a',     fResults[0].model === 'a');
check('(f) order: results[1].model===b',     fResults[1].model === 'b');
check('(f) order: results[0].content===a',   fResults[0].content === 'a');
check('(f) order: results[1].content===b',   fResults[1].content === 'b');
check('(f) parallel: elapsed < 900ms',       elapsed < 900);

// ------------------------------------------------------------------ //
// (g) fanOut with unknown adapter id -> failed PanelResponse, no throw
// ------------------------------------------------------------------ //
const cfgG = {
  adapters: {
    known: adapter(stub('g-known', `
process.stdout.write(JSON.stringify({is_error:false, result:'OK'}));
`), { model: 'known' }),
  },
  timeoutMs: 5000,
  concurrency: 2,
};

let gThrew = false;
let gResults;
try {
  gResults = await fanOut('prompt', ['known', 'unknown-id'], cfgG);
} catch (err) {
  gThrew = true;
}
check('(g) no throw on unknown id',              !gThrew);
check('(g) length 2',                            gResults && gResults.length === 2);
check('(g) results[0] ok=true',                  gResults && gResults[0].ok === true);
check('(g) results[1] ok=false (unknown id)',    gResults && gResults[1].ok === false);

// ------------------------------------------------------------------ //
// (h) unsafeForShellArg: pure-function metachar guard (cross-platform)
// ------------------------------------------------------------------ //
check('(h) plain prose is safe',          unsafeForShellArg('list three benefits of code review') === false);
check('(h) ampersand is safe (quoted)',   unsafeForShellArg('cats & dogs') === false);
check('(h) double-quote is unsafe',       unsafeForShellArg('say "hi"') === true);
check('(h) percent is unsafe',            unsafeForShellArg('100% sure') === true);
check('(h) newline is unsafe',            unsafeForShellArg('line1\nline2') === true);

// ------------------------------------------------------------------ //
// (i) win32 cmd.exe-wrap shim path: real .cmd stub round-trips a
//     multi-word arg prompt; an unsafe prompt is refused before spawn.
//     win32-only (the cmd-wrap branch does not exist off win32).
// ------------------------------------------------------------------ //
if (process.platform === 'win32') {
  const echo = stub('i-echo', `
process.stdout.write(JSON.stringify({is_error:false, result: process.argv.slice(2).join('|')}));
`);
  const shimCmd = path.join(tmp, 'i-shim.cmd');
  fs.writeFileSync(shimCmd, '@node "' + echo + '" %*\r\n');
  const shimEnv = { PATH: tmp + path.delimiter + (process.env.PATH || '') };
  const shimAdapter = {
    model: 'shim', bin: 'i-shim', baseArgs: ['--x'],
    promptVia: 'arg', promptFlag: '-p', output: 'stdout', parse: 'claude-json',
    env: shimEnv,
  };

  const iOk = await spawnOne('two words', shimAdapter);
  check('(i) cmd-wrap shim ok=true',            iOk.ok === true);
  check('(i) cmd-wrap multi-word arg survives', iOk.content.includes('two words'));

  const iUnsafe = await spawnOne('say "hi"', shimAdapter);
  check('(i) unsafe arg refused (ok=false)',    iUnsafe.ok === false);
  check('(i) unsafe arg error mentions unsafe', iUnsafe.error && iUnsafe.error.includes('unsafe'));
} else {
  console.log('  skip  (i) win32-only cmd-wrap shim path');
}

// ------------------------------------------------------------------ //
// cleanup + exit
// ------------------------------------------------------------------ //
fs.rmSync(tmp, { recursive: true, force: true });

if (failures) {
  console.error(failures + ' failure(s)');
  process.exit(1);
}
console.log('all tests passed');

})();
