#!/usr/bin/env node
// Tests for the optional Codex release smoke gate. All invocations inject a
// stub dispatcher; this suite must never launch a real Codex process.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { OPTIONAL_CODEX_MODEL_ENV, buildRuntimeCatalog } = require('./catalog.cjs');
const {
  OPTIONAL_CODEX_MODEL_IDS,
  SMOKE_PROMPT,
  SMOKE_SUCCESS,
  smokeConfiguredOptionalCodexModels,
  formatSmokeReport,
} = require('./smoke.cjs');

let failures = 0;
function check(name, condition) {
  if (!condition) {
    failures++;
    process.stderr.write('FAIL  ' + name + '\n');
  } else {
    process.stdout.write('PASS  ' + name + '\n');
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-smoke-test-'));
const missingEnvFile = path.join(tmp, 'missing.env');

(async () => {
  try {
    const none = buildRuntimeCatalog({ env: { PATH: '' }, codexEnvPath: missingEnvFile });
    let noneCalls = 0;
    const noneReport = await smokeConfiguredOptionalCodexModels(none, {
      spawnOne: async () => { noneCalls++; return { ok: true, content: SMOKE_SUCCESS }; },
    });
    check('unconfigured aliases make no external calls', noneCalls === 0);
    check('unconfigured aliases are blocked but do not fail the release gate',
      noneReport.releaseReady === true && noneReport.configuredCount === 0 &&
      noneReport.models.every(model => !model.configured && !model.attempted && !model.available));
    const noneText = formatSmokeReport(noneReport);
    check('unconfigured report gives safe setting-name remediation',
      noneText.includes('set ' + OPTIONAL_CODEX_MODEL_ENV.terra) &&
      noneText.includes('set ' + OPTIONAL_CODEX_MODEL_ENV.luna) &&
      noneText.includes('set ' + OPTIONAL_CODEX_MODEL_ENV.sol));

    const configuredId = 'provider/terra@2026-07';
    const one = buildRuntimeCatalog({
      env: { PATH: '', [OPTIONAL_CODEX_MODEL_ENV.terra]: configuredId },
      codexEnvPath: missingEnvFile,
    });
    const calls = [];
    const oneReport = await smokeConfiguredOptionalCodexModels(one, {
      fusionDepth: 3,
      spawnOne: async (prompt, adapter, opts) => {
        calls.push({ prompt, adapter, opts });
        return { ok: true, content: SMOKE_SUCCESS };
      },
    });
    check('configured smoke invokes only the configured alias',
      calls.length === 1 && calls[0].adapter.model === 'terra');
    check('configured smoke uses the minimal smoke prompt and guarded depth',
      calls.length === 1 && calls[0].prompt === SMOKE_PROMPT && calls[0].opts.fusionDepth === 3);
    check('configured smoke retains the exact configured Codex model argv',
      calls.length === 1 && calls[0].adapter.baseArgs.join('\u0000') === [
        'exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ask-for-approval', 'never',
        '-m', configuredId, '--color', 'never',
      ].join('\u0000'));
    check('successful configured smoke qualifies only that alias as available',
      oneReport.releaseReady === true && oneReport.configuredCount === 1 &&
      oneReport.models.find(model => model.id === 'terra').available === true &&
      oneReport.models.filter(model => model.id !== 'terra').every(model => !model.attempted && !model.available));

    const wrongSuccess = await smokeConfiguredOptionalCodexModels(one, {
      spawnOne: async () => ({ ok: true, content: 'NOT_OK' }),
    });
    check('successful but non-OK smoke response fails the release gate',
      wrongSuccess.releaseReady === false &&
      wrongSuccess.models.find(model => model.id === 'terra').reason === 'smoke-failed');

    const failed = await smokeConfiguredOptionalCodexModels(one, {
      spawnOne: async () => ({ ok: false, error: 'provider model id: ' + configuredId }),
    });
    const failedTerra = failed.models.find(model => model.id === 'terra');
    check('failed configured smoke fails the release gate',
      failed.releaseReady === false && failedTerra.attempted === true && failedTerra.available === false &&
      failedTerra.reason === 'smoke-failed');
    check('smoke report never prints configured ids or injected error text',
      !formatSmokeReport(failed).includes(configuredId) && !JSON.stringify(failed).includes(configuredId) &&
      !noneText.includes(configuredId));
    check('optional aliases are a fixed declared set',
      OPTIONAL_CODEX_MODEL_IDS.join(',') === 'terra,luna,sol');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failures) process.exit(1);
  process.stdout.write('all smoke tests passed\n');
})();
