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

const MODEL_ALIASES = {
  chatgpt: 'gpt-5.5',
};

const PRESET_ALIASES = {
  'chatgpt-duo': 'gpt-duo',
};

/** @param {string} model @returns {string} */
function canonicalModelId(model) {
  return MODEL_ALIASES[model] || model;
}

/** @param {string} preset @returns {string} */
function canonicalPresetId(preset) {
  return PRESET_ALIASES[preset] || preset;
}

/** @param {object} state @returns {object} */
function normalizeStateAliases(state) {
  const normalized = { ...state };
  if (normalized.model) normalized.model = canonicalModelId(normalized.model);
  if (normalized.preset) normalized.preset = canonicalPresetId(normalized.preset);
  if (Array.isArray(normalized.models)) {
    normalized.models = normalized.models.map(canonicalModelId);
  }
  if (normalized.judgeModel) normalized.judgeModel = canonicalModelId(normalized.judgeModel);
  if (normalized.synthModel) normalized.synthModel = canonicalModelId(normalized.synthModel);
  return normalized;
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
  // Tag this run and every child it spawns (panel, judge, synth) with a
  // stable id so a concurrent observer can tell a coordinated, read-only
  // Frontier subprocess apart from an independent autonomous write-loop.
  // spawnOne builds each child's env as { ...process.env, ... }, so setting
  // it here propagates to all descendants over the same channel as
  // FUSION_DEPTH -- no per-call threading. Generated once per top-level run;
  // a nested invocation inherits the parent's id unchanged. OFF mode and a
  // recursion-capped depth>=1 invocation both return above without spawning,
  // so neither reaches here. See commands/frontier.md "Concurrency".
  if (!process.env.MAESTRO_FRONTIER_RUN_ID) {
    process.env.MAESTRO_FRONTIER_RUN_ID =
      'frontier-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }

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
    const resp = await spawnOne(prompt, adapter, { timeoutMs: cfg.timeoutMs, fusionDepth: depth + 1 });
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
    emit({ phase: 'judge-start', model: stageCfg.judgeModel });
    const analysis = await runJudge(prompt, ok, stageCfg);
    emit({ phase: 'synth-start', model: stageCfg.synthModel });
    let final = await runSynth(prompt, { analysis, responses: ok }, stageCfg);
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
    if (failed.length) result.failed_models = failed.map(toFailedModel);
    return result;
  }

  // ---- UNKNOWN MODE ----
  return { status: 'error', mode: state.mode, error: 'unknown mode', failure_reason: 'unexpected_error' };
}

module.exports = { runFrontier, canonicalModelId, canonicalPresetId, normalizeStateAliases };
