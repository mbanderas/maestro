#!/usr/bin/env node
// Runs every hooks/*.test.cjs and scripts/*.test.cjs in sequence.
// Zero dependencies. Exit 1 if any suite fails. Run: npm test
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Hermetic child env: strip session-injected scope/recursion signals so the
// suite is deterministic regardless of host state (frontier armed, running
// inside a Claude Code / Codex session, etc.). Production code reads these
// from the ambient environment (frontier/run.cjs, frontier/config.cjs), so a
// host session leaks into child test procs otherwise — e.g. FUSION_DEPTH=1
// trips the recursion guard, CLAUDE_PROJECT_DIR steers the workspace scope.
const childEnv = { ...process.env };
for (const k of [
  'FUSION_DEPTH', 'MAESTRO_FRONTIER_RUN_ID', 'MAESTRO_FRONTIER_RUNS_DIR', 'MAESTRO_SCOPE',
  'CLAUDE_PROJECT_DIR', 'CODEX_PROJECT_DIR',
  'CLAUDE_PLUGIN_ROOT', 'CLAUDECODE',
  'PLUGIN_ROOT', 'PLUGIN_DATA',
]) delete childEnv[k];

let failed = 0;

for (const dir of ['hooks', 'scripts', 'frontier', 'settings', 'bin']) {
  const abs = path.join(__dirname, '..', dir);
  for (const f of fs.readdirSync(abs).filter(f => f.endsWith('.test.cjs')).sort()) {
    console.log(`== ${dir}/${f}`);
    try {
      execFileSync(process.execPath, [path.join(abs, f)], { stdio: 'inherit', env: childEnv });
    } catch {
      failed++;
    }
  }
}

if (failed) { console.error(`${failed} suite(s) failed`); process.exit(1); }
console.log('all suites passed');
