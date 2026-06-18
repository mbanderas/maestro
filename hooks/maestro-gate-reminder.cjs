#!/usr/bin/env node
// Maestro UserPromptSubmit gate reminder. Soft, additive, fire-once.
//
// Injects the Decision Gate checklist (AGENTS.md S1) as additional
// context on the FIRST user prompt of a session, so the gate survives
// attention decay in long interactive sessions. Hooks inject context;
// they cannot force a verdict or a spawn — this is a reminder, not an
// enforcement gate.
//
// Fire-once: a marker file keyed by session_id under the OS temp dir.
// Opt-out: MAESTRO_GATE_REMINDER=0 disables entirely.
// The measured default includes the spawn imperative. A shorter
// verdict-only variant was tested and removed after increasing turns
// and cost in a 2026-06-12 smoke run.
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

const checklistLines = [
  'Maestro Decision Gate (S1): engage the task first — this is a',
  'reminder, not your opening move. Just BEFORE your first file edit',
  '(once you know the real file count) output the counted verdict line',
  '`Maestro · frontier <on|off> — files=<n> concerns=<m> -> single-agent | multi-agent — <reason>`.',
  'files>=5 across 2+ concerns = multi-agent: spawn the Planner via the',
  'Agent/Task tool BEFORE any edit. A met trigger downgrades ONLY on',
  '>60% file overlap between subtasks or <=3 files total in one',
  'dependency chain. Sub-trigger tasks stay single-agent. For obviously',
  'single-agent work the verdict is a one-line reflex — do not lead',
  'your response with it.'
];

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

const checklist = checklistLines.join('\n') +
  '\nCurrent frontier state for the badge: frontier ' + badge;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: checklist,
  },
}));
process.exit(0);
