#!/usr/bin/env node
// Maestro Frontier autorun hook (UserPromptSubmit). When the engine is
// armed (frontier-state mode != 'off'), every user prompt is run through
// the configured preset/model via runFrontier, and the synthesized answer
// is injected back as additionalContext with a relay instruction + a
// one-line preset header, so the live session relays it. mode == 'off' ->
// zero overhead: no engine require, no spawn, no injected context.
//
// Recursion guard (load-bearing): the engine spawns child `claude -p`
// CLIs, and headless `claude -p` re-fires UserPromptSubmit hooks (verified
// against the Claude Code hooks contract). dispatch.cjs sets FUSION_DEPTH
// on every spawned child; this hook no-ops whenever FUSION_DEPTH is present,
// BEFORE any engine require or spawn. Without it the first armed prompt
// would fork the engine recursively.
//
// Degrade-to-normal: any engine error, empty answer, or thrown exception
// exits 0 with empty stdout (logging only to stderr), so a broken engine
// never blocks or corrupts a turn — the session just answers normally. A
// UserPromptSubmit hook can only ADD context; it cannot suppress the main
// turn, which is exactly the relay model.
//
// .cjs so Node treats it as CommonJS regardless of any parent "type":
// "module" package.json. configDir/state patterns reused from
// frontier/config.cjs; structure ported from maestro-terse-mode.cjs.

'use strict';

const fs = require('fs');

function noop() { process.exit(0); }

let data = {};
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { noop(); }

if (data.hook_event_name !== 'UserPromptSubmit') noop();

// Recursion guard FIRST: never run the engine inside an engine-spawned CLI.
// The engine sets FUSION_DEPTH on every child (dispatch.cjs:108); depth >= 1
// means we are inside a spawned panel/judge/synth process. Mirror run.cjs's
// own parseInt check (run.cjs:27) so the two layers agree and a stray
// FUSION_DEPTH='0'/'' in the environment reads as "not a child".
const fusionDepth = parseInt(process.env.FUSION_DEPTH || '0', 10);
if (Number.isFinite(fusionDepth) && fusionDepth >= 1) noop();

let state;
let scope;
try {
  const cfg = require('../frontier/config.cjs');
  const cwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.CODEX_PROJECT_DIR || process.cwd();
  scope = cfg.resolveScope([], { cwd });
  state = cfg.loadState(scope);
} catch {
  noop();
}

// Off -> zero overhead: no run.cjs require, no spawn, no injected context.
if (!state || state.mode === 'off') noop();

const prompt = String(data.prompt || '');

// Command guard (default ON): plugin/slash commands (/maestro:frontier off,
// /clear, /loop) are host directives, not questions -- fanning one through
// the panel costs minutes of blocking latency plus tokens for zero value.
// The hooks contract does not specify what `prompt` carries for a slash
// command, so detection covers BOTH candidate shapes: the raw typed `/cmd`
// form (whole-first-token match only, so `/etc/hosts is broken` still fans)
// and the transcript XML form (<command-name>/<command-message>/
// <command-args>, tag order varies between commands -- checked within the
// first 64 chars so a prose prompt merely quoting a tag mid-text still
// fans). Opt out with state.autorunOnCommands === true.
if (state.autorunOnCommands !== true) {
  const trimmed = prompt.trim();
  if (/<command-(?:name|message|args)>/.test(trimmed.slice(0, 64))) noop();
  const firstToken = trimmed.split(/\s+/, 1)[0] || '';
  if (/^\/[A-Za-z][\w:-]*$/.test(firstToken)) noop();
}

// Optional length gate (default 0 = every prompt). Skips trivially short
// prompts ("yes"/"ok") so they don't pay a full engine run.
const rawMin = Number(state.autorunMinChars);
const minChars = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
if (prompt.trim().length < minChars) noop();

// Loop / agentic-resume guard (load-bearing, default ON): never fan an
// autonomous-loop or scheduled-resume directive through the panel. Even with
// read-only members (config.cjs enforces that), re-running a build/loop prompt
// across N CLIs double-executes the loop's intent and is the S10-forbidden
// "loops never spawn loops" footgun -- the exact failure where fusion looked
// like a second write-loop racing the host session. Conservative, marker-based
// so it never suppresses an ordinary question: matches the `/loop` slash
// command, the harness autonomous-loop sentinels (<<autonomous-loop>> /
// <<autonomous-loop-dynamic>>), and "AUTONOMOUS LOOP" resume prompts. Opt out
// with state.autorunFanLoops === true.
if (state.autorunFanLoops !== true) {
  const LOOP_PROMPT_RE = /(^|\s)\/loop\b|<<\s*autonomous-loop|autonomous[ _-]loop\b/i;
  // Test the raw prompt AND a copy with <command-*> tags stripped to spaces:
  // the XML command form (<command-name>/loop</command-name>) puts `>` before
  // /loop, which (^|\s) never matches.
  const detagged = prompt.replace(/<\/?command-[a-z]+>/g, ' ');
  if (LOOP_PROMPT_RE.test(prompt) || LOOP_PROMPT_RE.test(detagged)) noop();
}

// Any unexpected throw after the await boundary degrades to a normal turn,
// never a non-zero exit / unhandled rejection.
run().catch((e) => {
  process.stderr.write('frontier-autorun: ' + ((e && e.message) || e) + '\n');
  process.exit(0);
});

async function run() {
  let result;
  const runStart = Date.now();
  // Live statusline progress: write the current stage as each one starts so
  // the context-bar can show ƒ⠿ fanning / ƒ⚖ judging / ƒ✶ synth during the
  // otherwise-silent blocking run. Cleared below on completion or error.
  const progress = require('../frontier/progress.cjs');
  const onProgress = progress.makeProgressWriter(scope);
  // Register this armed run so an out-of-process observer (the Stop
  // loop-guard, or an agent re-grounding per S10) can see a coordinated,
  // read-only Frontier run is in flight -- not a rogue write-loop. Released
  // on both paths; releaseRun is idempotent and a missed release self-heals
  // via runlock's dead-pid pruning (this hook process is short-lived).
  const runlock = require('../frontier/runlock.cjs');
  const runCwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.CODEX_PROJECT_DIR || process.cwd();
  try {
    const { runFrontier, ensureRunId } = require('../frontier/run.cjs');
    ensureRunId();
    runlock.registerRun({ kind: 'frontier', cwd: runCwd });
    // Non-blocking cost advisory (run time, the load-bearing surface): if this
    // run invokes a subscription-until adapter past its cutoff (Fable 5 after
    // 2026-07-07), emit a one-line stderr notice. stderr only — stdout is the
    // fused-answer channel the host relays. Best-effort; never gates the run.
    try {
      const cfg = require('../frontier/config.cjs');
      const advisory = cfg.runCostAdvisory(state, cfg.DEFAULTS);
      if (advisory) process.stderr.write(advisory + '\n');
    } catch { /* advisory is best-effort */ }
    result = await runFrontier({ prompt, state, deps: { onProgress } });
  } catch (e) {
    runlock.releaseRun();
    progress.clearProgress(scope);
    process.stderr.write('frontier-autorun: ' + ((e && e.message) || e) + '\n');
    noop();
  } finally {
    runlock.releaseRun();
  }
  const runMs = Date.now() - runStart;
  progress.clearProgress(scope);

  if (!result || result.status !== 'ok' || !result.final) {
    if (result && result.status === 'error') {
      process.stderr.write(
        'frontier-autorun: engine error [' + result.failure_reason + ']: ' + result.error + '\n');
    }
    noop();
  }

  const modelCount = result.responses ? result.responses.length : 1;
  const banner = '⚡ Frontier \xb7 ' + presetHeader(state) + ' \xb7 ' + modelCount + ' models \xb7 ' + Math.round(runMs / 1000) + 's';

  const context =
    'MAESTRO FRONTIER AUTORUN — ' + presetHeader(state) + '\n\n' +
    'The Maestro Frontier engine already ran this prompt through the panel ' +
    'above and produced the answer below. Begin your response with this exact ' +
    'banner line (verbatim, on its own line): ' + banner + '\n\n' +
    'Then relay the answer — you may reformat for clarity, but do not redo ' +
    'the work or contradict it:\n\n' +
    result.final;

  // fs.writeSync (synchronous, unbuffered) guarantees the full payload reaches
  // stdout before exit. process.exit() does NOT drain a pipe-backed
  // process.stdout, which would truncate a large engine answer (multi-KB
  // synthesis) into malformed JSON the hook consumer cannot parse.
  fs.writeSync(1, JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  }));
  process.exit(0);
}

function presetHeader(st) {
  if (st.mode === 'single') return 'single · ' + st.model;
  if (st.mode === 'fusion') {
    const preset = st.preset === 'custom'
      ? 'custom (' + (Array.isArray(st.models) ? st.models.join(', ') : '') + ')'
      : st.preset;
    return 'fusion · ' + preset;
  }
  return String(st.mode);
}
