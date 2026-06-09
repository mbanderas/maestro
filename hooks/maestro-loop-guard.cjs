#!/usr/bin/env node
// Maestro Stop-event loop guard. Enforces AGENTS.md S10 structurally.
//
// Fires only when the session shows loop evidence: active session crons
// (/loop <interval>) in the Stop payload's `session_crons`, or
// ScheduleWakeup calls (self-paced loops) in the transcript. Then:
// - Warn when no checkpoint artifact (_*.md) exists in cwd -- S10
//   requires one durable checkpoint file, read first on every wakeup.
// - Warn when wakeup count exceeds MAESTRO_LOOP_MAX_ITER (default 50)
//   -- S10 hard caps: the end condition set at start wins over anything
//   encountered mid-run.
//
// Fires at most once per session (transcript marker), never blocks,
// degrades silently on missing payload fields. Payload fields verified
// against code.claude.com/docs/en/hooks and the Claude Code changelog
// (Stop input: session_crons, transcript_path, cwd;
// output: hookSpecificOutput.additionalContext), 2026-06-10.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Loop Guard".

const fs = require('fs');
const path = require('path');

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

// Defensive: never re-enter a stop-hook continuation loop.
if (data.stop_hook_active === true) process.exit(0);

let txText = '';
const txPath = data.transcript_path;
if (txPath && fs.existsSync(txPath)) {
  try {
    const buf = fs.readFileSync(txPath, 'utf8');
    txText = buf.length > 2000000 ? buf.slice(-2000000) : buf;
  } catch {}
}

// Fire once per session.
if (txText.includes('Maestro loop guard:')) process.exit(0);

const crons = Array.isArray(data.session_crons) ? data.session_crons : [];
const wakeups = (txText.match(/"name"\s*:\s*"ScheduleWakeup"/g) || []).length;
const looping = crons.length > 0 || wakeups > 0;
if (!looping) process.exit(0);

const warnings = [];

const cap = parseInt(process.env.MAESTRO_LOOP_MAX_ITER, 10) || 50;
if (wakeups > cap) {
  warnings.push(`${wakeups} wakeups exceed the iteration cap (${cap}). S10: hard caps bound autonomous runs -- re-check the end condition declared at start; if it is met, deliver the final report and stop scheduling.`);
}

if (data.cwd) {
  let hasCheckpoint = false;
  try {
    hasCheckpoint = fs.readdirSync(data.cwd).some(f => /^_.+\.md$/i.test(f) && f !== '_.md');
  } catch { hasCheckpoint = true; } // unreadable cwd: assume fine, fail open
  if (!hasCheckpoint) {
    warnings.push('Session is looping but no checkpoint artifact (_<task>.md) exists in the working directory. S10: externalize phase status, findings, and decisions to one durable gitignored file and read it first on every wakeup.');
  }
}

if (warnings.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: 'Maestro loop guard:\n- ' + warnings.join('\n- ')
    }
  }));
}

process.exit(0);
