#!/usr/bin/env node
// Tests for scripts/install.cjs. Zero dependencies (Node stdlib only).
// Run: node scripts/install.test.cjs
//
// Uses mkdtemp for isolation; cleans up with fs.rmSync on exit.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { run } = require('./install.cjs');

// ---- harness ----

let failures = 0;
function check(name, cond) {
  if (cond) {
    process.stdout.write(`  ok    ${name}\n`);
  } else {
    failures++;
    process.stderr.write(`  FAIL  ${name}\n`);
  }
}

console.log('install tests');

// ---- helpers ----

/**
 * List all files under a directory recursively.
 * @param {string} dir
 * @returns {string[]}
 */
function listFiles(dir) {
  const out = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  walk(dir);
  return out;
}

/**
 * Create a fresh temp directory for one test scenario.
 * @returns {string}
 */
function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-install-test-'));
}

const tmpDirs = [];
function mkTmpTracked() {
  const d = mkTmp();
  tmpDirs.push(d);
  return d;
}

// ---- test 1: dry-run writes ZERO files ----
{
  const TMP = mkTmpTracked();
  const before = listFiles(TMP).length;

  const code = run(['--target', 'gemini', '--project', TMP, '--dry-run']);

  check('1: dry-run returns 0', code === 0);
  check('1: dry-run writes zero files', listFiles(TMP).length === before);
}

// ---- test 2: real run creates expected files ----
{
  const TMP = mkTmpTracked();

  const code = run(['--target', 'gemini', '--project', TMP]);

  check('2: real run returns 0', code === 0);
  check('2: creates AGENTS.md', fs.existsSync(path.join(TMP, 'AGENTS.md')));
  check('2: creates frontier/cli.cjs', fs.existsSync(path.join(TMP, 'frontier', 'cli.cjs')));
  check('2: creates bin/maestro.cjs', fs.existsSync(path.join(TMP, 'bin', 'maestro.cjs')));
  check('2: creates .gemini/commands/frontier.toml', fs.existsSync(path.join(TMP, '.gemini', 'commands', 'frontier.toml')));
}

// ---- test 3: idempotent ----
{
  const TMP = mkTmpTracked();

  // First run
  run(['--target', 'gemini', '--project', TMP]);

  const agentsAfterFirst = fs.readFileSync(path.join(TMP, 'AGENTS.md'), 'utf8');
  const sentinelCountFirst = (agentsAfterFirst.match(/<!-- maestro:begin -->/g) || []).length;
  check('3a: first run has exactly 1 sentinel', sentinelCountFirst === 1);

  // Second run — capture stdout to check for "skipped"
  const origWrite = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (s) => { captured.push(s); origWrite(s); return true; };

  run(['--target', 'gemini', '--project', TMP]);

  process.stdout.write = origWrite;

  const agentsAfterSecond = fs.readFileSync(path.join(TMP, 'AGENTS.md'), 'utf8');
  const sentinelCountSecond = (agentsAfterSecond.match(/<!-- maestro:begin -->/g) || []).length;
  check('3b: second run does not double-append (sentinel count stays 1)', sentinelCountSecond === 1);

  const output = captured.join('');
  check('3c: second run prints "skipped (exists" for wrapper', output.includes('skipped (exists'));
}

// ---- test 4: doctrine no-clobber (pre-existing AGENTS.md) ----
{
  const TMP = mkTmpTracked();

  const USER_CONTENT = 'USER CONTENT\n';
  fs.writeFileSync(path.join(TMP, 'AGENTS.md'), USER_CONTENT, 'utf8');

  run(['--target', 'gemini', '--project', TMP]);

  const result = fs.readFileSync(path.join(TMP, 'AGENTS.md'), 'utf8');
  check('4a: file still contains original user content', result.includes('USER CONTENT'));
  check('4b: file now contains maestro sentinel below user content', result.includes('<!-- maestro:begin -->'));
  check('4c: user content comes before sentinel', result.indexOf('USER CONTENT') < result.indexOf('<!-- maestro:begin -->'));
}

// ---- test 5: wrapper no-clobber ----
{
  const TMP = mkTmpTracked();

  const wrapperDest = path.join(TMP, '.gemini', 'commands', 'frontier.toml');
  fs.mkdirSync(path.dirname(wrapperDest), { recursive: true });
  const USER_WRAPPER = 'USER WRAPPER';
  fs.writeFileSync(wrapperDest, USER_WRAPPER, 'utf8');

  run(['--target', 'gemini', '--project', TMP]);

  const result = fs.readFileSync(wrapperDest, 'utf8');
  check('5: wrapper not overwritten when exists', result === USER_WRAPPER);
}

// ---- test 6: symlink refusal ----
{
  const TMP = mkTmpTracked();

  let symlinkSkipped = false;
  try {
    const linkTarget = path.join(TMP, 'agents-real.md');
    fs.writeFileSync(linkTarget, 'REAL CONTENT\n', 'utf8');
    fs.symlinkSync(linkTarget, path.join(TMP, 'AGENTS.md'));

    const origContent = fs.readFileSync(linkTarget, 'utf8');

    const origWrite = process.stdout.write.bind(process.stdout);
    const captured = [];
    process.stdout.write = (s) => { captured.push(s); origWrite(s); return true; };

    run(['--target', 'gemini', '--project', TMP]);

    process.stdout.write = origWrite;

    const afterContent = fs.readFileSync(linkTarget, 'utf8');
    check('6: symlink target not modified', afterContent === origContent);

    const output = captured.join('');
    check('6: error message mentions symlink', output.toLowerCase().includes('symlink'));
  } catch (err) {
    // Symlink creation requires privileges on Windows without Developer Mode
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      symlinkSkipped = true;
      console.log('  skip  6: symlink test (insufficient privilege on this OS — EPERM/EACCES)');
    } else {
      throw err;
    }
  }
}

// ---- test 7: run is exported and returns a number ----
{
  check('7a: run is a function', typeof run === 'function');

  const TMP = mkTmpTracked();
  const result = run(['--target', 'gemini', '--project', TMP]);
  check('7b: run returns a number', typeof result === 'number');
  check('7c: run returns 0 on success', result === 0);
}

// ---- cleanup ----

for (const d of tmpDirs) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

// ---- result ----

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall tests passed');
