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
try {
  state = require('../frontier/config.cjs').loadState();
} catch {
  noop();
}

// Off -> zero overhead: no run.cjs require, no spawn, no injected context.
if (!state || state.mode === 'off') noop();

const prompt = String(data.prompt || '');

// Optional length gate (default 0 = every prompt). Skips trivially short
// prompts ("yes"/"ok") so they don't pay a full engine run.
const rawMin = Number(state.autorunMinChars);
const minChars = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
if (prompt.trim().length < minChars) noop();

// Any unexpected throw after the await boundary degrades to a normal turn,
// never a non-zero exit / unhandled rejection.
run().catch((e) => {
  process.stderr.write('frontier-autorun: ' + ((e && e.message) || e) + '\n');
  process.exit(0);
});

async function run() {
  let result;
  try {
    const { runFrontier } = require('../frontier/run.cjs');
    result = await runFrontier({ prompt, state });
  } catch (e) {
    process.stderr.write('frontier-autorun: ' + ((e && e.message) || e) + '\n');
    noop();
  }

  if (!result || result.status !== 'ok' || !result.final) {
    if (result && result.status === 'error') {
      process.stderr.write(
        'frontier-autorun: engine error [' + result.failure_reason + ']: ' + result.error + '\n');
    }
    noop();
  }

  const context =
    'MAESTRO FRONTIER AUTORUN — ' + presetHeader(state) + '\n\n' +
    'The Maestro Frontier engine already ran this prompt through the panel ' +
    'above and produced the answer below. Relay it as your response — you ' +
    'may reformat for clarity, but do not redo the work or contradict it:\n\n' +
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
