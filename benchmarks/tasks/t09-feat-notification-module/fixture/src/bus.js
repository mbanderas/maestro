'use strict';

const EVENTS = {
  ALERT_RAISED: 'ALERT_RAISED',
  METRIC_RECORDED: 'METRIC_RECORDED',
  USER_ADDED: 'USER_ADDED',
};

const _listeners = {};

function on(event, fn) {
  if (!EVENTS[event]) {
    throw new Error('undeclared event: ' + event);
  }
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
}

function emit(event, payload) {
  if (!EVENTS[event]) {
    throw new Error('undeclared event: ' + event);
  }
  const fns = _listeners[event] || [];
  for (const fn of fns) fn(payload);
}

module.exports = { EVENTS, on, emit };
