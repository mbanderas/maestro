#!/usr/bin/env node
// Maestro Frontier — catalog unit tests. No real CLIs or credentials.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  OPTIONAL_CODEX_MODEL_ENV,
  isSafeModelId,
  canonicalModelId,
  canonicalPresetId,
  normalizeStateAliases,
  buildRuntimeCatalog,
  validateCatalog,
  isReadOnlyAdapter,
  listCatalogModels,
  findOnPath,
  modelReadiness,
} = require('./catalog.cjs');

let failures = 0;
function check(name, condition) {
  if (!condition) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-catalog-test-'));
const missingEnvFile = path.join(tmpBase, 'missing.env');
const emptyEnv = { PATH: '' };
const available = () => true;
const packageManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

try {
  check('package includes the catalog runtime file',
    Array.isArray(packageManifest.files) && packageManifest.files.includes('frontier/catalog.cjs'));
  check('safe model ids retain common provider characters',
    isSafeModelId('provider/model@2026-07:beta+1') === true);
  for (const unsafeId of ['has space', 'has\nnewline', 'has"quote', 'has%percent',
    'has&and', 'has|pipe', 'has<less', 'has>more', 'has(paren)', 'has^caret',
    'has!bang', 'has;semicolon', 'has`backtick', 'has\\slash', 'sk-secret-value']) {
    check('unsafe model id rejected: ' + JSON.stringify(unsafeId), isSafeModelId(unsafeId) === false);
  }

  // Current first-party model ids are catalog defaults, while the existing
  // MAESTRO_FRONTIER_MODEL_* settings remain safe optional overrides.
  const blocked = buildRuntimeCatalog({ env: emptyEnv, codexEnvPath: missingEnvFile });
  check('default catalog validates', validateCatalog(blocked).ok === true);
  const currentCodex = {
    astra: 'gpt-6-astra',
    sol: 'gpt-6-sol',
    terra: 'gpt-5.6-terra',
    luna: 'gpt-6-luna',
    'auto-review': 'codex-auto-review',
    'gpt-5.5': 'gpt-5.5',
    'gpt-5.4': 'gpt-5.4',
    'gpt-5.4-mini': 'gpt-5.4-mini',
    spark: 'gpt-5.3-codex-spark',
  };
  for (const [id, modelId] of Object.entries(currentCodex)) {
    const meta = blocked.models[id];
    const adapter = blocked.adapters[id];
    const readiness = modelReadiness(id, blocked, { env: emptyEnv, findBin: available });
    check(id + ' display metadata exists', !!meta && meta.readOnly === true);
    check(id + ' is selectable without a custom model id', meta && meta.selectable === true);
    check(id + ' has a read-only adapter', !!adapter && isReadOnlyAdapter(adapter));
    check(id + ' uses the current Codex model id',
      adapter && adapter.baseArgs.includes('-m') && adapter.baseArgs.includes(modelId));
    check(id + ' is ready when its binary resolves', readiness.ready === true);
  }
  check('Opus selector pins Claude Opus 5',
    blocked.models.opus.label === 'Opus 5.5' &&
    blocked.adapters.opus.baseArgs.includes('claude-opus-5-5') &&
    blocked.models.opus.minClaudeCodeVersion === '2.1.280');
  check('Fable selector pins Claude Fable 5.1 with the supported CLI floor',
    blocked.models.fable.label === 'Fable 5.1' &&
    blocked.adapters.fable.baseArgs.includes('claude-fable-5-1') &&
    blocked.models.fable.minClaudeCodeVersion === '2.1.257' &&
    blocked.adapters.fable.costTier === 'plan-dependent' &&
    !('freeUntil' in blocked.adapters.fable));
  check('Haiku selector uses its exact dated Claude model id without effort support',
    blocked.models.haiku.label === 'Haiku 4.5' &&
    blocked.adapters.haiku.baseArgs.includes('claude-haiku-4-5-20251001') &&
    blocked.models.haiku.efforts.length === 0);
  const publicModels = listCatalogModels(blocked);
  check('catalog listing exposes Claude Code minimum versions',
    publicModels.find(model => model.id === 'opus').minClaudeCodeVersion === '2.1.280' &&
    publicModels.find(model => model.id === 'fable').minClaudeCodeVersion === '2.1.257');
  check('Sonnet selector remains on Claude Sonnet 5',
    blocked.models['sonnet-5'].label === 'Sonnet 5' &&
    blocked.adapters['sonnet-5'].baseArgs.includes('claude-sonnet-5'));
  check('catalog declares supported effort levels',
    JSON.stringify(blocked.models.opus.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models.fable.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models['sonnet-5'].efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models.astra.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models.sol.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models.luna.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) &&
    JSON.stringify(blocked.models.terra.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']) &&
    JSON.stringify(blocked.models['gpt-5.5'].efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh']) &&
    JSON.stringify(blocked.models['gpt-5.4'].efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh']) &&
    JSON.stringify(blocked.models['gpt-5.4-mini'].efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh']) &&
    JSON.stringify(blocked.models.spark.efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh']) &&
    JSON.stringify(blocked.models['auto-review'].efforts) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']));

  // Aliases belong to the catalog and normalize every persisted state field.
  check('chatgpt canonicalizes to preserved GPT-5.5', canonicalModelId('chatgpt') === 'gpt-5.5');
  check('GPT-5.6 aliases remain valid',
    canonicalModelId('gpt-5.6') === 'sol' && canonicalModelId('gpt-5.6-sol') === 'sol' &&
    canonicalModelId('gpt-5.6-terra') === 'terra' && canonicalModelId('gpt-5.6-luna') === 'luna');
  check('chatgpt-duo canonicalizes to gpt-duo', canonicalPresetId('chatgpt-duo') === 'gpt-duo');
  const aliases = normalizeStateAliases({
    model: 'chatgpt', preset: 'chatgpt-duo', models: ['chatgpt'],
    judgeModel: 'chatgpt', synthModel: 'chatgpt',
  });
  check('state aliases normalize together', JSON.stringify(aliases) === JSON.stringify({
    model: 'gpt-5.5', preset: 'gpt-duo', models: ['gpt-5.5'],
    judgeModel: 'gpt-5.5', synthModel: 'gpt-5.5',
  }));

  // Existing settings override the first-party ids without leaking values.
  const configuredEnv = {
    PATH: '',
    [OPTIONAL_CODEX_MODEL_ENV.terra]: 'provider-terra-id',
    [OPTIONAL_CODEX_MODEL_ENV.luna]: 'provider-luna-id',
    [OPTIONAL_CODEX_MODEL_ENV.sol]: 'provider-sol-id',
  };
  const configured = buildRuntimeCatalog({ env: configuredEnv, codexEnvPath: missingEnvFile });
  for (const [id, value] of [['terra', 'provider-terra-id'], ['luna', 'provider-luna-id'], ['sol', 'provider-sol-id']]) {
    const adapter = configured.adapters[id];
    const readiness = modelReadiness(id, configured, { env: configuredEnv, findBin: available });
    check(id + ' remains selectable when overridden', configured.models[id].selectable === true);
    check(id + ' passes exactly its configured id to Codex',
      !!adapter && adapter.baseArgs.includes('-m') && adapter.baseArgs.includes(value));
    check(id + ' adapter remains read-only', isReadOnlyAdapter(adapter));
    check(id + ' readiness is configured and ready', readiness.ready === true);
    check(id + ' declares optional Codex auth/home forwarding',
      !!adapter && adapter.envPassthrough && adapter.envPassthrough.OPENAI_API_KEY === 'OPENAI_API_KEY' &&
      adapter.envPassthrough.CODEX_HOME === 'CODEX_HOME');
  }
  check('GPT-5.5 declares optional Codex auth/home forwarding',
    configured.adapters['gpt-5.5'].envPassthrough &&
    configured.adapters['gpt-5.5'].envPassthrough.OPENAI_API_KEY === 'OPENAI_API_KEY' &&
    configured.adapters['gpt-5.5'].envPassthrough.CODEX_HOME === 'CODEX_HOME');
  check('display listing never exposes configured model ids',
    !JSON.stringify(listCatalogModels(configured)).includes('provider-terra-id'));

  // A configured adapter still cannot arm until its local binary resolves to
  // a launchable regular file. Directories and missing absolute paths used to
  // pass the existence-only check and are now blocked by catalog readiness.
  const binaryDirectory = path.join(tmpBase, 'not-a-binary');
  const missingBinary = path.join(tmpBase, 'missing-binary');
  fs.mkdirSync(binaryDirectory);
  const directoryEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: binaryDirectory };
  const directoryCatalog = buildRuntimeCatalog({ env: directoryEnv, codexEnvPath: missingEnvFile });
  const directoryReadiness = modelReadiness('terra', directoryCatalog, { env: directoryEnv });
  check('absolute directory binary path is rejected',
    findOnPath(binaryDirectory, directoryEnv) === null && directoryReadiness.ready === false &&
    directoryReadiness.reasons.includes('binary-not-found'));
  const missingEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: missingBinary };
  const missingCatalog = buildRuntimeCatalog({ env: missingEnv, codexEnvPath: missingEnvFile });
  const missingReadiness = modelReadiness('terra', missingCatalog, { env: missingEnv });
  check('missing absolute binary path is rejected',
    findOnPath(missingBinary, missingEnv) === null && missingReadiness.ready === false &&
    missingReadiness.reasons.includes('binary-not-found'));
  if (process.platform !== 'win32') {
    const nonExecutableBinary = path.join(tmpBase, 'non-executable-binary');
    fs.writeFileSync(nonExecutableBinary, '#!/bin/sh\n', 'utf8');
    fs.chmodSync(nonExecutableBinary, 0o600);
    const nonExecutableEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: nonExecutableBinary };
    const nonExecutableCatalog = buildRuntimeCatalog({ env: nonExecutableEnv, codexEnvPath: missingEnvFile });
    const nonExecutableReadiness = modelReadiness('terra', nonExecutableCatalog, { env: nonExecutableEnv });
    check('non-executable absolute binary path is rejected on POSIX',
      findOnPath(nonExecutableBinary, nonExecutableEnv) === null && nonExecutableReadiness.ready === false &&
      nonExecutableReadiness.reasons.includes('binary-not-found'));
  } else {
    const textBinary = path.join(tmpBase, 'not-a-command.txt');
    const extensionlessBinary = path.join(tmpBase, 'extensionless-command');
    const cmdBinary = path.join(tmpBase, 'launchable.cmd');
    const batBinary = path.join(tmpBase, 'launchable.bat');
    const exeBinary = path.join(tmpBase, 'launchable.exe');
    const unsafeCmdBinary = path.join(tmpBase, 'unsafe&command.cmd');
    fs.writeFileSync(textBinary, '', 'utf8');
    fs.writeFileSync(extensionlessBinary, '', 'utf8');
    fs.writeFileSync(cmdBinary, '', 'utf8');
    fs.writeFileSync(batBinary, '', 'utf8');
    fs.writeFileSync(exeBinary, '', 'utf8');
    fs.writeFileSync(unsafeCmdBinary, '', 'utf8');
    const textEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: textBinary };
    const textCatalog = buildRuntimeCatalog({ env: textEnv, codexEnvPath: missingEnvFile });
    const textReadiness = modelReadiness('terra', textCatalog, { env: textEnv });
    check('Windows text absolute binary path is rejected',
      findOnPath(textBinary, textEnv) === null && textReadiness.ready === false &&
      textReadiness.reasons.includes('binary-not-found'));
    const extensionlessEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: extensionlessBinary };
    const extensionlessCatalog = buildRuntimeCatalog({ env: extensionlessEnv, codexEnvPath: missingEnvFile });
    const extensionlessReadiness = modelReadiness('terra', extensionlessCatalog, { env: extensionlessEnv });
    check('Windows explicit extensionless binary path is rejected',
      findOnPath(extensionlessBinary, extensionlessEnv) === null && extensionlessReadiness.ready === false &&
      extensionlessReadiness.reasons.includes('binary-not-found'));
    for (const [label, binary] of [['.cmd', cmdBinary], ['.bat', batBinary], ['.exe', exeBinary]]) {
      const commandEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: binary };
      const commandCatalog = buildRuntimeCatalog({ env: commandEnv, codexEnvPath: missingEnvFile });
      const commandReadiness = modelReadiness('terra', commandCatalog, { env: commandEnv });
      check('Windows explicit ' + label + ' binary path remains launchable',
        findOnPath(binary, commandEnv) === binary && commandReadiness.ready === true);
    }
    const unsafeCmdEnv = { ...configuredEnv, MAESTRO_CODEX_BIN: unsafeCmdBinary };
    const unsafeCmdCatalog = buildRuntimeCatalog({ env: unsafeCmdEnv, codexEnvPath: missingEnvFile });
    const unsafeCmdReadiness = modelReadiness('terra', unsafeCmdCatalog, { env: unsafeCmdEnv });
    check('Windows unsafe .cmd path is rejected before cmd.exe dispatch',
      findOnPath(unsafeCmdBinary, unsafeCmdEnv) === null && unsafeCmdReadiness.ready === false &&
      unsafeCmdReadiness.reasons.includes('binary-not-found'));
  }

  // Unsafe override values are rejected before becoming Codex argv; the safe
  // built-in model id remains active.
  const unsafeDirect = buildRuntimeCatalog({
    env: { PATH: '', [OPTIONAL_CODEX_MODEL_ENV.terra]: 'bad&calc' },
    codexEnvPath: missingEnvFile,
  });
  check('unsafe direct model id falls back to the declared default',
    unsafeDirect.models.terra.selectable === true &&
    unsafeDirect.adapters.terra.baseArgs.includes('gpt-5.6-terra') &&
    !unsafeDirect.adapters.terra.baseArgs.includes('bad&calc'));

  // ~/.codex/.env can override a current first-party id and is still subject
  // to the same explicit setting name and value validation.
  const homeDir = path.join(tmpBase, 'home');
  const codexDir = path.join(homeDir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, '.env'),
    OPTIONAL_CODEX_MODEL_ENV.terra + '=desktop-terra-id\nUNRELATED=value\n', 'utf8');
  const desktop = buildRuntimeCatalog({ env: emptyEnv, homeDir });
  check('~/.codex/.env overrides the Terra id',
    desktop.models.terra.selectable === true && desktop.adapters.terra.baseArgs.includes('desktop-terra-id'));
  check('~/.codex/.env leaves Luna and SOL on their declared defaults',
    desktop.adapters.luna.baseArgs.includes('gpt-6-luna') &&
    desktop.adapters.sol.baseArgs.includes('gpt-6-sol'));
  fs.writeFileSync(path.join(codexDir, '.env'),
    OPTIONAL_CODEX_MODEL_ENV.luna + '=bad%EXPANSION%\n', 'utf8');
  const unsafeDesktop = buildRuntimeCatalog({ env: emptyEnv, homeDir });
  check('unsafe ~/.codex/.env model id falls back to the declared default',
    unsafeDesktop.models.luna.selectable === true &&
    unsafeDesktop.adapters.luna.baseArgs.includes('gpt-6-luna'));

  // Validation defends the read-only subprocess invariant, including any
  // future catalog entry that accidentally adds a write grant.
  configured.adapters['gpt-5.5'] = {
    ...configured.adapters['gpt-5.5'],
    baseArgs: ['exec', '--sandbox', 'read-only', '--dangerously-skip-permissions'],
  };
  const invalid = validateCatalog(configured);
  check('catalog rejects a write-capable adapter',
    invalid.ok === false && invalid.errors.some(error => error.includes('not read-only: gpt-5.5')));

  const invalidEffort = buildRuntimeCatalog({ env: configuredEnv, codexEnvPath: missingEnvFile });
  invalidEffort.adapters.sol = {
    ...invalidEffort.adapters.sol,
    efforts: ['high', 'impossible'],
  };
  const invalidEffortResult = validateCatalog(invalidEffort);
  check('catalog rejects unknown and desynchronized effort metadata',
    invalidEffortResult.ok === false &&
    invalidEffortResult.errors.some(error => error.includes('unknown effort: sol/impossible')) &&
    invalidEffortResult.errors.some(error => error.includes('differs from model: sol')));

  // Auth-bearing catalog entries have a distinct readiness failure, even
  // though their static adapter metadata is valid and read-only.
  const authReadiness = modelReadiness('glm', blocked, { env: emptyEnv, findBin: available });
  check('missing provider auth is safely blocked',
    authReadiness.ready === false && authReadiness.reasons.includes('authentication-required'));
} finally {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
}

if (failures) {
  console.error(failures + ' test(s) failed.');
  process.exit(1);
}
console.log('ok');
