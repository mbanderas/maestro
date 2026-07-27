#!/usr/bin/env node
// Maestro discipline runtime gate — shared by the enforcement-hook pack.
//
// The discipline layer ships two runtime halves: the doctrine TEXT
// (AGENTS.md kernel, autoloaded into context at session start) and this
// enforcement-hook pack (gate-reminder, doctrine-guard, phase-scope,
// subagent-guard, loop-guard, gate-telemetry, toolbudget-advisory). The
// runtime toggle `discipline off` (settings/config.cjs, key `discipline`,
// or MAESTRO_DISCIPLINE=off) makes every hook in the pack no-op so users
// who only want the Frontier engine can silence enforcement without
// uninstalling. The doctrine TEXT cannot be unloaded mid-session, so it is
// unaffected — this gate is symmetric with Frontier's clean off only for
// the hook half (see README "Discipline layer toggle").
//
// Fail-open: any error resolving the optional setting returns DISABLED.
// Frontier must remain usable when the policy pack cannot read config.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.

'use strict';

/**
 * @returns {boolean} true when the discipline enforcement hooks should run.
 */
function disciplineEnabled() {
  try {
    const cfg = require('../settings/config.cjs');
    return cfg.readDiscipline().enabled !== false;
  } catch {
    return false;
  }
}

module.exports = { disciplineEnabled };
