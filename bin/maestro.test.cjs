#!/usr/bin/env node
// Tests for bin/maestro.cjs. Zero dependencies.
// Run: node bin/maestro.test.cjs

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'maestro.cjs');
const CLI = path.join(ROOT, 'frontier', 'cli.cjs');

// Hermetic throwaway scope so both paths read the same (absent -> off)
// state and the test never mutates a real workspace's frontier state.
const env = { ...process.env, MAESTRO_SCOPE: 'maestro-bintest-' + process.pid };

function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env });
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro bin tests');

// 1. `maestro frontier status` delegates to frontier/cli.cjs: same scope,
//    same state, identical stdout, exit 0.
const viaBin = run(BIN, ['frontier', 'status']);
const viaCli = run(CLI, ['status']);
check('frontier status -> exit 0', viaBin.status === 0);
check('frontier status -> identical stdout to raw cli', viaBin.stdout === viaCli.stdout);
check('frontier status -> output is frontier state JSON', /"mode"\s*:/.test(viaBin.stdout));

// 2. Exit-code passthrough: an invalid mode makes frontier exit 2; the bin
//    must propagate that, not swallow it.
const badMode = run(BIN, ['frontier', 'mode']);
check('invalid frontier mode -> exit 2 propagated', badMode.status === 2);

// 3. No args -> usage on stdout, exit 0.
const noArgs = run(BIN, []);
check('no args -> exit 0', noArgs.status === 0);
check('no args -> usage names "maestro frontier"', noArgs.stdout.includes('maestro frontier'));

// 4. --help -> exit 0.
check('--help -> exit 0', run(BIN, ['--help']).status === 0);

// 5. Unknown command -> exit 1, error names the command.
const bogus = run(BIN, ['bogus']);
check('unknown command -> exit 1', bogus.status === 1);
check('unknown command -> error names it', bogus.stderr.includes('bogus'));

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
