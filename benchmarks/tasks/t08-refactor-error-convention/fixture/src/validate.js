'use strict';

function validateName(name) {
  const trimmed = String(name).trim();
  if (!trimmed) {
    throw new Error('EMPTY_NAME: name required');
  }
  return trimmed;
}

module.exports = { validateName };
