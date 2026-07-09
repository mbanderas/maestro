#!/usr/bin/env node
// Maestro Frontier — configured optional-Codex release smoke gate.
//
// This is intentionally an explicit command rather than startup behavior:
// it can spend tokens, so ordinary catalog/dispatch use stays offline. Only
// configured optional aliases are invoked. A successful read-only Codex exec
// is the sole condition that marks one of those aliases available here.

'use strict';

const { buildRuntimeCatalog, OPTIONAL_CODEX_MODEL_ENV } = require('./catalog.cjs');
const { spawnOne: defaultSpawnOne } = require('./dispatch.cjs');

const OPTIONAL_CODEX_MODEL_IDS = Object.freeze(Object.keys(OPTIONAL_CODEX_MODEL_ENV));
const SMOKE_PROMPT = 'Reply with exactly: OK';
const SMOKE_SUCCESS = 'OK';

function supportedOptionalCodexAdapter(model, adapter) {
  return !!(model && adapter && model.backend === 'codex' && model.selectable &&
    model.smoke && model.smoke.supported === true && model.smoke.plan === 'codex-read-only');
}

/**
 * Smoke each configured Terra/Luna/SOL adapter through the normal dispatcher.
 * The `spawnOne` dependency is injectable, so the normal test suite never
 * launches Codex. Results intentionally contain alias/status only: configured
 * provider model ids and environment values must not surface in release logs.
 *
 * @param {object} [catalog] runtime catalog from buildRuntimeCatalog
 * @param {{ spawnOne?: Function, fusionDepth?: number }} [opts]
 * @returns {Promise<{releaseReady: boolean, configuredCount: number, models: object[]}>}
 */
async function smokeConfiguredOptionalCodexModels(catalog, opts) {
  const c = catalog || buildRuntimeCatalog();
  const invoke = (opts && opts.spawnOne) || defaultSpawnOne;
  const fusionDepth = (opts && opts.fusionDepth != null) ? opts.fusionDepth : 1;
  const models = [];

  for (const id of OPTIONAL_CODEX_MODEL_IDS) {
    const model = c.models && c.models[id];
    const adapter = c.adapters && c.adapters[id];
    const configured = !!(model && model.configured);

    if (!configured) {
      models.push({ id, configured: false, attempted: false, available: false, reason: 'configuration-required' });
      continue;
    }

    // A configured optional alias must have a declared read-only smoke plan
    // and a launch-ready adapter. Treat a catalog regression as a failed gate,
    // never as an excuse to skip a configured alias.
    if (!supportedOptionalCodexAdapter(model, adapter)) {
      models.push({ id, configured: true, attempted: false, available: false, reason: 'smoke-not-supported' });
      continue;
    }

    let response;
    try {
      response = await invoke(SMOKE_PROMPT, adapter, { fusionDepth });
    } catch {
      response = null;
    }
    models.push({
      id,
      configured: true,
      attempted: true,
      // dispatch normalizes the final response text; accepting anything other
      // than the explicit acknowledgement would turn an unrelated successful
      // request into a false availability signal.
      available: !!(response && response.ok && response.content === SMOKE_SUCCESS),
      reason: response && response.ok && response.content === SMOKE_SUCCESS ? null : 'smoke-failed',
    });
  }

  const configuredModels = models.filter(model => model.configured);
  return {
    // No configured optional aliases means nothing is advertised as available;
    // it is not a release failure and no external command was launched.
    releaseReady: configuredModels.every(model => model.available),
    configuredCount: configuredModels.length,
    models,
  };
}

function formatSmokeReport(report) {
  const lines = ['Frontier optional Codex smoke'];
  for (const model of report.models) {
    const status = model.available ? 'available' : 'blocked';
    let line = '  ' + model.id + ' configured=' + (model.configured ? 'yes' : 'no') + ' -> ' + status;
    // An unconfigured optional alias is actionable without revealing a model
    // selector: print only its declared setting NAME, never its value.
    if (!model.configured && OPTIONAL_CODEX_MODEL_ENV[model.id]) {
      line += '; remediation: set ' + OPTIONAL_CODEX_MODEL_ENV[model.id] + ' to its supported model id';
    }
    lines.push(line);
  }
  lines.push('release gate: ' + (report.releaseReady ? 'passed' : 'failed') +
    ' (' + report.configuredCount + ' configured optional alias' + (report.configuredCount === 1 ? '' : 'es') + ')');
  return lines.join('\n') + '\n';
}

async function main() {
  const report = await smokeConfiguredOptionalCodexModels();
  process.stdout.write(formatSmokeReport(report));
  process.exitCode = report.releaseReady ? 0 : 1;
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('Frontier optional Codex smoke failed.\n');
    process.exitCode = 1;
  });
}

module.exports = {
  OPTIONAL_CODEX_MODEL_IDS,
  SMOKE_PROMPT,
  SMOKE_SUCCESS,
  smokeConfiguredOptionalCodexModels,
  formatSmokeReport,
};
