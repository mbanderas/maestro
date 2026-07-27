#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function check(name, ok) {
  if (ok) console.log('  ok    ' + name);
  else { console.error('  FAIL  ' + name); failed++; }
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

const manifest = readJson('.codex-plugin/plugin.json');
const claudeManifest = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.agents/plugins/marketplace.json');
const pkg = readJson('package.json');
const defaultPrompts = manifest.interface && manifest.interface.defaultPrompt;
const packageFiles = new Set(pkg.files || []);

console.log('plugin marketplace tests');

// package.json is the single source of truth for the version; the Codex
// plugin manifest carries its own copy and is not auto-synced, so it drifted
// (stuck at 1.8.0 through several releases). Assert they match so a release
// bump that forgets the manifest fails CI (and publish.yml) instead of
// silently shipping a stale version. Fix on drift: copy pkg.version into
// .codex-plugin/plugin.json "version".
check('codex manifest version matches package.json (' + pkg.version + ')', manifest.version === pkg.version);
check('claude manifest version matches package.json (' + pkg.version + ')', claudeManifest.version === pkg.version);

check('manifest names maestro', manifest.name === 'maestro');
check('manifest exposes bundled Codex skills', manifest.skills === './codex-skills/');
check('manifest skills path exists', fs.existsSync(path.join(root, manifest.skills)));
check('manifest hooks path exists', fs.existsSync(path.join(root, manifest.hooks || './hooks/hooks.json')));
check('manifest has install-surface metadata', !!manifest.interface && manifest.interface.displayName === 'Maestro');
const composerIcon = manifest.interface && manifest.interface.composerIcon;
const composerIconPath = typeof composerIcon === 'string' ? composerIcon.replace(/^\.\//, '') : '';
check('manifest composer icon exists', !!composerIconPath && fs.existsSync(path.join(root, composerIconPath)));
check('package ships manifest composer icon', packageFiles.has(composerIconPath));
check(
  'manifest exposes exactly three supported default prompts',
  Array.isArray(defaultPrompts) && defaultPrompts.length === 3,
);
check(
  'every default prompt activates Maestro and fits the client limit',
  Array.isArray(defaultPrompts) && defaultPrompts.every(
    (prompt) => typeof prompt === 'string' && prompt.length <= 128 && prompt.startsWith('/maestro '),
  ),
);

const entry = Array.isArray(marketplace.plugins)
  ? marketplace.plugins.find((plugin) => plugin.name === 'maestro')
  : undefined;

check('marketplace is named maestro', marketplace.name === 'maestro');
check('marketplace display name is present', marketplace.interface && marketplace.interface.displayName === 'Maestro');
check('marketplace exposes maestro plugin', !!entry);
check('marketplace source uses git repo root', entry && entry.source && entry.source.source === 'url');
check('marketplace source points at GitHub repo', entry && entry.source && entry.source.url === 'https://github.com/mbanderas/maestro.git');
check('marketplace source tracks main', entry && entry.source && entry.source.ref === 'main');
check('marketplace install policy is available', entry && entry.policy && entry.policy.installation === 'AVAILABLE');
check('marketplace auth policy is on install', entry && entry.policy && entry.policy.authentication === 'ON_INSTALL');
check('marketplace category is productivity', entry && entry.category === 'Productivity');

const hookConfig = readJson('hooks/hooks.json');
const hookTargets = [...JSON.stringify(hookConfig).matchAll(/hooks\/([A-Za-z0-9.-]+\.cjs)/g)]
  .map(match => 'hooks/' + match[1]);
for (const target of [...new Set(hookTargets)].sort()) {
  check('package ships configured hook: ' + target, packageFiles.has(target));
}

// Package allowlist must be closed over local CommonJS dependencies. npm
// always adds package.json/README/LICENSE, so include those implicit files.
const packaged = new Set(['package.json', 'README.md', 'LICENSE']);
function addTree(rel) {
  const abs = path.join(root, rel);
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    packaged.add(rel.replace(/\\/g, '/'));
    return;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    addTree(path.join(rel, entry.name));
  }
}
for (const rel of packageFiles) addTree(rel);
for (const rel of [...packaged].filter(file => /\.[cm]?js$/.test(file))) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    const base = path.resolve(root, path.dirname(rel), match[1]);
    const candidates = path.extname(base)
      ? [base]
      : [base + '.js', base + '.cjs', base + '.mjs', path.join(base, 'index.js')];
    const dependency = candidates.find(candidate => fs.existsSync(candidate));
    if (!dependency) continue;
    const dependencyRel = path.relative(root, dependency).replace(/\\/g, '/');
    check('package closes local dependency: ' + rel + ' -> ' + dependencyRel, packaged.has(dependencyRel));
  }
}

for (const skill of ['maestro', 'maestro-frontier', 'maestro-terse', 'maestro-settings', 'maestro-update']) {
  check('bundled skill exists: ' + skill, fs.existsSync(path.join(root, manifest.skills, skill, 'SKILL.md')));
  const pluginSkill = fs.readFileSync(path.join(root, manifest.skills, skill, 'SKILL.md'), 'utf8');
  const integrationSkill = fs.readFileSync(path.join(root, 'integrations', 'codex', 'skills', skill, 'SKILL.md'), 'utf8');
  check('plugin skill matches integration skill: ' + skill, pluginSkill === integrationSkill);
}

if (failed) process.exit(1);
console.log('all tests passed');
