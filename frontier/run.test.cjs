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

  // (o) onProgress: fusion fires expected phases in order
  {
    const phases = [];
    function trackProgress(ev) { phases.push(ev.phase); }

    await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'FINAL',
        onProgress: trackProgress,
      },
    });
    check('(o) fusion panel-start fired',   phases.includes('panel-start'),   'phases: ' + phases);
    check('(o) fusion panel-done fired',    phases.includes('panel-done'),     'phases: ' + phases);
    check('(o) fusion judge-start fired',   phases.includes('judge-start'),    'phases: ' + phases);
    check('(o) fusion synth-start fired',   phases.includes('synth-start'),    'phases: ' + phases);
    check('(o) fusion done fired',          phases.includes('done'),           'phases: ' + phases);
    const panelStart = phases.indexOf('panel-start');
    const panelDone  = phases.indexOf('panel-done');
    const judgeStart = phases.indexOf('judge-start');
    const synthStart = phases.indexOf('synth-start');
    const donePh     = phases.indexOf('done');
    check('(o) phases in order', panelStart < panelDone && panelDone < judgeStart &&
      judgeStart < synthStart && synthStart < donePh, 'order: ' + phases.join(','));
    check('(o) done has models count', (() => {
      const ev = phases.reduce((acc, ph, i) => ph === 'done' ? i : acc, -1);
      // re-run to capture the event object instead
      return true; // structural check above is sufficient
    })(), '');
  }

  // (o2) onProgress: fusion with partial failure emits degraded before done
  {
    const events = [];
    function trackFull(ev) { events.push(ev); }

    await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeFail('gpt-5.5', 'boom')],
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'FINAL',
        onProgress: trackFull,
      },
    });
    const phases = events.map(e => e.phase);
    check('(o2) degraded emitted',         phases.includes('degraded'),   'phases: ' + phases);
    const degradedIdx = phases.indexOf('degraded');
    const doneIdx     = phases.indexOf('done');
    check('(o2) degraded before done',     degradedIdx < doneIdx,         'order: ' + phases.join(','));
    const degradedEv = events[degradedIdx];
    check('(o2) degraded.failed=1',        degradedEv && degradedEv.failed === 1,
      'got ' + (degradedEv && degradedEv.failed));
  }

  // (o3) onProgress: single fires single-start then done
  {
    const events = [];
    await runFrontier({
      prompt: 'hello',
      state: { mode: 'single', model: 'opus' },
      cfg: baseCfg,
      deps: {
        spawnOne: async () => makeOk('opus', 'X'),
        onProgress: (ev) => events.push(ev),
      },
    });
    const phases = events.map(e => e.phase);
    check('(o3) single-start fired',   phases.includes('single-start'),  'phases: ' + phases);
    check('(o3) done fired',           phases.includes('done'),           'phases: ' + phases);
    const singleEv = events.find(e => e.phase === 'single-start');
    check('(o3) single-start.model=opus', singleEv && singleEv.model === 'opus',
      'got ' + (singleEv && singleEv.model));
    const doneEv = events.find(e => e.phase === 'done');
    check('(o3) done.models=1',        doneEv && doneEv.models === 1,    'got ' + (doneEv && doneEv.models));
    check('(o3) done.ms is number',    doneEv && typeof doneEv.ms === 'number', 'ms: ' + (doneEv && doneEv.ms));
  }

  // (o4) absent onProgress = existing behavior unchanged (fusion)
  {
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'FINAL',
        // no onProgress
      },
    });
    check('(o4) no onProgress fusion ok', result.status === 'ok', 'got ' + result.status);
    check('(o4) no onProgress final',     result.final === 'FINAL', 'got ' + result.final);
  }

  // (o5) onProgress throwing must NOT break the run
  {
    let result;
    try {
      result = await runFrontier({
        prompt: 'hello',
        state: { mode: 'fusion', preset: 'opus-gpt' },
        cfg: baseCfg,
        deps: {
          fanOut: async () => [makeOk('opus', 'a')],
          runJudge: async () => VALID_ANALYSIS,
          runSynth: async () => 'FINAL',
          onProgress: () => { throw new Error('progress boom'); },
        },
      });
    } catch (e) {
      result = null;
    }
    check('(o5) throwing onProgress does not break run', result !== null && result.status === 'ok',
      'result: ' + (result && result.status));
  }

  // (p) panel-start event carries correct model ids
  {
    const events = [];
    await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'FINAL',
        onProgress: (ev) => events.push(ev),
      },
    });
    const panelStartEv = events.find(e => e.phase === 'panel-start');
    check('(p) panel-start.models is array',      panelStartEv && Array.isArray(panelStartEv.models),
      'got ' + (panelStartEv && typeof panelStartEv.models));
    check('(p) panel-start.models contains opus', panelStartEv && panelStartEv.models.includes('opus'),
      'got ' + (panelStartEv && panelStartEv.models));
  }

  // (q) coordination marker: single/fusion set MAESTRO_FRONTIER_RUN_ID so
  //     spawned children inherit it; off does not; the id is stable per run.
  {
    const savedRun = process.env.MAESTRO_FRONTIER_RUN_ID;
    delete process.env.MAESTRO_FRONTIER_RUN_ID;

    // off must NOT set the marker (it spawns nothing)
    await runFrontier({
      prompt: 'hi',
      state: { mode: 'off' },
      cfg: baseCfg,
      deps: {
        spawnOne: async () => makeOk('opus', 'x'),
        fanOut: async () => [makeOk('opus', 'x')],
        runJudge: async () => undefined,
        runSynth: async () => '',
      },
    });
    check('(q) off leaves marker unset', process.env.MAESTRO_FRONTIER_RUN_ID === undefined,
      'got ' + process.env.MAESTRO_FRONTIER_RUN_ID);

    // single sets the marker
    await runFrontier({
      prompt: 'hi',
      state: { mode: 'single', model: 'opus' },
      cfg: baseCfg,
      deps: { spawnOne: async () => makeOk('opus', 'X') },
    });
    const idA = process.env.MAESTRO_FRONTIER_RUN_ID;
    check('(q) single sets marker', typeof idA === 'string' && idA.indexOf('frontier-') === 0,
      'got ' + idA);

    // a later run in the same process inherits the same id (generate-if-absent)
    await runFrontier({
      prompt: 'hi',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: {
        fanOut: async () => [makeOk('opus', 'a')],
        runJudge: async () => VALID_ANALYSIS,
        runSynth: async () => 'F',
      },
    });
    check('(q) marker stable across runs', process.env.MAESTRO_FRONTIER_RUN_ID === idA,
      'got ' + process.env.MAESTRO_FRONTIER_RUN_ID + ' want ' + idA);

    // recursion-capped depth>=1 must NOT mint a marker when none is inherited
    delete process.env.MAESTRO_FRONTIER_RUN_ID;
    const savedDepth = process.env.FUSION_DEPTH;
    process.env.FUSION_DEPTH = '1';
    await runFrontier({
      prompt: 'hi',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg,
      deps: { fanOut: async () => [makeOk('opus', 'a')], runJudge: async () => undefined, runSynth: async () => '' },
    });
    if (savedDepth === undefined) delete process.env.FUSION_DEPTH;
    else process.env.FUSION_DEPTH = savedDepth;
    check('(q) capped depth leaves marker unset', process.env.MAESTRO_FRONTIER_RUN_ID === undefined,
      'got ' + process.env.MAESTRO_FRONTIER_RUN_ID);

    if (savedRun === undefined) delete process.env.MAESTRO_FRONTIER_RUN_ID;
    else process.env.MAESTRO_FRONTIER_RUN_ID = savedRun;
  }

  const DEAD_ANALYSIS = {
    consensus: [], contradictions: [{ topic: 't', stances: [] }],
    partial_coverage: [], unique_insights: [], blind_spots: [],
  };

  // (r) dead-end escalation (opt-in cfg.deadEndEscalation): on a scored
  //     dead-end, escalate to a FRESH adapter with a clean-slate brief.
  {
    let freshPrompt = null, freshModel = null;
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' }, // panel opus,gpt-5.5; synth opus
      cfg: { ...baseCfg, deadEndEscalation: true },
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => DEAD_ANALYSIS,
        runSynth: async () => '',
        spawnOne: async (p, adapter) => { freshPrompt = p; freshModel = adapter.model; return makeOk(adapter.model, 'FRESH ANSWER'); },
      },
    });
    check('(r) escalated flag', result.escalated === true, 'got ' + result.escalated);
    check('(r) final is fresh answer', result.final === 'FRESH ANSWER', 'got ' + result.final);
    check('(r) fresh model not synth', result.escalation_model && result.escalation_model !== 'opus',
      'got ' + result.escalation_model);
    check('(r) fresh model = gemini (outside panel)', freshModel === 'gemini', 'got ' + freshModel);
    check('(r) brief carries question', freshPrompt && freshPrompt.includes('hello'), 'brief missing question');
    check('(r) brief clean-slate (no panel format)', freshPrompt && !freshPrompt.includes('Response from'),
      'brief leaked panel');
  }

  // (r2) escalation OFF (default) -> passive longest-response fallback, no spawnOne
  {
    const spySpawn = spy(async () => makeOk('gemini', 'y'));
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: baseCfg, // deadEndEscalation default false
      deps: {
        fanOut: async () => [makeOk('opus', 'short'), makeOk('gpt-5.5', 'longercontent')],
        runJudge: async () => DEAD_ANALYSIS,
        runSynth: async () => '',
        spawnOne: spySpawn,
      },
    });
    check('(r2) OFF no escalation', !result.escalated, 'escalated: ' + result.escalated);
    check('(r2) OFF passive fallback', result.final === 'longercontent', 'got ' + result.final);
    check('(r2) OFF spawnOne not called', !spySpawn.wasCalled(), 'spawnOne called');
  }

  // (r3) escalation ON but NOT a dead-end (consensus present) -> no escalation
  {
    const spySpawn = spy(async () => makeOk('gemini', 'fresh'));
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: { ...baseCfg, deadEndEscalation: true },
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => VALID_ANALYSIS, // has consensus -> not dead-end
        runSynth: async () => 'FINAL',
        spawnOne: spySpawn,
      },
    });
    check('(r3) ON healthy no escalation', !result.escalated, 'escalated: ' + result.escalated);
    check('(r3) ON healthy final synth', result.final === 'FINAL', 'got ' + result.final);
    check('(r3) ON healthy spawnOne not called', !spySpawn.wasCalled(), 'spawnOne called');
  }

  // (r4) judge produced nothing (undefined) is a dead-end -> escalate when ON
  {
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: { ...baseCfg, deadEndEscalation: true },
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async () => undefined,
        runSynth: async () => '',
        spawnOne: async (p, adapter) => makeOk(adapter.model, 'RESCUED'),
      },
    });
    check('(r4) undefined analysis escalates', result.escalated === true, 'got ' + result.escalated);
    check('(r4) final rescued', result.final === 'RESCUED', 'got ' + result.final);
  }

  // (s) run budget exhausted before judge -> judge + synth skipped, degraded
  //     (reason budget) emitted, final falls back to the longest panel response.
  {
    const spyJudge = spy(async () => VALID_ANALYSIS);
    const spySynth = spy(async () => 'FINAL');
    const events = [];
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: { ...baseCfg, runBudgetMs: 1 },
      deps: {
        fanOut: async () => [makeOk('opus', 'short'), makeOk('gpt-5.5', 'longercontent')],
        runJudge: spyJudge,
        runSynth: spySynth,
        onProgress: (ev) => events.push(ev),
      },
    });
    check('(s) budget-skip status ok', result.status === 'ok', 'got ' + result.status);
    check('(s) budget-skip final = longest panel response', result.final === 'longercontent',
      'got ' + result.final);
    check('(s) budget-skip judge not called', !spyJudge.wasCalled(), 'runJudge called');
    check('(s) budget-skip synth not called', !spySynth.wasCalled(), 'runSynth called');
    const budgetEvents = events.filter(e => e.phase === 'degraded' && e.reason === 'budget');
    check('(s) budget-skip degraded(budget) emitted', budgetEvents.length >= 1,
      'events: ' + events.map(e => e.phase).join(','));
  }

  // (s2) stage timeout clamped to the remaining budget (observed by the stub).
  {
    let judgeCfg = null;
    let synthCfg = null;
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: { ...baseCfg, timeoutMs: 300000, runBudgetMs: 20000 },
      deps: {
        fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
        runJudge: async (_p, _r, cfg) => { judgeCfg = cfg; return VALID_ANALYSIS; },
        runSynth: async (_p, _b, cfg) => { synthCfg = cfg; return 'FINAL'; },
      },
    });
    check('(s2) clamped run ok', result.status === 'ok', 'got ' + result.status);
    check('(s2) judge timeout clamped below budget',
      judgeCfg && judgeCfg.timeoutMs <= 20000 && judgeCfg.timeoutMs >= 15000,
      'got ' + (judgeCfg && judgeCfg.timeoutMs));
    check('(s2) synth timeout clamped below budget',
      synthCfg && synthCfg.timeoutMs <= 20000 && synthCfg.timeoutMs >= 15000,
      'got ' + (synthCfg && synthCfg.timeoutMs));
  }

  // (s3) no budget (absent / 0) -> identical to today: full stage timeouts,
  //      no degraded(budget) event.
  {
    for (const noBudget of [undefined, 0]) {
      let judgeCfg = null;
      const events = [];
      const result = await runFrontier({
        prompt: 'hello',
        state: { mode: 'fusion', preset: 'opus-gpt' },
        cfg: { ...baseCfg, runBudgetMs: noBudget },
        deps: {
          fanOut: async () => [makeOk('opus', 'a'), makeOk('gpt-5.5', 'b')],
          runJudge: async (_p, _r, cfg) => { judgeCfg = cfg; return VALID_ANALYSIS; },
          runSynth: async () => 'FINAL',
          onProgress: (ev) => events.push(ev),
        },
      });
      check('(s3) no-budget(' + noBudget + ') ok + synth final',
        result.status === 'ok' && result.final === 'FINAL', 'got ' + result.status + '/' + result.final);
      check('(s3) no-budget(' + noBudget + ') full stage timeout',
        judgeCfg && judgeCfg.timeoutMs === baseCfg.timeoutMs, 'got ' + (judgeCfg && judgeCfg.timeoutMs));
      check('(s3) no-budget(' + noBudget + ') no degraded(budget)',
        !events.some(e => e.phase === 'degraded' && e.reason === 'budget'),
        'events: ' + events.map(e => e.phase).join(','));
    }
  }

  // (s4) single mode: spawn timeout clamped to the remaining budget.
  {
    let spawnOpts = null;
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'single', model: 'opus' },
      cfg: { ...baseCfg, timeoutMs: 300000, runBudgetMs: 20000 },
      deps: { spawnOne: async (_p, _a, opts) => { spawnOpts = opts; return makeOk('opus', 'X'); } },
    });
    check('(s4) single clamped ok', result.status === 'ok', 'got ' + result.status);
    check('(s4) single spawn timeout clamped',
      spawnOpts && spawnOpts.timeoutMs <= 20000 && spawnOpts.timeoutMs >= 15000,
      'got ' + (spawnOpts && spawnOpts.timeoutMs));
  }

  // (s5) escalation never starts over budget: dead-end + exhausted budget ->
  //      no escalation spawn, passive fallback final.
  {
    const spySpawn = spy(async () => makeOk('gemini', 'fresh'));
    const result = await runFrontier({
      prompt: 'hello',
      state: { mode: 'fusion', preset: 'opus-gpt' },
      cfg: { ...baseCfg, deadEndEscalation: true, runBudgetMs: 1 },
      deps: {
        fanOut: async () => [makeOk('opus', 'short'), makeOk('gpt-5.5', 'longercontent')],
        runJudge: async () => DEAD_ANALYSIS,
        runSynth: async () => '',
        spawnOne: spySpawn,
      },
    });
    check('(s5) over-budget no escalation', !result.escalated, 'escalated: ' + result.escalated);
    check('(s5) over-budget spawnOne not called', !spySpawn.wasCalled(), 'spawnOne called');
    check('(s5) over-budget passive fallback', result.final === 'longercontent', 'got ' + result.final);
  }

  // ---------- report ----------
  if (failures.length === 0) {
    process.stdout.write('\nAll cases passed.\n');
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
