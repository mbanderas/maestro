#!/usr/bin/env node
// Maestro Frontier — first-party Codex release smoke gate.
//
// This is intentionally an explicit command rather than startup behavior:
// it can spend tokens, so ordinary catalog/dispatch use stays offline. Only
// declared first-party Codex selectors are invoked. A successful read-only
// Codex exec is the sole condition that marks a selector available here.

'use strict';

const {
  buildRuntimeCatalog,
  FIRST_PARTY_CODEX_MODEL_IDS,
  OPTIONAL_CODEX_MODEL_ENV,
} = require('./catalog.cjs');
const { spawnOne: defaultSpawnOne } = require('./dispatch.cjs');

const SMOKE_CODEX_MODEL_IDS = FIRST_PARTY_CODEX_MODEL_IDS;
// Backward-compatible export for callers of the original Terra/Luna/Sol gate.
const OPTIONAL_CODEX_MODEL_IDS = SMOKE_CODEX_MODEL_IDS;
const SMOKE_PROMPT = 'Reply with exactly: OK';
const SMOKE_SUCCESS = 'OK';

function supportedCodexAdapter(model, adapter) {
  return !!(model && adapter && model.backend === 'codex' && model.selectable &&
    model.smoke && model.smoke.supported === true && model.smoke.plan === 'codex-read-only');
}

/**
 * Smoke each current first-party Codex adapter through the normal dispatcher.
 * The `spawnOne` dependency is injectable, so the normal test suite never
 * launches Codex. Results intentionally contain alias/status only: configured
 * provider model ids and environment values must not surface in release logs.
 *
 * @param {object} [catalog] runtime catalog from buildRuntimeCatalog
 * @param {{ spawnOne?: Function, fusionDepth?: number }} [opts]
 * @returns {Promise<{releaseReady: boolean, configuredCount: number, models: object[]}>}
 */
async function smokeCurrentCodexModels(catalog, opts) {
  const c = catalog || buildRuntimeCatalog();
  const invoke = (opts && opts.spawnOne) || defaultSpawnOne;
  const fusionDepth = (opts && opts.fusionDepth != null) ? opts.fusionDepth : 1;
  const models = await Promise.all(SMOKE_CODEX_MODEL_IDS.map(async id => {
    const model = c.models && c.models[id];
    const adapter = c.adapters && c.adapters[id];
    const configured = !!(model && model.configured);

    if (!configured) {
      return { id, configured: false, attempted: false, available: false, reason: 'configuration-required' };
    }

    // A current selector must have a declared read-only smoke plan
    // and a launch-ready adapter. Treat a catalog regression as a failed gate,
    // never as an excuse to skip a configured alias.
    if (!supportedCodexAdapter(model, adapter)) {
      return { id, configured: true, attempted: false, available: false, reason: 'smoke-not-supported' };
    }

    let response;
    try {
      response = await invoke(SMOKE_PROMPT, adapter, { fusionDepth });
    } catch {
      response = null;
    }
    return {
      id,
      configured: true,
      attempted: true,
      // dispatch normalizes the final response text; accepting anything other
      // than the explicit acknowledgement would turn an unrelated successful
      // request into a false availability signal.
      available: !!(response && response.ok && response.content === SMOKE_SUCCESS),
      reason: response && response.ok && response.content === SMOKE_SUCCESS ? null : 'smoke-failed',
    };
  }));

  const configuredModels = models.filter(model => model.configured);
  return {
    // A custom catalog may still omit these selectors; that is not a release
    // failure and no external command is launched for an omitted selector.
    releaseReady: configuredModels.every(model => model.available),
    configuredCount: configuredModels.length,
    models,
  };
}

function formatSmokeReport(report) {
  const lines = ['Frontier current Codex smoke'];
  for (const model of report.models) {
    const status = model.available ? 'available' : 'blocked';
    let line = '  ' + model.id + ' configured=' + (model.configured ? 'yes' : 'no') + ' -> ' + status;
    // A custom catalog can still require an override. Print only its declared
    // setting name, never its value.
    if (!model.configured && OPTIONAL_CODEX_MODEL_ENV[model.id]) {
      line += '; remediation: set ' + OPTIONAL_CODEX_MODEL_ENV[model.id] + ' to its supported model id';
    }
    lines.push(line);
  }
  lines.push('release gate: ' + (report.releaseReady ? 'passed' : 'failed') +
    ' (' + report.configuredCount + ' current selector' + (report.configuredCount === 1 ? '' : 's') + ')');
  return lines.join('\n') + '\n';
}

async function main() {
  const report = await smokeCurrentCodexModels();
  process.stdout.write(formatSmokeReport(report));
  process.exitCode = report.releaseReady ? 0 : 1;
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('Frontier current Codex smoke failed.\n');
    process.exitCode = 1;
  });
}

module.exports = {
  SMOKE_CODEX_MODEL_IDS,
  OPTIONAL_CODEX_MODEL_IDS,
  SMOKE_PROMPT,
  SMOKE_SUCCESS,
  smokeCurrentCodexModels,
  smokeConfiguredOptionalCodexModels: smokeCurrentCodexModels,
  formatSmokeReport,
};
