#!/usr/bin/env node
// Maestro UserPromptSubmit gate reminder. Soft, additive, fire-once.
//
// Injects a MINIMAL Decision Gate reminder (AGENTS.md S1) as additional
// context on the FIRST user prompt of a session, so the gate survives
// attention decay in long interactive sessions. Hooks inject context;
// they cannot force a verdict or a spawn — this is a reminder, not an
// enforcement gate.
//
// Fire-once: a marker file keyed by session_id under the OS temp dir.
// Opt-out: MAESTRO_GATE_REMINDER=0 disables entirely.
//
// Cost: the full S1 spec (triggers, downgrade rule, spawn imperative)
// already lives in cached doctrine — AGENTS.md S1 is in context every
// turn at ~zero marginal cost. Re-emitting it here is uncached spend on
// every fired prompt. So this reminder carries only what cached doctrine
// cannot: the live frontier badge and a one-line nudge to emit the
// verdict, with the parseable template the telemetry oracle keys on.
// (A 2026-06-12 smoke run favored the verbose variant; that predates the
// doctrine being reliably cached and is superseded by the 2026-06-22
// overhead work. Behavior change — PENDING_REVIEW.)
//
// Payload fields verified against code.claude.com/docs/en/hooks
// (UserPromptSubmit input: session_id, transcript_path, cwd, prompt;
// stdout JSON hookSpecificOutput.additionalContext is added to
// context), 2026-06-11.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.

const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.MAESTRO_GATE_REMINDER === '0') process.exit(0);

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
// Discipline runtime toggle (settings `discipline off`): silence the pack.
if (!require('./maestro-discipline-gate.cjs').disciplineEnabled()) process.exit(0);
if (!data.session_id) process.exit(0);

const marker = path.join(
  os.tmpdir(),
  `maestro-gate-reminder-${String(data.session_id).replace(/[^a-zA-Z0-9-]/g, '_')}`
);
if (fs.existsSync(marker)) process.exit(0);
try { fs.writeFileSync(marker, '1'); } catch { /* still remind */ }

// Inject the live frontier engine state so the badge in the verdict
// line is accurate. Degrades to 'off' on any failure — never throws.
let badge = 'off';
try {
  const cfg = require('../frontier/config.cjs');
  const cwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const scope = cfg.resolveScope([], { cwd });
  const st = cfg.loadState(scope);
  badge = (!st || st.mode === 'off')
    ? 'off'
    : ('on (' + st.mode + '/' + (st.preset || st.model || '') + ')');
} catch { badge = 'off'; }

// Minimal reminder: live badge embedded in the verdict template (so it
// is both the format the telemetry oracle parses and the current engine
// state), plus a pointer to the cached full spec. Full S1 rules —
// triggers, downgrade, spawn imperative — live in AGENTS.md, not here.
const reminder =
  'Maestro S1 gate: before your first edit, output the verdict line\n' +
  '`Maestro · frontier ' + badge + ' — files=<n> concerns=<m> -> single-agent|multi-agent`.\n' +
  'Full spec: AGENTS.md S1.';

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: reminder,
  },
}));
process.exit(0);
