#!/usr/bin/env node
// Frontier catalog/compose CLI tests. Local readiness only; no model runs.

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.cjs');
const packageManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-compose-test-'));
const xdgDir = path.join(root, 'xdg');
const homeDir = path.join(root, 'home');
const fakeCodex = path.join(root, process.platform === 'win32' ? 'fake-codex.cmd' : 'fake-codex');
const directoryCodex = path.join(root, 'directory-codex');
const textCodex = path.join(root, 'text-codex.txt');
const configuredTerraId = '0123456789abcdef0123456789abcdef';

const failures = [];

function check(label, condition, detail) {
  if (condition) {
    process.stdout.write('PASS  ' + label + '\n');
  } else {
    failures.push(label + ': ' + (detail || 'FAILED'));
    process.stderr.write('FAIL  ' + label + (detail ? ': ' + detail : '') + '\n');
  }
}

function run(args, extraEnv) {
  try {
    const stdout = execFileSync(process.execPath, [cliPath].concat(args), {
      env: {
        PATH: '',
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_CONFIG_HOME: xdgDir,
        ...(extraEnv || {}),
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status != null ? error.status : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

function state(scope, env) {
  const result = run(['status', '--scope', scope], env);
  return result.code === 0 ? JSON.parse(result.stdout) : null;
}

const configured = {
  MAESTRO_CODEX_BIN: fakeCodex,
  MAESTRO_FRONTIER_MODEL_TERRA: configuredTerraId,
  MAESTRO_FRONTIER_MODEL_LUNA: 'provider-luna-id',
  MAESTRO_FRONTIER_MODEL_SOL: 'provider-sol-id',
};

try {
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(directoryCodex, { recursive: true });
  fs.writeFileSync(fakeCodex, '', 'utf8');
  fs.writeFileSync(textCodex, '', 'utf8');
  if (process.platform !== 'win32') fs.chmodSync(fakeCodex, 0o755);
  check('package includes compose command module',
    Array.isArray(packageManifest.files) && packageManifest.files.includes('frontier/compose.cjs'));

  // Catalog output is deterministic and only includes safe declared model
  // identifiers. It has no path from arbitrary secret-shaped env values to
  // stdout.
  {
    const unsafe = { MAESTRO_CODEX_BIN: fakeCodex, MAESTRO_FRONTIER_MODEL_TERRA: 'sk-NOT-FOR-OUTPUT' };
    const r1 = run(['catalog', '--json'], unsafe);
    const r2 = run(['catalog', '--json'], unsafe);
    check('catalog JSON exit 0', r1.code === 0, r1.stderr.trim());
    check('catalog JSON is stable', r1.stdout === r2.stdout);
    check('catalog JSON never leaks rejected model values', !r1.stdout.includes('sk-NOT-FOR-OUTPUT'));
    const parsed = JSON.parse(r1.stdout);
    check('catalog JSON includes model aliases', parsed.aliases.models.chatgpt === 'gpt-5.5');
    check('catalog JSON includes preset aliases', parsed.aliases.presets['chatgpt-duo'] === 'gpt-duo');
    const opusGpt = parsed.presets.find(preset => preset.id === 'opus-gpt');
    check('catalog JSON exposes stable built-in preset records',
      !!opusGpt && JSON.stringify(opusGpt) === JSON.stringify({
        id: 'opus-gpt', models: ['opus', 'gpt-5.5'], judge: null, synth: null,
      }), JSON.stringify(parsed.presets));
    check('catalog JSON built-in presets never leak rejected model values',
      !JSON.stringify(parsed.presets).includes('sk-NOT-FOR-OUTPUT'));
    const terra = parsed.models.find(model => model.id === 'terra');
    check('catalog JSON preserves blocked readiness remediation',
      terra && terra.ready === false && terra.reasons.includes('configuration-required') &&
      terra.remediation.includes('configure its declared model id'));
    const human = run(['catalog'], configured);
    const humanAgain = run(['catalog'], configured);
    check('catalog human output is stable and readable',
      human.code === 0 && human.stdout.includes('model chatgpt -> gpt-5.5') &&
      human.stdout.includes('opus-gpt models=opus,gpt-5.5 judge=- synth=-') &&
      human.stdout.includes('configured=yes') && !human.stdout.includes(configuredTerraId) &&
      human.stdout === humanAgain.stdout, human.stderr.trim());
    const configuredJson = run(['catalog', '--json'], configured);
    check('catalog JSON never exposes configured model ids',
      configuredJson.code === 0 && !configuredJson.stdout.includes(configuredTerraId), configuredJson.stderr.trim());
  }

  // Model ids must be catalog-known, configured, and ready. The blocked
  // message retains catalog remediation rather than attempting a probe.
  {
    const blocked = run(['compose', '--models', 'terra', '--scope', 'blocked'], { MAESTRO_CODEX_BIN: fakeCodex });
    check('compose blocks unconfigured adapters', blocked.code === 2, blocked.stderr.trim());
    check('compose reports blocked remediation',
      blocked.stderr.includes('model-id-not-configured') && blocked.stderr.includes('configuration-required') &&
      blocked.stderr.includes('remediation: configure its declared model id'), blocked.stderr.trim());
    check('blocked compose does not arm state', state('blocked', configured).mode === 'off');

    const directoryBin = run(['compose', '--models', 'terra', '--scope', 'directory-bin'], {
      ...configured, MAESTRO_CODEX_BIN: directoryCodex,
    });
    check('compose blocks directory binary path',
      directoryBin.code === 2 && directoryBin.stderr.includes('binary-not-found'), directoryBin.stderr.trim());
    check('directory binary compose does not arm state', state('directory-bin', configured).mode === 'off');

    const missingBin = run(['compose', '--models', 'terra', '--scope', 'missing-bin'], {
      ...configured, MAESTRO_CODEX_BIN: path.join(root, 'missing-codex'),
    });
    check('compose blocks missing absolute binary path',
      missingBin.code === 2 && missingBin.stderr.includes('binary-not-found'), missingBin.stderr.trim());
    if (process.platform === 'win32') {
      const textBin = run(['compose', '--models', 'terra', '--scope', 'text-bin'], {
        ...configured, MAESTRO_CODEX_BIN: textCodex,
      });
      check('compose blocks non-command Windows binary path',
        textBin.code === 2 && textBin.stderr.includes('binary-not-found'), textBin.stderr.trim());
      check('text binary compose does not arm state', state('text-bin', configured).mode === 'off');
    }

    const unknown = run(['compose', '--models', 'not-a-model', '--scope', 'unknown'], configured);
    check('compose rejects unknown model', unknown.code === 2 && unknown.stderr.includes('unknown-model'), unknown.stderr.trim());
    const tooMany = run(['compose', '--models', 'terra,terra,terra,terra,terra,terra,terra,terra,terra'], configured);
    check('compose rejects over-eight panel', tooMany.code === 2 && tooMany.stderr.includes('between 1 and 8'), tooMany.stderr.trim());
  }

  // The entered panel order and duplicates persist exactly, with defaults
  // taken from the first selected model. Override stages are validated and
  // persisted canonically.
  {
    const duo = run(['compose', '--models', 'terra,terra', '--scope', 'duo'], configured);
    check('compose accepts repeated duo', duo.code === 0, duo.stderr.trim());
    check('compose prints repeated panel in entered order', duo.stdout.includes('panel: terra, terra'), duo.stdout.trim());
    const duoState = state('duo', configured);
    check('compose state preserves duplicate models', JSON.stringify(duoState.models) === JSON.stringify(['terra', 'terra']), JSON.stringify(duoState));
    check('compose defaults judge and synth to first selection',
      duoState.judgeModel === 'terra' && duoState.synthModel === 'terra', JSON.stringify(duoState));

    const trio = run([
      'compose', '--models', 'terra,luna,sol', '--judge', 'luna', '--synth', 'sol', '--scope', 'trio',
    ], configured);
    check('compose accepts ordered trio overrides', trio.code === 0, trio.stderr.trim());
    check('compose prints resolved stages before arming',
      trio.stdout.indexOf('judge: luna') < trio.stdout.indexOf('frontier compose armed'), trio.stdout.trim());
    const trioState = state('trio', configured);
    check('compose state preserves ordered trio and overrides',
      JSON.stringify(trioState) === JSON.stringify({
        mode: 'fusion', preset: 'custom', models: ['terra', 'luna', 'sol'], judgeModel: 'luna', synthModel: 'sol',
      }), JSON.stringify(trioState));

    const badJudge = run(['compose', '--models', 'terra', '--judge', 'not-a-model'], configured);
    check('compose rejects unready stage model', badJudge.code === 2 && badJudge.stderr.includes('judge model "not-a-model"'), badJudge.stderr.trim());
  }

  // Catalog aliases canonicalize while retaining the selected multiplicity,
  // and dry-runs leave both scoped persistence surfaces untouched.
  {
    const alias = run(['compose', '--models', 'chatgpt,chatgpt', '--dry-run', '--scope', 'alias'], configured);
    check('compose accepts catalog aliases', alias.code === 0, alias.stderr.trim());
    check('compose canonicalizes aliases without collapsing duplicates',
      alias.stdout.includes('panel: gpt-5.5, gpt-5.5') && alias.stdout.includes('judge: gpt-5.5'), alias.stdout.trim());
    check('compose dry-run does not arm alias scope', state('alias', configured).mode === 'off');

    const dry = run(['compose', '--models', 'terra,luna', '--save', 'reusable', '--dry-run', '--scope', 'saved-scope'], configured);
    check('compose save dry-run exits 0', dry.code === 0 && dry.stdout.includes('dry-run'), dry.stderr.trim());
    check('compose dry-run writes no state', state('saved-scope', configured).mode === 'off');
    const noPreset = run(['preset', 'list', '--scope', 'saved-scope'], configured);
    check('compose dry-run writes no preset', noPreset.code === 0 && noPreset.stdout.includes('no saved presets'), noPreset.stdout.trim());

    const saved = run(['compose', '--models', 'terra,luna', '--save', 'Reusable', '--scope', 'saved-scope'], configured);
    check('compose saves and arms custom state', saved.code === 0 && saved.stdout.includes('frontier preset saved: reusable'), saved.stderr.trim());
    const savedState = state('saved-scope', configured);
    check('compose save retains compatible custom state',
      JSON.stringify(savedState) === JSON.stringify({
        mode: 'fusion', preset: 'custom', models: ['terra', 'luna'], judgeModel: 'terra', synthModel: 'terra',
      }), JSON.stringify(savedState));
    const savedPreset = run(['preset', 'list', '--scope', 'saved-scope'], configured);
    check('compose saves reusable preset in requested scope',
      savedPreset.stdout.includes('reusable models=terra,luna judge=terra synth=terra'), savedPreset.stdout.trim());
    const defaultPreset = run(['preset', 'list'], configured);
    check('compose save does not leak to default scope', defaultPreset.stdout.includes('no saved presets'), defaultPreset.stdout.trim());
  }
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

if (failures.length) {
  process.stderr.write('\n' + failures.length + ' failure(s):\n');
  for (const failure of failures) process.stderr.write('  ' + failure + '\n');
  process.exit(1);
}
process.stdout.write('\nAll compose/catalog cases passed.\n');
