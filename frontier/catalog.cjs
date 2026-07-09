#!/usr/bin/env node
// Maestro Frontier — built-in model/preset catalog.
//
// Runtime adapters are derived here so roster, CLI validation, dispatch, and
// future composition code share one source of truth. Optional Codex models
// become selectable only when their explicit model-id setting is present.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MODEL_ALIASES = Object.freeze({
  chatgpt: 'gpt-5.5',
});

const PRESET_ALIASES = Object.freeze({
  'chatgpt-duo': 'gpt-duo',
});

const OPTIONAL_CODEX_MODEL_ENV = Object.freeze({
  terra: 'MAESTRO_FRONTIER_MODEL_TERRA',
  luna: 'MAESTRO_FRONTIER_MODEL_LUNA',
  sol: 'MAESTRO_FRONTIER_MODEL_SOL',
});

// Optional model ids become argv values for a local Codex invocation. Keep
// this deliberately narrow: common provider forms (namespace/model@version,
// dots, colons, dashes, underscores, plus) work, but whitespace, quoting, and
// shell metacharacters never cross the environment/.env boundary.
const SAFE_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]{0,127}$/;
const SECRET_LIKE_MODEL_ID_RE = /^(?:sk|pk|rk|api|key|token|secret)(?:[-_]|$)|^(?:gh[pousr]_|xox[baprs]-|AIza|AKIA)/i;

const WRITE_GRANT_ARGS = Object.freeze([
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  'yolo',
  'workspace-write',
  'danger-full-access',
  'acceptEdits',
  'bypassPermissions',
]);

// .cmd/.bat adapters execute through cmd.exe in dispatch. Keep its command
// line free of metacharacters even when a binary was supplied explicitly.
const CMD_UNSAFE_SHIM_PATH_RE = new RegExp('["%&|<>()^!\\r\\n]');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function cloneObject(obj) {
  return obj ? { ...obj } : undefined;
}

function isSafeModelId(value) {
  return typeof value === 'string' && SAFE_MODEL_ID_RE.test(value) && !SECRET_LIKE_MODEL_ID_RE.test(value);
}

function codexArgs(modelId) {
  return [
    'exec',
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--ask-for-approval', 'never',
    '-m', modelId,
    '--color', 'never',
  ];
}

function claudeArgs(modelId) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', 'plan'];
  if (modelId) args.push('--model', modelId);
  return args;
}

function cnAuthEnvFrom(hostVarName) {
  return { ANTHROPIC_AUTH_TOKEN: hostVarName, ANTHROPIC_API_KEY: hostVarName };
}

// Codex can authenticate with a direct API key or a local CODEX_HOME session.
// These are optional: a missing key must not block a desktop-login session, so
// dispatch forwards them only when present rather than treating them as the
// required `envFrom` credentials used by the CN provider adapters.
const CODEX_ENV_PASSTHROUGH = Object.freeze({
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  CODEX_HOME: 'CODEX_HOME',
});

// These records are declarative metadata only. In particular, Terra/Luna/SOL
// have no fallback model string: their `modelEnv` is the sole source of a
// launch model id.
const MODEL_SPECS = Object.freeze([
  {
    id: 'opus', label: 'Opus 4.8', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs(), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
  },
  {
    id: 'gpt-5.5', label: 'GPT-5.5', backend: 'codex', binEnv: 'MAESTRO_CODEX_BIN', binDefault: 'codex',
    baseArgs: () => codexArgs('gpt-5.5'), promptVia: 'stdin', webTools: true, output: 'last-message-file', parse: 'text',
    envPassthrough: CODEX_ENV_PASSTHROUGH,
  },
  {
    id: 'gemini', label: 'Gemini 3.1 Pro', backend: 'gemini', binEnv: 'MAESTRO_GEMINI_BIN', binDefault: 'gemini',
    baseArgs: () => ['--output-format', 'json', '--approval-mode', 'plan', '--model', 'gemini-3.1-pro-preview'],
    promptVia: 'arg', promptFlag: '-p', webTools: false, output: 'stdout', parse: 'gemini-json',
  },
  {
    id: 'fable', label: 'Fable 5', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs('claude-fable-5'), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
    costTier: 'subscription-until', freeUntil: '2026-07-07',
  },
  {
    id: 'sonnet-5', label: 'Sonnet 5', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs('claude-sonnet-5'), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
  },
  {
    id: 'glm', label: 'GLM 5.2', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs(), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_MODEL: 'glm-5.2',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-5.2',
      CLAUDE_CODE_SUBAGENT_MODEL: 'glm-5.2',
    },
    envFrom: cnAuthEnvFrom('ZAI_API_KEY'),
  },
  {
    id: 'kimi', label: 'Kimi K2.7 Code', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs(), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic',
      ANTHROPIC_MODEL: 'kimi-k2.7-code',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2.7-code',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2.7-code',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2.7-code',
      CLAUDE_CODE_SUBAGENT_MODEL: 'kimi-k2.7-code',
    },
    envFrom: cnAuthEnvFrom('MOONSHOT_API_KEY'),
  },
  {
    id: 'deepseek', label: 'DeepSeek V4 Pro', backend: 'claude', binEnv: 'MAESTRO_CLAUDE_BIN', binDefault: 'claude',
    baseArgs: () => claudeArgs(), promptVia: 'stdin', webTools: false, output: 'stdout', parse: 'claude-json',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
      CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
    },
    envFrom: cnAuthEnvFrom('DEEPSEEK_API_KEY'),
  },
  {
    id: 'terra', label: 'Terra', backend: 'codex', binEnv: 'MAESTRO_CODEX_BIN', binDefault: 'codex',
    modelEnv: OPTIONAL_CODEX_MODEL_ENV.terra,
    baseArgs: modelId => codexArgs(modelId), promptVia: 'stdin', webTools: true, output: 'last-message-file', parse: 'text',
    envPassthrough: CODEX_ENV_PASSTHROUGH,
    smoke: { supported: true, plan: 'codex-read-only' },
  },
  {
    id: 'luna', label: 'Luna', backend: 'codex', binEnv: 'MAESTRO_CODEX_BIN', binDefault: 'codex',
    modelEnv: OPTIONAL_CODEX_MODEL_ENV.luna,
    baseArgs: modelId => codexArgs(modelId), promptVia: 'stdin', webTools: true, output: 'last-message-file', parse: 'text',
    envPassthrough: CODEX_ENV_PASSTHROUGH,
    smoke: { supported: true, plan: 'codex-read-only' },
  },
  {
    id: 'sol', label: 'SOL', backend: 'codex', binEnv: 'MAESTRO_CODEX_BIN', binDefault: 'codex',
    modelEnv: OPTIONAL_CODEX_MODEL_ENV.sol,
    baseArgs: modelId => codexArgs(modelId), promptVia: 'stdin', webTools: true, output: 'last-message-file', parse: 'text',
    envPassthrough: CODEX_ENV_PASSTHROUGH,
    smoke: { supported: true, plan: 'codex-read-only' },
  },
]);

const BUILTIN_PRESETS = Object.freeze([
  { id: 'opus-duo', models: ['opus', 'opus'] },
  { id: 'opus-gpt', models: ['opus', 'gpt-5.5'] },
  { id: 'gpt-duo', models: ['gpt-5.5', 'gpt-5.5'], judge: 'gpt-5.5', synth: 'gpt-5.5' },
  { id: 'frontier-trio', models: ['opus', 'gpt-5.5', 'gemini'] },
  { id: 'fable-duo', models: ['fable', 'fable'], judge: 'fable', synth: 'fable' },
  { id: 'fable-gpt', models: ['fable', 'gpt-5.5'], judge: 'fable', synth: 'fable' },
  { id: 'fable-trio', models: ['fable', 'gpt-5.5', 'gemini'], judge: 'fable', synth: 'fable' },
  { id: 'sonnet-duo', models: ['sonnet-5', 'sonnet-5'], judge: 'sonnet-5', synth: 'sonnet-5' },
  { id: 'sonnet-gpt', models: ['sonnet-5', 'gpt-5.5'], judge: 'sonnet-5', synth: 'sonnet-5' },
  { id: 'sonnet-trio', models: ['sonnet-5', 'gpt-5.5', 'gemini'], judge: 'sonnet-5', synth: 'sonnet-5' },
  { id: 'frontier-quad', models: ['fable', 'opus', 'gpt-5.5', 'gemini'] },
  { id: 'frontier-quint', models: ['fable', 'opus', 'sonnet-5', 'gpt-5.5', 'gemini'] },
  { id: 'budget-trio', models: ['kimi', 'deepseek', 'glm'], judge: 'deepseek', synth: 'deepseek' },
  { id: 'east-west', models: ['deepseek', 'gpt-5.5'] },
]);

/** @param {*} model @returns {*} */
function canonicalModelId(model) {
  return typeof model === 'string' ? (MODEL_ALIASES[model] || model) : model;
}

/** @param {*} preset @returns {*} */
function canonicalPresetId(preset) {
  return typeof preset === 'string' ? (PRESET_ALIASES[preset] || preset) : preset;
}

/** @param {object} state @returns {object} */
function normalizeStateAliases(state) {
  const normalized = { ...(state || {}) };
  if (normalized.model) normalized.model = canonicalModelId(normalized.model);
  if (normalized.preset) normalized.preset = canonicalPresetId(normalized.preset);
  if (Array.isArray(normalized.models)) normalized.models = normalized.models.map(canonicalModelId);
  if (normalized.judgeModel) normalized.judgeModel = canonicalModelId(normalized.judgeModel);
  if (normalized.synthModel) normalized.synthModel = canonicalModelId(normalized.synthModel);
  return normalized;
}

function defaultCodexEnvPath(homeDir) {
  return path.join(homeDir || os.homedir(), '.codex', '.env');
}

// Read only the declared optional model settings. This deliberately does not
// mutate process.env or return unrelated values from ~/.codex/.env.
function readDesktopModelEnv(filePath) {
  const allowed = new Set(Object.values(OPTIONAL_CODEX_MODEL_ENV));
  let text;
  let fd;
  try {
    const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    try {
      fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    } catch (error) {
      // Windows and some filesystems do not implement O_NOFOLLOW. The
      // descriptor/path identity check below remains the portable fallback.
      if (!noFollow || !error || !['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error;
      fd = fs.openSync(filePath, fs.constants.O_RDONLY);
    }
    const opened = fs.fstatSync(fd);
    const named = fs.lstatSync(filePath);
    // Read from the opened descriptor, not the pathname. On platforms without
    // O_NOFOLLOW, matching the descriptor to the final pathname also rejects
    // a symlink/path replacement that occurred while opening it.
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino) return {};
    text = fs.readFileSync(fd, 'utf8');
  } catch {
    return {};
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    line = line.replace(/^export\s+/, '');
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !allowed.has(match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    if (isSafeModelId(value)) values[match[1]] = value;
  }
  return values;
}

function catalogEnvironment(env, opts) {
  const source = env || process.env;
  const fromDesktop = readDesktopModelEnv((opts && opts.codexEnvPath) || defaultCodexEnvPath(opts && opts.homeDir));
  const values = {};
  for (const name of Object.values(OPTIONAL_CODEX_MODEL_ENV)) {
    const direct = source && source[name];
    const fallback = fromDesktop[name];
    if (isSafeModelId(direct)) values[name] = direct;
    else if (isSafeModelId(fallback)) values[name] = fallback;
  }
  return values;
}

function effectiveBin(spec, env) {
  const override = env && env[spec.binEnv];
  return typeof override === 'string' && override.trim() ? override.trim() : spec.binDefault;
}

function configured(spec, values) {
  return !spec.modelEnv || !!values[spec.modelEnv];
}

function smokeSupported(spec) {
  return !spec.modelEnv || !!(spec.smoke && spec.smoke.supported && spec.smoke.plan === 'codex-read-only');
}

function adapterFor(spec, env, values) {
  const modelValue = spec.modelEnv ? values[spec.modelEnv] : undefined;
  const adapter = {
    model: spec.id,
    backend: spec.backend,
    bin: effectiveBin(spec, env),
    baseArgs: spec.baseArgs(modelValue),
    promptVia: spec.promptVia,
    webTools: spec.webTools,
    output: spec.output,
    parse: spec.parse,
    readOnly: true,
  };
  if (spec.promptFlag) adapter.promptFlag = spec.promptFlag;
  if (spec.env) adapter.env = cloneObject(spec.env);
  if (spec.envFrom) adapter.envFrom = cloneObject(spec.envFrom);
  if (spec.envPassthrough) adapter.envPassthrough = cloneObject(spec.envPassthrough);
  if (spec.costTier) adapter.costTier = spec.costTier;
  if (spec.freeUntil) adapter.freeUntil = spec.freeUntil;
  return adapter;
}

function modelMetadata(spec, env, values) {
  const needsModel = !!spec.modelEnv;
  const modelConfigured = configured(spec, values);
  const selectable = modelConfigured && smokeSupported(spec);
  return {
    id: spec.id,
    label: spec.label,
    backend: spec.backend,
    bin: effectiveBin(spec, env),
    readOnly: true,
    selectable,
    configured: modelConfigured,
    requiredEnv: [
      ...(needsModel ? [spec.modelEnv] : []),
      ...new Set(Object.values(spec.envFrom || {})),
    ],
    smoke: spec.smoke ? { supported: !!spec.smoke.supported, plan: spec.smoke.plan } : null,
  };
}

function buildPresetMaps() {
  const presets = {};
  const presetStages = {};
  for (const preset of BUILTIN_PRESETS) {
    presets[preset.id] = preset.models.slice();
    if (preset.judge || preset.synth) {
      presetStages[preset.id] = {
        ...(preset.judge ? { judge: preset.judge } : {}),
        ...(preset.synth ? { synth: preset.synth } : {}),
      };
    }
  }
  return { presets, presetStages };
}

// Display-safe built-in preset records. This retains only declarative catalog
// metadata: it never inspects configured model ids or local credentials.
function listBuiltinPresets() {
  return BUILTIN_PRESETS.map(preset => ({
    id: preset.id,
    models: preset.models.slice(),
    judge: preset.judge || null,
    synth: preset.synth || null,
  }));
}

/**
 * Construct the runtime catalog. `env` and `codexEnvPath` are injectable so
 * tests and desktop hosts can resolve the same source precedence without
 * changing the process environment. The returned `models` view is safe for
 * display: it reports configuration state, never a configured model value.
 */
function buildRuntimeCatalog(opts) {
  const env = (opts && opts.env) || process.env;
  const values = catalogEnvironment(env, opts);
  const models = {};
  const adapters = {};
  for (const spec of MODEL_SPECS) {
    const meta = modelMetadata(spec, env, values);
    models[spec.id] = meta;
    if (meta.selectable) adapters[spec.id] = adapterFor(spec, env, values);
  }
  const { presets, presetStages } = buildPresetMaps();
  const catalog = { models, adapters, presets, presetStages };
  const validation = validateCatalog(catalog);
  if (!validation.ok) throw new Error('invalid Frontier catalog: ' + validation.errors.join('; '));
  return catalog;
}

function isReadOnlyAdapter(adapter) {
  if (!adapter || !Array.isArray(adapter.baseArgs) || adapter.readOnly !== true) return false;
  const args = adapter.baseArgs.join(' ');
  if (WRITE_GRANT_ARGS.some(arg => args.includes(arg))) return false;
  if (adapter.backend === 'claude') return args.includes('--permission-mode plan');
  if (adapter.backend === 'codex') return args.includes('--sandbox read-only') && args.includes('--ask-for-approval never');
  if (adapter.backend === 'gemini') return args.includes('--approval-mode plan');
  return false;
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object') return { ok: false, errors: ['catalog is not an object'] };
  const models = catalog.models || {};
  const adapters = catalog.adapters || {};
  for (const [id, adapter] of Object.entries(adapters)) {
    if (!hasOwn(models, id)) errors.push('adapter has no model metadata: ' + id);
    if (!models[id] || !models[id].selectable) errors.push('adapter is not selectable: ' + id);
    if (!isReadOnlyAdapter(adapter)) errors.push('adapter is not read-only: ' + id);
  }
  for (const [preset, members] of Object.entries(catalog.presets || {})) {
    if (!Array.isArray(members) || members.length === 0 || members.length > 8) {
      errors.push('invalid preset members: ' + preset);
      continue;
    }
    for (const id of members) if (!hasOwn(models, id)) errors.push('preset unknown model: ' + preset + '/' + id);
  }
  for (const [preset, stages] of Object.entries(catalog.presetStages || {})) {
    if (!hasOwn(catalog.presets || {}, preset)) errors.push('stage for unknown preset: ' + preset);
    for (const id of Object.values(stages || {})) {
      if (!hasOwn(models, id)) errors.push('stage unknown model: ' + preset + '/' + id);
    }
  }
  return { ok: errors.length === 0, errors };
}

// Keep roster/CLI presentation free of configured model values. Adapters retain
// the resolved value only because dispatch must pass it to the local Codex CLI.
function listCatalogModels(catalog) {
  const c = catalog || buildRuntimeCatalog();
  return Object.values(c.models || {}).map(model => ({
    id: model.id,
    label: model.label,
    backend: model.backend,
    bin: model.bin,
    readOnly: model.readOnly,
    selectable: model.selectable,
    configured: model.configured,
    requiredEnv: model.requiredEnv.slice(),
    smoke: model.smoke && { ...model.smoke },
  }));
}

function findOnPath(bin, env) {
  const windowsSpawnableExtensions = new Set(['.com', '.exe', '.cmd', '.bat']);

  function launchableFile(candidate) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) return false;
      // Windows accepts only command-file extensions here. .cmd/.bat run
      // through cmd.exe in dispatch, so their paths must also be safe to put
      // on its command line. Do not treat arbitrary existing files (such as
      // .txt) as command binaries.
      if (process.platform === 'win32') {
        const ext = path.extname(candidate).toLowerCase();
        return windowsSpawnableExtensions.has(ext) &&
          ((ext !== '.cmd' && ext !== '.bat') || !CMD_UNSAFE_SHIM_PATH_RE.test(candidate));
      }
      // POSIX requires an executable mode bit in addition to a regular file.
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  if (path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')) return launchableFile(bin) ? bin : null;
  const source = env || process.env;
  const dirs = String(source.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      if (launchableFile(candidate)) return candidate;
    }
  }
  return null;
}

function modelReadiness(modelId, catalog, opts) {
  const c = catalog || buildRuntimeCatalog(opts);
  const id = canonicalModelId(modelId);
  const model = c.models && c.models[id];
  if (!model) return { id, ready: false, reasons: ['unknown-model'] };
  const env = (opts && opts.env) || process.env;
  const find = opts && opts.findBin;
  const binReady = typeof find === 'function' ? !!find(model.bin) : !!findOnPath(model.bin, env);
  const missing = model.requiredEnv.filter(name => {
    // Explicit model ids may be supplied by ~/.codex/.env; provider auth may
    // not. Do not mistake a configured optional model for configured auth.
    if (Object.values(OPTIONAL_CODEX_MODEL_ENV).includes(name)) return !model.configured;
    return !(typeof env[name] === 'string' && env[name].trim());
  });
  const reasons = [];
  if (!model.selectable) reasons.push('model-id-not-configured');
  if (!binReady) reasons.push('binary-not-found');
  if (missing.some(name => Object.values(OPTIONAL_CODEX_MODEL_ENV).includes(name))) {
    reasons.push('configuration-required');
  }
  if (missing.some(name => !Object.values(OPTIONAL_CODEX_MODEL_ENV).includes(name))) {
    reasons.push('authentication-required');
  }
  return {
    id,
    backend: model.backend,
    readOnly: model.readOnly,
    ready: reasons.length === 0,
    reasons,
    requiredEnv: model.requiredEnv.slice(),
  };
}

function isSelectableModel(modelId, catalog) {
  const c = catalog || buildRuntimeCatalog();
  const model = c.models && c.models[canonicalModelId(modelId)];
  return !!(model && model.selectable);
}

module.exports = {
  MODEL_ALIASES,
  PRESET_ALIASES,
  OPTIONAL_CODEX_MODEL_ENV,
  isSafeModelId,
  BUILTIN_PRESETS,
  canonicalModelId,
  canonicalPresetId,
  normalizeStateAliases,
  defaultCodexEnvPath,
  readDesktopModelEnv,
  buildRuntimeCatalog,
  listBuiltinPresets,
  validateCatalog,
  isReadOnlyAdapter,
  listCatalogModels,
  findOnPath,
  modelReadiness,
  isSelectableModel,
};
