#!/usr/bin/env node
// Tests for maestro-statusline-sync.cjs. Zero dependencies.
// Run: node hooks/maestro-statusline-sync.test.cjs

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, 'maestro-statusline-sync.cjs');

function mkTmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-slsync-'));
  const plugin = path.join(root, 'plugin');
  const claude = path.join(root, 'claude');
  fs.mkdirSync(path.join(plugin, 'statusline'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'statusline'), { recursive: true });
  // Fresh shipped source.
  fs.writeFileSync(path.join(plugin, 'statusline', 'context-bar.sh'), 'FRESH-SH\n');
  fs.writeFileSync(path.join(plugin, 'statusline', 'context-bar.ps1'), 'FRESH-PS1\n');
  return { root, plugin, claude };
}

function runHook(env, input) {
  return execFileSync(process.execPath, [HOOK], {
    input: input == null ? JSON.stringify({ hook_event_name: 'SessionStart' }) : input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function envFor(t) {
  return { CLAUDE_PLUGIN_ROOT: t.plugin, CLAUDE_CONFIG_DIR: t.claude };
}

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok    ${name}`); }
  else { failures++; console.error(`  FAIL  ${name}`); }
}

console.log('maestro-statusline-sync tests');

// 1. Stale present copy -> refreshed to shipped content; output silent.
{
  const t = mkTmp();
  const sh = path.join(t.claude, 'statusline', 'context-bar.sh');
  const ps1 = path.join(t.claude, 'statusline', 'context-bar.ps1');
  fs.writeFileSync(sh, 'STALE-SH-1.00M\n');
  fs.writeFileSync(ps1, 'STALE-PS1\n');
  const out = runHook(envFor(t));
  check('output is silent', out === '');
  check('stale .sh refreshed', fs.readFileSync(sh, 'utf8') === 'FRESH-SH\n');
  check('stale .ps1 refreshed', fs.readFileSync(ps1, 'utf8') === 'FRESH-PS1\n');
  // Exec bit is POSIX-only; Windows (NTFS) has no 0o111 bits and fs.chmod only
  // toggles the read-only attribute, so this assertion is meaningless there.
  check('.sh is executable', process.platform === 'win32' || (fs.statSync(sh).mode & 0o111) !== 0);
  fs.rmSync(t.root, { recursive: true, force: true });
}

// 2. Absent copy -> NOT created (refresh-if-present, opt-in preserved).
{
  const t = mkTmp();
  const sh = path.join(t.claude, 'statusline', 'context-bar.sh');
  runHook(envFor(t));
  check('absent .sh not created', !fs.existsSync(sh));
  fs.rmSync(t.root, { recursive: true, force: true });
}

// 3. Already-current copy -> left byte-identical (idempotent).
{
  const t = mkTmp();
  const sh = path.join(t.claude, 'statusline', 'context-bar.sh');
  fs.writeFileSync(sh, 'FRESH-SH\n');
  runHook(envFor(t));
  check('current .sh unchanged', fs.readFileSync(sh, 'utf8') === 'FRESH-SH\n');
  fs.rmSync(t.root, { recursive: true, force: true });
}

// 4. Symlinked destination -> refused, link target untouched.
{
  const t = mkTmp();
  const real = path.join(t.root, 'outside.sh');
  fs.writeFileSync(real, 'OUTSIDE\n');
  const link = path.join(t.claude, 'statusline', 'context-bar.sh');
  let linked = true;
  try { fs.symlinkSync(real, link); } catch { linked = false; }
  if (linked) {
    runHook(envFor(t));
    check('symlink dest refused (target untouched)', fs.readFileSync(real, 'utf8') === 'OUTSIDE\n');
  } else {
    check('symlink dest refused (target untouched)', true); // platform without symlink perms
  }
  fs.rmSync(t.root, { recursive: true, force: true });
}

// 5. Garbage stdin -> silent exit 0, still refreshes.
{
  const t = mkTmp();
  const sh = path.join(t.claude, 'statusline', 'context-bar.sh');
  fs.writeFileSync(sh, 'STALE\n');
  const out = runHook(envFor(t), 'not json');
  check('garbage stdin -> silent exit 0', out === '');
  check('garbage stdin still refreshed', fs.readFileSync(sh, 'utf8') === 'FRESH-SH\n');
  fs.rmSync(t.root, { recursive: true, force: true });
}

// 6. Missing shipped source -> no-op, no throw, dest left as-is.
{
  const t = mkTmp();
  fs.rmSync(path.join(t.plugin, 'statusline', 'context-bar.sh'));
  const sh = path.join(t.claude, 'statusline', 'context-bar.sh');
  fs.writeFileSync(sh, 'STALE\n');
  const out = runHook(envFor(t));
  check('missing source -> silent', out === '');
  check('missing source -> dest untouched', fs.readFileSync(sh, 'utf8') === 'STALE\n');
  fs.rmSync(t.root, { recursive: true, force: true });
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all tests passed');
