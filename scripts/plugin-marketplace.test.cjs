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
const marketplace = readJson('.agents/plugins/marketplace.json');

console.log('plugin marketplace tests');

check('manifest names maestro', manifest.name === 'maestro');
check('manifest exposes bundled Codex skills', manifest.skills === './skills/');
check('manifest skills path exists', fs.existsSync(path.join(root, manifest.skills)));
check('manifest hooks path exists', fs.existsSync(path.join(root, manifest.hooks || './hooks/hooks.json')));
check('manifest has install-surface metadata', !!manifest.interface && manifest.interface.displayName === 'Maestro');

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

for (const skill of ['maestro-frontier', 'maestro-terse', 'maestro-settings', 'maestro-update']) {
  check('bundled skill exists: ' + skill, fs.existsSync(path.join(root, manifest.skills, skill, 'SKILL.md')));
  const pluginSkill = fs.readFileSync(path.join(root, manifest.skills, skill, 'SKILL.md'), 'utf8');
  const integrationSkill = fs.readFileSync(path.join(root, 'integrations', 'codex', 'skills', skill, 'SKILL.md'), 'utf8');
  check('plugin skill matches integration skill: ' + skill, pluginSkill === integrationSkill);
}

if (failed) process.exit(1);
console.log('all tests passed');
