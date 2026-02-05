export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = (process.env.NS_LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(message: string, context?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, context));
  },

  info(message: string, context?: Record<string, unknown>) {
    if (shouldLog('info')) console.info(formatMessage('info', message, context));
  },

  warn(message: string, context?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, context));
  },

  error(message: string, context?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(formatMessage('error', message, context));
  },
};
