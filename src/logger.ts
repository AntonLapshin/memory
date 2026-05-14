import fs from 'node:fs';
import path from 'node:path';
import { getMemoryRoot } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let logStream: fs.WriteStream | null = null;
let currentDate = '';
let enabled = true;
let minLevel: LogLevel = 'info';

export function configureLogger(opts: { enabled: boolean; level?: string }): void {
  enabled = opts.enabled;
  if (opts.level && opts.level in LOG_LEVELS) {
    minLevel = opts.level as LogLevel;
  }
}

function ensureLogDir(): string {
  const logsDir = path.join(getMemoryRoot(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function getLogStream(): fs.WriteStream | null {
  if (!enabled) return null;
  const today = new Date().toISOString().substring(0, 10);
  const logsDir = ensureLogDir();
  const logFile = path.join(logsDir, `memory-${today}.log`);

  if (currentDate !== today || !logStream) {
    logStream?.end();
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    currentDate = today;
  }
  return logStream;
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? ' ' + safeStringify(data) : '';
  return `[${ts}] ${level.toUpperCase().padEnd(5)} ${message}${dataStr}\n`;
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (!enabled || LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

  const formatted = formatMessage(level, message, data);
  const stream = getLogStream();
  if (stream) stream.write(formatted);

  // Also print errors to stderr
  if (level === 'error') {
    process.stderr.write(formatted);
  }
}

export const logger = {
  debug(message: string, data?: unknown): void {
    writeLog('debug', message, data);
  },
  info(message: string, data?: unknown): void {
    writeLog('info', message, data);
  },
  warn(message: string, data?: unknown): void {
    writeLog('warn', message, data);
  },
  error(message: string, data?: unknown): void {
    writeLog('error', message, data);
  },
};

export function closeLogger(): void {
  logStream?.end();
  logStream = null;
}
