'use strict';

function padLeft(text, width) {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error('BAD_WIDTH: width must be positive');
  }
  return String(text).padStart(width, ' ');
}

module.exports = { padLeft };
