#!/usr/bin/env node
// Maestro Settings — aggregating front-end over the three existing toggle
// stores. Reads and writes terse (config.json terseLevel + live flag),
// frontier (frontier-state.json, via frontier/config.cjs), and context-bar
// (.context-bar-disabled next to the status-line script). It owns no state
// of its own; the existing readers stay the source of truth. Zero deps, CJS.
//
// Hardened I/O (atomic temp+rename, O_NOFOLLOW, 0600, symlink refusal,
// size-capped reads, whitelist validation) is ported from
// frontier/config.cjs and hooks/maestro-terse-mode.cjs. See
// docs/settings-design.md for the full design.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const frontier = require('../frontier/config.cjs');

const TERSE_LEVELS = ['off', 'lite', 'full', 'ultra'];
const FLAG_LEVELS = ['lite', 'full', 'ultra']; // 'off' = remove the flag
const VERIFY_MODES = ['off', 'warn', 'block']; // verify-gate Stop hook
const MAX_CONFIG_BYTES = 1 << 16; // 64 KB cap for config.json / settings.json

// Human labels for model ids. Presentation only — the model SET is always
// sourced from frontier DEFAULTS.adapters so there is one source of truth;
// an id with no label here falls back to the id itself.
const MODEL_LABELS = {
  opus: 'Opus 4.8',
  'gpt-5.5': 'GPT-5.5 (Codex)',
  gemini: 'Gemini 3.1 Pro',
};

// ---------- directory resolvers ----------

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
function terseFlagPath() { return path.join(claudeDir(), '.maestro-terse'); }
function configJsonPath() { return path.join(frontier.configDir(), 'config.json'); }

// ---------- hardened low-level I/O ----------

function safeWrite(targetPath, contents) {
  try {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.lstatSync(dir).isSymbolicLink()) return false; } catch { return false; }
    try {
      if (fs.lstatSync(targetPath).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }
    const tempPath = path.join(dir, '.' + path.basename(targetPath) + '.' + process.pid + '.' + Date.now() + '.tmp');
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(tempPath).isSymbolicLink()) return false; } catch {} }
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, contents);
      try { fs.fchmodSync(fd, 0o600); } catch {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, targetPath);
    return true;
  } catch {
    return false;
  }
}

function safeRead(targetPath, maxBytes) {
  try {
    let st;
    try { st = fs.lstatSync(targetPath); } catch { return null; }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > maxBytes) return null;
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    let fd, out;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(targetPath).isSymbolicLink()) return null; } catch {} }
      fd = fs.openSync(targetPath, fs.constants.O_RDONLY | O_NOFOLLOW);
      const buf = Buffer.alloc(maxBytes);
      const n = fs.readSync(fd, buf, 0, maxBytes, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return out;
  } catch {
    return null;
  }
}

// ---------- terse ----------

function readTerse() {
  const env = String(process.env.MAESTRO_TERSE_LEVEL || '').toLowerCase();
  const envValid = TERSE_LEVELS.includes(env);
  let configLevel = null;
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const c = JSON.parse(raw);
      const v = String((c && c.terseLevel) || '').toLowerCase();
      if (TERSE_LEVELS.includes(v)) configLevel = v;
    } catch {}
  }
  let level, source;
  if (envValid) { level = env; source = 'env'; }
  else if (configLevel) { level = configLevel; source = 'config'; }
  else { level = 'off'; source = 'default'; }
  return { level, source, envOverride: envValid ? env : null, configLevel: configLevel || 'off' };
}

function setTerse(level) {
  const lvl = String(level == null ? '' : level).toLowerCase();
  if (!TERSE_LEVELS.includes(lvl)) {
    return { ok: false, error: 'terse level must be off, lite, full, or ultra' };
  }
  let cfg = {};
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') cfg = parsed;
    } catch {
      return { ok: false, error: 'config.json exists but is not valid JSON; refusing to overwrite it' };
    }
  }
  cfg.terseLevel = lvl;
  if (!safeWrite(configJsonPath(), JSON.stringify(cfg, null, 2))) {
    return { ok: false, error: 'failed to write config.json' };
  }
  if (FLAG_LEVELS.includes(lvl)) safeWrite(terseFlagPath(), lvl);
  else { try { fs.unlinkSync(terseFlagPath()); } catch {} }
  const env = String(process.env.MAESTRO_TERSE_LEVEL || '').toLowerCase();
  const warning = TERSE_LEVELS.includes(env)
    ? 'MAESTRO_TERSE_LEVEL=' + env + ' is set in the environment and overrides this until unset'
    : null;
  return { ok: true, warning };
}

// ---------- context-bar ----------

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p && (p.startsWith('~/') || p.startsWith('~\\'))) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveStatuslineDir() {
  const base = claudeDir();
  const fallback = { dir: path.join(base, 'statusline'), scriptOk: false, resolved: false };
  const raw = safeRead(path.join(base, 'settings.json'), MAX_CONFIG_BYTES);
  if (!raw) return fallback;
  let cmd = null;
  try {
    const s = JSON.parse(raw);
    const sl = s && s.statusLine;
    cmd = typeof sl === 'string' ? sl : (sl && typeof sl === 'object' ? sl.command : null);
  } catch {
    return fallback;
  }
  if (!cmd || typeof cmd !== 'string') return fallback;
  const tokens = cmd.split(/\s+/).map(t => t.replace(/^["']|["']$/g, '')).filter(Boolean);
  let tok = tokens.find(t => /context-bar(\.(ps1|sh|cmd|bat|js|cjs))?$/i.test(path.basename(t)));
  if (!tok) tok = tokens.find(t => /[\\/]/.test(t) || /\.(ps1|sh|cmd|bat|js|cjs)$/i.test(t));
  if (!tok) return fallback;
  const expanded = expandHome(tok);
  return {
    dir: path.dirname(expanded),
    scriptOk: /context-bar/i.test(path.basename(expanded)),
    resolved: true,
  };
}

function readContextBar() {
  const r = resolveStatuslineDir();
  const flag = path.join(r.dir, '.context-bar-disabled');
  let present = false;
  try { present = fs.statSync(flag).isFile(); } catch {}
  return { enabled: !present, dir: r.dir, flagPath: flag, scriptConfirmed: r.scriptOk, resolved: r.resolved };
}

function setContextBar(enabled) {
  const r = resolveStatuslineDir();
  const flag = path.join(r.dir, '.context-bar-disabled');
  if (enabled) {
    try { fs.unlinkSync(flag); } catch {}
  } else {
    if (!safeWrite(flag, '')) return { ok: false, error: 'failed to write context-bar flag at ' + flag };
  }
  const warning = r.scriptOk
    ? null
    : 'could not confirm the status line is the Maestro context bar; using ' + r.dir;
  return { ok: true, warning };
}

// ---------- discipline ----------

// The discipline enforcement-hook pack reads this at runtime; `off` makes
// every hook no-op (see hooks/maestro-discipline-gate.cjs). Stored in
// config.json `discipline` (default ON => key absent). MAESTRO_DISCIPLINE
// overrides the file, mirroring the terse env-override pattern.
function readDiscipline() {
  const env = String(process.env.MAESTRO_DISCIPLINE || '').toLowerCase();
  if (env === 'off' || env === 'false' || env === '0') return { enabled: false, source: 'env' };
  if (env === 'on' || env === 'true' || env === '1') return { enabled: true, source: 'env' };
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const c = JSON.parse(raw);
      if (c && c.discipline === false) return { enabled: false, source: 'config' };
      if (c && c.discipline === true) return { enabled: true, source: 'config' };
    } catch {}
  }
  return { enabled: true, source: 'default' };
}

function setDiscipline(value) {
  const v = typeof value === 'boolean' ? value : String(value == null ? '' : value).toLowerCase();
  let on;
  if (v === true || v === 'on' || v === 'true' || v === '1') on = true;
  else if (v === false || v === 'off' || v === 'false' || v === '0') on = false;
  else return { ok: false, error: 'discipline value must be on or off' };

  let cfg = {};
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') cfg = parsed;
    } catch {
      return { ok: false, error: 'config.json exists but is not valid JSON; refusing to overwrite it' };
    }
  }
  // ON is the default => drop the key so config.json stays minimal; OFF is
  // explicit.
  if (on) delete cfg.discipline; else cfg.discipline = false;
  if (!safeWrite(configJsonPath(), JSON.stringify(cfg, null, 2))) {
    return { ok: false, error: 'failed to write config.json' };
  }
  const env = String(process.env.MAESTRO_DISCIPLINE || '').toLowerCase();
  const warning = ['off', 'on', 'true', 'false', '0', '1'].includes(env)
    ? 'MAESTRO_DISCIPLINE=' + env + ' is set in the environment and overrides this until unset'
    : null;
  return { ok: true, warning };
}

// ---------- verify-gate ----------

// The verify-gate Stop hook (hooks/maestro-verify-gate.cjs) reads this at
// runtime: `warn` (default) nudges, `block` blocks the Stop once, `off`
// disables. Stored in config.json `verifyGate` (default warn => key absent).
// MAESTRO_VERIFY_GATE overrides the file, mirroring the terse/discipline
// env-override pattern; the env value `0` is accepted as an alias for `off`.
function normalizeVerify(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  if (s === '0' || s === 'off' || s === 'false') return 'off';
  if (s === 'warn' || s === 'block') return s;
  return null;
}

function readVerify() {
  const env = normalizeVerify(process.env.MAESTRO_VERIFY_GATE);
  if (env) return { mode: env, source: 'env' };
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const c = JSON.parse(raw);
      const v = normalizeVerify(c && c.verifyGate);
      if (v) return { mode: v, source: 'config' };
    } catch {}
  }
  return { mode: 'warn', source: 'default' };
}

function setVerify(mode) {
  const m = normalizeVerify(mode);
  if (!m) return { ok: false, error: 'verify value must be off, warn, or block' };

  let cfg = {};
  const raw = safeRead(configJsonPath(), MAX_CONFIG_BYTES);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') cfg = parsed;
    } catch {
      return { ok: false, error: 'config.json exists but is not valid JSON; refusing to overwrite it' };
    }
  }
  // warn is the default => drop the key so config.json stays minimal;
  // off/block are explicit.
  if (m === 'warn') delete cfg.verifyGate; else cfg.verifyGate = m;
  if (!safeWrite(configJsonPath(), JSON.stringify(cfg, null, 2))) {
    return { ok: false, error: 'failed to write config.json' };
  }
  const warning = normalizeVerify(process.env.MAESTRO_VERIFY_GATE)
    ? 'MAESTRO_VERIFY_GATE=' + process.env.MAESTRO_VERIFY_GATE + ' is set in the environment and overrides this until unset'
    : null;
  return { ok: true, warning };
}

// ---------- frontier (delegated to frontier/config.cjs) ----------

function readFrontier(scope) { return frontier.loadState(scope); }

function saveFrontier(state, scope) {
  return frontier.saveState(state, scope)
    ? { ok: true, warning: null }
    : { ok: false, error: 'failed to write frontier state' };
}

function setFrontier(spec, opts) {
  opts = opts || {};
  const s = String(spec == null ? '' : spec).trim();
  const idx = s.indexOf(':');
  const head = (idx === -1 ? s : s.slice(0, idx)).toLowerCase();
  const tail = idx === -1 ? '' : s.slice(idx + 1).trim();

  if (head === 'off' || head === '') return saveFrontier({ mode: 'off' }, opts.scope);

  if (head === 'single') {
    const model = (tail || opts.model || '').trim();
    if (!frontier.validateModel(model)) return { ok: false, error: 'unknown model: ' + (model || '(none)') };
    return saveFrontier({ mode: 'single', model }, opts.scope);
  }

  if (head === 'fusion') {
    const preset = (tail || opts.preset || '').trim();
    if (!frontier.validatePreset(preset)) return { ok: false, error: 'unknown preset: ' + (preset || '(none)') };
    const state = { mode: 'fusion', preset };
    if (preset === 'custom') {
      const models = Array.isArray(opts.models)
        ? opts.models
        : String(opts.models || '').split(',').map(m => m.trim()).filter(Boolean);
      if (models.length === 0) return { ok: false, error: 'custom preset requires --models a,b,c' };
      if (models.length > 8) return { ok: false, error: 'custom preset exceeds the 8-model limit' };
      const unknown = models.filter(m => !frontier.validateModel(m));
      if (unknown.length) return { ok: false, error: 'unknown model(s): ' + unknown.join(', ') };
      state.models = models;
    }
    if (opts.judge != null) {
      if (!frontier.validateModel(opts.judge)) return { ok: false, error: 'unknown judge model: ' + opts.judge };
      state.judgeModel = opts.judge;
    }
    if (opts.synth != null) {
      if (!frontier.validateModel(opts.synth)) return { ok: false, error: 'unknown synth model: ' + opts.synth };
      state.synthModel = opts.synth;
    }
    return saveFrontier(state, opts.scope);
  }

  return { ok: false, error: 'frontier value must be off, single:<model>, or fusion:<preset>' };
}

// ---------- aggregate ----------

function readAll(scope) {
  return {
    terse: readTerse(),
    frontier: readFrontier(scope),
    contextBar: readContextBar(),
    discipline: readDiscipline(),
    verify: readVerify(),
  };
}

// The available-values catalog: every toggle value a picker can offer. The
// frontier model/preset SET is sourced from frontier DEFAULTS so there is no
// second list to drift; `custom` is the one preset value frontier accepts
// that is not a DEFAULTS preset (validatePreset special-cases it).
function catalog() {
  const cfg = frontier.DEFAULTS;
  const models = Object.keys(cfg.adapters).map(id => ({ id, label: MODEL_LABELS[id] || id }));
  const presets = Object.keys(cfg.presets).map(id => ({ id, models: cfg.presets[id].slice() }));
  presets.push({ id: 'custom', models: null });
  return {
    terse: { key: 'terse', values: TERSE_LEVELS.slice() },
    frontier: {
      modes: ['off', 'single', 'fusion'],
      models,
      presets,
      stageModels: models.map(m => m.id),
      defaults: { judge: cfg.judgeModel, synth: cfg.synthModel },
      presetStages: cfg.presetStages || {},
    },
    contextBar: { key: 'context-bar', values: ['on', 'off'] },
    discipline: { key: 'discipline', values: ['on', 'off'] },
    verify: { key: 'verify', values: VERIFY_MODES.slice() },
  };
}

function setKey(key, value, opts) {
  const k = String(key == null ? '' : key).toLowerCase();
  if (k === 'terse') return setTerse(value);
  if (k === 'frontier') return setFrontier(value, opts);
  if (k === 'context-bar' || k === 'contextbar' || k === 'bar') {
    const v = String(value == null ? '' : value).toLowerCase();
    if (v !== 'on' && v !== 'off') return { ok: false, error: 'context-bar value must be on or off' };
    return setContextBar(v === 'on');
  }
  if (k === 'discipline') {
    const v = String(value == null ? '' : value).toLowerCase();
    if (v !== 'on' && v !== 'off') return { ok: false, error: 'discipline value must be on or off' };
    return setDiscipline(v === 'on');
  }
  if (k === 'verify' || k === 'verify-gate' || k === 'verifygate') return setVerify(value);
  return { ok: false, error: 'unknown key: ' + key + ' (use terse, frontier, context-bar, discipline, or verify)' };
}

module.exports = {
  TERSE_LEVELS,
  VERIFY_MODES,
  claudeDir,
  terseFlagPath,
  configJsonPath,
  resolveStatuslineDir,
  readTerse,
  setTerse,
  readFrontier,
  setFrontier,
  readContextBar,
  setContextBar,
  readDiscipline,
  setDiscipline,
  readVerify,
  setVerify,
  readAll,
  catalog,
  setKey,
};
