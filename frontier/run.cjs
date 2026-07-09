#!/usr/bin/env node
// Maestro Frontier — mode router (off / single / fusion).
// runFrontier({prompt, state, cfg, deps}) -> Promise<FusionResult>.
//
// Re-grounding note (Fable T2): the engine fans a prompt to model CLIs
// that do NOT share this session's file/context. A member or synthesis
// output asserting "I can't see X" / "no such file" reflects that
// subprocess's blank context, not ground truth — re-ground such claims
// against live context before relaying them to the user (AGENTS.md S7.7).

'use strict';

const { DEFAULTS } = require('./config.cjs');
const { resolvePanel, resolveJudgeModel, resolveSynthModel } = require('./config.cjs');
const { classify, toFailedModel } = require('./schema.cjs');
const dispatch = require('./dispatch.cjs');
const judge = require('./judge.cjs');
const synthesize = require('./synthesize.cjs');
const {
  canonicalModelId,
  canonicalPresetId,
  normalizeStateAliases,
} = require('./catalog.cjs');

/**
 * Clean-slate reframing brief for dead-end escalation: carries ONLY the
 * question and a fresh-perspective cue — never the panel's reasoning — so the
 * fresh adapter is not anchored onto the stuck path (anti-anchoring).
 * @param {string} userPrompt @returns {string}
 */
function buildReframeBrief(userPrompt) {
  return `Prior attempts reached a dead-end. Approach this with a COMPLETELY FRESH
perspective — do NOT assume their framing; reframe the problem if needed.

QUESTION:
${userPrompt}

Give your best direct answer as clear prose.`;
}

/**
 * Pick a fresh adapter for escalation: any known adapter other than the
 * dead-ended synth model, preferring one outside the panel (a genuinely
 * different perspective). Returns null if none available.
 * @param {object} cfg @param {string[]} panelIds @param {string} synthModel
 * @returns {string|null}
 */
function pickFreshAdapter(cfg, panelIds, synthModel) {
  const ids = Object.keys((cfg && cfg.adapters) || {}).filter(m => m !== synthModel);
  return ids.find(m => !panelIds.includes(m)) || ids[0] || null;
}

/**
 * Ensure a stable per-run coordination id is present in the environment and
 * return it. Generated once per top-level run; a nested invocation (or a
 * child spawned with this env) inherits the parent's id unchanged. spawnOne
 * spreads process.env into every child, so this one assignment propagates the
 * id to panel/judge/synth over the same channel as FUSION_DEPTH -- no per-call
 * threading. The id is set only inside the short-lived run process (autorun
 * hook / `maestro frontier run`), so it never leaks into the long-lived host
 * session. frontier/runlock.cjs records it so the id is observable from
 * outside the process too.
 * @returns {string}
 */
function ensureRunId() {
  if (!process.env.MAESTRO_FRONTIER_RUN_ID) {
    process.env.MAESTRO_FRONTIER_RUN_ID =
      'frontier-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }
  return process.env.MAESTRO_FRONTIER_RUN_ID;
}

/**
 * @param {{ prompt:string, state:object, cfg?:object, deps?:object }} opts
 * @returns {Promise<object>}
 */
async function runFrontier({ prompt, state, cfg, deps }) {
  cfg = cfg || DEFAULTS;
  deps = deps || {};
  state = normalizeStateAliases(state || {});

  const spawnOne   = deps.spawnOne   || dispatch.spawnOne;
  const fanOut     = deps.fanOut     || dispatch.fanOut;
  const runJudge   = deps.runJudge   || judge.runJudge;
  const runSynth   = deps.runSynth   || synthesize.runSynth;
  const onProgress = (deps && typeof deps.onProgress === 'function') ? deps.onProgress : null;

  const startMs = Date.now();

  // Whole-run wall-clock budget (cfg.runBudgetMs): keeps the engine inside
  // the autorun hook's outer timeout so a slow run degrades to the best
  // available answer instead of the host killing the hook and discarding
  // everything. Non-finite or <=0 disables it (backward compatible for
  // direct runFrontier callers). Stages started with < BUDGET_FLOOR_MS left
  // are skipped outright — each skip has an existing graceful fallback.
  const runBudgetMs = Number(cfg.runBudgetMs);
  const hasRunBudget = Number.isFinite(runBudgetMs) && runBudgetMs > 0;
  const BUDGET_FLOOR_MS = 15000;
  /** @returns {number} ms left in the run budget; Infinity when no budget. */
  function budgetRemaining() {
    return hasRunBudget ? runBudgetMs - (Date.now() - startMs) : Infinity;
  }
  /** @param {number} remaining @returns {number} stage timeout clamped to the budget. */
  function stageTimeout(remaining) {
    return Math.min(cfg.timeoutMs, remaining);
  }

  /** Emit a progress event; swallows any error thrown by the callback. */
  function emit(eventObj) {
    if (!onProgress) return;
    try { onProgress(eventObj); } catch (_) {}
  }

  const rawDepth = parseInt(process.env.FUSION_DEPTH || '0', 10);
  const depth    = isNaN(rawDepth) ? 0 : rawDepth;

  // ---- OFF ----
  if (state.mode === 'off') {
    return { status: 'off', mode: 'off', final: null };
  }

  // ---- RECURSION GUARD (single + fusion) ----
  if (depth >= 1) {
    const base = {
      status: 'error',
      mode: state.mode,
      error: 'fusion depth exceeded (one-level cap)',
      failure_reason: 'fusion_invocation_capped',
    };
    if (state.mode === 'fusion') return { ...base, preset: state.preset };
    if (state.mode === 'single') return { ...base, model: state.model };
    return base;
  }

  // ---- FRONTIER RUN ID (coordination marker) ----
  // Stamp this run + every child it spawns (panel, judge, synth) so an
  // out-of-process observer can tell a coordinated, read-only Frontier
  // subprocess apart from an independent autonomous write-loop. OFF mode and
  // a recursion-capped depth>=1 invocation both return above without
  // spawning, so neither reaches here. See commands/frontier.md "Concurrency".
  ensureRunId();

  // ---- SINGLE ----
  if (state.mode === 'single') {
    const adapter = cfg.adapters && cfg.adapters[state.model];
    if (!adapter) {
      return {
        status: 'error',
        mode: 'single',
        model: state.model,
        error: 'unknown model: ' + state.model,
        failure_reason: 'unexpected_error',
      };
    }
    emit({ phase: 'single-start', model: state.model });
    const resp = await spawnOne(prompt, adapter,
      { timeoutMs: stageTimeout(budgetRemaining()), fusionDepth: depth + 1 });
    if (!resp.ok) {
      return {
        status: 'error',
        mode: 'single',
        model: state.model,
        error: resp.error,
        failure_reason: classify([toFailedModel(resp)]),
      };
    }
    emit({ phase: 'done', models: 1, ms: Date.now() - startMs });
    return { status: 'ok', mode: 'single', model: state.model, final: resp.content, response: resp };
  }

  // ---- FUSION ----
  if (state.mode === 'fusion') {
    // resolve panel
    let panelIds;
    try {
      panelIds = resolvePanel(state, cfg);
    } catch (e) {
      return {
        status: 'error',
        mode: 'fusion',
        preset: state.preset,
        error: e.message,
        failure_reason: 'unexpected_error',
      };
    }

    // BUDGET (opt-in)
    if (cfg.tokenBudget && cfg.tokenBudget > 0) {
      const projected = Math.ceil(prompt.length / 4) * panelIds.length;
      if (projected > cfg.tokenBudget) {
        return {
          status: 'error',
          mode: 'fusion',
          preset: state.preset,
          error: 'projected token budget exceeded (' + projected + '>' + cfg.tokenBudget + ')',
          failure_reason: 'unexpected_error',
        };
      }
    }

    emit({ phase: 'panel-start', models: panelIds });
    const panel  = await fanOut(prompt, panelIds, cfg, { fusionDepth: depth + 1, onProgress });
    const ok     = panel.filter(p => p.ok);
    const failed = panel.filter(p => !p.ok);

    emit({ phase: 'panel-done', ok: ok.length, failed: failed.length });

    if (ok.length === 0) {
      return {
        status: 'error',
        mode: 'fusion',
        preset: state.preset,
        error: 'all panels failed',
        failure_reason: classify(failed.map(toFailedModel)),
      };
    }

    // Resolve judge/synth model (explicit flag -> preset override -> default)
    // and hand the judge/synth stages a cfg pinned to those models, so a
    // preset like gpt-duo runs entirely on its own provider.
    const stageCfg = {
      ...cfg,
      judgeModel: resolveJudgeModel(state, cfg),
      synthModel: resolveSynthModel(state, cfg),
    };
    let analysis;
    const judgeRemaining = budgetRemaining();
    if (judgeRemaining < BUDGET_FLOOR_MS) {
      // Budget exhausted before the judge: skip it and synthesize on the raw
      // panel responses (runSynth accepts analysis === undefined).
      emit({ phase: 'degraded', reason: 'budget' });
    } else {
      emit({ phase: 'judge-start', model: stageCfg.judgeModel });
      analysis = await runJudge(prompt, ok,
        { ...stageCfg, timeoutMs: stageTimeout(judgeRemaining) });
    }
    // Task-matched synthesizer: re-resolve now the analysis crux is known
    // (opt-in via cfg.analysisSynthSelect; default keeps stageCfg.synthModel).
    const synthModel = resolveSynthModel(state, cfg, analysis);
    let final = null;
    const synthRemaining = budgetRemaining();
    if (synthRemaining < BUDGET_FLOOR_MS) {
      // Budget exhausted before synth: fall through to the longest-response
      // fallback below.
      emit({ phase: 'degraded', reason: 'budget' });
    } else {
      emit({ phase: 'synth-start', model: synthModel });
      final = await runSynth(prompt, { analysis, responses: ok },
        { ...stageCfg, synthModel, timeoutMs: stageTimeout(synthRemaining) });
    }

    // Dead-end escalation (opt-in): a scored dead-end gets a clean-slate
    // re-examination by a FRESH perspective, not a same-agent retry.
    let escalated = false;
    let escalationModel = null;
    if (cfg.deadEndEscalation && judge.isDeadEnd(analysis)) {
      const escalateRemaining = budgetRemaining();
      if (escalateRemaining < BUDGET_FLOOR_MS) {
        // Budget exhausted: never start an escalation spawn over budget.
        emit({ phase: 'degraded', reason: 'budget' });
      } else {
        escalationModel = pickFreshAdapter(cfg, panelIds, synthModel);
        if (escalationModel) {
          emit({ phase: 'escalate-start', model: escalationModel });
          let er;
          try {
            er = await spawnOne(buildReframeBrief(prompt), cfg.adapters[escalationModel],
              { timeoutMs: stageTimeout(escalateRemaining), fusionDepth: depth + 1 });
          } catch { er = null; }
          if (er && er.ok && er.content) { final = er.content; escalated = true; }
        }
      }
    }

    if (!final) {
      // synth-fail fallback: longest ok response
      final = ok.reduce((a, b) => b.content.length > a.content.length ? b : a).content;
    }

    if (failed.length > 0 && ok.length > 0) {
      emit({ phase: 'degraded', failed: failed.length });
    }
    emit({ phase: 'done', models: ok.length, ms: Date.now() - startMs });

    const result = { status: 'ok', mode: 'fusion', preset: state.preset, final, responses: ok };
    if (analysis !== undefined) result.analysis = analysis;
    if (escalated) { result.escalated = true; result.escalation_model = escalationModel; }
    if (failed.length) result.failed_models = failed.map(toFailedModel);
    return result;
  }

  // ---- UNKNOWN MODE ----
  return { status: 'error', mode: state.mode, error: 'unknown mode', failure_reason: 'unexpected_error' };
}

module.exports = { runFrontier, ensureRunId, canonicalModelId, canonicalPresetId, normalizeStateAliases };
