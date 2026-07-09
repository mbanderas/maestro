#!/usr/bin/env node
// Maestro Frontier — config defaults + state persistence.
// Zero deps, CJS. configDir + safeWriteFlag patterns ported from
// hooks/maestro-terse-mode.cjs. tokenBudget=0 means budget abort
// DISABLED (opt-in feature; set to a positive integer to enable).

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildRuntimeCatalog,
  canonicalModelId,
  canonicalPresetId,
  normalizeStateAliases,
} = require('./catalog.cjs');

// ---------- configDir (ported from maestro-terse-mode.cjs) ----------

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'maestro');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'maestro');
  }
  return path.join(os.homedir(), '.config', 'maestro');
}

// ---------- arg helper (used by resolveScope) ----------

/**
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string|null}
 */
function getFlag(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

// ---------- workspace hash ----------

/**
 * Derive a stable 8-hex workspace identifier from cwd by walking up to the
 * nearest .git root, normalizing the path, and hashing it.
 * On win32 the path is lowercased (filesystem is case-insensitive).
 * @param {string} cwd
 * @returns {string} 8 hex characters
 */
function workspaceHash(cwd) {
  let normalized = path.resolve(cwd);
  let last = null;
  while (normalized !== last && !fs.existsSync(path.join(normalized, '.git'))) {
    last = normalized;
    normalized = path.dirname(normalized);
  }
  if (process.platform === 'win32') {
    normalized = normalized.replace(/\\/g, '/').toLowerCase().replace(/\/+$/g, '');
  } else {
    normalized = normalized.replace(/\\/g, '/').replace(/\/+$/g, '');
  }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

// ---------- scope helpers ----------

/**
 * Sanitize a raw scope value: lowercase, strip non-[a-z0-9-] chars entirely,
 * then return 'default' if the result is empty.
 * Examples: 'Foo' -> 'foo', 'a b!c' -> 'abc', '' -> 'default'.
 * @param {*} v
 * @returns {string}
 */
function sanitizeScope(v) {
  const s = String(v).toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s.length > 0 ? s : 'default';
}

function workspaceCwd(opts) {
  return (opts && opts.cwd) || process.env.CLAUDE_PROJECT_DIR || process.env.CODEX_PROJECT_DIR || process.cwd();
}

function resolveScopeAlias(scope, opts) {
  const clean = sanitizeScope(scope);
  if (['codex-project', 'codex-workspace', 'codex-repo'].includes(clean)) {
    return 'codex-' + workspaceHash(workspaceCwd(opts));
  }
  if (['claude-project', 'claude-workspace', 'cc-project', 'cc-workspace'].includes(clean)) {
    return 'cc-' + workspaceHash(workspaceCwd(opts));
  }
  return clean;
}

/**
 * Resolve the active scope from argv + environment. Precedence:
 *   1. --scope <value> flag in argv
 *   2. process.env.MAESTRO_SCOPE
 *   3. Autodetect: PLUGIN_ROOT truthy -> 'codex-<8hex>'
 *   4. Autodetect: CLAUDE_PLUGIN_ROOT || CLAUDECODE truthy -> 'cc-<8hex>'
 *   5. Autodetect: PLUGIN_DATA truthy -> 'codex-<8hex>'
 *      where <8hex> is derived from the workspace root (opts.cwd,
 *      CLAUDE_PROJECT_DIR, CODEX_PROJECT_DIR, or process.cwd()) via
 *      workspaceHash().
 *   6. 'default'
 * The chosen value for steps 1-2 is sanitized, and project aliases such as
 * codex-project/codex-workspace are expanded to per-workspace scopes.
 * @param {string[]} argv
 * @param {{ cwd?: string }} [opts]
 * @returns {string}
 */
function resolveScope(argv, opts) {
  const flagVal = getFlag(argv, '--scope');
  if (flagVal !== null) return resolveScopeAlias(flagVal, opts);
  if (process.env.MAESTRO_SCOPE) return resolveScopeAlias(process.env.MAESTRO_SCOPE, opts);
  if (process.env.PLUGIN_ROOT) {
    return 'codex-' + workspaceHash(workspaceCwd(opts));
  }
  if (process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDECODE) {
    return 'cc-' + workspaceHash(workspaceCwd(opts));
  }
  if (process.env.PLUGIN_DATA) {
    return 'codex-' + workspaceHash(workspaceCwd(opts));
  }
  return 'default';
}

// ---------- path helpers ----------

/** Pre-scope global state file; migration source only, never written/deleted. */
function legacyStatePath() {
  return path.join(configDir(), 'frontier-state.json');
}

/**
 * Scope-aware state path.
 * scope === 'default' => frontier-state.json (legacy-compatible, no suffix).
 * Any other scope => frontier-state.<scope>.json.
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {string}
 */
function statePath(scope) {
  if (scope === undefined) scope = resolveScope([]);
  else scope = resolveScopeAlias(scope);
  if (scope === 'default') return path.join(configDir(), 'frontier-state.json');
  return path.join(configDir(), 'frontier-state.' + scope + '.json');
}

// ---------- state I/O ----------

/**
 * Read and validate a state file. Returns:
 *   - null if the file is absent (ENOENT) — caller decides the fallback.
 *   - {mode:'off'} on symlink, corrupt JSON, or invalid mode.
 *   - parsed object on success.
 * @param {string} p
 * @returns {object|null}
 */
function _readStateFile(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return null; }
  if (st.isSymbolicLink()) return { mode: 'off' };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { mode: 'off' };
    if (!['off', 'single', 'fusion'].includes(parsed.mode)) return { mode: 'off' };
    return parsed;
  } catch {
    return { mode: 'off' };
  }
}

/**
 * Strict state read for explicit adoption paths. Unlike _readStateFile, this
 * distinguishes invalid legacy content from a valid {mode:'off'} state.
 * @param {string} p
 * @returns {{ ok: true, state: object }|{ ok: false, reason: 'missing'|'invalid' }}
 */
function _readValidatedStateFile(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return { ok: false, reason: 'missing' }; }
  if (st.isSymbolicLink()) return { ok: false, reason: 'invalid' };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'invalid' };
    if (!['off', 'single', 'fusion'].includes(parsed.mode)) return { ok: false, reason: 'invalid' };
    return { ok: true, state: parsed };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Load frontier state for the given scope.
 * D3 MIGRATION: if scope !== 'default' and scope does NOT match /^(cc|codex)-/
 * and the scoped file does NOT exist AND the legacy frontier-state.json
 * DOES exist, seed from the legacy file (read-only — never write during
 * load). Same symlink/parse guards apply. cc-* and codex-* scopes are
 * excluded from migration because they are per-workspace and must not inherit
 * global legacy state. Named scopes (e.g. 'codex', 'cursor') still migrate.
 * Falls back to {mode:'off'} on any failure.
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {object}
 */
function loadState(scope) {
  if (scope === undefined) scope = resolveScope([]);
  else scope = resolveScopeAlias(scope);
  try {
    const p = statePath(scope);
    const result = _readStateFile(p);
    if (result !== null) return normalizeStateAliases(result);

    // File absent. For non-default, non-workspace scopes attempt migration from legacy file.
    if (scope !== 'default' && !/^(cc|codex)-/.test(scope)) {
      const legacyResult = _readStateFile(legacyStatePath());
      if (legacyResult !== null) return normalizeStateAliases(legacyResult);
    }

    return { mode: 'off' };
  } catch {
    return { mode: 'off' };
  }
}

/**
 * Atomic temp+rename JSON write, 0600, symlink-refusing — the single write
 * pattern for every file under configDir() (state here, saved presets in
 * presets.cjs). Ported from safeWriteFlag in hooks/maestro-terse-mode.cjs.
 * @param {string} p absolute target path
 * @param {object} obj
 * @returns {boolean}
 */
function safeWriteJson(p, obj) {
  try {
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.lstatSync(dir).isSymbolicLink()) return false; } catch { return false; }
    try {
      if (fs.lstatSync(p).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }
    const tempPath = path.join(dir, `.${path.basename(p)}.${process.pid}.${Date.now()}.tmp`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) {
        try { if (fs.lstatSync(tempPath).isSymbolicLink()) return false; } catch {}
      }
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, JSON.stringify(obj));
      try { fs.fchmodSync(fd, 0o600); } catch {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, p);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} state
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {boolean}
 */
function saveState(state, scope) {
  if (scope === undefined) scope = resolveScope([]);
  else scope = resolveScopeAlias(scope);
  return safeWriteJson(statePath(scope), normalizeStateAliases(state));
}

/**
 * Explicitly adopt the validated legacy frontier-state.json into a cc-* scope.
 * This copies legacy content into frontier-state.<cc-scope>.json only, never
 * deletes legacy, and refuses to overwrite an existing scoped file unless
 * opts.force is true.
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @param {{ force?: boolean }} [opts]
 * @returns {{ ok: true, scope: string, path: string }|{ ok: false, reason: string, scope: string, path?: string }}
 */
function adoptLegacyState(scope, opts) {
  if (scope === undefined) scope = resolveScope([]);
  const targetScope = sanitizeScope(scope);
  const targetPath = statePath(targetScope);
  if (!/^cc-/.test(targetScope)) {
    return { ok: false, reason: 'not-cc-scope', scope: targetScope, path: targetPath };
  }

  const legacy = _readValidatedStateFile(legacyStatePath());
  if (!legacy.ok) {
    return {
      ok: false,
      reason: legacy.reason === 'missing' ? 'missing-legacy' : 'invalid-legacy',
      scope: targetScope,
      path: targetPath,
    };
  }

  try {
    const st = fs.lstatSync(targetPath);
    if (st.isSymbolicLink()) return { ok: false, reason: 'unsafe-target', scope: targetScope, path: targetPath };
    if (!(opts && opts.force)) return { ok: false, reason: 'exists', scope: targetScope, path: targetPath };
  } catch (e) {
    if (e.code !== 'ENOENT') return { ok: false, reason: 'unsafe-target', scope: targetScope, path: targetPath };
  }

  if (!saveState(legacy.state, targetScope)) {
    return { ok: false, reason: 'write-failed', scope: targetScope, path: targetPath };
  }
  return { ok: true, scope: targetScope, path: targetPath };
}

// ---------- DEFAULTS ----------

const RUNTIME_CATALOG = buildRuntimeCatalog();

const DEFAULTS = {
  // Model metadata, spawn adapters, and built-in stage/preset maps are all
  // catalog-owned. `models` is display-safe; adapters are launch-ready only
  // for configured optional Codex model ids.
  models: RUNTIME_CATALOG.models,
  adapters: RUNTIME_CATALOG.adapters,
  presets: RUNTIME_CATALOG.presets,
  presetStages: RUNTIME_CATALOG.presetStages,
  judgeModel: 'opus',
  synthModel: 'opus',
  // Opt-in (default OFF = fixed synthesizer). When true, the synth stage may be
  // re-assigned to a task-matched model named by the analysis (Analysis.synth_hint),
  // ranking just above the global default — see resolveStageModel.
  analysisSynthSelect: false,
  // Per-step adaptive routing (opt-in, default OFF = routing locked to preset/default).
  // When true, each pipeline stage (judge, synth) re-resolves its model from the dated
  // stage-affinity table below — a HINT, not a rule. Ranks below explicit flags, preset
  // overrides, and the analysis synth-hint; above the global default.
  perStepRouting: false,
  // Dated capability-affinity hints (2026-06; EDIT FREELY — these rot at model releases).
  // Stage -> preferred model; null = no hint (fall through). Hint only, never a rule.
  stageAffinity: { judge: null, synth: null },
  // Opt-in (default OFF). When true, a scored dead-end (judge.isDeadEnd) escalates to a
  // FRESH adapter given a clean-slate reframing brief — a different perspective, not a
  // same-agent retry — before the passive longest-response fallback. See run.cjs.
  deadEndEscalation: false,
  concurrency: 4,
  timeoutMs: 180000,
  // Whole-run wall-clock budget. Two invariants hold the pipeline together:
  // (1) runBudgetMs < the autorun hook timeout (hooks/hooks.json, 600s) minus
  //     a relay buffer, so the engine degrades gracefully inside the window
  //     instead of the host killing the hook and discarding all output;
  // (2) per-stage timeoutMs stays < the statusline progress-file staleness
  //     window (300s, statusline/context-bar.mjs) or the live bar blanks
  //     mid-stage. Non-finite/<=0 disables the budget (per-stage timeouts only).
  runBudgetMs: 540000,
  // tokenBudget=0 means budget abort DISABLED (opt-in).
  // Set to a positive integer (e.g. 50000) to enable hard budget cutoff.
  tokenBudget: 0,
  excluded_domains: [],
};

// ---------- resolution helpers ----------

/**
 * @param {object} state
 * @param {typeof DEFAULTS} cfg
 * @returns {string[]}
 */
function resolvePanel(state, cfg) {
  const preset = canonicalPresetId(state.preset);
  if (preset === 'custom') {
    const models = Array.isArray(state.models) ? state.models.map(canonicalModelId) : state.models;
    if (!Array.isArray(models) || models.length === 0) {
      throw new Error('resolvePanel: custom preset requires a non-empty models array');
    }
    if (models.length > 8) {
      throw new Error('resolvePanel: custom preset exceeds 8-model limit');
    }
    const unknown = models.filter(m => !cfg.adapters[m]);
    if (unknown.length > 0) {
      throw new Error('resolvePanel: unknown model(s): ' + unknown.join(', '));
    }
    return models;
  }
  const resolved = cfg.presets[preset];
  if (!resolved) {
    throw new Error('resolvePanel: unknown preset: ' + preset);
  }
  return resolved;
}

/**
 * Resolve the judge or synth model for a fusion state. Precedence:
 * explicit flag (state.judgeModel/synthModel) -> per-preset override
 * (cfg.presetStages) -> task-matched analysis hint (synth only, opt-in via
 * cfg.analysisSynthSelect) -> per-step stage-affinity hint (opt-in via
 * cfg.perStepRouting) -> global default (cfg.judgeModel/synthModel).
 * @param {'judge'|'synth'} stage
 * @param {object} state
 * @param {typeof DEFAULTS} cfg
 * @param {import('./schema.cjs').Analysis} [analysis] synth-stage task crux
 * @returns {string}
 */
function resolveStageModel(stage, state, cfg, analysis) {
  const explicit = canonicalModelId(stage === 'judge' ? state.judgeModel : state.synthModel);
  if (explicit) return explicit;
  const ps = cfg.presetStages && cfg.presetStages[canonicalPresetId(state.preset)];
  if (ps && ps[stage]) return ps[stage];
  if (stage === 'synth' && cfg.analysisSynthSelect && analysis &&
      typeof analysis.synth_hint === 'string' &&
      Object.prototype.hasOwnProperty.call(cfg.adapters, analysis.synth_hint)) {
    return analysis.synth_hint;
  }
  if (cfg.perStepRouting && cfg.stageAffinity) {
    const hint = cfg.stageAffinity[stage];
    if (typeof hint === 'string' &&
        Object.prototype.hasOwnProperty.call(cfg.adapters, hint)) {
      return hint;
    }
  }
  return stage === 'judge' ? cfg.judgeModel : cfg.synthModel;
}

/** @param {object} state @param {typeof DEFAULTS} cfg @returns {string} */
function resolveJudgeModel(state, cfg) {
  return resolveStageModel('judge', state, cfg);
}

/** @param {object} state @param {typeof DEFAULTS} cfg @param {import('./schema.cjs').Analysis} [analysis] @returns {string} */
function resolveSynthModel(state, cfg, analysis) {
  return resolveStageModel('synth', state, cfg, analysis);
}

/** @param {string} m @returns {boolean} */
function validateMode(m) {
  return ['off', 'single', 'fusion'].includes(m);
}

/**
 * @param {string} p
 * @param {typeof DEFAULTS} [cfg]
 * @returns {boolean}
 */
function validatePreset(p, cfg) {
  const c = cfg || DEFAULTS;
  const preset = canonicalPresetId(p);
  return preset === 'custom' || Object.prototype.hasOwnProperty.call(c.presets, preset);
}

/**
 * @param {string} m
 * @param {typeof DEFAULTS} [cfg]
 * @returns {boolean}
 */
function validateModel(m, cfg) {
  const c = cfg || DEFAULTS;
  return Object.prototype.hasOwnProperty.call(c.adapters, canonicalModelId(m));
}

/**
 * The distinct adapter ids a run/arm actually invokes: [model] for single
 * mode, panel + judge + synth for fusion, [] otherwise. Best-effort — returns
 * [] rather than throwing on an unresolvable state, since its only consumer is
 * the (non-blocking) cost advisory, never a gate.
 * @param {object} state
 * @param {typeof DEFAULTS} cfg
 * @returns {string[]}
 */
function resolveRunModels(state, cfg) {
  if (!state) return [];
  if (state.mode === 'single') return state.model ? [canonicalModelId(state.model)] : [];
  if (state.mode === 'fusion') {
    try {
      return [
        ...resolvePanel(state, cfg),
        resolveStageModel('judge', state, cfg),
        resolveStageModel('synth', state, cfg),
      ];
    } catch { return []; }
  }
  return [];
}

/**
 * Soft, non-blocking cost advisory for a resolved run. Returns a one-line
 * `[frontier] ...` string when any distinct member (panel + judge + synth) is a
 * `subscription-until` adapter whose `freeUntil` cutoff has passed, else null.
 * Pure and clock-injectable so it can be unit-tested deterministically. This
 * never gates a run — the caller emits it to stderr and continues.
 * @param {string[]} models resolved member ids (panel + judge + synth)
 * @param {typeof DEFAULTS} cfg
 * @param {Date} [now]
 * @returns {string|null}
 */
function costAdvisory(models, cfg, now = new Date()) {
  const flagged = [...new Set(models)].filter(m => {
    const a = cfg.adapters[m];
    return a && a.costTier === 'subscription-until' && a.freeUntil &&
           now >= new Date(a.freeUntil + 'T00:00:00Z');
  });
  if (flagged.length === 0) return null;
  return `[frontier] ${flagged.join(', ')} draws Usage Credits after ` +
         `${cfg.adapters[flagged[0]].freeUntil} (subscription no longer covers it) ` +
         `and burns usage faster than Opus 4.8.`;
}

/**
 * Compose resolveRunModels + costAdvisory for a run/arm state — the single
 * entry point every call site uses (autorun, cli run/mode, settings). The clock
 * defaults to now, overridable via MAESTRO_FRONTIER_NOW (ISO date) so an
 * operator can preview the post-cutoff advisory and the integration boundary is
 * deterministically testable. Returns the one-line advisory string, or null.
 * @param {object} state
 * @param {typeof DEFAULTS} cfg
 * @param {Date} [now]
 * @returns {string|null}
 */
function runCostAdvisory(state, cfg, now) {
  let clock = now;
  if (!clock) {
    const override = process.env.MAESTRO_FRONTIER_NOW;
    const parsed = override ? new Date(override) : null;
    clock = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  }
  return costAdvisory(resolveRunModels(state, cfg), cfg, clock);
}

module.exports = {
  DEFAULTS,
  configDir,
  sanitizeScope,
  workspaceHash,
  resolveScope,
  resolveScopeAlias,
  statePath,
  legacyStatePath,
  loadState,
  saveState,
  safeWriteJson,
  adoptLegacyState,
  resolvePanel,
  resolveJudgeModel,
  resolveSynthModel,
  validateMode,
  validatePreset,
  validateModel,
  costAdvisory,
  runCostAdvisory,
};
