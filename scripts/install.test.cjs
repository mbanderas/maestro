#!/usr/bin/env node
// Tests for scripts/install.cjs. Zero dependencies (Node stdlib only).
// Run: node scripts/install.test.cjs
//
// Uses mkdtemp for isolation; cleans up with fs.rmSync on exit.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { run, _test } = require('./install.cjs');

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
  check('2: creates settings/cli.cjs', fs.existsSync(path.join(TMP, 'settings', 'cli.cjs')));
  check('2: creates settings/config.cjs', fs.existsSync(path.join(TMP, 'settings', 'config.cjs')));
  check('2: creates bin/maestro.cjs', fs.existsSync(path.join(TMP, 'bin', 'maestro.cjs')));
  check('2: creates .gemini/commands/frontier.toml', fs.existsSync(path.join(TMP, '.gemini', 'commands', 'frontier.toml')));
  check('2: creates docs/orchestration.md', fs.existsSync(path.join(TMP, 'docs', 'orchestration.md')));
  check('2: creates GEMINI.md adapter (gemini target)', fs.existsSync(path.join(TMP, 'GEMINI.md')));
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

// ---- test 8: per-target adapter — only that tool's stuff ----
{
  // claude -> CLAUDE.md, and NOT the other tools' adapters
  const C = mkTmpTracked();
  run(['--target', 'claude', '--project', C]);
  check('8a: claude installs CLAUDE.md adapter', fs.existsSync(path.join(C, 'CLAUDE.md')));
  check('8b: claude does NOT install GEMINI.md', !fs.existsSync(path.join(C, 'GEMINI.md')));
  check('8c: claude does NOT install .cursorrules', !fs.existsSync(path.join(C, '.cursorrules')));
  check('8d: claude still gets docs/orchestration.md', fs.existsSync(path.join(C, 'docs', 'orchestration.md')));

  // cursor -> .cursorrules adapter + .cursor wrapper
  const U = mkTmpTracked();
  run(['--target', 'cursor', '--project', U]);
  check('8e: cursor installs .cursorrules adapter', fs.existsSync(path.join(U, '.cursorrules')));
  check('8f: cursor installs .cursor/commands/frontier.md wrapper', fs.existsSync(path.join(U, '.cursor', 'commands', 'frontier.md')));

  // codex -> AGENTS.md only, no runtime adapter file
  const X = mkTmpTracked();
  run(['--target', 'codex', '--project', X]);
  check('8g: codex installs AGENTS.md', fs.existsSync(path.join(X, 'AGENTS.md')));
  check('8h: codex installs no adapter file', !fs.existsSync(path.join(X, 'CLAUDE.md')) && !fs.existsSync(path.join(X, 'GEMINI.md')) && !fs.existsSync(path.join(X, '.cursorrules')));

  // adapter is append-only / no-clobber
  const K = mkTmpTracked();
  fs.writeFileSync(path.join(K, 'CLAUDE.md'), 'USER KEEP\n', 'utf8');
  run(['--target', 'claude', '--project', K]);
  const cm = fs.readFileSync(path.join(K, 'CLAUDE.md'), 'utf8');
  check('8i: adapter append-only keeps user content above the block',
    cm.includes('USER KEEP') && cm.includes('<!-- maestro:begin -->') &&
    cm.indexOf('USER KEEP') < cm.indexOf('<!-- maestro:begin -->'));
}

// ---- test 9: codex skills install ----
{
  const SKILLS = ['maestro-frontier', 'maestro-terse', 'maestro-settings', 'maestro-update'];
  const skillPath = (root, name) =>
    path.join(root, '.agents', 'skills', name, 'SKILL.md');

  // 9.1 dry-run writes NO skill files (only logs)
  const D = mkTmpTracked();
  const beforeD = listFiles(D).length;
  run(['--target', 'codex', '--project', D, '--dry-run']);
  check('9a: codex dry-run writes zero files', listFiles(D).length === beforeD);

  // 9.2 real install creates all four skills with non-empty content
  const TMP = mkTmpTracked();
  const code = run(['--target', 'codex', '--project', TMP]);
  check('9b: codex install returns 0', code === 0);
  for (const name of SKILLS) {
    const p = skillPath(TMP, name);
    check(`9c: creates .agents/skills/${name}/SKILL.md`, fs.existsSync(p));
    const nonEmpty = fs.existsSync(p) && fs.readFileSync(p, 'utf8').trim().length > 0;
    check(`9c: ${name} SKILL.md is non-empty`, nonEmpty);
  }

  // 9.3 existing codex wrapper + AGENTS.md writes still happen (no regression)
  check('9d: codex still installs AGENTS.md', fs.existsSync(path.join(TMP, 'AGENTS.md')));
  check('9d: codex still installs .codex/prompts/frontier.md wrapper',
    fs.existsSync(path.join(TMP, '.codex', 'prompts', 'frontier.md')));
  check('9d: codex installs settings CLI used by settings/terse skills',
    fs.existsSync(path.join(TMP, 'settings', 'cli.cjs')));

  // 9.4 INDICATOR contract delivered by the installed frontier skill
  const frontier = fs.readFileSync(skillPath(TMP, 'maestro-frontier'), 'utf8');
  check('9e: frontier SKILL.md contains "Maestro Frontier ON" indicator',
    frontier.includes('Maestro Frontier ON'));
  check('9e: frontier SKILL.md frontmatter is namespaced',
    frontier.includes('name: maestro-frontier'));
  check('9e: frontier SKILL.md references status --scope codex-project',
    frontier.includes('maestro frontier status --scope codex-project'));
  check('9e: frontier SKILL.md states the off contract (no indicator line)',
    frontier.includes('output no indicator line'));

  // 9.5 re-run is no-clobber / idempotent (does not overwrite or error)
  const userEdit = '\nUSER LOCAL EDIT\n';
  fs.appendFileSync(skillPath(TMP, 'maestro-frontier'), userEdit, 'utf8');
  const edited = fs.readFileSync(skillPath(TMP, 'maestro-frontier'), 'utf8');

  const origWrite = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (s) => { captured.push(s); origWrite(s); return true; };
  const rerun = run(['--target', 'codex', '--project', TMP]);
  process.stdout.write = origWrite;

  check('9f: re-run returns 0 (no error on existing skill)', rerun === 0);
  check('9f: re-run does not clobber user edit to skill',
    fs.readFileSync(skillPath(TMP, 'maestro-frontier'), 'utf8') === edited);
  check('9f: re-run logs user-edited preservation for codex skill',
    captured.join('').includes('preserved user-edited Codex skill'));
  check('9g: new install does not create legacy generic skill aliases',
    !fs.existsSync(skillPath(TMP, 'frontier')));
}

// ---- test 10: codex skills install to --user scope ----
{
  const OLD_HOME = process.env.USERPROFILE;
  const HOME = mkTmpTracked();
  process.env.USERPROFILE = HOME;

  const code = run(['--target', 'codex', '--project', mkTmpTracked(), '--user']);

  process.env.USERPROFILE = OLD_HOME;

  const skillPath = (name) => path.join(HOME, '.agents', 'skills', name, 'SKILL.md');
  check('10a: codex --user install returns 0', code === 0);
  check('10b: codex --user creates namespaced frontier skill',
    fs.existsSync(skillPath('maestro-frontier')));
  check('10c: codex --user creates namespaced update skill',
    fs.existsSync(skillPath('maestro-update')));
}

// ---- test 11: managed namespaced skills refresh on re-run ----
{
  const TMP = mkTmpTracked();
  const skillPath = path.join(TMP, '.agents', 'skills', 'maestro-update', 'SKILL.md');

  run(['--target', 'codex', '--project', TMP]);
  fs.writeFileSync(skillPath, '<!-- maestro-managed:codex-skill name=maestro-update sha256=0000 -->\nSTALE MANAGED\n', 'utf8');
  run(['--target', 'codex', '--project', TMP]);

  const refreshed = fs.readFileSync(skillPath, 'utf8');
  check('11a: stale managed namespaced skill is refreshed', !refreshed.includes('STALE MANAGED'));
  check('11b: refreshed managed skill keeps ownership marker',
    refreshed.includes('maestro-managed:codex-skill name=maestro-update'));
}

// ---- test 12: user-edited installed skills are preserved with next steps ----
{
  const TMP = mkTmpTracked();
  const skillPath = path.join(TMP, '.agents', 'skills', 'maestro-settings', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.writeFileSync(skillPath, 'USER SETTINGS SKILL\n', 'utf8');

  const origWrite = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (s) => { captured.push(s); origWrite(s); return true; };
  const code = run(['--target', 'codex', '--project', TMP]);
  process.stdout.write = origWrite;

  const output = captured.join('');
  check('12a: user-edited skill preservation returns 0', code === 0);
  check('12b: user-edited skill is not overwritten',
    fs.readFileSync(skillPath, 'utf8') === 'USER SETTINGS SKILL\n');
  check('12c: preservation report includes next steps',
    output.includes('preserved user-edited Codex skill') && output.includes('next step'));
}

// ---- test 13: legacy generic skill migration semantics ----
{
  const TMP = mkTmpTracked();
  const LEGACY = [
    ['frontier', 'maestro-frontier'],
    ['terse', 'maestro-terse'],
    ['settings', 'maestro-settings'],
    ['update', 'maestro-update'],
  ];

  for (const [legacyName] of LEGACY) {
    const genericPath = path.join(TMP, '.agents', 'skills', legacyName, 'SKILL.md');
    fs.mkdirSync(path.dirname(genericPath), { recursive: true });
    fs.writeFileSync(genericPath, _test.LEGACY_CODEX_SKILL_TEMPLATES[legacyName], 'utf8');
  }

  const origWrite = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (s) => { captured.push(s); origWrite(s); return true; };
  run(['--target', 'codex', '--project', TMP]);
  process.stdout.write = origWrite;

  for (const [legacyName, namespacedName] of LEGACY) {
    const genericPath = path.join(TMP, '.agents', 'skills', legacyName, 'SKILL.md');
    const namespacedPath = path.join(TMP, '.agents', 'skills', namespacedName, 'SKILL.md');
    const migrated = fs.readFileSync(genericPath, 'utf8');
    check(`13a: namespaced ${namespacedName} skill is installed during legacy migration`, fs.existsSync(namespacedPath));
    check(`13b: previous tracked ${legacyName} skill is replaced with compatibility shim`,
      migrated.includes('Legacy Maestro compatibility skill') && migrated.includes(namespacedName));
  }
  check('13c: legacy migration is reported',
    captured.join('').includes('migrated legacy Codex skill'));

  const genericPath = path.join(TMP, '.agents', 'skills', 'frontier', 'SKILL.md');
  fs.writeFileSync(genericPath, 'USER LEGACY FRONTIER\n', 'utf8');
  const captured2 = [];
  process.stdout.write = (s) => { captured2.push(s); origWrite(s); return true; };
  run(['--target', 'codex', '--project', TMP]);
  process.stdout.write = origWrite;

  check('13d: user-edited legacy generic skill is preserved',
    fs.readFileSync(genericPath, 'utf8') === 'USER LEGACY FRONTIER\n');
  check('13e: preserved legacy generic skill report includes next steps',
    captured2.join('').includes('preserved user-edited legacy Codex skill'));
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
