#!/usr/bin/env node
// Maestro Frontier — user-defined saved presets.
// Persists { name: { models, judge?, synth? } } per scope into configDir()
// (frontier-presets[.<scope>].json) with the same 0600 atomic-write pattern
// as config.cjs saveState. Built-ins ALWAYS win: a saved name may never
// shadow a DEFAULTS preset (refused on save, dropped on load, and merge
// order in withUserPresets keeps built-ins on top even if one slips in).

'use strict';

const fs = require('fs');
const path = require('path');

const {
  DEFAULTS, configDir, resolveScope, resolveScopeAlias, safeWriteJson,
  validateModel,
} = require('./config.cjs');
const { canonicalModelId, canonicalPresetId } = require('./catalog.cjs');

/**
 * Scope-aware saved-presets path (same naming scheme as statePath).
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {string}
 */
function userPresetsPath(scope) {
  if (scope === undefined) scope = resolveScope([]);
  else scope = resolveScopeAlias(scope);
  if (scope === 'default') return path.join(configDir(), 'frontier-presets.json');
  return path.join(configDir(), 'frontier-presets.' + scope + '.json');
}

/**
 * A saved-preset name: 1-64 chars of [a-z0-9-], starting alphanumeric, and
 * never a built-in preset name or 'custom' (built-ins always win).
 * @param {*} name
 * @param {typeof DEFAULTS} [cfg]
 * @returns {{ ok: true }|{ ok: false, error: string }}
 */
function validateUserPresetName(name, cfg) {
  const c = cfg || DEFAULTS;
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    return { ok: false, error: 'invalid preset name (1-64 chars of a-z, 0-9, -)' };
  }
  const preset = canonicalPresetId(name);
  if (preset === 'custom' || Object.prototype.hasOwnProperty.call(c.presets, preset)) {
    return { ok: false, error: 'name shadows a built-in preset (built-ins always win): ' + name };
  }
  return { ok: true };
}

/**
 * Load saved user presets for a scope. Defensive like _readStateFile:
 * missing/symlink/corrupt/invalid file -> {}. Entries that shadow a
 * built-in, exceed the 8-model cap, or carry unknown models/stages are
 * dropped entry-by-entry so one bad row never poisons the rest.
 * @param {string} [scope]
 * @param {typeof DEFAULTS} [cfg]
 * @returns {Record<string, { models: string[], judge?: string, synth?: string }>}
 */
function loadUserPresets(scope, cfg) {
  const c = cfg || DEFAULTS;
  const p = userPresetsPath(scope);
  let st;
  try { st = fs.lstatSync(p); } catch { return {}; }
  if (st.isSymbolicLink()) return {};
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [name, def] of Object.entries(parsed)) {
    if (!validateUserPresetName(name, c).ok) continue;
    if (!def || typeof def !== 'object') continue;
    if (!Array.isArray(def.models) || def.models.length < 1 || def.models.length > 8) continue;
    const models = def.models.map(canonicalModelId);
    const judge = canonicalModelId(def.judge);
    const synth = canonicalModelId(def.synth);
    if (!models.every(m => validateModel(m, c))) continue;
    if (def.judge !== undefined && !validateModel(judge, c)) continue;
    if (def.synth !== undefined && !validateModel(synth, c)) continue;
    out[name] = {
      models,
      ...(def.judge ? { judge } : {}),
      ...(def.synth ? { synth } : {}),
    };
  }
  return out;
}

/**
 * Validate and persist one saved preset. Never stores anything but model
 * ids — keys/tokens have no path into this file.
 * @param {string} name
 * @param {{ models: string[], judge?: string, synth?: string }} def
 * @param {string} [scope]
 * @param {typeof DEFAULTS} [cfg]
 * @returns {{ ok: true, name: string, path: string }|{ ok: false, error: string }}
 */
function saveUserPreset(name, def, scope, cfg) {
  const c = cfg || DEFAULTS;
  const nameCheck = validateUserPresetName(name, c);
  if (!nameCheck.ok) return nameCheck;
  if (!def || !Array.isArray(def.models) || def.models.length === 0) {
    return { ok: false, error: 'preset requires a non-empty models list (--models a,b,c)' };
  }
  if (def.models.length > 8) return { ok: false, error: 'preset exceeds the 8-model limit' };
  const normalized = {
    models: def.models.map(canonicalModelId),
    ...(def.judge !== undefined ? { judge: canonicalModelId(def.judge) } : {}),
    ...(def.synth !== undefined ? { synth: canonicalModelId(def.synth) } : {}),
  };
  const unknown = normalized.models.filter(m => !validateModel(m, c));
  if (unknown.length > 0) return { ok: false, error: 'unknown model(s): ' + unknown.join(', ') };
  if (normalized.judge !== undefined && !validateModel(normalized.judge, c)) {
    return { ok: false, error: 'unknown judge model: ' + def.judge };
  }
  if (normalized.synth !== undefined && !validateModel(normalized.synth, c)) {
    return { ok: false, error: 'unknown synth model: ' + def.synth };
  }
  const all = loadUserPresets(scope, c);
  all[name] = {
    models: normalized.models,
    ...(normalized.judge ? { judge: normalized.judge } : {}),
    ...(normalized.synth ? { synth: normalized.synth } : {}),
  };
  const p = userPresetsPath(scope);
  return safeWriteJson(p, all)
    ? { ok: true, name, path: p }
    : { ok: false, error: 'failed to write ' + p };
}

/**
 * Delete one saved preset.
 * @param {string} name
 * @param {string} [scope]
 * @returns {{ ok: true }|{ ok: false, error: string }}
 */
function deleteUserPreset(name, scope) {
  const all = loadUserPresets(scope);
  if (!Object.prototype.hasOwnProperty.call(all, name)) {
    return { ok: false, error: 'no saved preset: ' + name };
  }
  delete all[name];
  const p = userPresetsPath(scope);
  return safeWriteJson(p, all) ? { ok: true } : { ok: false, error: 'failed to write ' + p };
}

/**
 * cfg with the scope's saved presets merged UNDER built-ins — spread order
 * makes built-ins always win. resolvePanel/resolveStageModel/validatePreset
 * then resolve saved presets with no signature change: panels land in
 * cfg.presets, judge/synth overrides in cfg.presetStages. Returns cfg
 * unchanged (same reference) when the scope has no saved presets.
 * @param {typeof DEFAULTS} cfg
 * @param {string} [scope]
 * @returns {typeof DEFAULTS}
 */
function withUserPresets(cfg, scope) {
  const user = loadUserPresets(scope, cfg);
  const names = Object.keys(user);
  if (names.length === 0) return cfg;
  const userPanels = {};
  const userStages = {};
  for (const name of names) {
    const def = user[name];
    userPanels[name] = def.models;
    if (def.judge || def.synth) {
      userStages[name] = {
        ...(def.judge ? { judge: def.judge } : {}),
        ...(def.synth ? { synth: def.synth } : {}),
      };
    }
  }
  return {
    ...cfg,
    presets: { ...userPanels, ...cfg.presets },
    presetStages: { ...userStages, ...cfg.presetStages },
  };
}

module.exports = {
  userPresetsPath,
  validateUserPresetName,
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  withUserPresets,
};
