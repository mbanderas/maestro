#!/usr/bin/env node
// Maestro Settings — portable CLI. Usable from Codex and any other agent,
// and the write path the /maestro:settings command calls. Subcommands:
//   settings status [--json]
//   settings set <terse|frontier|context-bar> <value> [--judge M] [--synth M] [--models a,b,c]
// All state I/O goes through settings/config.cjs, which is the one writer
// over the three existing stores. Zero deps, CJS.

'use strict';

const settings = require('./config.cjs');

function getFlag(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function fmtFrontier(f) {
  if (!f || !f.mode || f.mode === 'off') return 'off';
  if (f.mode === 'single') return 'single ' + (f.model || '?');
  if (f.mode === 'fusion') {
    let s = 'fusion ' + (f.preset || '?');
    if (f.preset === 'custom' && Array.isArray(f.models)) s += ' [' + f.models.join(',') + ']';
    const extra = [];
    if (f.judgeModel) extra.push('judge=' + f.judgeModel);
    if (f.synthModel) extra.push('synth=' + f.synthModel);
    if (extra.length) s += ' ' + extra.join(' ');
    return s;
  }
  return f.mode;
}

function cmdStatus(argv) {
  const all = settings.readAll();
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(all, null, 2) + '\n');
    return;
  }
  const t = all.terse;
  const cb = all.contextBar;
  const lines = ['Maestro settings'];
  lines.push('  terse        ' + t.level + '  (source: ' + t.source + ')' +
    (t.envOverride ? '  [MAESTRO_TERSE_LEVEL override active]' : ''));
  lines.push('  frontier     ' + fmtFrontier(all.frontier));
  lines.push('  context-bar  ' + (cb.enabled ? 'on' : 'off') +
    (cb.scriptConfirmed ? '' : '  [status-line script unconfirmed: ' + cb.dir + ']'));
  process.stdout.write(lines.join('\n') + '\n');
}

function cmdList(argv) {
  const c = settings.catalog();
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(c, null, 2) + '\n');
    return;
  }
  const labelOf = {};
  c.frontier.models.forEach(m => { labelOf[m.id] = m.label; });
  const lines = ['Maestro settings — available values'];
  lines.push('  terse        ' + c.terse.values.join(' | '));
  lines.push('  context-bar  ' + c.contextBar.values.join(' | '));
  lines.push('  frontier     off | single:<model> | fusion:<preset>');
  lines.push('    models     ' + c.frontier.models.map(m => m.id + ' (' + m.label + ')').join(', '));
  lines.push('    presets');
  c.frontier.presets.forEach(p => {
    const desc = p.models
      ? p.models.map(id => labelOf[id] || id).join(' + ')
      : 'choose your own models (--models a,b,c)';
    lines.push('      ' + p.id.padEnd(14) + desc);
  });
  lines.push('    judge/synth  ' + c.frontier.stageModels.join(', ') +
    '  (default judge=' + c.frontier.defaults.judge + ', synth=' + c.frontier.defaults.synth + ')');
  process.stdout.write(lines.join('\n') + '\n');
}

function cmdSet(argv) {
  const key = argv[0];
  const value = argv[1];
  if (!key || value === undefined) {
    process.stderr.write('Usage: settings set <terse|frontier|context-bar> <value>\n');
    process.exit(2);
  }
  const opts = {
    judge: getFlag(argv, '--judge'),
    synth: getFlag(argv, '--synth'),
    models: getFlag(argv, '--models'),
    model: getFlag(argv, '--model'),
    preset: getFlag(argv, '--preset'),
  };
  Object.keys(opts).forEach(k => { if (opts[k] == null) delete opts[k]; });

  const r = settings.setKey(key, value, opts);
  if (!r.ok) {
    process.stderr.write('ERROR: ' + r.error + '\n');
    process.exit(2);
  }
  process.stdout.write('set ' + key + ' = ' + value + '\n');
  if (r.warning) process.stdout.write('WARNING: ' + r.warning + '\n');
}

function usageText() {
  return (
    'Usage:\n' +
    '  settings status [--json]\n' +
    '  settings list [--json]\n' +
    '  settings help\n' +
    '  settings set <key> <value> [--judge M] [--synth M] [--models a,b,c]\n' +
    '    terse        <off|lite|full|ultra>\n' +
    '    frontier     <off | single:<model> | fusion:<preset>>\n' +
    '    context-bar  <on|off>\n'
  );
}

function usage() {
  process.stderr.write(usageText());
}

// `help` prints the usage grammar plus the available-values catalog to
// stdout, so a non-interactive user (Codex, scripts) gets the same matrix the
// keyboard picker offers.
function cmdHelp() {
  process.stdout.write(usageText() + '\n');
  cmdList([]);
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'status') cmdStatus(argv.slice(1));
  else if (cmd === 'list') cmdList(argv.slice(1));
  else if (cmd === 'help' || cmd === '--help' || cmd === '-h') cmdHelp();
  else if (cmd === 'set') cmdSet(argv.slice(1));
  else { usage(); process.exit(2); }
}

if (require.main === module) main();

module.exports = { main, fmtFrontier };
