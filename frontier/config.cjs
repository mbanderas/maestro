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

/**
 * Resolve the active scope from argv + environment. Precedence:
 *   1. --scope <value> flag in argv
 *   2. process.env.MAESTRO_SCOPE
 *   3. Autodetect: CLAUDE_PLUGIN_ROOT || CLAUDECODE truthy -> 'cc-<8hex>'
 *      where <8hex> is derived from the workspace root (opts.cwd,
 *      CLAUDE_PROJECT_DIR, or process.cwd()) via workspaceHash().
 *   4. 'default'
 * The chosen value for steps 1-2 is always passed through sanitizeScope.
 * @param {string[]} argv
 * @param {{ cwd?: string }} [opts]
 * @returns {string}
 */
function resolveScope(argv, opts) {
  const flagVal = getFlag(argv, '--scope');
  if (flagVal !== null) return sanitizeScope(flagVal);
  if (process.env.MAESTRO_SCOPE) return sanitizeScope(process.env.MAESTRO_SCOPE);
  if (process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDECODE) {
    const cwd = (opts && opts.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    return 'cc-' + workspaceHash(cwd);
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
 * D3 MIGRATION: if scope !== 'default' and scope does NOT match /^cc-/
 * and the scoped file does NOT exist AND the legacy frontier-state.json
 * DOES exist, seed from the legacy file (read-only — never write during
 * load). Same symlink/parse guards apply. cc-* scopes are excluded from
 * migration because they are per-workspace and must not inherit global
 * legacy state. Named scopes (e.g. 'codex', 'cursor') still migrate.
 * Falls back to {mode:'off'} on any failure.
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {object}
 */
function loadState(scope) {
  if (scope === undefined) scope = resolveScope([]);
  try {
    const p = statePath(scope);
    const result = _readStateFile(p);
    if (result !== null) return result;

    // File absent. For non-default, non-cc-* scopes attempt migration from legacy file.
    if (scope !== 'default' && !/^cc-/.test(scope)) {
      const legacyResult = _readStateFile(legacyStatePath());
      if (legacyResult !== null) return legacyResult;
    }

    return { mode: 'off' };
  } catch {
    return { mode: 'off' };
  }
}

/**
 * Atomic temp+rename write, 0600, symlink-refusing.
 * Ported from safeWriteFlag in hooks/maestro-terse-mode.cjs.
 * @param {object} state
 * @param {string} [scope] Omit to autodetect the runtime scope via resolveScope([]).
 * @returns {boolean}
 */
function saveState(state, scope) {
  if (scope === undefined) scope = resolveScope([]);
  try {
    const p = statePath(scope);
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.lstatSync(dir).isSymbolicLink()) return false; } catch { return false; }
    try {
      if (fs.lstatSync(p).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }
    const tempPath = path.join(dir, `.frontier-state.${process.pid}.${Date.now()}.tmp`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) {
        try { if (fs.lstatSync(tempPath).isSymbolicLink()) return false; } catch {}
      }
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, JSON.stringify(state));
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

const DEFAULTS = {
  adapters: {
    opus: {
      model: 'opus',
      bin: process.env.MAESTRO_CLAUDE_BIN || 'claude',
      baseArgs: ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'claude-json',
    },
    'gpt-5.5': {
      model: 'gpt-5.5',
      bin: process.env.MAESTRO_CODEX_BIN || 'codex',
      baseArgs: [
        'exec',
        '--skip-git-repo-check',
        '--dangerously-bypass-approvals-and-sandbox',
        '-m', 'gpt-5.5',
        '--color', 'never',
      ],
      promptVia: 'stdin',
      webTools: true,
      output: 'last-message-file',
      parse: 'text',
    },
    gemini: {
      model: 'gemini',
      bin: process.env.MAESTRO_GEMINI_BIN || 'gemini',
      baseArgs: [
        '--output-format', 'json',
        '--approval-mode', 'yolo',
        '--model', 'gemini-3.1-pro-preview',
      ],
      promptVia: 'arg',
      promptFlag: '-p',
      webTools: false,
      output: 'stdout',
      parse: 'gemini-json',
    },
  },
  presets: {
    'opus-duo': ['opus', 'opus'],
    'opus-gpt': ['opus', 'gpt-5.5'],
    'gpt-duo': ['gpt-5.5', 'gpt-5.5'],
    'frontier-trio': ['opus', 'gpt-5.5', 'gemini'],
  },
  // Per-preset judge/synth model overrides. A preset listed here runs its
  // judge + synthesizer on the named model instead of the global default
  // below; this is what lets gpt-duo run end-to-end on Codex alone (no
  // claude). Presets NOT listed use judgeModel/synthModel. An explicit
  // --judge/--synth flag (state.judgeModel/synthModel) overrides both.
  presetStages: {
    'gpt-duo': { judge: 'gpt-5.5', synth: 'gpt-5.5' },
  },
  judgeModel: 'opus',
  synthModel: 'opus',
  concurrency: 4,
  timeoutMs: 180000,
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
  if (state.preset === 'custom') {
    const models = state.models;
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
  const resolved = cfg.presets[state.preset];
  if (!resolved) {
    throw new Error('resolvePanel: unknown preset: ' + state.preset);
  }
  return resolved;
}

/**
 * Resolve the judge or synth model for a fusion state. Precedence:
 * explicit flag (state.judgeModel/synthModel) -> per-preset override
 * (cfg.presetStages) -> global default (cfg.judgeModel/synthModel).
 * @param {'judge'|'synth'} stage
 * @param {object} state
 * @param {typeof DEFAULTS} cfg
 * @returns {string}
 */
function resolveStageModel(stage, state, cfg) {
  const explicit = stage === 'judge' ? state.judgeModel : state.synthModel;
  if (explicit) return explicit;
  const ps = cfg.presetStages && cfg.presetStages[state.preset];
  if (ps && ps[stage]) return ps[stage];
  return stage === 'judge' ? cfg.judgeModel : cfg.synthModel;
}

/** @param {object} state @param {typeof DEFAULTS} cfg @returns {string} */
function resolveJudgeModel(state, cfg) {
  return resolveStageModel('judge', state, cfg);
}

/** @param {object} state @param {typeof DEFAULTS} cfg @returns {string} */
function resolveSynthModel(state, cfg) {
  return resolveStageModel('synth', state, cfg);
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
  return p === 'custom' || Object.prototype.hasOwnProperty.call(c.presets, p);
}

/**
 * @param {string} m
 * @param {typeof DEFAULTS} [cfg]
 * @returns {boolean}
 */
function validateModel(m, cfg) {
  const c = cfg || DEFAULTS;
  return Object.prototype.hasOwnProperty.call(c.adapters, m);
}

module.exports = {
  DEFAULTS,
  configDir,
  sanitizeScope,
  workspaceHash,
  resolveScope,
  statePath,
  legacyStatePath,
  loadState,
  saveState,
  adoptLegacyState,
  resolvePanel,
  resolveJudgeModel,
  resolveSynthModel,
  validateMode,
  validatePreset,
  validateModel,
};
