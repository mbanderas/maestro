#!/usr/bin/env node
// Maestro — unified CLI. One stable `maestro` entrypoint so every tool
// wrapper and the docs call `maestro frontier ...` instead of the raw
// `node frontier/cli.cjs` path.
//
//   maestro frontier <mode|status|run|adopt> [...]
//       Delegates verbatim to frontier/cli.cjs in a child process with
//       inherited cwd, env, and stdio -> identical Frontier state and
//       scope (the engine's own scope autodetect and MAESTRO_SCOPE both
//       resolve exactly as a direct call would). The child's exit code
//       is propagated.
//
//   maestro install [--target <tool>] [--dry-run] [--project <path>]
//                   [--user] [--no-hooks]
//       Runs the cross-tool installer (scripts/install.cjs). Loaded
//       lazily so the bin works for `frontier` even where the installer
//       is absent.
//
// Zero dependencies. Resolves siblings relative to __dirname so it works
// whether invoked via an npm bin shim, `npx github:mbanderas/maestro`, or
// a direct `node bin/maestro.cjs`. .cjs so Node treats it as CommonJS
// regardless of any parent "type": "module".

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

function usage(code) {
  const w = code ? process.stderr : process.stdout;
  w.write(
    'Maestro — unified CLI\n' +
    '\n' +
    'Usage:\n' +
    '  maestro frontier <mode|status|run|adopt> [...]   run the Frontier engine\n' +
    '  maestro install [--target <tool>] [--dry-run] [--project <path>] [--user] [--no-hooks]\n' +
    '\n' +
    'Examples:\n' +
    '  maestro frontier status\n' +
    '  maestro frontier mode fusion --preset opus-gpt\n' +
    '  maestro frontier run "fix the failing test"\n' +
    '  maestro install --target auto --project .\n'
  );
  process.exit(code);
}

if (cmd === 'frontier') {
  const cli = path.join(__dirname, '..', 'frontier', 'cli.cjs');
  const r = spawnSync(process.execPath, [cli, ...rest], { stdio: 'inherit' });
  if (r.error) {
    process.stderr.write('maestro: failed to launch frontier — ' + (r.error.message || r.error) + '\n');
    process.exit(1);
  }
  process.exit(r.status === null ? 1 : r.status);
} else if (cmd === 'install') {
  let run;
  try {
    ({ run } = require(path.join(__dirname, '..', 'scripts', 'install.cjs')));
  } catch (e) {
    process.stderr.write('maestro: installer unavailable — ' + (e && e.message) + '\n');
    process.exit(1);
  }
  Promise.resolve(run(rest))
    .then(code => process.exit(code || 0))
    .catch(e => { process.stderr.write(String((e && e.stack) || e) + '\n'); process.exit(1); });
} else if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  usage(0);
} else {
  process.stderr.write('maestro: unknown command "' + cmd + '"\n');
  usage(1);
}
