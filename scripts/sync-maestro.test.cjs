#!/usr/bin/env node
// Smoke test for scripts/sync-maestro.ps1. Proves the rewritten sync delegates
// to install.cjs (marker-splice): user content OUTSIDE the block survives, the
// block is refreshed, a re-run is byte-idempotent, and a dry-run writes nothing.
// Skips gracefully (passes) if no PowerShell (pwsh/powershell) is on PATH.
//
// Run: node scripts/sync-maestro.test.cjs

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let failures = 0;
function check(name, cond) {
  if (cond) process.stdout.write(`  ok    ${name}\n`);
  else { failures++; process.stderr.write(`  FAIL  ${name}\n`); }
}

console.log('sync-maestro smoke tests');

// Prefer pwsh (PS7, the project standard); on Windows fall back to Windows
// PowerShell. Skip (pass) if neither is available — keeps npm test green on
// runners without PowerShell while exercising the real script where it exists.
function findShell() {
  const candidates = ['pwsh'];
  if (process.platform === 'win32') candidates.push('powershell');
  for (const sh of candidates) {
    try {
      const r = spawnSync(sh, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'],
        { encoding: 'utf8' });
      if (r.status === 0) return sh;
    } catch { /* not found — try next */ }
  }
  return null;
}

const shell = findShell();
if (!shell) {
  console.log('  SKIP  no PowerShell (pwsh/powershell) on PATH — sync smoke not run');
  console.log('\nall tests passed (sync smoke skipped)');
  process.exit(0);
}

const script = path.join(__dirname, 'sync-maestro.ps1');

const tmpDirs = [];
function mkTmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-sync-test-'));
  tmpDirs.push(d);
  return d;
}

function runSync(workspaceRoot, listFile, dryRun) {
  const args = ['-NoProfile', '-File', script,
    '-WorkspaceRoot', workspaceRoot, '-ListFile', listFile];
  if (dryRun) args.push('-DryRun');
  return spawnSync(shell, args, { encoding: 'utf8' });
}

// Downstream repo: user content surrounding a STALE maestro block.
const ws = mkTmp();
const repo = path.join(ws, 'testrepo');
fs.mkdirSync(repo);
const dest = path.join(repo, 'AGENTS.md');
const userContent =
  'MY REPO NOTES\n\n<!-- maestro:begin -->\nOLD STALE DOCTRINE\n<!-- maestro:end -->\n\nMORE USER NOTES\n';
fs.writeFileSync(dest, userContent, 'utf8');

const listFile = path.join(ws, 'list.txt');
fs.writeFileSync(listFile, 'testrepo\n', 'utf8');

// 1. Dry-run writes nothing.
const dry = runSync(ws, listFile, true);
check('a: dry-run exits 0', dry.status === 0);
check('b: dry-run leaves AGENTS.md byte-unchanged', fs.readFileSync(dest, 'utf8') === userContent);

// 2. Real sync splices the block, preserving content outside it.
const real = runSync(ws, listFile, false);
check('c: sync exits 0', real.status === 0);
const after1 = fs.readFileSync(dest, 'utf8');
check('d: stale doctrine replaced with real doctrine',
  !after1.includes('OLD STALE DOCTRINE') && after1.includes('Decision Gate'));
check('e: user content ABOVE the block preserved',
  after1.includes('MY REPO NOTES') &&
  after1.indexOf('MY REPO NOTES') < after1.indexOf('<!-- maestro:begin -->'));
check('f: user content BELOW the block preserved',
  after1.includes('MORE USER NOTES') &&
  after1.indexOf('MORE USER NOTES') > after1.indexOf('<!-- maestro:end -->'));
check('g: exactly one begin and one end marker',
  (after1.match(/<!-- maestro:begin -->/g) || []).length === 1 &&
  (after1.match(/<!-- maestro:end -->/g) || []).length === 1);

// 3. Re-run is byte-idempotent.
const real2 = runSync(ws, listFile, false);
check('h: re-run exits 0', real2.status === 0);
check('i: re-run is byte-idempotent', fs.readFileSync(dest, 'utf8') === after1);

// 4. A missing workspace dir is reported, not fatal.
const ws2 = mkTmp();
const list2 = path.join(ws2, 'list.txt');
fs.writeFileSync(list2, 'does-not-exist\n', 'utf8');
const miss = runSync(ws2, list2, false);
check('j: missing downstream dir is non-fatal (exit 0)', miss.status === 0);
check('k: missing downstream dir reported as MISS', (miss.stdout || '').includes('MISS'));

// cleanup
for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall tests passed');
