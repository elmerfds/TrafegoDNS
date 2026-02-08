/**
 * Log Buffer
 * Circular buffer to store recent log entries for API access
 */

export interface LogEntry {
  timestamp: number;
  level: number;
  levelLabel: string;
  message: string;
  context?: Record<string, unknown>;
}

class LogBuffer {
  private buffer: LogEntry[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add a log entry to the buffer
   */
  push(entry: LogEntry): void {
    this.buffer.push(entry);
    // Keep buffer size limited
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get recent log entries
   */
  getRecent(count: number = 100, minLevel?: number): LogEntry[] {
    let entries = this.buffer;

    if (minLevel !== undefined) {
      entries = entries.filter(e => e.level >= minLevel);
    }

    return entries.slice(-count);
  }

  /**
   * Get all log entries
   */
  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Get formatted log lines
   */
  getFormattedLines(count: number = 100, minLevel?: number): string[] {
    const entries = this.getRecent(count, minLevel);
    return entries.map(entry => {
      const time = new Date(entry.timestamp).toISOString();
      const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      return JSON.stringify({
        time: entry.timestamp,
        level: entry.level,
        msg: entry.message,
        ...entry.context,
      });
    });
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get buffer size
   */
  get size(): number {
    return this.buffer.length;
  }
}

// Singleton instance
export const logBuffer = new LogBuffer(2000);

// Level name to number mapping (pino levels)
export const levelNumbers: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export const levelNames: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export default logBuffer;
