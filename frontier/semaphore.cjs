#!/usr/bin/env node
// Maestro Frontier — bounded-concurrency map utility.
// mapLimit(items, limit, asyncFn) -> Promise<settled[]>
// Each settled item is {ok:true,value} or {ok:false,error}.
// A rejected task releases its permit and does NOT starve the pool.

'use strict';

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} asyncFn
 * @returns {Promise<({ok:true,value:R}|{ok:false,error:unknown})[]}
 */
function mapLimit(items, limit, asyncFn) {
  return new Promise((resolve) => {
    const n = items.length;
    if (n === 0) { resolve([]); return; }

    const results = new Array(n);
    let nextIdx = 0;   // index of next item to start
    let inFlight = 0;  // currently running tasks
    let done = 0;      // settled tasks

    function run() {
      while (inFlight < limit && nextIdx < n) {
        const idx = nextIdx++;
        inFlight++;
        Promise.resolve()
          .then(() => asyncFn(items[idx], idx))
          .then(
            (value) => { results[idx] = { ok: true, value }; },
            (error) => { results[idx] = { ok: false, error }; }
          )
          .finally(() => {
            inFlight--;
            done++;
            if (done === n) { resolve(results); return; }
            run();
          });
      }
    }

    run();
  });
}

module.exports = { mapLimit };
