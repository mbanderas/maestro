#!/usr/bin/env node
// Maestro Frontier — unit tests for run.cjs. Zero real spawns; injected deps only.

'use strict';

const { runFrontier } = require('./run.cjs');
const { DEFAULTS } = require('./config.cjs');

// ---------- helpers ----------

const failures = [];

function check(label, cond, msg) {
  if (!cond) {
    failures.push(label + ': ' + (msg || 'FAILED'));
    process.stderr.write('FAIL  ' + label + (msg ? ': ' + msg : '') + '\n');
  } else {
    process.stdout.write('PASS  ' + label + '\n');
  }
}

// Minimal cfg with adapters so single-mode tests work
const baseCfg = {
  ...DEFAULTS,
  tokenBudget: 0,
  adapters: {
    opus: {
      model: 'opus',
      bin: 'fake',
      baseArgs: [],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'claude-json',
    },
    'gpt-5.5': {
      model: 'gpt-5.5',
      bin: 'fake',
      baseArgs: [],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'text',
    },
    gemini: {
      model: 'gemini',
      bin: 'fake',
      baseArgs: [],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'text',
    },
  },
  presets: {
    'opus-gpt': ['opus', 'gpt-5.5'],
    'gpt-duo': ['gpt-5.5', 'gpt-5.5'],
    'frontier-trio': ['opus', 'gpt-5.5', 'gemini'],
  },
  presetStages: {
    'gpt-duo': { judge: 'gpt-5.5', synth: 'gpt-5.5' },
  },
  judgeModel: 'opus',
  synthModel: 'opus',
  timeoutMs: 5000,
};

const VALID_ANALYSIS = {
  consensus: ['c1'],
  contradictions: [],
  partial_coverage: [],
  unique_insights: [],
  blind_spots: [],
};

function makeOk(model, content) {
  return { model, content, ok: true, durationMs: 1, tokensEst: 1 };
}
function makeFail(model, error) {
  return { model, content: '', ok: false, durationMs: 1, tokensEst: 0, error };
}

// ---------- spy ----------

function spy(fn) {
  let called = false;
  const wrapper = async (...args) => { called = true; return fn(...args); };
  wrapper.wasCalled = () => called;
  return wrapper;
}

// ---------- tests ----------

async function runTests() {

  // (a) OFF mode — spawnOne + fanOut must NOT be called
  {
    const spySingle = spy(async () => makeOk('opus', 'x'));
    const spyFan    = spy(async () => [makeOk('opus', 'x')]);
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'off' },
      cfg: baseCfg,
      deps: { spawnOne: spySingle, fanOut: spyFan, runJudge: async () => undefined, runSynth: async () => '' },
    });
    check('(a) off status', result.status === 'off', 'expected off, got ' + result.status);
    check('(a) off final', result.final === null, 'expected null final');
    check('(a) off no spawnOne', !spySingle.wasCalled(), 'spawnOne was called');
    check('(a) off no fanOut', !spyFan.wasCalled(), 'fanOut was called');
  }

  // (b) FUSION_DEPTH=1 + fusion -> recursion guard
  {
    const saved = process.env.FUSION_DEPTH;
    process.env.FUSION_DEPTH = '1';
    const spyFan = spy(async () => [makeOk('opus', 'x')]);
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: { fanOut: spyFan, runJudge: async () => undefined, runSynth: async () => '' },
    });
    if (saved === undefined) delete process.env.FUSION_DEPTH;
    else process.env.FUSION_DEPTH = saved;
    check('(b) recursion guard status', result.status === 'error', 'expected error');
    check('(b) recursion guard reason', result.failure_reason === 'fusion_invocation_capped',
      'got ' + result.failure_reason);
    check('(b) recursion guard no fanOut', !spyFan.wasCalled(), 'fanOut was called');
  }

  // (c) single ok
  {
    const fakeSpawn = async () => makeOk('opus', 'X');
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'single', model: 'opus' },
      cfg: baseCfg,
      deps: { spawnOne: fakeSpawn },
    });
    check('(c) single ok status', result.status === 'ok', 'got ' + result.status);
    check('(c) single ok final', result.final === 'X', 'got ' + result.final);
  }

  // (d) single fail — rate limited
  {
    const fakeSpawn = async () => makeFail('opus', 'rate limit 429');
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'single', model: 'opus' },
      cfg: baseCfg,
      deps: { spawnOne: fakeSpawn },
    });
    check('(d) single fail status', result.status === 'error', 'got ' + result.status);
    check('(d) single fail reason', result.failure_reason === 'rate_limited', 'got ' + result.failure_reason);
  }

  // (e) fusion happy path
  {
    const fakePanel = [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')];
    const fakeFanOut = async () => fakePanel;
    const fakeJudge = async () => VALID_ANALYSIS;
    const fakeSynth = async () => 'FINAL';
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: { fanOut: fakeFanOut, runJudge: fakeJudge, runSynth: fakeSynth },
    });
    check('(e) fusion ok status', result.status === 'ok', 'got ' + result.status);
    check('(e) fusion ok final', result.final === 'FINAL', 'got ' + result.final);
    check('(e) fusion ok analysis truthy', !!result.analysis, 'analysis falsy');
    check('(e) fusion ok responses.length', result.responses.length === 2, 'got ' + result.responses.length);
  }

  // (f) partial fail — one model fails
  {
    const fakePanel = [makeOk('opus', 'answer'), makeFail('gemini', 'boom')];
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => fakePanel,
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'DONE',
      },
    });
    check('(f) partial fail status', result.status === 'ok', 'got ' + result.status);
    check('(f) partial fail failed_models', result.failed_models && result.failed_models.length === 1,
      'got ' + (result.failed_models && result.failed_models.length));
  }

  // (g) judge fail degrade — analysis key absent / undefined
  {
    const fakePanel = [makeOk('opus', 'answer')];
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => fakePanel,
        runJudge: async () => undefined,
        runSynth: async () => 'DONE',
      },
    });
    check('(g) judge-fail no analysis key', !('analysis' in result) || result.analysis === undefined,
      'analysis present: ' + JSON.stringify(result.analysis));
    check('(g) judge-fail final present', !!result.final, 'final missing');
  }

  // (h) all-fail
  {
    const fakePanel = [
      makeFail('opus', 'quota exceeded plan'),
      makeFail('gpt-5.5', 'quota exceeded plan'),
    ];
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: { fanOut: async () => fakePanel, runJudge: async () => undefined, runSynth: async () => '' },
    });
    check('(h) all-fail status', result.status === 'error', 'got ' + result.status);
    check('(h) all-fail reason', result.failure_reason === 'insufficient_credits', 'got ' + result.failure_reason);
  }

  // (i) synth-fail fallback to longest ok response
  {
    const fakePanel = [makeOk('opus', 'short'), makeOk('gpt-5.5', 'longercontent')];
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => fakePanel,
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => '',
      },
    });
    check('(i) synth-fail fallback', result.final === 'longercontent', 'got: ' + result.final);
  }

  // (j) budget exceeded — fanOut NOT called
  {
    const budgetCfg = { ...baseCfg, tokenBudget: 1 };
    const spyFan = spy(async () => []);
    const result = await runFrontier({
      prompt: 'hello world this is a long prompt',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: budgetCfg,
      deps: { fanOut: spyFan, runJudge: async () => undefined, runSynth: async () => '' },
    });
    check('(j) budget status', result.status === 'error', 'got ' + result.status);
    check('(j) budget reason', result.failure_reason === 'unexpected_error', 'got ' + result.failure_reason);
    check('(j) budget no fanOut', !spyFan.wasCalled(), 'fanOut was called');
  }

  // (k) gpt-duo pins judge + synth to gpt-5.5 (Codex-only fusion)
  {
    let judgeCfg = null;
    let synthCfg = null;
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'gpt-duo' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('gpt-5.5', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async (_p, _r, cfg) => { judgeCfg = cfg; return VALID_ANALYSIS; },
        runSynth: async (_p, _b, cfg) => { synthCfg = cfg; return 'FINAL'; },
      },
    });
    check('(k) gpt-duo ok', result.status === 'ok', 'got ' + result.status);
    check('(k) judge pinned gpt-5.5', judgeCfg && judgeCfg.judgeModel === 'gpt-5.5',
      'got ' + (judgeCfg && judgeCfg.judgeModel));
    check('(k) synth pinned gpt-5.5', synthCfg && synthCfg.synthModel === 'gpt-5.5',
      'got ' + (synthCfg && synthCfg.synthModel));
  }

  // (l) explicit --judge/--synth override beats preset default
  {
    let judgeCfg = null;
    let synthCfg = null;
    await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'gpt-duo', judgeModel: 'opus', synthModel: 'opus' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('gpt-5.5', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async (_p, _r, cfg) => { judgeCfg = cfg; return VALID_ANALYSIS; },
        runSynth: async (_p, _b, cfg) => { synthCfg = cfg; return 'FINAL'; },
      },
    });
    check('(l) explicit judge override', judgeCfg && judgeCfg.judgeModel === 'opus',
      'got ' + (judgeCfg && judgeCfg.judgeModel));
    check('(l) explicit synth override', synthCfg && synthCfg.synthModel === 'opus',
      'got ' + (synthCfg && synthCfg.synthModel));
  }

  // (m) chatgpt aliases resolve for panel, judge, and synth in fusion
  {
    let panelIds = null;
    let judgeCfg = null;
    let synthCfg = null;
    const result = await runFrontier({
      prompt: 'hello',
      state: {
        mode: 'fusion',
        preset: 'custom',
        models: ['chatgpt', 'gemini', 'opus'],
        judgeModel: 'chatgpt',
        synthModel: 'chatgpt',
      },
      cfg: baseCfg,
      deps: {
        fanOut: async (_p, ids) => {
          panelIds = ids;
          return [makeOk('gpt-5.5', 'a'), makeOk('gemini', 'b'), makeOk('opus', 'c')];
        },
        runJudge: async (_p, _r, cfg) => { judgeCfg = cfg; return VALID_ANALYSIS; },
        runSynth: async (_p, _b, cfg) => { synthCfg = cfg; return 'FINAL'; },
      },
    });
    check('(m) chatgpt alias fusion ok', result.status === 'ok', 'got ' + result.status);
    check('(m) panel alias normalized', panelIds && panelIds.join(',') === 'gpt-5.5,gemini,opus',
      'got ' + (panelIds && panelIds.join(',')));
    check('(m) judge alias normalized', judgeCfg && judgeCfg.judgeModel === 'gpt-5.5',
      'got ' + (judgeCfg && judgeCfg.judgeModel));
    check('(m) synth alias normalized', synthCfg && synthCfg.synthModel === 'gpt-5.5',
      'got ' + (synthCfg && synthCfg.synthModel));
  }

  // (n) chatgpt-duo preset alias preserves gpt-duo behavior
  {
    let panelIds = null;
    await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'chatgpt-duo' },
      cfg: baseCfg,
      deps: {
        fanOut: async (_p, ids) => {
          panelIds = ids;
          return [makeOk('gpt-5.5', 'a'), makeOk('gpt-5.5', 'b')];
        },
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'FINAL',
      },
    });
    check('(n) preset alias normalized', panelIds && panelIds.join(',') === 'gpt-5.5,gpt-5.5',
      'got ' + (panelIds && panelIds.join(',')));
  }

  // ---------- report ----------
  if (failures.length === 0) {
    process.stdout.write('\nAll ' + 14 + ' cases passed.\n');
    process.exit(0);
  } else {
    process.stderr.write('\n' + failures.length + ' failure(s):\n');
    failures.forEach(f => process.stderr.write('  ' + f + '\n'));
    process.exit(1);
  }
}

runTests().catch(err => {
  process.stderr.write(String(err.stack || err) + '\n');
  process.exit(1);
});
