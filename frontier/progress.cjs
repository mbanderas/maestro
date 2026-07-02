#!/usr/bin/env node
// Maestro Frontier — live progress file for the statusline.
//
// The armed autorun runs the panel->judge->synth pipeline inside a blocking
// UserPromptSubmit hook (silent to the chat until it returns). To give a live
// signal during that wait, the hook wires makeProgressWriter(scope) as the
// engine's onProgress callback; it writes frontier-progress.<scope>.json with
// the current stage as each stage starts. The context-bar statusline reads
// that file and renders a transient phase (ƒ⠿ fanning 2/3 -> ƒ⚖ judging ->
// ƒ✶ synth) in place of the static armed badge, then snaps back when the file
// is cleared. clearProgress removes it on completion; the statusline also
// ignores a file whose ts is stale (>300s), so a crashed run never pins a
// phantom phase.
//
// Scope + path resolution reuse frontier/config.cjs so the file the engine
// writes is byte-for-byte the path the statusline computes (cc-<hash>). The
// statusline only ever renders the whitelisted phase words + clamped integer
// counts from this file -- never raw bytes -- so the file is presentation
// data, not a trust boundary.
//
// .cjs so Node treats it as CommonJS regardless of a parent "type": "module".

'use strict';

const fs = require('fs');
const path = require('path');
const { statePath } = require('./config.cjs');

// Phases the statusline knows how to render. The writer maps the engine's
// onProgress events onto exactly these; anything else is dropped.
const PHASES = ['panel', 'judge', 'synth', 'single', 'escalate'];

// Model names are presentation data: whitelisted or omitted, never raw bytes.
const MODEL_RE = /^[a-z0-9.-]{1,24}$/i;

/**
 * Progress file path for a scope, derived from statePath so the scope-alias
 * and default/suffix rules match the state file (and the statusline reader)
 * exactly: frontier-state[.scope].json -> frontier-progress[.scope].json.
 * @param {string} [scope]
 * @returns {string}
 */
function progressPath(scope) {
  const sp = statePath(scope);
  return path.join(path.dirname(sp), path.basename(sp).replace('frontier-state', 'frontier-progress'));
}

/**
 * Atomic, symlink-refusing, 0600 write of the progress record. Mirrors
 * saveState in config.cjs. Never throws — progress is best-effort telemetry.
 * @param {string} scope
 * @param {{ phase:string, done?:number, total?:number, model?:string, startTs?:number }} rec
 * @returns {boolean}
 */
function writeProgress(scope, rec) {
  if (!rec || PHASES.indexOf(rec.phase) === -1) return false;
  const clampInt = (v) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > 99 ? 99 : n;
  };
  const record = {
    phase: rec.phase,
    done: clampInt(rec.done),
    total: clampInt(rec.total),
    ts: Date.now(),
    pid: process.pid,
  };
  // Optional enrichments (statusline renders model + elapsed): whitelist the
  // model name or omit it; startTs is the run start, forwarded verbatim only
  // when it is a sane positive epoch ms.
  if (typeof rec.model === 'string' && MODEL_RE.test(rec.model)) record.model = rec.model;
  const startTs = Math.floor(Number(rec.startTs));
  if (Number.isFinite(startTs) && startTs > 0) record.startTs = startTs;
  const payload = JSON.stringify(record);
  try {
    const p = progressPath(scope);
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    try { if (fs.lstatSync(dir).isSymbolicLink()) return false; } catch { return false; }
    try {
      if (fs.lstatSync(p).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }
    const tempPath = path.join(dir, '.frontier-progress.' + process.pid + '.' + Date.now() + '.tmp');
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      if (O_NOFOLLOW === 0) { try { if (fs.lstatSync(tempPath).isSymbolicLink()) return false; } catch {} }
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, payload);
      try { fs.fchmodSync(fd, 0o600); } catch {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the progress file for a scope. Never throws.
 * @param {string} scope
 */
function clearProgress(scope) {
  try { fs.unlinkSync(progressPath(scope)); } catch {}
}

/**
 * Build an onProgress(event) callback that writes the current stage to the
 * progress file. Maps engine events -> statusline phases; ignores terminal
 * events (panel-done/degraded/done — the caller clears the file on completion).
 * Never throws.
 * @param {string} scope
 * @returns {(event:object)=>void}
 */
function makeProgressWriter(scope) {
  // Run start, captured once at writer creation so every stage record carries
  // the same origin and the statusline can render elapsed time.
  const startTs = Date.now();
  return function onProgress(ev) {
    if (!ev || typeof ev.phase !== 'string') return;
    let rec = null;
    switch (ev.phase) {
      case 'panel-start':
        rec = { phase: 'panel', done: 0, total: Array.isArray(ev.models) ? ev.models.length : 0 };
        break;
      case 'panel-progress':
        // ev.model is the completing member — passed through (sanitized in
        // writeProgress) so the bar can name who just finished.
        rec = { phase: 'panel', done: ev.done, total: ev.total, model: ev.model };
        break;
      case 'judge-start':
        rec = { phase: 'judge', done: 0, total: 0, model: ev.model };
        break;
      case 'synth-start':
        rec = { phase: 'synth', done: 0, total: 0, model: ev.model };
        break;
      case 'escalate-start':
        rec = { phase: 'escalate', done: 0, total: 0, model: ev.model };
        break;
      case 'single-start':
        rec = { phase: 'single', done: 0, total: 0, model: ev.model };
        break;
      default:
        return;
    }
    rec.startTs = startTs;
    writeProgress(scope, rec);
  };
}

module.exports = { progressPath, writeProgress, clearProgress, makeProgressWriter, PHASES };
