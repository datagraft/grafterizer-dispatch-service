/**
 * Logging component.
 */
'use strict';

// Raven is an error repporting component for Sentry.
const raven = require('raven');

// Sentry is a log repporting middleware, it can push messages
// to a service, or just log on the standard output (default)
const log = new raven.Client(process.env.SENTRY);

module.exports = {
  info: (message, extra) => {
    console.log(message);
    log.captureMessage(message, {
      level: 'info',
      extra
    });
  },

  error: (message, extra) => {
    console.log(message);
    log.captureMessage(message, {
      level: 'error',
      extra
    });
  }
};
