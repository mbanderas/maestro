#!/usr/bin/env node
// Maestro SubagentStop guard. Enforces AGENTS.md S7.3 structurally.
// - Warn on stop with orphaned background_tasks
// - Warn if no verification tool ran in recent transcript
// Soft warnings via additionalContext. Never blocks.
//
// Install: see README "Claude Code: Verification Hook".

const fs = require('fs');

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const warnings = [];

const bg = Array.isArray(data.background_tasks) ? data.background_tasks : [];
const active = bg.filter(t => t && (t.status === 'running' || t.status === 'pending' || t.status === 'active'));
if (active.length) {
  warnings.push(`${active.length} background task(s) still active. Wait or stop before declaring complete (AGENTS.md S7.3).`);
}

let txText = '';
if (data.transcript_path && fs.existsSync(data.transcript_path)) {
  try {
    const buf = fs.readFileSync(data.transcript_path, 'utf8');
    txText = buf.length > 40000 ? buf.slice(-40000) : buf;
  } catch {}
}

const verifyRe = /(tsc\s+--noEmit|eslint|pytest|jest|vitest|\bgo\s+test\b|\bcargo\s+test\b|npm\s+(?:run\s+)?test|pnpm\s+test|yarn\s+test|ruff\s+check|mypy|prettier\s+--check|biome\s+check)/i;
if (txText && !verifyRe.test(txText)) {
  warnings.push('No type-check/lint/test detected in recent transcript. Verify before complete, or state "no checker configured" (AGENTS.md S7.3).');
}

if (warnings.length) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
      additionalContext: 'Maestro guard:\n- ' + warnings.join('\n- ')
    }
  };
  process.stdout.write(JSON.stringify(payload));
}

process.exit(0);
