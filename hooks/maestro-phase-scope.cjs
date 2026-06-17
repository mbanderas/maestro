#!/usr/bin/env node
// Maestro PostToolUse phase-scope guard. Enforces AGENTS.md S7.1
// structurally: max 5 files modified per phase. Counts distinct files
// touched by Edit/Write/NotebookEdit -- plus Bash mutations whose
// target path is statically extractable (redirects, sed -i, tee, mv,
// cp, rm, mkdir, touch) -- since the last real user prompt (one turn
// ~ one phase for interactive work) and warns once per turn when the
// count exceeds MAESTRO_PHASE_FILE_CAP (default 5). Targets with
// shell expansion ($, backticks, globs) are skipped: a missed count
// is cheaper than a false warning. git commit / npm install mutate
// but name no file; they are out of scope for a file counter.
//
// Wire with matcher "Edit|Write|NotebookEdit|Bash" so it only runs on
// file-modifying tools. Soft warning via additionalContext -- never
// blocks; the agent decides whether the scope is justified (e.g. a
// user-approved bulk rename). Degrades silently on missing payload
// fields. Payload fields verified against code.claude.com/docs/en/hooks
// (PostToolUse input: tool_name, tool_input, transcript_path;
// output: hookSpecificOutput.additionalContext), 2026-06-10.
//
// .cjs so Node treats it as CommonJS regardless of any "type": "module"
// package.json in a parent directory of the install location.
//
// Install: see README "Claude Code: Phase-Scope Guard".

const fs = require('fs');

const MUTATORS = new Set(['Edit', 'Write', 'NotebookEdit']);
const MARKER = 'Maestro phase-scope guard:';

// Best-effort file targets of a Bash command's mutating constructs.
function bashTargets(cmd) {
  const files = [];
  if (typeof cmd !== 'string') return files;
  const strip = t => t.replace(/^["']+|["']+$/g, '');
  const ok = t => t && !t.startsWith('-') && !/[$`*?{}()\[\]<>]/.test(t) && t !== '/dev/null' && !/^nul$/i.test(t);
  let m;
  const redir = /(?<![-=<>])>{1,2}\s*([^\s;&|<>]+)/g;
  while ((m = redir.exec(cmd))) { const t = strip(m[1]); if (ok(t)) files.push(t); }
  for (let seg of cmd.split(/(?:&&|\|\||[;|\n])/)) {
    seg = seg.replace(/(?<![-=<>])>{1,2}\s*[^\s;&|<>]+/g, ' ');
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    while (toks.length && (toks[0] === 'sudo' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0]))) toks.shift();
    const name = toks[0];
    if (!name) continue;
    const args = toks.slice(1).filter(a => !a.startsWith('-')).map(strip).filter(ok);
    if ((name === 'mv' || name === 'cp') && args.length >= 2) files.push(args[args.length - 1]);
    else if (name === 'rm' || name === 'mkdir' || name === 'touch' || name === 'tee') files.push(...args);
    else if (name === 'sed' && /(^|\s)-i/.test(seg) && args.length) files.push(args[args.length - 1]);
  }
  return files;
}

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

let lines = [];
if (data.transcript_path && fs.existsSync(data.transcript_path)) {
  try {
    const buf = fs.readFileSync(data.transcript_path, 'utf8');
    lines = (buf.length > 4000000 ? buf.slice(-4000000) : buf).split(/\r?\n/);
  } catch {}
}

// Locate the last genuine user prompt (typed text, not a tool_result
// carrier). Everything after it is the current turn.
let turnStart = 0;
const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } });
for (let i = 0; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'user' || e.isMeta || !e.message) continue;
  const c = e.message.content;
  const genuine = typeof c === 'string'
    ? true
    : Array.isArray(c) && c.some(x => x && x.type === 'text') && !c.some(x => x && x.type === 'tool_result');
  if (genuine) turnStart = i;
}

// Fire once per turn.
for (let i = turnStart; i < lines.length; i++) {
  if (lines[i].includes(MARKER)) process.exit(0);
}

const files = new Set();
for (let i = turnStart; i < parsed.length; i++) {
  const e = parsed[i];
  if (!e || e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
  for (const item of e.message.content) {
    if (!item || item.type !== 'tool_use' || !item.input) continue;
    if (MUTATORS.has(item.name)) {
      const p = item.input.file_path || item.input.notebook_path;
      if (p) files.add(p);
    } else if (item.name === 'Bash') {
      for (const t of bashTargets(item.input.command)) files.add(t);
    }
  }
}
// The triggering call may not be in the transcript yet.
if (data.tool_input) {
  if (MUTATORS.has(data.tool_name)) {
    const p = data.tool_input.file_path || data.tool_input.notebook_path;
    if (p) files.add(p);
  } else if (data.tool_name === 'Bash') {
    for (const t of bashTargets(data.tool_input.command)) files.add(t);
  }
}

const cap = parseInt(process.env.MAESTRO_PHASE_FILE_CAP, 10) || 5;
if (files.size > cap) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `${MARKER} ${files.size} distinct files modified this turn — past the ~${cap}-file phase guideline (AGENTS.md S7.1, a guideline not a hard cap). Keep a phase small enough to validate: split independent remaining work into a follow-up phase, or proceed if you intend a wider batch.`
    }
  }));
}

process.exit(0);
