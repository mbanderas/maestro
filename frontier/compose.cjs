#!/usr/bin/env node
// Maestro Frontier — portable catalog display and custom panel composition.
//
// This module deliberately consumes the catalog's display and readiness APIs
// rather than launching probes: all Frontier panel processes remain read-only.

'use strict';

const {
  MODEL_ALIASES,
  PRESET_ALIASES,
  buildRuntimeCatalog,
  canonicalModelId,
  listBuiltinPresets,
  listCatalogModels,
  modelReadiness,
} = require('./catalog.cjs');
const { saveState } = require('./config.cjs');
const { saveUserPreset } = require('./presets.cjs');

function sortedEntries(obj) {
  return Object.entries(obj || {}).sort(([left], [right]) => left.localeCompare(right));
}

function remediationFor(readiness) {
  const fixes = [];
  const add = value => { if (!fixes.includes(value)) fixes.push(value); };
  for (const reason of readiness.reasons || []) {
    if (reason === 'unknown-model') add('choose a model listed by frontier catalog');
    else if (reason === 'model-id-not-configured' || reason === 'configuration-required') {
      add('configure its declared model id');
    } else if (reason === 'binary-not-found') {
      add('make its local CLI available on PATH');
    } else if (reason === 'authentication-required') {
      add('configure the required local authentication');
    }
  }
  return fixes;
}

function catalogView(catalog) {
  const presets = listBuiltinPresets()
    .sort((left, right) => left.id.localeCompare(right.id));
  const models = listCatalogModels(catalog)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(model => {
      const readiness = modelReadiness(model.id, catalog);
      return {
        id: model.id,
        label: model.label,
        backend: model.backend,
        readOnly: model.readOnly,
        selectable: model.selectable,
        configured: model.configured,
        ready: readiness.ready,
        reasons: readiness.reasons,
        remediation: remediationFor(readiness),
        requiredEnv: readiness.requiredEnv,
        smoke: model.smoke,
      };
    });
  return {
    aliases: {
      models: Object.fromEntries(sortedEntries(MODEL_ALIASES)),
      presets: Object.fromEntries(sortedEntries(PRESET_ALIASES)),
    },
    presets,
    models,
  };
}

function formatCatalogHuman(view) {
  const lines = ['Frontier catalog', 'aliases:'];
  for (const [from, to] of Object.entries(view.aliases.models)) lines.push('  model ' + from + ' -> ' + to);
  for (const [from, to] of Object.entries(view.aliases.presets)) lines.push('  preset ' + from + ' -> ' + to);
  lines.push('presets:');
  for (const preset of view.presets) {
    lines.push(
      '  ' + preset.id +
      ' models=' + preset.models.join(',') +
      ' judge=' + (preset.judge || '-') +
      ' synth=' + (preset.synth || '-')
    );
  }
  lines.push('models:');
  for (const model of view.models) {
    const details = [
      'backend=' + model.backend,
      'read-only=' + (model.readOnly ? 'yes' : 'no'),
      'selectable=' + (model.selectable ? 'yes' : 'no'),
      'configured=' + (model.configured ? 'yes' : 'no'),
      'ready=' + (model.ready ? 'yes' : 'no'),
      'reason=' + (model.reasons.length ? model.reasons.join(',') : '-'),
      'required-env=' + (model.requiredEnv.length ? model.requiredEnv.join(',') : '-'),
    ];
    if (model.remediation.length) details.push('remediation=' + model.remediation.join('; '));
    lines.push('  ' + model.id + ' (' + model.label + ') ' + details.join(' '));
  }
  return lines.join('\n') + '\n';
}

function parseComposeArgs(argv) {
  const values = { models: null, judge: null, synth: null, save: null, dryRun: false };
  const valueFlags = new Map([
    ['--models', 'models'], ['--judge', 'judge'], ['--synth', 'synth'], ['--save', 'save'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scope') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) return { ok: false, error: '--scope requires a value' };
      i++;
      continue;
    }
    if (arg === '--dry-run') {
      if (values.dryRun) return { ok: false, error: '--dry-run may be specified once' };
      values.dryRun = true;
      continue;
    }
    const key = valueFlags.get(arg);
    if (!key) return { ok: false, error: 'unknown compose option: ' + arg };
    if (values[key] !== null) return { ok: false, error: arg + ' may be specified once' };
    const value = argv[++i];
    if (!value || value.startsWith('--')) return { ok: false, error: arg + ' requires a value' };
    values[key] = value;
  }
  if (values.models === null) return { ok: false, error: '--models is required' };
  const models = values.models.split(',').map(model => model.trim());
  if (models.some(model => !model)) return { ok: false, error: '--models must be a comma-separated model list' };
  if (models.length < 1 || models.length > 8) return { ok: false, error: '--models must select between 1 and 8 models' };
  return { ok: true, ...values, models: models.map(canonicalModelId) };
}

function composeConfig(catalog) {
  return {
    ...catalog,
    judgeModel: 'opus',
    synthModel: 'opus',
  };
}

function resolveReadyModel(rawModel, role, catalog) {
  const id = canonicalModelId(rawModel);
  const readiness = modelReadiness(id, catalog);
  if (readiness.ready) return { ok: true, id };
  const noun = role === 'panel' ? 'model' : role + ' model';
  const reasons = readiness.reasons.length ? readiness.reasons.join(', ') : 'not-ready';
  const remediation = remediationFor(readiness);
  return {
    ok: false,
    error: noun + ' "' + id + '" is not ready (' + reasons + ')' +
      (remediation.length ? '; remediation: ' + remediation.join('; ') : '') +
      '. Run `frontier catalog` for details.',
  };
}

function resolveComposition(options, catalog) {
  const panel = [];
  for (const model of options.models) {
    const resolved = resolveReadyModel(model, 'panel', catalog);
    if (!resolved.ok) return resolved;
    panel.push(resolved.id);
  }
  const judge = canonicalModelId(options.judge || panel[0]);
  const synth = canonicalModelId(options.synth || panel[0]);
  for (const [role, model] of [['judge', judge], ['synth', synth]]) {
    const resolved = resolveReadyModel(model, role, catalog);
    if (!resolved.ok) return resolved;
  }
  return {
    ok: true,
    panel,
    judge,
    synth,
    state: {
      mode: 'fusion',
      preset: 'custom',
      models: panel,
      judgeModel: judge,
      synthModel: synth,
    },
  };
}

function cmdCatalog(argv) {
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') {
      if (json) {
        process.stderr.write('ERROR: catalog accepts --json once\n');
        process.exit(2);
      }
      json = true;
    } else if (argv[i] === '--scope') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        process.stderr.write('ERROR: --scope requires a value\n');
        process.exit(2);
      }
      i++;
    } else {
      process.stderr.write('ERROR: catalog accepts only --json\n');
      process.exit(2);
    }
  }
  const view = catalogView(buildRuntimeCatalog());
  process.stdout.write(json ? JSON.stringify(view, null, 2) + '\n' : formatCatalogHuman(view));
}

function cmdCompose(argv, scope) {
  const options = parseComposeArgs(argv);
  if (!options.ok) {
    process.stderr.write('ERROR: compose ' + options.error + '\n');
    process.exit(2);
  }
  const catalog = buildRuntimeCatalog();
  const composition = resolveComposition(options, catalog);
  if (!composition.ok) {
    process.stderr.write('ERROR: ' + composition.error + '\n');
    process.exit(2);
  }

  process.stdout.write(
    'frontier compose resolved:\n' +
    '  panel: ' + composition.panel.join(', ') + '\n' +
    '  judge: ' + composition.judge + '\n' +
    '  synth: ' + composition.synth + '\n'
  );
  if (options.dryRun) {
    process.stdout.write('frontier compose dry-run: state and presets unchanged\n');
    return;
  }

  if (options.save) {
    const result = saveUserPreset(
      options.save.toLowerCase(),
      { models: composition.panel, judge: composition.judge, synth: composition.synth },
      scope,
      composeConfig(catalog)
    );
    if (!result.ok) {
      process.stderr.write('ERROR: ' + result.error + '\n');
      process.exit(2);
    }
    process.stdout.write('frontier preset saved: ' + result.name + '\n');
  }

  if (!saveState(composition.state, scope)) {
    process.stderr.write('ERROR: failed to save Frontier state\n');
    process.exit(1);
  }
  process.stdout.write('frontier compose armed: custom\n');
}

module.exports = {
  remediationFor,
  catalogView,
  formatCatalogHuman,
  parseComposeArgs,
  resolveComposition,
  cmdCatalog,
  cmdCompose,
};
