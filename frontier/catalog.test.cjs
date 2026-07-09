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
const catalogSource = fs.readFileSync(path.join(__dirname, 'catalog.cjs'), 'utf8');
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

  // The unconfigured catalog remains inspectable, but must never invent a
  // Terra/Luna/SOL model id or make it spawnable.
  const blocked = buildRuntimeCatalog({ env: emptyEnv, codexEnvPath: missingEnvFile });
  check('unconfigured catalog validates', validateCatalog(blocked).ok === true);
  for (const id of ['terra', 'luna', 'sol']) {
    const meta = blocked.models[id];
    const readiness = modelReadiness(id, blocked, { env: emptyEnv, findBin: available });
    check(id + ' display metadata exists', !!meta && meta.readOnly === true);
    check(id + ' is not selectable without its explicit id', meta && meta.selectable === false);
    check(id + ' has no adapter without its explicit id', !blocked.adapters[id]);
    check(id + ' is safely blocked when unconfigured',
      readiness.ready === false && readiness.reasons.includes('model-id-not-configured') &&
      readiness.reasons.includes('configuration-required'));
  }
  for (const id of ['terra', 'luna', 'sol']) {
    const nextId = id === 'terra' ? 'luna' : id === 'luna' ? 'sol' : null;
    const start = catalogSource.indexOf("id: '" + id + "'");
    const end = nextId ? catalogSource.indexOf("id: '" + nextId + "'", start) : catalogSource.indexOf('\n  },\n]);', start);
    const spec = catalogSource.slice(start, end);
    check(id + ' has no hard-coded model id',
      spec.includes('modelEnv: OPTIONAL_CODEX_MODEL_ENV.' + id) &&
      spec.includes('baseArgs: modelId => codexArgs(modelId)') &&
      !/codexArgs\(['"][^'"]+['"]\)/.test(spec));
  }

  // Aliases belong to the catalog and normalize every persisted state field.
  check('chatgpt canonicalizes to GPT-5.5', canonicalModelId('chatgpt') === 'gpt-5.5');
  check('chatgpt-duo canonicalizes to gpt-duo', canonicalPresetId('chatgpt-duo') === 'gpt-duo');
  const aliases = normalizeStateAliases({
    model: 'chatgpt', preset: 'chatgpt-duo', models: ['chatgpt'],
    judgeModel: 'chatgpt', synthModel: 'chatgpt',
  });
  check('state aliases normalize together', JSON.stringify(aliases) === JSON.stringify({
    model: 'gpt-5.5', preset: 'gpt-duo', models: ['gpt-5.5'],
    judgeModel: 'gpt-5.5', synthModel: 'gpt-5.5',
  }));

  // Exact IDs come only from the declared MAESTRO_FRONTIER_MODEL_* settings.
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
    check(id + ' becomes selectable only when configured', configured.models[id].selectable === true);
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

  // Direct environment values are rejected before becoming a Codex -m argv
  // value; malformed values leave optional models in the safe blocked state.
  const unsafeDirect = buildRuntimeCatalog({
    env: { PATH: '', [OPTIONAL_CODEX_MODEL_ENV.terra]: 'bad&calc' },
    codexEnvPath: missingEnvFile,
  });
  check('unsafe direct model id yields no optional adapter',
    unsafeDirect.models.terra.selectable === false && !unsafeDirect.adapters.terra);

  // The sole fallback is the user's ~/.codex/.env analogue, and it is still
  // subject to the same explicit setting name.
  const homeDir = path.join(tmpBase, 'home');
  const codexDir = path.join(homeDir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, '.env'),
    OPTIONAL_CODEX_MODEL_ENV.terra + '=desktop-terra-id\nUNRELATED=value\n', 'utf8');
  const desktop = buildRuntimeCatalog({ env: emptyEnv, homeDir });
  check('~/.codex/.env supplies the explicit Terra id',
    desktop.models.terra.selectable === true && desktop.adapters.terra.baseArgs.includes('desktop-terra-id'));
  check('~/.codex/.env does not configure Luna or SOL by accident',
    desktop.models.luna.selectable === false && desktop.models.sol.selectable === false);
  fs.writeFileSync(path.join(codexDir, '.env'),
    OPTIONAL_CODEX_MODEL_ENV.luna + '=bad%EXPANSION%\n', 'utf8');
  const unsafeDesktop = buildRuntimeCatalog({ env: emptyEnv, homeDir });
  check('unsafe ~/.codex/.env model id yields no optional adapter',
    unsafeDesktop.models.luna.selectable === false && !unsafeDesktop.adapters.luna);

  // Validation defends the read-only subprocess invariant, including any
  // future catalog entry that accidentally adds a write grant.
  configured.adapters['gpt-5.5'] = {
    ...configured.adapters['gpt-5.5'],
    baseArgs: ['exec', '--sandbox', 'read-only', '--dangerously-skip-permissions'],
  };
  const invalid = validateCatalog(configured);
  check('catalog rejects a write-capable adapter',
    invalid.ok === false && invalid.errors.some(error => error.includes('not read-only: gpt-5.5')));

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
