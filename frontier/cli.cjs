#!/usr/bin/env node
// Maestro Frontier — CLI entrypoint. Subcommands: mode, status, run.

'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULTS, loadState, saveState, resolveScope, validateMode, validatePreset, validateModel, adoptLegacyState, runCostAdvisory } = require('./config.cjs');
const { loadUserPresets, saveUserPreset, deleteUserPreset, withUserPresets } = require('./presets.cjs');
const { runFrontier, ensureRunId, canonicalModelId, canonicalPresetId } = require('./run.cjs');
const runlock = require('./runlock.cjs');
const { cmdCatalog, cmdCompose } = require('./compose.cjs');

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
    '  frontier adopt [--force] [--scope <name>]\n' +
    '  frontier preset save <name> --models a,b,c [--judge m] [--synth m] [--scope <name>]\n' +
    '  frontier preset list|delete <name> [--scope <name>]\n' +
    '  frontier roster\n' +
    '  frontier catalog [--json]\n' +
    '  frontier compose --models a,b,c [--judge m] [--synth m] [--save name] [--dry-run] [--scope <name>]\n'
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
    // Saved user presets are armable too — validate against the merged cfg
    // (built-ins always win on a name collision).
    if (!validatePreset(preset, withUserPresets(DEFAULTS, scope))) {
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
  // Arm-time cost advisory (secondary echo): if the armed panel/model draws on
  // a subscription-until adapter past its cutoff, note it on stderr. The run-
  // time emit (cmdRun / autorun) is the load-bearing surface; this just flags
  // it when the user arms. stderr keeps stdout the machine-readable state line.
  const armAdvisory = runCostAdvisory(state, withUserPresets(DEFAULTS, scope));
  if (armAdvisory) process.stderr.write(armAdvisory + '\n');
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

  function onProgress(ev) {
    switch (ev.phase) {
      case 'panel-start':
        process.stderr.write('⚡ Activating Frontier Intelligence\n');
        process.stderr.write('Fanning prompt to the panel — ' + ev.models.join(' \xb7 ') + '\n');
        break;
      case 'panel-progress':
        process.stderr.write('Panel responding… ' + ev.done + '/' + ev.total + ' in\n');
        break;
      case 'judge-start':
        process.stderr.write('Convening the judge (' + ev.model + ')\n');
        break;
      case 'synth-start':
        process.stderr.write('Synthesizing the verdict\n');
        break;
      case 'degraded':
        process.stderr.write('Frontier degraded — relaying best available (' + ev.failed + ' down)\n');
        break;
      case 'done':
        process.stderr.write('Frontier verdict ready — ' + ev.models + ' models \xb7 ' + Math.round(ev.ms / 1000) + 's\n');
        break;
      case 'single-start':
        process.stderr.write('⚡ Activating Frontier Intelligence (single \xb7 ' + ev.model + ')\n');
        break;
    }
  }

  // Register this run so an out-of-process observer (the Stop loop-guard, or
  // an agent re-grounding per S10) can see it is a coordinated, read-only
  // Frontier run -- not a rogue write-loop. Released in finally; a missed
  // release self-heals via runlock's dead-pid pruning.
  ensureRunId();
  runlock.registerRun({ kind: 'frontier', cwd: process.cwd() });
  // Saved user presets resolve through the merged cfg (identity when the
  // scope has none, so the built-in-only path is unchanged).
  const runCfg = withUserPresets(DEFAULTS, scope);
  // Non-blocking cost advisory (run time): flag a subscription-until adapter
  // past its cutoff on stderr before the run. stdout stays the fused answer.
  const runAdvisory = runCostAdvisory(state, runCfg);
  if (runAdvisory) process.stderr.write(runAdvisory + '\n');
  let result;
  try {
    result = await runFrontier({ prompt, state, cfg: runCfg, deps: { onProgress } });
  } finally {
    runlock.releaseRun();
  }

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

// Saved user presets: save/list/delete under the active scope. Persistence,
// validation, and the built-ins-always-win rule live in presets.cjs.
function cmdPreset(argv, scope) {
  const sub = argv[0];

  if (sub === 'save') {
    const name = argv[1] && !argv[1].startsWith('--') ? String(argv[1]).toLowerCase() : null;
    const modelsRaw = getFlag(argv, '--models');
    if (!name || !modelsRaw) {
      process.stderr.write('ERROR: usage: frontier preset save <name> --models a,b,c [--judge m] [--synth m]\n');
      process.exit(2);
    }
    const def = { models: modelsRaw.split(',').map(m => canonicalModelId(m.trim())).filter(Boolean) };
    const rawJudge = getFlag(argv, '--judge');
    if (rawJudge !== null) def.judge = canonicalModelId(rawJudge);
    const rawSynth = getFlag(argv, '--synth');
    if (rawSynth !== null) def.synth = canonicalModelId(rawSynth);
    const res = saveUserPreset(name, def, scope);
    if (!res.ok) {
      process.stderr.write('ERROR: ' + res.error + '\n');
      process.exit(2);
    }
    process.stdout.write('frontier preset saved: ' + name + ' ' + JSON.stringify(def) + '\n');
    return;
  }

  if (sub === 'list') {
    const all = loadUserPresets(scope);
    const names = Object.keys(all).sort();
    if (names.length === 0) {
      process.stdout.write('no saved presets\n');
      return;
    }
    for (const n of names) {
      const d = all[n];
      process.stdout.write(
        n + ' models=' + d.models.join(',') +
        ' judge=' + (d.judge || '-') + ' synth=' + (d.synth || '-') + '\n');
    }
    return;
  }

  if (sub === 'delete') {
    const name = argv[1] && !argv[1].startsWith('--') ? String(argv[1]).toLowerCase() : null;
    if (!name) {
      process.stderr.write('ERROR: usage: frontier preset delete <name>\n');
      process.exit(2);
    }
    const res = deleteUserPreset(name, scope);
    if (!res.ok) {
      process.stderr.write('ERROR: ' + res.error + '\n');
      process.exit(2);
    }
    process.stdout.write('frontier preset deleted: ' + name + '\n');
    return;
  }

  process.stderr.write('ERROR: preset subcommand must be save, list, or delete\n');
  process.exit(2);
}

// Resolve a bin the way spawn will see it: node scripts and explicit paths
// by existence, bare names by PATH scan (win32 shims add .exe/.cmd/.bat).
function findOnPath(bin) {
  if (path.isAbsolute(bin) || bin.includes('/') || bin.includes('\\')) {
    return fs.existsSync(bin) ? bin : null;
  }
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const d of dirs) {
    for (const ext of exts) {
      try { if (fs.existsSync(path.join(d, bin + ext))) return path.join(d, bin + ext); } catch {}
    }
  }
  return null;
}

// Roster: one line per adapter — bin presence on PATH plus the host env vars
// its auth passthrough needs (names only; values are never read into output).
function cmdRoster() {
  const binCache = {};
  for (const [id, a] of Object.entries(DEFAULTS.adapters)) {
    if (!(a.bin in binCache)) binCache[a.bin] = findOnPath(a.bin) !== null;
    const binOk = binCache[a.bin];
    const vars = [...new Set(Object.values(a.envFrom || {}))];
    const missing = vars.filter(v => !process.env[v]);
    const envCol = vars.length === 0
      ? '-'
      : vars.map(v => v + '(' + (process.env[v] ? 'set' : 'missing') + ')').join(',');
    const ready = binOk && missing.length === 0;
    process.stdout.write(
      id.padEnd(10) + ' bin=' + a.bin + '(' + (binOk ? 'found' : 'missing') + ')' +
      ' env=' + envCol + ' -> ' + (ready ? 'ready' : 'blocked') + '\n');
  }
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
  } else if (cmd === 'preset') {
    cmdPreset(argv.slice(1), scope);
  } else if (cmd === 'roster') {
    cmdRoster();
  } else if (cmd === 'catalog') {
    cmdCatalog(argv.slice(1));
  } else if (cmd === 'compose') {
    cmdCompose(argv.slice(1), scope);
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
