/**
 * Structured logger wrapping Pino.
 * Default: stdout only (no writable filesystem required; suitable for containers).
 * Set LOG_FILE to also write logs to a file.
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('Server started', { port: 3001 });
 */

const pino = require('pino');
const config = require('../config');

const hasFile = Boolean(config.LOG_FILE);
const dest = hasFile
  ? pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: config.LOG_FILE, append: true }) },
    ])
  : process.stdout;

const opts = {
  level: config.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: { service: 'foundly-start' },
};
if (config.LOG_PRETTY && !hasFile) {
  opts.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' },
  };
}

const logger = pino(opts, opts.transport ? undefined : dest);

module.exports = logger;
