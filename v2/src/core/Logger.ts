/**
 * Logger configuration using Pino
 * Provides structured logging with configurable levels and user-friendly output
 */
import pino, { multistream } from 'pino';
import pretty from 'pino-pretty';
import { Transform, PassThrough } from 'stream';
import { logBuffer, levelNumbers, levelNames } from './LogBuffer.js';

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
  separator: '─',
};

const defaultOptions: LoggerOptions = {
  level: (process.env['LOG_LEVEL']?.toLowerCase() as LogLevel) ?? 'info',
  pretty: process.env['LOG_PRETTY'] !== 'false', // Default to pretty output
};

/**
 * Format a value for clean inline display
 * Keeps output concise for log readability
 */
function formatValue(value: unknown, maxLen: number = 40): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) {
      const items = value.map(v => formatValue(v, 30));
      return items.join(', ');
    }
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return `{${keys.length} fields}`;
  }

  return String(value);
}

// Keys that contain IDs — truncate to short form
const ID_KEYS = new Set(['containerId', 'providerId', 'resourceId', 'externalId', 'id', 'tunnelId']);

/**
 * Format context data in a clean, readable way
 * Prioritizes important fields and keeps output short
 */
function formatContext(log: Record<string, unknown>, excludeKeys: string[]): string {
  const contextKeys = Object.keys(log).filter((k) => !excludeKeys.includes(k));
  if (contextKeys.length === 0) return '';

  // Priority order for context fields (most useful first)
  const priorityKeys = [
    'name', 'containerName', 'hostname', 'hostnames',
    'type', 'count', 'provider', 'zone', 'source',
  ];

  // De-duplicate: if containerName present, skip containerId from display
  const skipKeys = new Set<string>();
  if (log['containerName']) skipKeys.add('containerId');
  if (log['name']) skipKeys.add('id');

  const sortedKeys = contextKeys
    .filter(k => !skipKeys.has(k))
    .sort((a, b) => {
      const aIdx = priorityKeys.indexOf(a);
      const bIdx = priorityKeys.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return 0;
    });

  const contextParts: string[] = [];
  for (const key of sortedKeys.slice(0, 5)) {
    const value = log[key];
    if (value === undefined || value === null) continue;
    // Use short truncation for ID-like fields
    const maxLen = ID_KEYS.has(key) ? 12 : 40;
    const formatted = formatValue(value, maxLen);
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

/**
 * Create a write stream that captures logs to buffer
 */
function createBufferCaptureStream(destination: NodeJS.WritableStream) {
  const captureStream = new Transform({
    objectMode: true,
    transform(chunk: string, encoding: string, callback: (err?: Error, data?: unknown) => void) {
      // Parse the log line and add to buffer
      try {
        const logObj = JSON.parse(chunk.toString());
        const levelNum = typeof logObj.level === 'number'
          ? logObj.level
          : levelNumbers[logObj.level] ?? 30;

        logBuffer.push({
          timestamp: logObj.time ?? Date.now(),
          level: levelNum,
          levelLabel: levelNames[levelNum] ?? 'info',
          message: logObj.msg ?? '',
          context: (() => {
            const { time, level, msg, app, ...rest } = logObj;
            return Object.keys(rest).length > 0 ? rest : undefined;
          })(),
        });
      } catch {
        // Ignore parse errors
      }

      // Pass through to original destination
      callback(undefined, chunk);
    },
  });

  captureStream.pipe(destination);
  return captureStream;
}

function createLogger(options: LoggerOptions = defaultOptions): pino.Logger {
  const baseConfig: pino.LoggerOptions = {
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
  };

  if (options.pretty) {
    // Use pino-pretty stream for human-readable output
    // Create a multistream that writes to both buffer capture and pretty output

    // Create JSON stream for buffer capture
    const jsonStream = new PassThrough();
    jsonStream.on('data', (chunk: Buffer) => {
      try {
        const logObj = JSON.parse(chunk.toString());
        const levelNum = typeof logObj.level === 'number'
          ? logObj.level
          : levelNumbers[logObj.level] ?? 30;

        logBuffer.push({
          timestamp: logObj.time ?? Date.now(),
          level: levelNum,
          levelLabel: levelNames[levelNum] ?? 'info',
          message: logObj.msg ?? '',
          context: (() => {
            const { time, level, msg, app, ...rest } = logObj;
            return Object.keys(rest).length > 0 ? rest : undefined;
          })(),
        });
      } catch {
        // Ignore parse errors
      }
    });

    const prettyStream = createPrettyStream();

    return pino(
      baseConfig,
      multistream([
        { stream: jsonStream },
        { stream: prettyStream },
      ])
    );
  }

  // Production mode - structured JSON logging with buffer capture
  const captureStream = createBufferCaptureStream(process.stdout);
  return pino(baseConfig, captureStream);
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
