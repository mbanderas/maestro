#!/usr/bin/env node
// Maestro Frontier — config unit tests. Zero deps, standalone.
// Uses a temp XDG_CONFIG_HOME so it never touches real config.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Set temp configDir BEFORE requiring config.cjs so configDir() picks it up.
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-test-'));
process.env.XDG_CONFIG_HOME = tmpBase;

const { DEFAULTS, loadState, saveState, resolvePanel, validatePreset,
  resolveJudgeModel, resolveSynthModel, sanitizeScope, resolveScope,
  statePath, legacyStatePath, configDir, adoptLegacyState } = require('./config.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

function expectedClaudeWorkspaceScope(cwd) {
  let normalized = path.resolve(cwd);
  let last = null;
  while (normalized !== last && !fs.existsSync(path.join(normalized, '.git'))) {
    last = normalized;
    normalized = path.dirname(normalized);
  }
  // Mirror production workspaceHash(): lowercase ONLY on win32 (case-insensitive
  // FS). On case-sensitive Linux/macOS the path case is preserved, otherwise a
  // mixed-case mkdtemp dir diverges from production and fails the *matches
  // helper* checks on those platforms only.
  if (process.platform === 'win32') {
    normalized = normalized.replace(/\\/g, '/').toLowerCase().replace(/\/+$/g, '');
  } else {
    normalized = normalized.replace(/\\/g, '/').replace(/\/+$/g, '');
  }
  return 'cc-' + crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
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

  // (3b) CC WORKSPACE SCOPES NEVER IMPLICITLY MIGRATE LEGACY
  {
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;

    try { fs.unlinkSync(legacyStatePath()); } catch {}
    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}
    try { fs.unlinkSync(statePath('codex')); } catch {}

    const legacyDir = path.dirname(legacyStatePath());
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(legacyStatePath(), JSON.stringify({ mode: 'single', model: 'opus' }), 'utf8');

    const ccState = loadState('cc-deadbeef');
    check('cc legacy armed without scoped file -> off', ccState.mode === 'off');

    const codexState = loadState('codex');
    check('non-cc named scope still seeds legacy mode', codexState.mode === 'single');
    check('non-cc named scope still seeds legacy model', codexState.model === 'opus');

    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}
    try { fs.unlinkSync(statePath('codex')); } catch {}
    try { fs.unlinkSync(legacyStatePath()); } catch {}
  }

  // (3c) EXPLICIT CC LEGACY ADOPTION
  {
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDECODE;

    try { fs.unlinkSync(legacyStatePath()); } catch {}
    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}

    const legacyDir = path.dirname(legacyStatePath());
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyState = { mode: 'fusion', preset: 'opus-gpt' };
    fs.writeFileSync(legacyStatePath(), JSON.stringify(legacyState), 'utf8');

    const adopted = adoptLegacyState('cc-deadbeef');
    check('adoptLegacyState cc succeeds', adopted.ok === true);
    check('adoptLegacyState writes scoped cc file', fs.existsSync(statePath('cc-deadbeef')));
    check('adoptLegacyState preserves legacy file', fs.existsSync(legacyStatePath()));
    check('adoptLegacyState adopted mode round-trips', loadState('cc-deadbeef').mode === 'fusion');
    check('adoptLegacyState adopted preset round-trips', loadState('cc-deadbeef').preset === 'opus-gpt');

    fs.writeFileSync(legacyStatePath(), JSON.stringify({ mode: 'single', model: 'opus' }), 'utf8');
    const refused = adoptLegacyState('cc-deadbeef');
    check('adoptLegacyState refuses overwrite by default', refused.ok === false && refused.reason === 'exists');
    check('adoptLegacyState refused overwrite leaves scoped file intact',
      loadState('cc-deadbeef').mode === 'fusion' && loadState('cc-deadbeef').preset === 'opus-gpt');

    const forced = adoptLegacyState('cc-deadbeef', { force: true });
    check('adoptLegacyState force overwrites', forced.ok === true);
    check('adoptLegacyState force copies latest legacy', loadState('cc-deadbeef').mode === 'single');
    check('adoptLegacyState force copies latest model', loadState('cc-deadbeef').model === 'opus');
    check('adoptLegacyState force still preserves legacy', fs.existsSync(legacyStatePath()));

    fs.writeFileSync(legacyStatePath(), JSON.stringify({ mode: 'bogus' }), 'utf8');
    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}
    const invalid = adoptLegacyState('cc-deadbeef');
    check('adoptLegacyState rejects invalid legacy', invalid.ok === false && invalid.reason === 'invalid-legacy');
    check('adoptLegacyState invalid legacy writes no scoped file', !fs.existsSync(statePath('cc-deadbeef')));

    // A valid {mode:'off'} legacy IS adoptable (locks the documented
    // "off is adoptable" semantics — off is a real state, not a no-op).
    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}
    fs.writeFileSync(legacyStatePath(), JSON.stringify({ mode: 'off' }), 'utf8');
    const offAdopt = adoptLegacyState('cc-deadbeef');
    check('adoptLegacyState adopts valid off legacy', offAdopt.ok === true);
    check('adoptLegacyState off legacy writes off scoped file',
      fs.existsSync(statePath('cc-deadbeef')) && loadState('cc-deadbeef').mode === 'off');

    // Non-cc scope is rejected before any read/write (unit-level guard).
    try { fs.unlinkSync(statePath('codex')); } catch {}
    const notCc = adoptLegacyState('codex');
    check('adoptLegacyState rejects non-cc scope', notCc.ok === false && notCc.reason === 'not-cc-scope');
    check('adoptLegacyState non-cc scope writes no scoped file', !fs.existsSync(statePath('codex')));

    try { fs.unlinkSync(statePath('cc-deadbeef')); } catch {}
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

    // (4c) CLAUDECODE set (no flag, no MAESTRO_SCOPE) -> 'cc-<8hex>'.
    delete process.env.MAESTRO_SCOPE;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDECODE = '1';
    check('resolveScope: CLAUDECODE set -> cc-<8hex>',
      /^cc-[0-9a-f]{8}$/.test(resolveScope([])));
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
      // Part 1: CLAUDE_PLUGIN_ROOT set -> writes frontier-state.cc-<8hex>.json
      delete process.env.MAESTRO_SCOPE;
      delete process.env.CLAUDECODE;
      process.env.CLAUDE_PLUGIN_ROOT = 'x';

      const ccScope = expectedClaudeWorkspaceScope(process.cwd());
      const saved1 = saveState({ mode: 'fusion', preset: 'opus-gpt' }); // no scope arg
      check('(auto) saveState returns true under CLAUDE_PLUGIN_ROOT', saved1 === true);
      check('(auto) cc-<8hex> file exists when CLAUDE_PLUGIN_ROOT set',
        fs.existsSync(path.join(configDir(), 'frontier-state.' + ccScope + '.json')));
      const loaded1 = loadState(); // no scope arg
      check('(auto) loadState reads correct scope preset under CLAUDE_PLUGIN_ROOT',
        loaded1.preset === 'opus-gpt');

      // Cleanup scoped file
      try { fs.unlinkSync(path.join(configDir(), 'frontier-state.' + ccScope + '.json')); } catch {}

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

  // (workspace) CLAUDE CODE SCOPE IS PER WORKSPACE
  // Planned API: resolveScope(argv, { cwd }) accepts the strongest local cwd
  // signal and normalizes it to project root before deriving cc-<8hex>.
  // This is the closest regression test before implementation because the
  // current API has no explicit workspace/cwd parameter.
  {
    const savedMaestroScope = process.env.MAESTRO_SCOPE;
    const savedClaudePlugin = process.env.CLAUDE_PLUGIN_ROOT;
    const savedClaudeCode = process.env.CLAUDECODE;

    const workspaceA = path.join(tmpBase, 'workspace-a');
    const workspaceB = path.join(tmpBase, 'workspace-b');
    const nestedA = path.join(workspaceA, 'packages', 'one');
    fs.mkdirSync(path.join(workspaceA, '.git'), { recursive: true });
    fs.mkdirSync(path.join(workspaceB, '.git'), { recursive: true });
    fs.mkdirSync(nestedA, { recursive: true });

    try {
      delete process.env.MAESTRO_SCOPE;
      delete process.env.CLAUDECODE;
      process.env.CLAUDE_PLUGIN_ROOT = 'x';

      const scopeA = resolveScope([], { cwd: nestedA });
      const scopeAFromRoot = resolveScope([], { cwd: workspaceA });
      const scopeB = resolveScope([], { cwd: workspaceB });
      const expectedA = expectedClaudeWorkspaceScope(workspaceA);
      const expectedB = expectedClaudeWorkspaceScope(workspaceB);

      check('claude workspace scope A is cc-<8hex>',
        /^cc-[0-9a-f]{8}$/.test(scopeA));
      check('claude workspace nested cwd normalizes to project root',
        scopeA === scopeAFromRoot && scopeA === expectedA);
      check('claude workspace distinct cwd signals resolve distinct scopes',
        scopeA !== scopeB && scopeB === expectedB);

      saveState({ mode: 'fusion', preset: 'opus-duo' }, scopeA);
      const loadedA = loadState(scopeA);
      const loadedB = loadState(scopeB);
      check('claude workspace A fusion round-trip mode', loadedA.mode === 'fusion');
      check('claude workspace A fusion round-trip preset', loadedA.preset === 'opus-duo');
      check('claude workspace B remains off after A is armed', loadedB.mode === 'off');

      fs.writeFileSync(statePath('claude-code'), JSON.stringify({ mode: 'single', model: 'opus' }), 'utf8');
      const legacyClaudeLoaded = loadState(scopeA);
      check('claude workspace scope does not seed from legacy claude-code state',
        legacyClaudeLoaded.mode === 'fusion' && legacyClaudeLoaded.preset === 'opus-duo');

      try { fs.unlinkSync(statePath(scopeA)); } catch {}
      try { fs.unlinkSync(statePath(scopeB)); } catch {}
      try { fs.unlinkSync(statePath('claude-code')); } catch {}
    } finally {
      if (savedMaestroScope === undefined) delete process.env.MAESTRO_SCOPE;
      else process.env.MAESTRO_SCOPE = savedMaestroScope;
      if (savedClaudePlugin === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = savedClaudePlugin;
      if (savedClaudeCode === undefined) delete process.env.CLAUDECODE;
      else process.env.CLAUDECODE = savedClaudeCode;
    }
  }

  // (env) CLAUDE_PROJECT_DIR drives the per-workspace scope (criterion #1)
  // The CLI calls resolveScope(argv) with NO opts, so the env var is the
  // workspace signal. Two distinct dirs must yield two distinct cc-scopes,
  // and arming one must leave the other off.
  {
    const savedMaestroScope = process.env.MAESTRO_SCOPE;
    const savedClaudePlugin = process.env.CLAUDE_PLUGIN_ROOT;
    const savedClaudeCode = process.env.CLAUDECODE;
    const savedProjectDir = process.env.CLAUDE_PROJECT_DIR;

    const wsA = path.join(tmpBase, 'cpd-a');
    const wsB = path.join(tmpBase, 'cpd-b');
    fs.mkdirSync(path.join(wsA, '.git'), { recursive: true });
    fs.mkdirSync(path.join(wsB, '.git'), { recursive: true });

    try {
      delete process.env.MAESTRO_SCOPE;
      delete process.env.CLAUDECODE;
      process.env.CLAUDE_PLUGIN_ROOT = 'x';

      process.env.CLAUDE_PROJECT_DIR = wsA;
      const scopeA = resolveScope([]); // no opts -> uses CLAUDE_PROJECT_DIR
      process.env.CLAUDE_PROJECT_DIR = wsB;
      const scopeB = resolveScope([]);

      check('env: CLAUDE_PROJECT_DIR A -> cc-<8hex>', /^cc-[0-9a-f]{8}$/.test(scopeA));
      check('env: distinct CLAUDE_PROJECT_DIR -> distinct scopes', scopeA !== scopeB);
      check('env: CLAUDE_PROJECT_DIR A matches helper', scopeA === expectedClaudeWorkspaceScope(wsA));
      check('env: CLAUDE_PROJECT_DIR B matches helper', scopeB === expectedClaudeWorkspaceScope(wsB));

      saveState({ mode: 'fusion', preset: 'opus-duo' }, scopeA);
      check('env: workspace A armed round-trips fusion', loadState(scopeA).mode === 'fusion');
      check('env: workspace B stays off after A armed', loadState(scopeB).mode === 'off');

      try { fs.unlinkSync(statePath(scopeA)); } catch {}
      try { fs.unlinkSync(statePath(scopeB)); } catch {}
    } finally {
      if (savedMaestroScope === undefined) delete process.env.MAESTRO_SCOPE;
      else process.env.MAESTRO_SCOPE = savedMaestroScope;
      if (savedClaudePlugin === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = savedClaudePlugin;
      if (savedClaudeCode === undefined) delete process.env.CLAUDECODE;
      else process.env.CLAUDECODE = savedClaudeCode;
      if (savedProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
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
