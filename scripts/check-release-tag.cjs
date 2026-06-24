#!/usr/bin/env node
'use strict';

// Verify the pushed git tag (vX.Y.Z) matches package.json "version".
// Shell-agnostic on purpose: the previous `shell: bash` step failed on the
// self-hosted Windows runner, whose `bash` resolved to a distro-less WSL
// ("Windows Subsystem for Linux has no installed distributions"). Node is
// always present after setup-node, so this runs identically on GitHub-hosted
// ubuntu and the self-hosted Windows home runner.

const ref = process.env.GITHUB_REF_NAME || '';
const tag = ref.replace(/^v/, '');
const pkg = require('../package.json').version;

if (tag !== pkg) {
  console.error(`FAIL tag v${tag} != package.json ${pkg}`);
  process.exit(1);
}

console.log(`version ${pkg} matches tag`);
