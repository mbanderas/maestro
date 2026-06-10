'use strict';

class AppError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

module.exports = { AppError };
