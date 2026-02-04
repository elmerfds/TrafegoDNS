/**
 * Logger configuration using Pino
 * Provides structured logging with configurable levels
 */
import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface LoggerOptions {
  level: LogLevel;
  pretty: boolean;
}

const defaultOptions: LoggerOptions = {
  level: (process.env['LOG_LEVEL']?.toLowerCase() as LogLevel) ?? 'info',
  pretty: process.env['NODE_ENV'] !== 'production',
};

function createLogger(options: LoggerOptions = defaultOptions): pino.Logger {
  const transport = options.pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  return pino({
    level: options.level,
    transport,
    base: {
      app: 'trafegodns',
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    serializers: {
      error: (err: Error) => ({
        type: err.constructor.name,
        message: err.message,
        stack: err.stack,
        ...(err as unknown as Record<string, unknown>),
      }),
    },
  });
}

export const logger = createLogger();

/**
 * Set the log level at runtime
 */
export function setLogLevel(level: LogLevel): void {
  logger.level = level;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}

export default logger;
