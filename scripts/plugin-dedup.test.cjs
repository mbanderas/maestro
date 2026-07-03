#!/usr/bin/env node
// Guards the cross-CLI command/skill dedup (see _settings-dedup.md):
//   (a) Claude Code registers each Maestro feature EXACTLY ONCE — the Codex
//       skill twins live outside CC's default skills/ dir, so commands/ is CC's
//       sole surface and no feature double-registers.
//   (b) Codex still resolves every bundled skill under .codex-plugin's skills path.
//   (c) settings/cli.cjs still reads+writes the three toggles (isolated env).
// Zero deps, CJS. Exit 1 on any failure.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let failed = 0;

function check(name, ok, detail) {
  if (ok) console.log('  ok    ' + name);
  else { console.error('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); failed++; }
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }

console.log('plugin dedup tests');

// ---- enumerate what Claude Code would register from .claude-plugin/plugin.json
// Schema (code.claude.com/docs/en/plugins-reference): with no key, CC
// auto-discovers commands/*.md and skills/<dir>/SKILL.md. A `commands` key
// REPLACES the default commands/; a `skills` key ADDS to the default skills/.
const ccManifest = readJson('.claude-plugin/plugin.json');

function commandSources(manifest) {
  if (manifest.commands == null) return ['commands'];
  return Array.isArray(manifest.commands) ? manifest.commands : [manifest.commands];
}
function skillDirs(manifest) {
  const dirs = ['skills']; // default is always scanned
  if (manifest.skills != null) {
    for (const e of (Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills])) dirs.push(e);
  }
  return dirs;
}
function listCommandNames(manifest) {
  const names = [];
  for (const s of commandSources(manifest)) {
    const abs = path.join(root, s);
    let st; try { st = fs.statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs)) if (f.endsWith('.md')) names.push(path.basename(f, '.md'));
    } else if (abs.endsWith('.md')) {
      names.push(path.basename(abs, '.md'));
    }
  }
  return names;
}
function listCcSkillNames(manifest) {
  const names = [];
  for (const d of skillDirs(manifest)) {
    const abs = path.join(root, d);
    let st; try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const sub of fs.readdirSync(abs)) {
      if (fs.existsSync(path.join(abs, sub, 'SKILL.md'))) names.push(sub);
    }
  }
  return names;
}

const commandNames = listCommandNames(ccManifest);
const ccSkillNames = listCcSkillNames(ccManifest);

// (a) no feature double-registers. A feature double-registers when it has both a
// command and a CC-visible skill twin (folder `maestro-<f>` or a same-name `<f>`).
const featureOf = (n) => n.replace(/^maestro-/, '');
const commandFeatures = new Set(commandNames.map(featureOf));
const doubles = ccSkillNames.filter((s) => commandFeatures.has(featureOf(s)) || commandNames.includes(s));
const seen = new Set();
const dupCmd = commandNames.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));

check('Claude Code registers at least one command', commandNames.length >= 1, commandNames.join(','));
check('Claude Code default skills/ holds no Codex skill twins', ccSkillNames.length === 0, 'CC-visible skills: ' + ccSkillNames.join(','));
check('no feature double-registers in Claude Code', doubles.length === 0, 'doubles: ' + doubles.join(','));
check('no duplicate command names', dupCmd.length === 0, dupCmd.join(','));
check('each toggle/action present once as a command',
  ['settings', 'terse', 'update', 'frontier', 'compress', 'context-bar'].every((f) => commandNames.includes(f)),
  'commands: ' + commandNames.join(','));

// (b) Codex resolves every bundled skill under its manifest's skills path.
const codexManifest = readJson('.codex-plugin/plugin.json');
check('codex manifest declares a skills path', typeof codexManifest.skills === 'string', String(codexManifest.skills));
const codexSkillsDir = path.join(root, codexManifest.skills);
check('codex skills dir exists', fs.existsSync(codexSkillsDir), codexSkillsDir);
for (const s of ['maestro', 'maestro-frontier', 'maestro-settings', 'maestro-terse', 'maestro-update', 'terse']) {
  check('codex resolves skill: ' + s, fs.existsSync(path.join(codexSkillsDir, s, 'SKILL.md')));
}
// and those skills sit OUTSIDE Claude Code's default skills/ dir.
const ccSkillsDir = path.join(root, 'skills');
const strayTwins = fs.existsSync(ccSkillsDir)
  ? fs.readdirSync(ccSkillsDir).filter((sub) => fs.existsSync(path.join(ccSkillsDir, sub, 'SKILL.md')))
  : [];
check('codex skills are outside Claude Code default skills/ dir', strayTwins.length === 0, strayTwins.join(','));

// (c) settings/cli.cjs reads+writes the three toggles, in an isolated config tree.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-dedup-'));
const cliEnv = Object.assign({}, process.env, {
  XDG_CONFIG_HOME: tmp,                      // terse config.json + frontier state
  CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), // terse flag + statusline base
  APPDATA: tmp,                              // win32 fallback if XDG ignored
});
delete cliEnv.MAESTRO_TERSE_LEVEL;           // let config.json be the source
const cli = path.join(root, 'settings', 'cli.cjs');
const run = (args) => execFileSync(process.execPath, [cli, ...args], { env: cliEnv, encoding: 'utf8' });
const status = (extra) => JSON.parse(run(['status', '--json', ...(extra || [])]));
try {
  run(['set', 'terse', 'ultra']);
  check('cli writes+reads terse', status().terse.level === 'ultra');
  run(['set', 'terse', 'off']);
  check('cli writes terse off', status().terse.level === 'off');
  run(['set', 'context-bar', 'off']);
  check('cli writes+reads context-bar off', status().contextBar.enabled === false);
  run(['set', 'context-bar', 'on']);
  check('cli reads context-bar on', status().contextBar.enabled === true);
  run(['set', 'frontier', 'single:opus', '--scope', 'dedup-test']);
  const f = status(['--scope', 'dedup-test']).frontier;
  check('cli writes+reads frontier', f.mode === 'single' && f.model === 'opus', JSON.stringify(f));
} catch (e) {
  check('cli toggle round-trip executes without error', false, e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

if (failed) { console.error(failed + ' check(s) failed'); process.exit(1); }
console.log('all tests passed');
