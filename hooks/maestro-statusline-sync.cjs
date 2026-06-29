#!/usr/bin/env node
// Maestro status-line sync hook (SessionStart).
//
// Problem it solves: the context-bar status line is a STANDALONE copy the
// user installs once (curl into ~/.claude/statusline/, per docs/context-bar.md)
// and wires into ~/.claude/settings.json. A Claude Code plugin cannot edit
// settings.json or copy that file at install time, so when the plugin updates,
// the wired copy goes stale -- the user keeps seeing the old render (e.g. the
// "1.00M" token format) while the plugin already ships the fix. This hook
// closes that gap: on every session start it refreshes the wired copy from the
// plugin's shipped version.
//
// Refresh-if-present ONLY. It never creates the file: an absent context-bar.sh
// means the user never opted into the status line, and the plugin must not
// change anyone's status line uninvited (same opt-in rule as terse mode). It
// only overwrites a file that already exists and whose content differs.
//
// Source of truth: ${CLAUDE_PLUGIN_ROOT}/statusline/ (the installed plugin),
// falling back to this hook's own ../statusline when the env var is unset.
//
// Targets: the canonical ~/.claude/statusline/ (the documented install dir,
// and what the vibe-ads-style ad wrappers chain to), plus the dir resolved
// from settings.json statusLine.command when that resolves to a real
// context-bar script. Deduped.
//
// Hardened I/O (symlink refusal, O_NOFOLLOW, atomic temp+rename, size cap)
// mirrors hooks/maestro-terse-mode.cjs. The destination lives at a predictable
// path under ~/.claude -- a symlink-attack target -- so never write through a
// link. The source is trusted shipped plugin content.
//
// Always silent, never throws, exit 0: a maintenance hook must never break or
// clutter a session. It writes at most three times (.sh, .ps1, .mjs) and only
// right after an update changed the shipped script. A shipped script absent
// from the plugin (e.g. an older plugin without the .mjs) is simply skipped.
//
// .cjs so Node treats it as CommonJS regardless of a parent package.json.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPTS = ['context-bar.sh', 'context-bar.ps1', 'context-bar.mjs'];
const MAX_SCRIPT_BYTES = 1 << 16; // 64 KB cap; the scripts are ~6 KB

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

function sourceDir() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (root) return path.join(root, 'statusline');
  return path.join(__dirname, '..', 'statusline');
}

// Read a regular file, refusing symlinks and oversized files. Returns a Buffer
// or null. Buffer (not utf8) so a byte-exact compare/copy survives any encoding.
function safeReadFile(p) {
  try {
    let st;
    try { st = fs.lstatSync(p); } catch { return null; }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_SCRIPT_BYTES) return null;
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    let fd;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(p).isSymbolicLink()) return null; } catch {} }
      fd = fs.openSync(p, fs.constants.O_RDONLY | O_NOFOLLOW);
      const buf = Buffer.alloc(st.size);
      const n = fs.readSync(fd, buf, 0, st.size, 0);
      return buf.slice(0, n);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

// Atomic overwrite via temp+rename, refusing to write through a symlinked dir
// or destination. mode sets the final permission bits.
function safeWriteFile(dest, buf, mode) {
  try {
    const dir = path.dirname(dest);
    try { if (fs.lstatSync(dir).isSymbolicLink()) return false; } catch { return false; }
    try {
      if (fs.lstatSync(dest).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }
    const tempPath = path.join(dir, '.' + path.basename(dest) + '.' + process.pid + '.' + Date.now() + '.tmp');
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(tempPath).isSymbolicLink()) return false; } catch {} }
      fd = fs.openSync(tempPath, flags, mode);
      fs.writeSync(fd, buf, 0, buf.length, 0);
      try { fs.fchmodSync(fd, mode); } catch {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, dest);
    return true;
  } catch {
    return false;
  }
}

// The dir Claude Code is actually pointed at, when settings.json resolves to a
// real context-bar script. Reused from settings/config.cjs so there is one
// resolver. Best-effort: any failure just drops this candidate.
function resolvedTargetDir() {
  try {
    const cfg = require('../settings/config.cjs');
    const r = cfg.resolveStatuslineDir();
    if (r && r.scriptOk && r.dir) return r.dir;
  } catch {}
  return null;
}

function syncDir(dir, srcDir) {
  for (const name of SCRIPTS) {
    const src = safeReadFile(path.join(srcDir, name));
    if (!src) continue;
    const destPath = path.join(dir, name);
    // Refresh-if-present: skip if the user never installed this script here.
    let dst;
    try {
      const st = fs.lstatSync(destPath);
      if (st.isSymbolicLink() || !st.isFile()) continue;
      dst = safeReadFile(destPath);
    } catch {
      continue; // ENOENT -> not installed here -> do not create
    }
    if (dst && dst.equals(src)) continue; // already current
    const mode = name.endsWith('.sh') ? 0o755 : 0o644;
    safeWriteFile(destPath, src, mode);
  }
}

function run() {
  const srcDir = sourceDir();
  const dirs = new Set([path.join(claudeDir, 'statusline')]);
  const resolved = resolvedTargetDir();
  if (resolved) dirs.add(resolved);
  for (const dir of dirs) syncDir(dir, srcDir);
}

// Drain stdin (the harness pipes the SessionStart payload) but ignore it; we
// act unconditionally on session start. Garbage stdin must not throw.
try { fs.readFileSync(0, 'utf8'); } catch {}
try { run(); } catch {}
process.exit(0);
