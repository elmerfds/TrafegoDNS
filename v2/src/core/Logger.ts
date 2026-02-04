/**
 * Logger configuration using Pino
 * Provides structured logging with configurable levels and user-friendly output
 */
import pino from 'pino';
import pretty from 'pino-pretty';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface LoggerOptions {
  level: LogLevel;
  pretty: boolean;
}

// Emoji symbols for pretty logging (matching v1 style)
const levelSymbols: Record<string, string> = {
  fatal: '💀',
  error: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  debug: '🔍',
  trace: '📝',
};

// Export symbols for use in code
export const symbols = {
  success: '✅',
  info: 'ℹ️',
  complete: '✅',
  error: '❌',
  warning: '⚠️',
  dns: '🌐',
  provider: '🔌',
  docker: '🐳',
  traefik: '🚦',
  sync: '🔄',
  startup: '🚀',
};

const defaultOptions: LoggerOptions = {
  level: (process.env['LOG_LEVEL']?.toLowerCase() as LogLevel) ?? 'info',
  pretty: process.env['LOG_PRETTY'] !== 'false', // Default to pretty output
};

/**
 * Format a value for clean inline display
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.join(', ')}]`;
    return `[${value.slice(0, 3).join(', ')}, ...+${value.length - 3}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) {
      const pairs = keys.map((k) => `${k}=${formatValue(obj[k])}`);
      return `{${pairs.join(', ')}}`;
    }
    return `{${keys.length} props}`;
  }

  return String(value);
}

/**
 * Format context data in a clean, readable way
 */
function formatContext(log: Record<string, unknown>, excludeKeys: string[]): string {
  const contextKeys = Object.keys(log).filter((k) => !excludeKeys.includes(k));
  if (contextKeys.length === 0) return '';

  const contextParts: string[] = [];
  for (const key of contextKeys.slice(0, 6)) {
    const value = log[key];
    if (value === undefined || value === null) continue;
    const formatted = formatValue(value);
    if (formatted) {
      contextParts.push(`${key}=${formatted}`);
    }
  }

  return contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
}

/**
 * Create pretty stream with v1-style formatting
 */
function createPrettyStream() {
  return pretty({
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'app', // Only ignore 'app' since we already exclude pid/hostname from base
    hideObject: true, // Hide the extra object output below the message
    messageFormat: (log: Record<string, unknown>, messageKey: string) => {
      const level = log['level'] as string;
      const service = log['service'] as string | undefined;
      const msg = log[messageKey] as string;
      const symbol = levelSymbols[level] ?? 'ℹ️';

      // Build clean message
      let output = '';

      // Add service prefix if present (e.g., [DNSManager])
      if (service) {
        output += `[${service}] `;
      }

      output += msg;

      // Append relevant context in a clean way
      // Note: 'hostname' is NOT excluded - it may be a user-provided field for DNS records
      const excludeKeys = ['level', 'time', 'pid', 'app', 'service', messageKey, 'err', 'error', 'stack'];
      output += formatContext(log, excludeKeys);

      return `${symbol} ${output}`;
    },
    // Hide the default level label since we're using emojis
    customPrettifiers: {
      level: () => '',
    },
  });
}

function createLogger(options: LoggerOptions = defaultOptions): pino.Logger {
  if (options.pretty) {
    // Use pino-pretty stream for human-readable output
    const stream = createPrettyStream();
    return pino(
      {
        level: options.level,
        base: {
          app: 'trafegodns',
          pid: undefined, // Don't include pid in logs
          hostname: undefined, // Don't include machine hostname in logs
        },
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        serializers: {
          err: pino.stdSerializers.err,
          error: pino.stdSerializers.err,
        },
      },
      stream
    );
  }

  // Production mode - structured JSON logging
  return pino({
    level: options.level,
    base: {
      app: 'trafegodns',
      pid: undefined,
      hostname: undefined,
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
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
