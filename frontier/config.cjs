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
    if (result !== null) return result;

    // File absent. For non-default, non-workspace scopes attempt migration from legacy file.
    if (scope !== 'default' && !/^(cc|codex)-/.test(scope)) {
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
  else scope = resolveScopeAlias(scope);
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
  // READ-ONLY PANEL INVARIANT (load-bearing): a panel/judge/synth member's
  // ONLY consumed output is its stdout text (run.cjs fuses text, never
  // filesystem changes). So every adapter MUST spawn read-only — any file
  // write or shell mutation a member makes is unconsumed side-effect that
  // races the host session. This is the documented contract in
  // commands/frontier.md "Concurrency" and runlock.cjs; these flags ENFORCE
  // it. Do NOT restore a write/bypass flag (--dangerously-skip-permissions,
  // --dangerously-bypass-approvals-and-sandbox, --approval-mode yolo): that
  // turns each member into a rogue parallel write-loop on an agentic prompt
  // (the S10-forbidden "loops never spawn loops" state). Each mode below is
  // the per-CLI read-only-but-non-interactive setting:
  //   claude  --permission-mode plan        (reads + read-only shell, no edits)
  //   codex   --sandbox read-only + --ask-for-approval never (default sandbox)
  //   gemini  --approval-mode plan          (read-only tool mode)
  adapters: {
    opus: {
      model: 'opus',
      bin: process.env.MAESTRO_CLAUDE_BIN || 'claude',
      baseArgs: ['-p', '--output-format', 'json', '--permission-mode', 'plan'],
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
        '--sandbox', 'read-only',
        '--ask-for-approval', 'never',
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
        '--approval-mode', 'plan',
        '--model', 'gemini-3.1-pro-preview',
      ],
      promptVia: 'arg',
      promptFlag: '-p',
      webTools: false,
      output: 'stdout',
      parse: 'gemini-json',
    },
    // Fable 5 and Sonnet 5 ride the same read-only `claude` CLI as opus, so
    // they MUST pin --model explicitly — otherwise all three claude adapters
    // resolve to the bare-`claude` default (verified Opus-class 2026-07-02) and
    // panel diversity silently collapses. Full model IDs are the durable form
    // (the CLI also accepts short aliases). Reuse parse:'claude-json'.
    fable: {
      model: 'fable',
      bin: process.env.MAESTRO_CLAUDE_BIN || 'claude',
      baseArgs: ['-p', '--output-format', 'json', '--permission-mode', 'plan', '--model', 'claude-fable-5'],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'claude-json',
      // Soft cost metadata (no pricing table / hard gate — see costAdvisory).
      // Subscription covers Fable 5 (<=50% weekly limit) only through freeUntil;
      // on/after that date it draws Usage Credits and burns usage faster than
      // Opus 4.8. Surfaced as a non-blocking run-time advisory, never enforced.
      costTier: 'subscription-until',
      freeUntil: '2026-07-07',
    },
    'sonnet-5': {
      model: 'sonnet-5',
      bin: process.env.MAESTRO_CLAUDE_BIN || 'claude',
      baseArgs: ['-p', '--output-format', 'json', '--permission-mode', 'plan', '--model', 'claude-sonnet-5'],
      promptVia: 'stdin',
      webTools: false,
      output: 'stdout',
      parse: 'claude-json',
    },
  },
  presets: {
    'opus-duo': ['opus', 'opus'],
    'opus-gpt': ['opus', 'gpt-5.5'],
    'gpt-duo': ['gpt-5.5', 'gpt-5.5'],
    'frontier-trio': ['opus', 'gpt-5.5', 'gemini'],
    'fable-duo': ['fable', 'fable'],
    'fable-gpt': ['fable', 'gpt-5.5'],
    'fable-trio': ['fable', 'gpt-5.5', 'gemini'],
    'sonnet-duo': ['sonnet-5', 'sonnet-5'],
    'sonnet-gpt': ['sonnet-5', 'gpt-5.5'],
    'sonnet-trio': ['sonnet-5', 'gpt-5.5', 'gemini'],
    // frontier-quint (5 members) <= the 8-model resolvePanel cap; 3 members
    // (fable/opus/sonnet-5) share the claude CLI, fanned under concurrency:4.
    'frontier-quad': ['fable', 'opus', 'gpt-5.5', 'gemini'],
    'frontier-quint': ['fable', 'opus', 'sonnet-5', 'gpt-5.5', 'gemini'],
  },
  // Per-preset judge/synth model overrides. A preset listed here runs its
  // judge + synthesizer on the named model instead of the global default
  // below; this is what lets gpt-duo run end-to-end on Codex alone (no
  // claude). Presets NOT listed use judgeModel/synthModel. An explicit
  // --judge/--synth flag (state.judgeModel/synthModel) overrides both.
  presetStages: {
    'gpt-duo': { judge: 'gpt-5.5', synth: 'gpt-5.5' },
    // Family presets self-judge/synth (mirrors gpt-duo): fable-* on Fable,
    // sonnet-* on Sonnet 5 — keeps each family's fusion runnable end-to-end
    // on its own model. frontier-quad/quint are intentionally omitted so they
    // fall through to the global opus judge/synth (Fable/Sonnet stay panelists).
    'fable-duo': { judge: 'fable', synth: 'fable' },
    'fable-gpt': { judge: 'fable', synth: 'fable' },
    'fable-trio': { judge: 'fable', synth: 'fable' },
    'sonnet-duo': { judge: 'sonnet-5', synth: 'sonnet-5' },
    'sonnet-gpt': { judge: 'sonnet-5', synth: 'sonnet-5' },
    'sonnet-trio': { judge: 'sonnet-5', synth: 'sonnet-5' },
  },
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
  const explicit = stage === 'judge' ? state.judgeModel : state.synthModel;
  if (explicit) return explicit;
  const ps = cfg.presetStages && cfg.presetStages[state.preset];
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
  costAdvisory,
};
