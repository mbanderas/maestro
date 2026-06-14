#!/usr/bin/env node
// Maestro Frontier — semaphore unit tests. Zero deps, standalone.

'use strict';

const { mapLimit } = require('./semaphore.cjs');

let failures = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL: ' + name);
    failures++;
  }
}

async function main() {

  // (a) peak in-flight <= limit
  {
    const limit = 3;
    let inFlight = 0;
    let peakInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapLimit(items, limit, async (item) => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      await new Promise(r => setTimeout(r, 10));
      inFlight--;
      return item;
    });
    check('peak in-flight <= limit', peakInFlight <= limit);
    check('peak in-flight > 0', peakInFlight > 0);
  }

  // (b) all tasks resolve, results in input order
  {
    const items = [3, 1, 4, 1, 5, 9];
    const results = await mapLimit(items, 2, async (x) => x * 2);
    check('all results present', results.length === items.length);
    check('results in order', results.every((r, i) => r.ok && r.value === items[i] * 2));
  }

  // (c) limit=1 is fully serial
  {
    const order = [];
    const items = [0, 1, 2, 3];
    await mapLimit(items, 1, async (x) => {
      order.push(x);
      await new Promise(r => setTimeout(r, 5));
    });
    check('limit=1 serial order', JSON.stringify(order) === JSON.stringify(items));
  }

  // (d) RELEASE-ON-REJECT: one task throws -> all remaining still run,
  //     pool drains (final in-flight=0), batch returns settled outcomes
  //     including the {ok:false}
  {
    let inFlight = 0;
    let finalInFlight = -1;
    const items = [0, 1, 2, 3, 4];
    const THROW_IDX = 2;
    const results = await mapLimit(items, 2, async (x, idx) => {
      inFlight++;
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      if (idx === THROW_IDX) throw new Error('deliberate-' + x);
      return x;
    });
    finalInFlight = inFlight;

    check('release-on-reject: all settled', results.length === items.length);
    check('release-on-reject: failed item is {ok:false}', results[THROW_IDX].ok === false);
    check('release-on-reject: failed item has error', results[THROW_IDX].error instanceof Error);
    check('release-on-reject: other items succeeded',
      results.every((r, i) => i === THROW_IDX ? !r.ok : r.ok));
    check('release-on-reject: pool drained (in-flight=0)', finalInFlight === 0);
  }

  if (failures) {
    console.error(failures + ' test(s) failed.');
    process.exit(1);
  } else {
    console.log('ok');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
