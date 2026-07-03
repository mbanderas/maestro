#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, 'npm-publish-plan.cjs');
let failed = 0;

function check(name, ok, detail) {
  if (ok) console.log('  ok    ' + name);
  else {
    failed++;
    console.error('  FAIL  ' + name + (detail ? ' -> ' + detail : ''));
  }
}

function run(version, versions) {
  const outFile = path.join(os.tmpdir(), `maestro-publish-plan-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const env = {
    ...process.env,
    MAESTRO_PACKAGE_NAME: '@maestrofrontier/frontier',
    MAESTRO_PACKAGE_VERSION: version,
    MAESTRO_NPM_VERSIONS_JSON: JSON.stringify(versions),
    GITHUB_OUTPUT: outFile,
  };
  const stdout = cp.execFileSync(process.execPath, [script], { env, encoding: 'utf8' });
  const fields = Object.fromEntries(
    fs.readFileSync(outFile, 'utf8').trim().split(/\r?\n/).map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
  );
  fs.rmSync(outFile, { force: true });
  return { stdout, fields };
}

console.log('npm publish plan tests');

{
  const r = run('1.14.0', []);
  check('first publish proceeds', r.fields.publish === 'true', JSON.stringify(r));
  check('first publish reports new-version', r.fields.reason === 'new-version', JSON.stringify(r));
}

{
  const r = run('1.14.0', ['1.13.0']);
  check('newer unpublished version proceeds', r.fields.publish === 'true', JSON.stringify(r));
}

{
  const r = run('1.14.0', ['1.14.0']);
  check('already published version skips', r.fields.publish === 'false', JSON.stringify(r));
  check('already published reason reported', r.fields.reason === 'already-published', JSON.stringify(r));
}

{
  const r = run('1.13.0', ['1.14.0']);
  check('stale tag skips', r.fields.publish === 'false', JSON.stringify(r));
  check('stale tag names latest', r.fields.reason === 'stale-tag-latest-1.14.0', JSON.stringify(r));
}

{
  const r = run('2.0.0-beta.1', ['2.0.0']);
  check('prerelease below stable skips', r.fields.publish === 'false', JSON.stringify(r));
}

if (failed) {
  console.error(failed + ' check(s) failed');
  process.exit(1);
}
console.log('all tests passed');
