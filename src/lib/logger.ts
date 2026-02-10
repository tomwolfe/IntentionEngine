/**
 * Structured Logging Module
 * 
 * Provides JSON-formatted logging for production observability.
 * Includes timestamps, log levels, and optional metadata.
 */

export interface LogMeta {
  [key: string]: any;
}

export interface LogEntry {
  level: 'info' | 'error' | 'warn' | 'debug';
  msg: string;
  timestamp: string;
  meta?: LogMeta;
  error?: string;
  stack?: string;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  info(msg: string, meta?: LogMeta): void {
    const entry: LogEntry = {
      level: 'info',
      msg,
      timestamp: new Date().toISOString(),
      ...(meta && { meta }),
    };

    if (this.isDevelopment) {
      console.log(`[INFO] ${msg}`, meta || '');
    } else {
      console.log(this.formatLog(entry));
    }
  }

  error(msg: string, error: Error, meta?: LogMeta): void {
    const entry: LogEntry = {
      level: 'error',
      msg,
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      ...(meta && { meta }),
    };

    if (this.isDevelopment) {
      console.error(`[ERROR] ${msg}`, error.message, meta || '');
    } else {
      console.error(this.formatLog(entry));
    }
  }

  warn(msg: string, meta?: LogMeta): void {
    const entry: LogEntry = {
      level: 'warn',
      msg,
      timestamp: new Date().toISOString(),
      ...(meta && { meta }),
    };

    if (this.isDevelopment) {
      console.warn(`[WARN] ${msg}`, meta || '');
    } else {
      console.warn(this.formatLog(entry));
    }
  }

  debug(msg: string, meta?: LogMeta): void {
    // Only log debug in development
    if (!this.isDevelopment) return;

    const entry: LogEntry = {
      level: 'debug',
      msg,
      timestamp: new Date().toISOString(),
      ...(meta && { meta }),
    };

    console.log(`[DEBUG] ${msg}`, meta || '');
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports for direct use
export const logInfo = (msg: string, meta?: LogMeta) => logger.info(msg, meta);
export const logError = (msg: string, error: Error, meta?: LogMeta) => logger.error(msg, error, meta);
export const logWarn = (msg: string, meta?: LogMeta) => logger.warn(msg, meta);
export const logDebug = (msg: string, meta?: LogMeta) => logger.debug(msg, meta);
