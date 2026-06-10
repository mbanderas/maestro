'use strict';

const { STRINGS } = require('../src/strings.js');
const { raiseAlert } = require('../src/modules/alerts.js');
const { recordMetric } = require('../src/modules/metrics.js');
const { addUser } = require('../src/modules/users.js');

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'alert': {
    const [level, ...rest] = args;
    if (!level || rest.length === 0) {
      console.error(STRINGS.ERR_MISSING_ARGS.replace('{cmd}', cmd));
      process.exit(1);
    }
    console.log(raiseAlert(level, rest.join(' ')));
    break;
  }
  case 'metric': {
    const [name, value] = args;
    if (!name || value === undefined) {
      console.error(STRINGS.ERR_MISSING_ARGS.replace('{cmd}', cmd));
      process.exit(1);
    }
    console.log(recordMetric(name, Number(value)));
    break;
  }
  case 'user': {
    const [username] = args;
    if (!username) {
      console.error(STRINGS.ERR_MISSING_ARGS.replace('{cmd}', cmd));
      process.exit(1);
    }
    console.log(addUser(username));
    break;
  }
  default:
    console.error(STRINGS.ERR_UNKNOWN_CMD.replace('{cmd}', cmd));
    process.exit(1);
}
