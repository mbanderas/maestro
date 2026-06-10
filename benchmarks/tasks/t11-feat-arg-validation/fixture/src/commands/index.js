'use strict';

// Command registry -- keys in alphabetical order.
const registry = {
  add:    require('./add.js'),
  count:  require('./count.js'),
  echo:   require('./echo.js'),
  head:   require('./head.js'),
  join:   require('./join.js'),
  lower:  require('./lower.js'),
  mul:    require('./mul.js'),
  ping:   require('./ping.js'),
  repeat: require('./repeat.js'),
  split:  require('./split.js'),
  tail:   require('./tail.js'),
  trim:   require('./trim.js'),
  upper:  require('./upper.js'),
  wrap:   require('./wrap.js'),
};

module.exports = registry;
