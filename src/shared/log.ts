export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  scope: string;
  msg: string;
  data?: unknown;
}

const MAX_ENTRIES = 300;
const buffer: LogEntry[] = [];

/** Small in-memory ring-buffer logger. Never records page content or URLs beyond the origin. */
export function createLogger(scope: string) {
  const write = (level: LogLevel, msg: string, data?: unknown) => {
    const entry: LogEntry = {
      t: Date.now(),
      level,
      scope,
      msg,
      ...(data === undefined ? {} : { data }),
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.shift();
    const fn =
      level === 'debug'
        ? console.debug
        : level === 'info'
          ? console.info
          : level === 'warn'
            ? console.warn
            : console.error;
    fn(`[pagesnap:${scope}] ${msg}`, data ?? '');
  };
  return {
    debug: (m: string, d?: unknown) => write('debug', m, d),
    info: (m: string, d?: unknown) => write('info', m, d),
    warn: (m: string, d?: unknown) => write('warn', m, d),
    error: (m: string, d?: unknown) => write('error', m, d),
  };
}

export function getLogEntries(): LogEntry[] {
  return buffer.slice();
}

export function safeOrigin(url: string | undefined): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).origin;
  } catch {
    return 'unknown';
  }
}
