#!/usr/bin/env node
// Maestro Frontier — mode router (off / single / fusion).
// runFrontier({prompt, state, cfg, deps}) -> Promise<FusionResult>.

'use strict';

const { DEFAULTS } = require('./config.cjs');
const { resolvePanel } = require('./config.cjs');
const { classify, toFailedModel } = require('./schema.cjs');
const dispatch = require('./dispatch.cjs');
const judge = require('./judge.cjs');
const synthesize = require('./synthesize.cjs');

/**
 * @param {{ prompt:string, state:object, cfg?:object, deps?:object }} opts
 * @returns {Promise<object>}
 */
async function runFrontier({ prompt, state, cfg, deps }) {
  cfg = cfg || DEFAULTS;
  deps = deps || {};

  const spawnOne  = deps.spawnOne  || dispatch.spawnOne;
  const fanOut    = deps.fanOut    || dispatch.fanOut;
  const runJudge  = deps.runJudge  || judge.runJudge;
  const runSynth  = deps.runSynth  || synthesize.runSynth;

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

    const panel  = await fanOut(prompt, panelIds, cfg, { fusionDepth: depth + 1 });
    const ok     = panel.filter(p => p.ok);
    const failed = panel.filter(p => !p.ok);

    if (ok.length === 0) {
      return {
        status: 'error',
        mode: 'fusion',
        preset: state.preset,
        error: 'all panels failed',
        failure_reason: classify(failed.map(toFailedModel)),
      };
    }

    const analysis = await runJudge(prompt, ok, cfg);
    let final = await runSynth(prompt, { analysis, responses: ok }, cfg);
    if (!final) {
      // synth-fail fallback: longest ok response
      final = ok.reduce((a, b) => b.content.length > a.content.length ? b : a).content;
    }

    const result = { status: 'ok', mode: 'fusion', preset: state.preset, final, responses: ok };
    if (analysis !== undefined) result.analysis = analysis;
    if (failed.length) result.failed_models = failed.map(toFailedModel);
    return result;
  }

  // ---- UNKNOWN MODE ----
  return { status: 'error', mode: state.mode, error: 'unknown mode', failure_reason: 'unexpected_error' };
}

module.exports = { runFrontier };
