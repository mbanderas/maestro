#!/usr/bin/env node
// Maestro Frontier -- active-run registry.
//
// Records each live engine run (pid + runId + scope) to a small JSON file
// so an out-of-process observer (the Stop loop-guard, or an agent
// re-grounding per S10) can tell a coordinated, READ-ONLY Frontier
// subprocess apart from an independent autonomous write-loop. The env
// marker MAESTRO_FRONTIER_RUN_ID (frontier/run.cjs) identifies a run from
// INSIDE its own process; this registry makes the same fact observable
// from OUTSIDE it.
//
// Scope boundary (intentional): a registered run is a panel/judge/synth
// member that never writes the repo, so it is always safe to ignore as a
// "collision". This does NOT make two independent write-loops on one
// branch safe -- that genuinely races and stays the S10-forbidden state.
//
// Fail-open everywhere: any fs/permission error degrades to a no-op. The
// registry never blocks a run and never fabricates a collision. Stale
// entries (dead pid, unparseable) are pruned on read. Zero dependencies.
// CommonJS (.cjs) so Node treats it as CommonJS regardless of a parent
// "type": "module" package.json.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Registry directory; override via env for hermetic tests. */
function runsDir() {
  return process.env.MAESTRO_FRONTIER_RUNS_DIR
    || path.join(os.tmpdir(), 'maestro-frontier-runs');
}

function entryPath(pid) {
  return path.join(runsDir(), String(pid) + '.json');
}

/**
 * Liveness probe. process.kill(pid, 0) sends no signal but performs the
 * permission/existence check: no throw or EPERM -> alive; ESRCH -> dead.
 * @param {number} pid
 * @returns {boolean}
 */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; }
  catch (e) { return !!(e && e.code === 'EPERM'); }
}

/**
 * Register the current process as an active Frontier run. Idempotent per
 * pid (overwrites its own entry). Returns the written entry or null.
 * @param {{ runId?: string, kind?: string, cwd?: string }} [info]
 * @returns {object|null}
 */
function registerRun(info) {
  try {
    fs.mkdirSync(runsDir(), { recursive: true });
    const entry = {
      pid: process.pid,
      runId: (info && info.runId) || process.env.MAESTRO_FRONTIER_RUN_ID || null,
      kind: (info && info.kind) || 'frontier',
      cwd: (info && info.cwd) || process.cwd(),
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(entryPath(entry.pid), JSON.stringify(entry));
    return entry;
  } catch { return null; }
}

/**
 * Remove a run entry (defaults to the current process). Best-effort.
 * @param {number} [pid]
 */
function releaseRun(pid) {
  try { fs.unlinkSync(entryPath(pid || process.pid)); } catch { /* fail-open */ }
}

/**
 * List live Frontier runs, pruning dead-pid and unparseable entries.
 * @param {{ cwd?: string }} [opts] optional cwd filter (resolved compare)
 * @returns {object[]}
 */
function listActiveRuns(opts) {
  const cwd = opts && opts.cwd;
  let files;
  try { files = fs.readdirSync(runsDir()); } catch { return []; }

  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(runsDir(), f);
    let entry = null;
    try { entry = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { entry = null; }
    if (!entry || !Number.isInteger(entry.pid)) { try { fs.unlinkSync(p); } catch {} continue; }
    if (!isAlive(entry.pid)) { try { fs.unlinkSync(p); } catch {} continue; }
    if (cwd && entry.cwd && path.resolve(entry.cwd) !== path.resolve(cwd)) continue;
    out.push(entry);
  }
  return out;
}

module.exports = { registerRun, releaseRun, listActiveRuns, isAlive, runsDir };

// Queryable from the shell / by a re-grounding agent: prints the live
// coordinated Frontier runs in the current workspace as JSON.
if (require.main === module) {
  process.stdout.write(JSON.stringify(listActiveRuns({ cwd: process.cwd() }), null, 2) + '\n');
}
