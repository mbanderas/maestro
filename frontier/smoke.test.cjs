#!/usr/bin/env node
// Tests for the current Codex release smoke gate. All invocations inject a
// stub dispatcher; this suite must never launch a real Codex process.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { OPTIONAL_CODEX_MODEL_ENV, buildRuntimeCatalog } = require('./catalog.cjs');
const {
  SMOKE_CODEX_MODEL_IDS,
  OPTIONAL_CODEX_MODEL_IDS,
  SMOKE_PROMPT,
  SMOKE_SUCCESS,
  smokeCurrentCodexModels,
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
    const noneReport = await smokeCurrentCodexModels(none, {
      spawnOne: async () => { noneCalls++; return { ok: true, content: SMOKE_SUCCESS }; },
    });
    check('all current Codex selectors are smoked through the injected dispatcher', noneCalls === 9);
    check('current aliases pass when every exact response is OK',
      noneReport.releaseReady === true && noneReport.configuredCount === 9 &&
      noneReport.models.every(model => model.configured && model.attempted && model.available));
    const noneText = formatSmokeReport(noneReport);
    check('current report needs no model-id configuration remediation',
      !noneText.includes('remediation: set '));

    const configuredId = 'provider/terra@2026-07';
    const one = buildRuntimeCatalog({
      env: { PATH: '', [OPTIONAL_CODEX_MODEL_ENV.terra]: configuredId },
      codexEnvPath: missingEnvFile,
    });
    const calls = [];
    const oneReport = await smokeCurrentCodexModels(one, {
      fusionDepth: 3,
      spawnOne: async (prompt, adapter, opts) => {
        calls.push({ prompt, adapter, opts });
        return { ok: true, content: SMOKE_SUCCESS };
      },
    });
    check('current smoke invokes every declared Codex selector',
      calls.length === 9 &&
      calls.map(call => call.adapter.model).join(',') === SMOKE_CODEX_MODEL_IDS.join(','));
    check('configured smoke uses the minimal smoke prompt and guarded depth',
      calls.length === 9 && calls.every(call => call.prompt === SMOKE_PROMPT && call.opts.fusionDepth === 3));
    const terraCall = calls.find(call => call.adapter.model === 'terra');
    check('configured smoke retains the exact configured Codex model argv',
      terraCall && terraCall.adapter.baseArgs.join('\u0000') === [
        '--ask-for-approval', 'never', 'exec', '--skip-git-repo-check', '--sandbox', 'read-only',
        '-m', configuredId, '--color', 'never',
      ].join('\u0000'));
    check('successful current smoke qualifies all selectors as available',
      oneReport.releaseReady === true && oneReport.configuredCount === 9 &&
      oneReport.models.find(model => model.id === 'terra').available === true &&
      oneReport.models.every(model => model.attempted && model.available));

    const wrongSuccess = await smokeCurrentCodexModels(one, {
      spawnOne: async () => ({ ok: true, content: 'NOT_OK' }),
    });
    check('successful but non-OK smoke response fails the release gate',
      wrongSuccess.releaseReady === false &&
      wrongSuccess.models.find(model => model.id === 'terra').reason === 'smoke-failed');

    const failed = await smokeCurrentCodexModels(one, {
      spawnOne: async () => ({ ok: false, error: 'provider model id: ' + configuredId }),
    });
    const failedTerra = failed.models.find(model => model.id === 'terra');
    check('failed configured smoke fails the release gate',
      failed.releaseReady === false && failedTerra.attempted === true && failedTerra.available === false &&
      failedTerra.reason === 'smoke-failed');
    check('smoke report never prints configured ids or injected error text',
      !formatSmokeReport(failed).includes(configuredId) && !JSON.stringify(failed).includes(configuredId) &&
      !noneText.includes(configuredId));
    check('smoked selectors are the fixed first-party Codex set',
      SMOKE_CODEX_MODEL_IDS.join(',') ===
      'astra,sol,terra,luna,auto-review,gpt-5.5,gpt-5.4,gpt-5.4-mini,spark');
    check('legacy smoke exports remain compatible',
      OPTIONAL_CODEX_MODEL_IDS === SMOKE_CODEX_MODEL_IDS &&
      smokeConfiguredOptionalCodexModels === smokeCurrentCodexModels);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failures) process.exit(1);
  process.stdout.write('all smoke tests passed\n');
})();
