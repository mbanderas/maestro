#!/usr/bin/env node
// Guards that every runnable CLI example in the docs/skills/commands matches the
// real argument grammar of the repo-owned CLIs, so a doc can never ship an
// invocation that exits 2. Two grammars are enforced:
//   settings/cli.cjs : status | list | help | set <key> <value>   (no bare-key form)
//   <maestro> frontier : mode | status | run | adopt | preset | roster
// Scope: fenced bash/sh code blocks in *.md (where runnable examples live) plus
// the gemini *.toml command files. Prose mentions outside fences are ignored, and
// the `...` placeholder is allowed. install.cjs is *.cjs, deliberately NOT scanned:
// its LEGACY_CODEX_SKILL_TEMPLATES are historical recognition fingerprints, not
// shipped examples (see scripts/install.cjs + _repo-audit notes).
// Zero deps, CJS. Exit 1 on any failure.
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function check(name, ok, detail) {
  if (ok) console.log('  ok    ' + name);
  else { console.error('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); failed++; }
}

// ---- collect target files ----
const SHELL_INFO = new Set(['', 'bash', 'sh', 'shell', 'console', 'zsh']);
const SETTINGS_SUB = new Set(['status', 'list', 'help', 'set', '--help', '-h']);
const FRONTIER_SUB = new Set(['mode', 'status', 'run', 'adopt', 'preset', 'roster']);
const PLACEHOLDER = new Set(['...', '<...>']);

function walk(dir, acc, exts) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('_')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, acc, exts);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(abs);
  }
}

const mdFiles = [];
for (const f of ['README.md', 'AGENTS.md', 'CLAUDE.md']) {
  const abs = path.join(root, f);
  if (fs.existsSync(abs)) mdFiles.push(abs);
}
for (const d of ['docs', 'commands', 'codex-skills', 'integrations']) {
  walk(path.join(root, d), mdFiles, ['.md']);
}
const tomlFiles = [];
walk(path.join(root, 'integrations'), tomlFiles, ['.toml']);

// ---- grammar matchers ----
// settings/cli.cjs <sub> — token right after cli.cjs (closing quote optional for
// the `"<plugin-root>/settings/cli.cjs"` launcher form). `\s*(\S*)` (not `\s+(\S+)`)
// so a bare `node settings/cli.cjs` with NO subcommand still matches: that form
// hits the parser's else branch and exits 2, so it must be flagged too.
const SETTINGS_RE = /settings\/cli\.cjs"?\s*(\S*)/g;
// <maestro|maestro.cjs> frontier <sub> — requires a maestro prefix so a bare
// `frontier/cli.cjs` download URL (curl -O) is never mistaken for an invocation.
const FRONTIER_RE = /maestro(?:\.cjs)?"?\s+frontier\s+(\S+)/g;

function firstToken(raw) {
  // strip a leading closing quote and any trailing punctuation/quote/backtick
  return raw.replace(/^["'`]+/, '').replace(/["'`}]+$/, '');
}

function scanLine(line, rel, lineNo, violations) {
  let m;
  SETTINGS_RE.lastIndex = 0;
  while ((m = SETTINGS_RE.exec(line)) !== null) {
    const tok = firstToken(m[1]);
    if (tok === '') {
      violations.push(`${rel}:${lineNo} bare settings/cli.cjs invocation (no subcommand exits 2; use status|list|help|set) — ${line.trim()}`);
    } else if (!PLACEHOLDER.has(tok) && !SETTINGS_SUB.has(tok)) {
      violations.push(`${rel}:${lineNo} settings/cli.cjs subcommand "${tok}" (valid: status|list|help|set) — ${line.trim()}`);
    }
  }
  FRONTIER_RE.lastIndex = 0;
  while ((m = FRONTIER_RE.exec(line)) !== null) {
    const tok = firstToken(m[1]);
    if (!PLACEHOLDER.has(tok) && !FRONTIER_SUB.has(tok)) {
      violations.push(`${rel}:${lineNo} frontier subcommand "${tok}" (valid: mode|status|run|adopt|preset|roster) — ${line.trim()}`);
    }
  }
}

const violations = [];

// .md: only inside fenced bash/sh blocks
for (const abs of mdFiles) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  let inFence = false;
  let scanFence = false;
  lines.forEach((line, i) => {
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      if (!inFence) { inFence = true; scanFence = SHELL_INFO.has(fence[1].toLowerCase()); }
      else { inFence = false; scanFence = false; }
      return;
    }
    if (inFence && scanFence) scanLine(line, rel, i + 1, violations);
  });
}

// .toml: line-based (the gemini command files invoke `!{maestro frontier ...}`)
for (const abs of tomlFiles) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => scanLine(line, rel, i + 1, violations));
}

console.log('cli-example grammar tests');
check('scanned at least one doc surface', mdFiles.length > 0, String(mdFiles.length));
check('every settings/cli.cjs + frontier example matches the real parser grammar',
  violations.length === 0, '\n    ' + violations.join('\n    '));

if (failed) { console.error(failed + ' check(s) failed'); process.exit(1); }
console.log('all tests passed');
