'use strict';

function help() {
  console.log('csvkit <command>');
  console.log('  help        show this help');
  console.log('  show-rows   show each CSV row as pipe-joined fields');
}

module.exports = { help };
