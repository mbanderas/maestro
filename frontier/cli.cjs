#!/usr/bin/env node
// Maestro Frontier — CLI entrypoint. Subcommands: mode, status, run.

'use strict';

const fs = require('fs');
const { DEFAULTS, loadState, saveState, resolveScope, validateMode, validatePreset, validateModel, adoptLegacyState } = require('./config.cjs');
const { runFrontier, canonicalModelId, canonicalPresetId } = require('./run.cjs');

// ---------- arg helpers ----------

function getFlag(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function hasFlag(argv, flag) {
  return argv.indexOf(flag) !== -1;
}

/**
 * Strip --scope <value> from an argv array so it never leaks into prompts.
 * @param {string[]} argv
 * @returns {string[]}
 */
function stripScopeFlag(argv) {
  const out = [];
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === '--scope') {
      i += 2; // skip flag and its value
    } else {
      out.push(argv[i]);
      i++;
    }
  }
  return out;
}

// ---------- usage ----------

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  frontier mode <off|single|fusion> [--model X] [--preset Y] [--models a,b,c] [--scope <name>]\n' +
    '  frontier status [--scope <name>]\n' +
    '  frontier run [<prompt>|-] [--scope <name>]\n' +
    '  frontier adopt [--force] [--scope <name>]\n'
  );
}

// ---------- subcommands ----------

function cmdMode(argv, scope) {
  const newMode = argv[0];
  if (!newMode || !validateMode(newMode)) {
    process.stderr.write('ERROR: mode must be off, single, or fusion\n');
    process.exit(2);
  }

  let state;

  if (newMode === 'off') {
    state = { mode: 'off' };
  } else if (newMode === 'single') {
    const rawModel = getFlag(argv, '--model');
    const model = rawModel && canonicalModelId(rawModel);
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
    const rawPreset = getFlag(argv, '--preset');
    const preset = rawPreset && canonicalPresetId(rawPreset);
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
      const models = modelsRaw.split(',').map(m => canonicalModelId(m.trim())).filter(Boolean);
      state = { mode: 'fusion', preset: 'custom', models };
    } else {
      state = { mode: 'fusion', preset };
    }

    // Optional judge/synth model overrides — apply to any fusion preset so
    // users can mix freely (e.g. --judge opus --synth gpt-5.5). Unset =
    // the preset's own stage model (presetStages) or the global default.
    const rawJudge = getFlag(argv, '--judge');
    const judge = rawJudge !== null ? canonicalModelId(rawJudge) : null;
    if (judge !== null) {
      if (!validateModel(judge)) {
        process.stderr.write('ERROR: unknown judge model: ' + judge + '\n');
        process.exit(2);
      }
      state.judgeModel = judge;
    }
    const rawSynth = getFlag(argv, '--synth');
    const synth = rawSynth !== null ? canonicalModelId(rawSynth) : null;
    if (synth !== null) {
      if (!validateModel(synth)) {
        process.stderr.write('ERROR: unknown synth model: ' + synth + '\n');
        process.exit(2);
      }
      state.synthModel = synth;
    }
  }

  saveState(state, scope);
  process.stdout.write('frontier mode set: ' + JSON.stringify(state) + '\n');
}

function cmdStatus(scope) {
  const state = loadState(scope);
  process.stdout.write(JSON.stringify(state) + '\n');
}

async function cmdRun(argv, scope) {
  // Strip --scope and its value before building the prompt so it never leaks.
  const cleanArgv = stripScopeFlag(argv);

  let prompt;
  const rest = cleanArgv.join(' ').trim();
  if (!rest || rest === '-') {
    prompt = fs.readFileSync(0, 'utf8');
  } else {
    prompt = rest;
  }

  const state = loadState(scope);

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

// Adopt the legacy global frontier-state.json into the current Claude Code
// workspace scope (cc-*). Source is read-only; never overwrites an existing
// workspace state file unless --force. This is the explicit escape hatch the
// per-workspace isolation change requires: a workspace never inherits the old
// global armed mode automatically, so a user who wants it copies it once.
function cmdAdopt(argv, scope) {
  const res = adoptLegacyState(scope, { force: hasFlag(argv, '--force') });

  if (res.ok) {
    process.stdout.write(
      'frontier adopted legacy state into ' + res.scope + ': ' +
      JSON.stringify(loadState(res.scope)) + '\n');
    return;
  }

  let msg;
  switch (res.reason) {
    case 'not-cc-scope':
      msg = 'adopt only targets a Claude Code per-workspace scope (cc-*); current ' +
            'scope is "' + res.scope + '". Run it inside a Claude Code workspace ' +
            '(under a git project root), or arm Codex/Cursor with `mode --scope`.';
      break;
    case 'missing-legacy':
      msg = 'no legacy global state to adopt (frontier-state.json not found). ' +
            'Nothing to do — arm this workspace with `mode` instead.';
      break;
    case 'invalid-legacy':
      msg = 'legacy state file is unreadable, a symlink, or invalid; refusing to adopt.';
      break;
    case 'exists':
      msg = 'this workspace already has frontier state (' +
            JSON.stringify(loadState(res.scope)) + '); pass --force to overwrite.';
      break;
    case 'unsafe-target':
      msg = 'refusing to write workspace state (symlink or unsafe path): ' + res.path;
      break;
    case 'write-failed':
      msg = 'failed to write workspace state file: ' + res.path;
      break;
    default:
      msg = 'adopt failed (' + res.reason + ').';
  }
  process.stderr.write('ERROR [' + res.reason + ']: ' + msg + '\n');
  process.exit(2);
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];

  // Resolve scope once from full argv; all subcommands receive it.
  const scope = resolveScope(argv);

  if (cmd === 'mode') {
    cmdMode(argv.slice(1), scope);
  } else if (cmd === 'status') {
    cmdStatus(scope);
  } else if (cmd === 'run') {
    await cmdRun(argv.slice(1), scope);
  } else if (cmd === 'adopt') {
    cmdAdopt(argv.slice(1), scope);
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
