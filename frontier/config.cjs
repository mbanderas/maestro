#!/usr/bin/env node
// Maestro Frontier — config defaults + state persistence.
// Zero deps, CJS. configDir + safeWriteFlag patterns ported from
// hooks/maestro-terse-mode.cjs. tokenBudget=0 means budget abort
// DISABLED (opt-in feature; set to a positive integer to enable).

'use strict';

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

function statePath() {
  return path.join(configDir(), 'frontier-state.json');
}

// ---------- state I/O ----------

function loadState() {
  try {
    const p = statePath();
    let st;
    try { st = fs.lstatSync(p); } catch { return { mode: 'off' }; }
    if (st.isSymbolicLink()) return { mode: 'off' };
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
 * Atomic temp+rename write, 0600, symlink-refusing.
 * Ported from safeWriteFlag in hooks/maestro-terse-mode.cjs.
 * @param {object} state
 * @returns {boolean}
 */
function saveState(state) {
  try {
    const p = statePath();
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
  statePath,
  loadState,
  saveState,
  resolvePanel,
  resolveJudgeModel,
  resolveSynthModel,
  validateMode,
  validatePreset,
  validateModel,
};
