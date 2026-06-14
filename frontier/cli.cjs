#!/usr/bin/env node
// Maestro Frontier — CLI entrypoint. Subcommands: mode, status, run.

'use strict';

const fs = require('fs');
const { DEFAULTS, loadState, saveState, validateMode, validatePreset, validateModel } = require('./config.cjs');
const { runFrontier } = require('./run.cjs');

// ---------- arg helpers ----------

function getFlag(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function hasFlag(argv, flag) {
  return argv.indexOf(flag) !== -1;
}

// ---------- usage ----------

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  frontier mode <off|single|fusion> [--model X] [--preset Y] [--models a,b,c]\n' +
    '  frontier status\n' +
    '  frontier run [<prompt>|-]\n'
  );
}

// ---------- subcommands ----------

function cmdMode(argv) {
  const newMode = argv[0];
  if (!newMode || !validateMode(newMode)) {
    process.stderr.write('ERROR: mode must be off, single, or fusion\n');
    process.exit(2);
  }

  let state;

  if (newMode === 'off') {
    state = { mode: 'off' };
  } else if (newMode === 'single') {
    const model = getFlag(argv, '--model');
    if (!model) {
      process.stderr.write('ERROR: --model required for single mode\n');
      process.exit(2);
    }
    if (!validateModel(model)) {
      process.stderr.write('ERROR: unknown model: ' + model + '\n');
      process.exit(2);
    }
    state = { mode: 'single', model };
  } else {
    // fusion
    const preset = getFlag(argv, '--preset');
    if (!preset) {
      process.stderr.write('ERROR: --preset required for fusion mode\n');
      process.exit(2);
    }
    if (!validatePreset(preset)) {
      process.stderr.write('ERROR: unknown preset: ' + preset + '\n');
      process.exit(2);
    }
    if (preset === 'custom') {
      const modelsRaw = getFlag(argv, '--models');
      if (!modelsRaw) {
        process.stderr.write('ERROR: --models required for custom preset\n');
        process.exit(2);
      }
      const models = modelsRaw.split(',').map(m => m.trim()).filter(Boolean);
      state = { mode: 'fusion', preset: 'custom', models };
    } else {
      state = { mode: 'fusion', preset };
    }

    // Optional judge/synth model overrides — apply to any fusion preset so
    // users can mix freely (e.g. --judge opus --synth gpt-5.5). Unset =
    // the preset's own stage model (presetStages) or the global default.
    const judge = getFlag(argv, '--judge');
    if (judge !== null) {
      if (!validateModel(judge)) {
        process.stderr.write('ERROR: unknown judge model: ' + judge + '\n');
        process.exit(2);
      }
      state.judgeModel = judge;
    }
    const synth = getFlag(argv, '--synth');
    if (synth !== null) {
      if (!validateModel(synth)) {
        process.stderr.write('ERROR: unknown synth model: ' + synth + '\n');
        process.exit(2);
      }
      state.synthModel = synth;
    }
  }

  saveState(state);
  process.stdout.write('frontier mode set: ' + JSON.stringify(state) + '\n');
}

function cmdStatus() {
  const state = loadState();
  process.stdout.write(JSON.stringify(state) + '\n');
}

async function cmdRun(argv) {
  let prompt;
  const rest = argv.join(' ').trim();
  if (!rest || rest === '-') {
    prompt = fs.readFileSync(0, 'utf8');
  } else {
    prompt = rest;
  }

  const state = loadState();

  if (state.mode === 'off') {
    process.stdout.write('Frontier off — using normal Maestro (engine not invoked).\n');
    process.exit(0);
  }

  const result = await runFrontier({ prompt, state });

  if (result.status === 'error') {
    process.stderr.write('ERROR [' + result.failure_reason + ']: ' + result.error + '\n');
    process.exit(1);
  }

  process.stdout.write(result.final + '\n');

  if (result.mode === 'fusion') {
    const models   = (result.responses || []).map(r => r.model);
    const failed   = (result.failed_models || []).length;
    const hasAnal  = !!result.analysis;
    process.stderr.write(
      'meta: preset=' + result.preset +
      ' models=' + models.join(',') +
      ' analysis=' + hasAnal +
      ' failed=' + failed + '\n'
    );
  }

  process.exit(0);
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];

  if (cmd === 'mode') {
    cmdMode(argv.slice(1));
  } else if (cmd === 'status') {
    cmdStatus();
  } else if (cmd === 'run') {
    await cmdRun(argv.slice(1));
  } else {
    usage();
    process.exit(2);
  }
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err.stack || err) + '\n');
    process.exit(1);
  });
}

module.exports = { main, getFlag };
