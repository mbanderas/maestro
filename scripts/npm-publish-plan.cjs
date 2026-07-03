#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');

const pkg = require('../package.json');

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || ''));
  if (!m) return null;
  return {
    raw: String(v),
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] || '',
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const ax = a.split('.');
  const bx = b.split('.');
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    if (ax[i] == null) return -1;
    if (bx[i] == null) return 1;
    const an = /^\d+$/.test(ax[i]) ? Number(ax[i]) : null;
    const bn = /^\d+$/.test(bx[i]) ? Number(bx[i]) : null;
    if (an !== null && bn !== null && an !== bn) return an > bn ? 1 : -1;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    if (ax[i] !== bx[i]) return ax[i] > bx[i] ? 1 : -1;
  }
  return 0;
}

function compareSemver(a, b) {
  const av = typeof a === 'string' ? parseSemver(a) : a;
  const bv = typeof b === 'string' ? parseSemver(b) : b;
  if (!av || !bv) throw new Error(`invalid semver comparison: ${a} vs ${b}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (av[key] !== bv[key]) return av[key] > bv[key] ? 1 : -1;
  }
  return comparePrerelease(av.pre, bv.pre);
}

function readPublishedVersions(name) {
  if (process.env.MAESTRO_NPM_VERSIONS_JSON) {
    return JSON.parse(process.env.MAESTRO_NPM_VERSIONS_JSON);
  }

  try {
    const out = process.platform === 'win32'
      ? cp.execSync(`npm view "${String(name).replace(/"/g, '')}" versions --json`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      : cp.execFileSync('npm', ['view', name, 'versions', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    return JSON.parse(out || '[]');
  } catch (err) {
    const stderr = String(err.stderr || err.message || '');
    if (stderr.includes('E404') || stderr.includes('404 Not Found')) return [];
    process.stderr.write(stderr || String(err));
    process.exit(1);
  }
}

function writeOutput(fields) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(fields)
    .map(([k, v]) => `${k}=${String(v).replace(/\r?\n/g, ' ')}`)
    .join('\n') + '\n';
  fs.appendFileSync(file, lines, 'utf8');
}

const name = process.env.MAESTRO_PACKAGE_NAME || pkg.name;
const version = process.env.MAESTRO_PACKAGE_VERSION || pkg.version;
const current = parseSemver(version);
if (!current) {
  console.error(`FAIL invalid package version: ${version}`);
  process.exit(1);
}

const versions = readPublishedVersions(name);
const published = Array.isArray(versions) ? versions.map(String) : [String(versions)];
const validPublished = published.map(parseSemver).filter(Boolean);
const latest = validPublished.sort(compareSemver).at(-1);

let publish = true;
let reason = 'new-version';

if (published.includes(version)) {
  publish = false;
  reason = 'already-published';
} else if (latest && compareSemver(current, latest) < 0) {
  publish = false;
  reason = `stale-tag-latest-${latest.raw}`;
}

writeOutput({
  publish: publish ? 'true' : 'false',
  reason,
  version,
  latest: latest ? latest.raw : '',
});

if (publish) {
  console.log(`publish ${name}@${version}: ${reason}`);
} else {
  console.log(`skip publish ${name}@${version}: ${reason}`);
}
