#!/usr/bin/env node
// Maestro Frontier — config unit tests. Zero deps, standalone.
// Uses a temp XDG_CONFIG_HOME so it never touches real config.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Set temp configDir BEFORE requiring config.cjs so configDir() picks it up.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-test-'));
process.env.XDG_CONFIG_HOME = tmpBase;

const { DEFAULTS, loadState, saveState, resolvePanel, validatePreset,
  resolveJudgeModel, resolveSynthModel, sanitizeScope, resolveScope,
  statePath, legacyStatePath, configDir } = require('./config.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

async function main() {

  // (a) loadState() with no file -> {mode:'off'}
  {
    const s = loadState();
    check('no-file -> mode:off', s.mode === 'off');
  }

  // (b) saveState then loadState round-trips {mode:'fusion',preset:'opus-gpt'}
  {
    const state = { mode: 'fusion', preset: 'opus-gpt' };
    const saved = saveState(state);
    check('saveState returns true', saved === true);
    const loaded = loadState();
    check('round-trip mode', loaded.mode === 'fusion');
    check('round-trip preset', loaded.preset === 'opus-gpt');
  }

  // (c) corrupt JSON file -> loadState returns {mode:'off'}
  {
    const { statePath } = require('./config.cjs');
    fs.writeFileSync(statePath(), 'NOT{JSON}', 'utf8');
    const s = loadState();
    check('corrupt JSON -> mode:off', s.mode === 'off');
    // clean up so subsequent tests start fresh
    try { fs.unlinkSync(statePath()); } catch {}
  }

  // (d) resolvePanel for 'opus-gpt' -> ['opus','gpt-5.5']
  {
    const models = resolvePanel({ preset: 'opus-gpt' }, DEFAULTS);
    check('opus-gpt resolves correctly', JSON.stringify(models) === JSON.stringify(['opus', 'gpt-5.5']));
  }

  // (e) resolvePanel custom with 9 models throws
  {
    let threw = false;
    try {
      resolvePanel(
        { preset: 'custom', models: ['opus','opus','opus','opus','opus','opus','opus','opus','opus'] },
        DEFAULTS
      );
    } catch {
      threw = true;
    }
    check('custom >8 models throws', threw);
  }

  // (f) resolvePanel custom with unknown model throws
  {
    let threw = false;
    try {
      resolvePanel({ preset: 'custom', models: ['opus', 'nonexistent-model'] }, DEFAULTS);
    } catch {
      threw = true;
    }
    check('custom unknown model throws', threw);
  }

  // (g) validatePreset
  {
    check('validatePreset frontier-trio true', validatePreset('frontier-trio', DEFAULTS) === true);
    check('validatePreset bogus false', validatePreset('bogus', DEFAULTS) === false);
  }

  // (h) gpt-duo preset resolves to two GPT-5.5 panel members
  {
    const models = resolvePanel({ preset: 'gpt-duo' }, DEFAULTS);
    check('gpt-duo panel', JSON.stringify(models) === JSON.stringify(['gpt-5.5', 'gpt-5.5']));
  }

  // (i) gpt-duo judge+synth resolve to gpt-5.5 (Codex-only fusion)
  {
    check('gpt-duo judge -> gpt-5.5', resolveJudgeModel({ preset: 'gpt-duo' }, DEFAULTS) === 'gpt-5.5');
    check('gpt-duo synth -> gpt-5.5', resolveSynthModel({ preset: 'gpt-duo' }, DEFAULTS) === 'gpt-5.5');
  }

  // (j) presets without a stage override fall back to the global Opus default
  {
    check('opus-gpt judge -> opus (default)', resolveJudgeModel({ preset: 'opus-gpt' }, DEFAULTS) === 'opus');
    check('opus-gpt synth -> opus (default)', resolveSynthModel({ preset: 'opus-gpt' }, DEFAULTS) === 'opus');
  }

  // (k) explicit --judge/--synth override beats preset + default
  {
    const st = { preset: 'gpt-duo', judgeModel: 'opus', synthModel: 'gemini' };
    check('explicit judge override', resolveJudgeModel(st, DEFAULTS) === 'opus');
    check('explicit synth override', resolveSynthModel(st, DEFAULTS) === 'gemini');
  }

  // ----------------------------------------------------------------
  // NEW CASES: scope isolation, path, migration, resolveScope.
  // Each case controls MAESTRO_SCOPE, CLAUDE_PLUGIN_ROOT, CLAUDECODE
  // explicitly (set AND delete per case) to prevent host-env bleed.
  // resolveScope(argv) takes a string[] — argv-style array.
  // sanitizeScope(v) takes a raw value string.
  // ----------------------------------------------------------------

  // (1) ISOLATION REGRESSION
  // Proves the bug is fixed: arming scope A must not affect scope B.
  {
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;

    // Ensure both scopes start empty (no legacy either).
    try { fs.unlinkSync(statePath('claude-code')); } catch {}
    try { fs.unlinkSync(statePath('codex')); } catch {}
    try { fs.unlinkSync(legacyStatePath()); } catch {}

    saveState({ mode: 'fusion', preset: 'opus-duo' }, 'claude-code');

    // Scope B ('codex'): file absent, no legacy -> must return {mode:'off'}.
    const codexState = loadState('codex');
    check('isolation: codex unaffected by claude-code arm', codexState.mode === 'off');

    // Scope A round-trip must be intact.
    const ccState = loadState('claude-code');
    check('isolation: claude-code round-trip mode', ccState.mode === 'fusion');
    check('isolation: claude-code round-trip preset', ccState.preset === 'opus-duo');

    // Cleanup.
    try { fs.unlinkSync(statePath('claude-code')); } catch {}
    try { fs.unlinkSync(statePath('codex')); } catch {}
  }

  // (2) DEFAULT SCOPE PATH
  {
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;

    const defPath = statePath('default');
    // Must end in frontier-state.json but NOT frontier-state.default.json.
    check('statePath default ends with frontier-state.json',
      defPath.endsWith('frontier-state.json') && !defPath.endsWith('frontier-state.default.json'));

    const codexPath = statePath('codex');
    check('statePath codex ends with frontier-state.codex.json',
      codexPath.endsWith('frontier-state.codex.json'));
  }

  // (3) MIGRATION
  // Legacy frontier-state.json seeds a non-default scope when its scoped file
  // is absent. Writing to the scoped scope must NOT modify the legacy file.
  {
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;

    try { fs.unlinkSync(legacyStatePath()); } catch {}
    try { fs.unlinkSync(statePath('codex')); } catch {}

    // Write the legacy file directly so its path stays at legacyStatePath().
    const legacyDir = path.dirname(legacyStatePath());
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(legacyStatePath(), JSON.stringify({ mode: 'single', model: 'opus' }), 'utf8');

    // loadState('codex') — no scoped file, legacy present — seeds from legacy.
    const seeded = loadState('codex');
    check('migration: seeds mode from legacy', seeded.mode === 'single');
    check('migration: seeds model from legacy', seeded.model === 'opus');

    // Saving to the scoped file must leave the legacy file untouched.
    saveState({ mode: 'off' }, 'codex');
    const legacyRaw = fs.readFileSync(legacyStatePath(), 'utf8');
    const legacyParsed = JSON.parse(legacyRaw);
    check('migration: legacy file not overwritten', legacyParsed.mode === 'single');
    check('migration: legacy model preserved', legacyParsed.model === 'opus');

    // Cleanup.
    try { fs.unlinkSync(statePath('codex')); } catch {}
    try { fs.unlinkSync(legacyStatePath()); } catch {}
  }

  // (4) resolveScope PRECEDENCE + sanitizeScope
  // resolveScope(argv) takes string[]; flag value is sanitized.
  {
    // (4a) --scope flag: value sanitized (uppercase stripped to lower, no non-[a-z0-9-]).
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;
    check('resolveScope: --scope Foo -> foo',
      resolveScope(['--scope', 'Foo']) === 'foo');

    // (4b) MAESTRO_SCOPE env when no flag present.
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;
    process.env.MAESTRO_SCOPE = 'bar';
    check('resolveScope: MAESTRO_SCOPE=bar (no flag) -> bar',
      resolveScope([]) === 'bar');
    delete process.env.MAESTRO_SCOPE;

    // (4c) CLAUDECODE set (no flag, no MAESTRO_SCOPE) -> 'claude-code'.
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDECODE = '1';
    check('resolveScope: CLAUDECODE set -> claude-code',
      resolveScope([]) === 'claude-code');
    delete process.env.CLAUDECODE;

    // (4d) Nothing set -> 'default'.
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;
    check('resolveScope: nothing set -> default',
      resolveScope([]) === 'default');

    // (4e) Sanitization: 'a b!c' keeps only [a-z0-9-], so spaces and ! stripped -> 'abc'.
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;
    check('resolveScope: --scope "a b!c" -> abc (non-alnum-dash stripped)',
      resolveScope(['--scope', 'a b!c']) === 'abc');

    // (4f) All chars stripped -> 'default'.
    check('resolveScope: --scope "!!!" -> default (empty after sanitize)',
      resolveScope(['--scope', '!!!']) === 'default');
  }

  // (auto) UNDEFINED SCOPE AUTODETECTS RUNTIME VIA resolveScope([])
  // Proves: saveState/loadState with no scope arg pick up CLAUDE_PLUGIN_ROOT
  // -> 'claude-code', and with nothing set -> 'default'.
  {
    const savedMaestroScope = process.env.MAESTRO_SCOPE;
    const savedClaudePlugin = process.env.CLAUDE_PLUGIN_ROOT;
    const savedClaudeCode = process.env.CLAUDECODE;

    try {
      // Part 1: CLAUDE_PLUGIN_ROOT set -> writes frontier-state.claude-code.json
      delete process.env.MAESTRO_SCOPE;
      delete process.env.CLAUDECODE;
      process.env.CLAUDE_PLUGIN_ROOT = 'x';

      const saved1 = saveState({ mode: 'fusion', preset: 'opus-gpt' }); // no scope arg
      check('(auto) saveState returns true under CLAUDE_PLUGIN_ROOT', saved1 === true);
      check('(auto) claude-code file exists when CLAUDE_PLUGIN_ROOT set',
        fs.existsSync(path.join(configDir(), 'frontier-state.claude-code.json')));
      const loaded1 = loadState(); // no scope arg
      check('(auto) loadState reads correct scope preset under CLAUDE_PLUGIN_ROOT',
        loaded1.preset === 'opus-gpt');

      // Cleanup scoped file
      try { fs.unlinkSync(path.join(configDir(), 'frontier-state.claude-code.json')); } catch {}

      // Part 2: nothing set -> writes frontier-state.json (default)
      delete process.env.MAESTRO_SCOPE;
      delete process.env.CLAUDE_PLUGIN_ROOT;
      delete process.env.CLAUDECODE;

      const saved2 = saveState({ mode: 'single', model: 'opus' }); // no scope arg
      check('(auto) saveState returns true under no env', saved2 === true);
      check('(auto) default file exists when no env set',
        fs.existsSync(path.join(configDir(), 'frontier-state.json')));
      const loaded2 = loadState(); // no scope arg
      check('(auto) loadState reads correct model under no env', loaded2.model === 'opus');

      // Cleanup default file
      try { fs.unlinkSync(path.join(configDir(), 'frontier-state.json')); } catch {}

    } finally {
      // Restore original env values
      if (savedMaestroScope === undefined) delete process.env.MAESTRO_SCOPE;
      else process.env.MAESTRO_SCOPE = savedMaestroScope;
      if (savedClaudePlugin === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = savedClaudePlugin;
      if (savedClaudeCode === undefined) delete process.env.CLAUDECODE;
      else process.env.CLAUDECODE = savedClaudeCode;
    }
  }

  // cleanup
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}

  if (failures) {
    console.error(failures + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('ok');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
