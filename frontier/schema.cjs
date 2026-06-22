#!/usr/bin/env node
// Maestro Frontier — shared types-as-validators + helpers.
// Zero deps, CJS. Ported stripLlmWrapper from scripts/compress.cjs.

'use strict';

/**
 * @typedef {{ model:string, content:string, ok:boolean, durationMs:number, tokensEst:number, toolCalls?:unknown[], error?:string }} PanelResponse
 * @typedef {{ model:string, reason:string }} FailedModel
 * @typedef {{ consensus:string[], contradictions:{topic:string,stances:{model:string,stance:string}[]}[], partial_coverage:{models:string[],point:string}[], unique_insights:{model:string,insight:string}[], blind_spots:string[], synth_hint?:string }} Analysis
 */

/** @type {string[]} */
const FAILURE_REASONS = [
  'all_panels_failed',
  'insufficient_credits',
  'rate_limited',
  'fusion_invocation_capped',
  'unexpected_error',
];

/**
 * @param {unknown} x
 * @returns {x is PanelResponse}
 */
function isPanelResponse(x) {
  if (x === null || typeof x !== 'object') return false;
  const o = /** @type {Record<string,unknown>} */ (x);
  return (
    typeof o.model === 'string' &&
    typeof o.content === 'string' &&
    typeof o.ok === 'boolean' &&
    typeof o.durationMs === 'number' &&
    typeof o.tokensEst === 'number'
  );
}

/**
 * @param {unknown} x
 * @returns {x is Analysis}
 */
function isAnalysis(x) {
  if (x === null || typeof x !== 'object') return false;
  const o = /** @type {Record<string,unknown>} */ (x);
  if (!Array.isArray(o.consensus)) return false;
  if (!o.consensus.every(s => typeof s === 'string')) return false;
  if (!Array.isArray(o.blind_spots)) return false;
  if (!o.blind_spots.every(s => typeof s === 'string')) return false;
  if (!Array.isArray(o.contradictions)) return false;
  if (!o.contradictions.every(e => e !== null && typeof e === 'object')) return false;
  if (!Array.isArray(o.partial_coverage)) return false;
  if (!o.partial_coverage.every(e => e !== null && typeof e === 'object')) return false;
  if (!Array.isArray(o.unique_insights)) return false;
  if (!o.unique_insights.every(e => e !== null && typeof e === 'object')) return false;
  if (o.synth_hint !== undefined && typeof o.synth_hint !== 'string') return false;
  return true;
}

/**
 * @param {string} str
 * @returns {Analysis}
 * @throws {Error}
 */
function parseAnalysis(str) {
  let parsed;
  try {
    parsed = JSON.parse(str);
  } catch (e) {
    throw new Error('parseAnalysis: invalid JSON — ' + e.message);
  }
  if (!isAnalysis(parsed)) {
    throw new Error('parseAnalysis: object does not satisfy Analysis shape');
  }
  return /** @type {Analysis} */ (parsed);
}

/**
 * @param {PanelResponse} panelResponse
 * @returns {FailedModel}
 */
function toFailedModel(panelResponse) {
  return { model: panelResponse.model, reason: panelResponse.error || 'unknown' };
}

/**
 * @param {FailedModel[]} failedModels
 * @returns {string}
 */
function classify(failedModels) {
  if (!failedModels || failedModels.length === 0) return 'all_panels_failed';
  const combined = failedModels.map(f => f.reason || '').join(' ').toLowerCase();
  if (/rate.?limit|429|too many request/.test(combined)) return 'rate_limited';
  if (/insufficient|credit|quota|billing|payment|exceed.*(usage|plan)/.test(combined)) return 'insufficient_credits';
  if (/enoent|spawn|signal|crash|killed/.test(combined)) return 'unexpected_error';
  return 'all_panels_failed';
}

// Port VERBATIM from scripts/compress.cjs — strips an outer ```fence
// wrapping the ENTIRE output.
function stripLlmWrapper(text) {
  const m = text.match(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*)\n\1\s*$/);
  return m ? m[2] : text;
}

module.exports = {
  FAILURE_REASONS,
  isPanelResponse,
  isAnalysis,
  parseAnalysis,
  toFailedModel,
  classify,
  stripLlmWrapper,
};
