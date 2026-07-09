#!/usr/bin/env node
// Tests for frontier/dispatch.cjs. Zero dependencies.
// Run: node frontier/dispatch.test.cjs
// All CLI adapters are stubbed as .cjs node scripts — no real claude/codex/gemini.
// Cases (h)/(i) additionally exercise the win32 cmd.exe-wrap shim path with
// explicit .cmd/.bat and extensionless stubs (win32 only), plus the
// promptVia:'arg' metachar guard.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { spawnOne, fanOut, unsafeForShellArg, unsafeForWinShimBaseArg } = require(path.join(__dirname, 'dispatch.cjs'));
const { OPTIONAL_CODEX_MODEL_ENV, buildRuntimeCatalog } = require(path.join(__dirname, 'catalog.cjs'));

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
// (b) failure: stderr is classified but never returned verbatim. Use
// parse:'text' so stdout emptiness does not trigger a json-parse-fail error
// first; the exit-code + redacted-stderr path then applies.
// ------------------------------------------------------------------ //
const stubB = stub('b-fail', `
process.stderr.write('unauthorized token=sekret-stderr');
process.exit(1);
`);

const b = await spawnOne('prompt', adapter(stubB, { parse: 'text', output: 'stdout' }));
check('(b) fail ok=false',              b.ok === false);
check('(b) error includes exit 1',      b.error && b.error.includes('exit 1'));
check('(b) stderr is classified',       b.error && b.error.includes('authentication failure'));
check('(b) stderr secret is redacted',  b.error && !b.error.includes('sekret-stderr'));

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
// Stub sleeps ~500ms then emits its model id as result. The sleep is the
// parallelism signal: run the SAME stubs serially (concurrency 1) and in
// parallel (concurrency 2), then assert parallel beats serial by ~one sleep.
// serial ~= 2*sleep + spawn, parallel ~= sleep + spawn, so (serial - parallel)
// ~= one sleep (500ms) regardless of per-process spawn jitter — which is high
// and unbounded on cold Windows CI and hits BOTH runs, so it cancels. This
// replaces a fragile absolute wall-clock threshold that re-flaked on Windows.
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

const tSerial0 = Date.now();
await fanOut('prompt', ['a', 'b'], cfgF, { fusionDepth: 1, concurrency: 1 });
const serialMs = Date.now() - tSerial0;

const t0 = Date.now();
const fResults = await fanOut('prompt', ['a', 'b'], cfgF, { fusionDepth: 1, concurrency: 2 });
const parallelMs = Date.now() - t0;

check('(f) fanOut returns 2 results',        fResults.length === 2);
check('(f) order: results[0].model===a',     fResults[0].model === 'a');
check('(f) order: results[1].model===b',     fResults[1].model === 'b');
check('(f) order: results[0].content===a',   fResults[0].content === 'a');
check('(f) order: results[1].content===b',   fResults[1].content === 'b');
// signal is ~one sleep (500ms); 250ms margin clears run-to-run jitter variance.
check('(f) parallel beats serial by >250ms', serialMs - parallelMs > 250);

// ------------------------------------------------------------------ //
// (f2) fanOut passes FUSION_DEPTH to mixed codex/claude/gemini children
// ------------------------------------------------------------------ //
const stubF2 = stub('f2-mixed-depth', `
const id = process.env.STUB_ID || 'x';
process.stdout.write(JSON.stringify({is_error:false, result: id + ':' + process.env.FUSION_DEPTH}));
`);

const cfgF2 = {
  adapters: {
    chatgpt: adapter(stubF2, { model: 'gpt-5.5', env: { STUB_ID: 'chatgpt' }, parse: 'claude-json' }),
    claude: adapter(stubF2, { model: 'opus', env: { STUB_ID: 'claude' }, parse: 'claude-json' }),
    gemini: adapter(stubF2, { model: 'gemini', env: { STUB_ID: 'gemini' }, parse: 'claude-json', promptVia: 'arg' }),
  },
  timeoutMs: 5000,
  concurrency: 3,
};

const f2Results = await fanOut('prompt', ['chatgpt', 'claude', 'gemini'], cfgF2, { fusionDepth: 2, concurrency: 3 });
check('(f2) mixed depth length 3',          f2Results.length === 3);
check('(f2) chatgpt child depth',          f2Results[0].content === 'chatgpt:2');
check('(f2) claude child depth',           f2Results[1].content === 'claude:2');
check('(f2) gemini child depth',           f2Results[2].content === 'gemini:2');

// ------------------------------------------------------------------ //
// (f2a) configured optional Codex aliases dispatch their declared canonical
//       model ids through the same read-only argv shape as GPT-5.5. The
//       MAESTRO_CODEX_BIN override is a local Node stub, so no real Codex is
//       launched; the child records the exact argv and recursion depth it got.
// ------------------------------------------------------------------ //
const codexProbe = stub('f2a-codex-probe', `
const fs = require('fs');
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output-last-message');
fs.writeFileSync(args[outputIndex + 1], JSON.stringify({
  args,
  fusionDepth: process.env.FUSION_DEPTH,
  apiKey: process.env.OPENAI_API_KEY || 'absent',
  codexHome: process.env.CODEX_HOME || 'absent',
  unrelated: process.env.FRONTIER_UNRELATED_SECRET || 'absent',
}));
`);
const configuredCodexIds = {
  terra: 'provider/terra@2026-07',
  luna: 'provider/luna@2026-07',
  sol: 'provider/sol@2026-07',
};
const configuredCodexCatalog = buildRuntimeCatalog({
  env: {
    PATH: '',
    MAESTRO_CODEX_BIN: codexProbe,
    [OPTIONAL_CODEX_MODEL_ENV.terra]: configuredCodexIds.terra,
    [OPTIONAL_CODEX_MODEL_ENV.luna]: configuredCodexIds.luna,
    [OPTIONAL_CODEX_MODEL_ENV.sol]: configuredCodexIds.sol,
  },
  codexEnvPath: path.join(tmp, 'no-codex.env'),
});
const codexForwardedEnv = {
  OPENAI_API_KEY: 'frontier-test-codex-auth',
  CODEX_HOME: path.join(tmp, 'codex-home'),
  FRONTIER_UNRELATED_SECRET: 'must-not-reach-codex',
};
const originalCodexEnv = Object.fromEntries(
  Object.keys(codexForwardedEnv).map(name => [name, process.env[name]])
);
Object.assign(process.env, codexForwardedEnv);
try {
  for (const id of ['terra', 'luna', 'sol', 'gpt-5.5']) {
    const expectedModel = id === 'gpt-5.5' ? 'gpt-5.5' : configuredCodexIds[id];
    const response = await spawnOne('probe', configuredCodexCatalog.adapters[id], { fusionDepth: 7 });
    let received = null;
    try { received = JSON.parse(response.content); } catch {}
    const expectedArgs = [
      'exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ask-for-approval', 'never',
      '-m', expectedModel, '--color', 'never',
    ];
    check('(f2a) ' + id + ' dispatch is read-only Codex exec',
      response.ok === true && received &&
      JSON.stringify(received.args.slice(0, expectedArgs.length)) === JSON.stringify(expectedArgs));
    check('(f2a) ' + id + ' dispatch preserves FUSION_DEPTH',
      received && received.fusionDepth === '7');
    check('(f2a) ' + id + ' forwards declared Codex auth/home only',
      received && received.apiKey === codexForwardedEnv.OPENAI_API_KEY &&
      received.codexHome === codexForwardedEnv.CODEX_HOME && received.unrelated === 'absent');
  }
} finally {
  for (const [name, value] of Object.entries(originalCodexEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

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
// (f3) fanOut fires panel-progress per model via onProgress
// ------------------------------------------------------------------ //
const stubF3 = stub('f3-progress', `
const id = process.env.STUB_ID || 'x';
process.stdout.write(JSON.stringify({is_error:false, result: id}));
`);

const cfgF3 = {
  adapters: {
    m1: adapter(stubF3, { model: 'm1', env: { STUB_ID: 'm1' }, parse: 'claude-json' }),
    m2: adapter(stubF3, { model: 'm2', env: { STUB_ID: 'm2' }, parse: 'claude-json' }),
    m3: adapter(stubF3, { model: 'm3', env: { STUB_ID: 'm3' }, parse: 'claude-json' }),
  },
  timeoutMs: 5000,
  concurrency: 3,
};

const progressEvents = [];
const f3Results = await fanOut('hello', ['m1', 'm2', 'm3'], cfgF3, {
  fusionDepth: 1,
  concurrency: 3,
  onProgress: (ev) => progressEvents.push(ev),
});
check('(f3) fanOut returns 3 results',               f3Results.length === 3);
check('(f3) panel-progress fired 3 times',           progressEvents.length === 3);
check('(f3) all events are panel-progress',
  progressEvents.every(e => e.phase === 'panel-progress'));
check('(f3) done counts go 1,2,3',
  progressEvents.map(e => e.done).sort((a, b) => a - b).join(',') === '1,2,3');
check('(f3) total is 3 on all events',
  progressEvents.every(e => e.total === 3));
check('(f3) each event has a model string',
  progressEvents.every(e => typeof e.model === 'string' && e.model.length > 0));
check('(f3) each event has numeric ms',
  progressEvents.every(e => typeof e.ms === 'number'));

// (f4) fanOut without onProgress: unchanged behavior
const f4Events = [];
const f4Results = await fanOut('hello', ['m1', 'm2'], cfgF3, { fusionDepth: 1, concurrency: 2 });
check('(f4) no onProgress — still returns 2 results', f4Results.length === 2);
check('(f4) no spurious progress events',              f4Events.length === 0);

// ------------------------------------------------------------------ //
// (h) unsafeForShellArg: pure-function metachar guard (cross-platform)
// ------------------------------------------------------------------ //
check('(h) plain prose is safe',          unsafeForShellArg('list three benefits of code review') === false);
check('(h) ordinary punctuation is safe', unsafeForShellArg('cats, dogs, and birds.') === false);
check('(h) double-quote is unsafe',       unsafeForShellArg('say "hi"') === true);
check('(h) percent is unsafe',            unsafeForShellArg('100% sure') === true);
check('(h) newline is unsafe',            unsafeForShellArg('line1\nline2') === true);
for (const metachar of ['&', '|', '<', '>', '^', '(', ')', '!']) {
  check('(h) no-whitespace cmd metachar is unsafe: ' + metachar,
    unsafeForShellArg('x' + metachar + 'whoami') === true);
}
check('(h) static base arg is safe',      unsafeForWinShimBaseArg('--model') === false);
check('(h) cmd metachar in base arg is unsafe', unsafeForWinShimBaseArg('model&calc') === true);
check('(h) quote in base arg is unsafe',  unsafeForWinShimBaseArg('model"quote') === true);

// ------------------------------------------------------------------ //
// (i) win32 cmd.exe-wrap shim path: explicit .cmd/.bat and extensionless
//     stubs round-trip a multi-word arg prompt; unsafe values are refused
//     before spawn. win32-only (the cmd-wrap branch does not exist off win32).
// ------------------------------------------------------------------ //
if (process.platform === 'win32') {
  const spawnMarker = path.join(tmp, 'i-shim-spawned');
  const echo = stub('i-echo', `
const fs = require('fs');
if (process.env.FRONTIER_TEST_SPAWN_MARKER) fs.writeFileSync(process.env.FRONTIER_TEST_SPAWN_MARKER, 'spawned');
process.stdout.write(JSON.stringify({is_error:false, result: process.argv.slice(2).join('|')}));
  `);
  const shimCmd = path.join(tmp, 'i-shim.cmd');
  const shimBat = path.join(tmp, 'i-shim.bat');
  fs.writeFileSync(shimCmd, '@node "' + echo + '" %*\r\n');
  fs.writeFileSync(shimBat, '@node "' + echo + '" %*\r\n');
  const shimEnv = {
    PATH: tmp + path.delimiter + (process.env.PATH || ''),
    FRONTIER_TEST_SPAWN_MARKER: spawnMarker,
  };
  const shimAdapter = {
    model: 'shim', bin: 'i-shim', baseArgs: ['--x'],
    promptVia: 'arg', promptFlag: '-p', output: 'stdout', parse: 'claude-json',
    env: shimEnv,
  };

  const iExtensionless = await spawnOne('two words', shimAdapter);
  check('(i) extensionless cmd-wrap shim ok=true', iExtensionless.ok === true);
  check('(i) extensionless multi-word arg survives', iExtensionless.content.includes('two words'));

  for (const [ext, bin] of [['.cmd', shimCmd], ['.bat', shimBat]]) {
    const explicit = await spawnOne('two words', { ...shimAdapter, bin });
    check('(i) explicit ' + ext + ' cmd-wrap shim ok=true', explicit.ok === true);
    check('(i) explicit ' + ext + ' multi-word arg survives', explicit.content.includes('two words'));
  }

  fs.rmSync(spawnMarker, { force: true });
  const iUnsafe = await spawnOne('x&whoami', shimAdapter);
  check('(i) no-whitespace command separator refused (ok=false)', iUnsafe.ok === false);
  check('(i) command separator error mentions unsafe', iUnsafe.error && iUnsafe.error.includes('unsafe'));
  check('(i) command separator is refused before shim spawn', !fs.existsSync(spawnMarker));

  const iUnsafeBase = await spawnOne('safe prompt', {
    ...shimAdapter,
    baseArgs: ['--model', 'bad&calc'],
  });
  check('(i) unsafe base arg refused (ok=false)', iUnsafeBase.ok === false);
  check('(i) unsafe base arg error mentions unsafe', iUnsafeBase.error && iUnsafeBase.error.includes('unsafe'));

  const unsafeShimCmd = path.join(tmp, 'i-shim&unsafe.cmd');
  fs.writeFileSync(unsafeShimCmd, '@node "' + echo + '" %*\r\n');
  const iUnsafeBin = await spawnOne('safe prompt', { ...shimAdapter, bin: unsafeShimCmd });
  check('(i) unsafe command path refused (ok=false)', iUnsafeBin.ok === false);
  check('(i) unsafe command path error mentions unsafe', iUnsafeBin.error && iUnsafeBin.error.includes('unsafe'));
} else {
  console.log('  skip  (i) win32-only cmd-wrap shim path');
}

// ------------------------------------------------------------------ //
// (j) envFrom auth passthrough: host var injected into the child env
//     (overriding a static adapter.env placeholder); missing host var
//     fails the member cleanly BEFORE spawn, naming the var, never the
//     value.
// ------------------------------------------------------------------ //
const stubJ = stub('j-envfrom', `
process.stdout.write(JSON.stringify({is_error:false,
  result: [process.env.CHILD_TOKEN, process.env.STATIC_V,
    process.env.FRONTIER_UNRELATED_SECRET || 'absent'].join('|')}));
`);

process.env.FRONTIER_TEST_SRC_KEY = 'sekret-value';
process.env.FRONTIER_UNRELATED_SECRET = 'must-not-reach-child';
const jOk = await spawnOne('prompt', adapter(stubJ, {
  env: { STATIC_V: 'static', CHILD_TOKEN: 'placeholder-loses' },
  envFrom: { CHILD_TOKEN: 'FRONTIER_TEST_SRC_KEY' },
}));
check('(j) envFrom injects declared host auth into child',
  jOk.ok === true && jOk.content === 'sekret-value|static|absent');
check('(j) unrelated host secret is not inherited',
  jOk.ok === true && !jOk.content.includes('must-not-reach-child'));
delete process.env.FRONTIER_TEST_SRC_KEY;
delete process.env.FRONTIER_UNRELATED_SECRET;

const jMissing = await spawnOne('prompt', adapter(stubJ, {
  envFrom: { CHILD_TOKEN: 'FRONTIER_TEST_SRC_KEY' },
}));
check('(j) missing host var -> ok=false',            jMissing.ok === false);
check('(j) missing host var -> empty content (no spawn)', jMissing.content === '');
check('(j) error names the missing var',             jMissing.error && jMissing.error.includes('FRONTIER_TEST_SRC_KEY'));
check('(j) error carries no secret material',        jMissing.error && !jMissing.error.includes('sekret-value'));

process.env.FRONTIER_TEST_SRC_KEY = '';
const jEmpty = await spawnOne('prompt', adapter(stubJ, {
  envFrom: { CHILD_TOKEN: 'FRONTIER_TEST_SRC_KEY' },
}));
check('(j) empty host var counts as missing',        jEmpty.ok === false && jEmpty.error.includes('FRONTIER_TEST_SRC_KEY'));
delete process.env.FRONTIER_TEST_SRC_KEY;

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
