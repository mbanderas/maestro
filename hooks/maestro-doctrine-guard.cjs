#!/usr/bin/env node
// Maestro PreToolUse doctrine-read guard. Enforces AGENTS.md S7.2
// structurally: when the doctrine is autoloaded (CLAUDE.md/AGENTS.md
// present at cwd, which Claude Code injects at session start), a Read
// of AGENTS.md or CLAUDE.md re-buys tokens for content already in
// context. This hook replaces the probabilistic S7.2 prose line with a
// deterministic deny.
//
// Modes via MAESTRO_DOCTRINE_GUARD:
// - "once" (default): allow the first doctrine Read per session
//   (marker file in the OS temp dir keyed by session_id), deny
//   repeats. Lets a task that is ABOUT the doctrine (review, edit,
//   debug) read the live file once, while still blocking re-read
//   loops (S7.2: "a subagent without it in context reads AGENTS.md
//   once").
// - "always": deny every doctrine Read while doctrine files exist at
//   cwd. Strict token-saving mode for runtimes whose subagents always
//   receive the project doctrine automatically; the deny reason tells
//   the model to use the in-context copy.
// - "0": disabled.
//
// When no doctrine file exists at cwd nothing was autoloaded, so reads
// pass through untouched (e.g. inspecting another repo's AGENTS.md).
// docs/orchestration.md is never guarded -- it is the on-demand layer
// and reading it is the intended path. Fails open on any error.
//
// Payload fields verified against code.claude.com/docs/en/hooks
// (PreToolUse input: session_id, cwd, tool_name, tool_input; output:
// hookSpecificOutput.permissionDecision allow|deny|ask + reason),
// 2026-06-11.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mode = process.env.MAESTRO_DOCTRINE_GUARD || 'once';
if (mode === '0') process.exit(0);

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (data.tool_name !== 'Read' || !data.tool_input) process.exit(0);

const fp = data.tool_input.file_path;
if (typeof fp !== 'string') process.exit(0);
const base = path.basename(fp).toLowerCase();
if (base !== 'agents.md' && base !== 'claude.md') process.exit(0);

// Guard only when the doctrine was actually autoloaded: a doctrine file
// at cwd is what Claude Code injects at session start.
const cwd = typeof data.cwd === 'string' ? data.cwd : process.cwd();
let autoloaded = false;
try {
  autoloaded = fs.existsSync(path.join(cwd, 'CLAUDE.md'))
    || fs.existsSync(path.join(cwd, 'AGENTS.md'));
} catch { autoloaded = false; }
if (!autoloaded) process.exit(0);

if (mode === 'once' && data.session_id) {
  const marker = path.join(
    os.tmpdir(),
    `maestro-doctrine-guard-${String(data.session_id).replace(/[^a-zA-Z0-9-]/g, '_')}`
  );
  if (!fs.existsSync(marker)) {
    try { fs.writeFileSync(marker, '1'); } catch { /* still allow */ }
    process.exit(0);
  }
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'maestro-doctrine-guard: denied Read of '
      + path.basename(fp) + ' -- the doctrine is autoloaded into context '
      + 'at session start (AGENTS.md S7.2); use the in-context copy '
      + 'instead of re-reading it from disk. The on-demand protocol '
      + 'layer lives in docs/orchestration.md, which is not blocked.'
  }
}));
process.exit(0);
