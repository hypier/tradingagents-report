export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown>;
};

type LogSink = (entry: LogEntry) => void;

const redactedKeys = new Set([
  'authorization',
  'cookie',
  'core_api_key',
  'database_url',
  'redis_url',
]);

const redactedValue = '[REDACTED]';

function isCredentialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.username.length > 0 || url.password.length > 0;
  } catch {
    return false;
  }
}

function redact(value: unknown, visited: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return isCredentialUrl(value) ? redactedValue : value;
  }

  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  if (visited.has(value)) {
    return '[Circular]';
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, visited));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      redactedKeys.has(key.toLowerCase())
        ? redactedValue
        : redact(item, visited),
    ]),
  );
}

function redactMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return redact(metadata, new WeakSet<object>()) as Record<string, unknown>;
}

export class Logger {
  constructor(private readonly sink: LogSink = (entry) => console.log(entry)) {}

  debug(message: string, metadata: Record<string, unknown> = {}): void {
    this.write('debug', message, metadata);
  }

  info(message: string, metadata: Record<string, unknown> = {}): void {
    this.write('info', message, metadata);
  }

  warn(message: string, metadata: Record<string, unknown> = {}): void {
    this.write('warn', message, metadata);
  }

  error(message: string, metadata: Record<string, unknown> = {}): void {
    this.write('error', message, metadata);
  }

  private write(
    level: LogLevel,
    message: string,
    metadata: Record<string, unknown>,
  ): void {
    this.sink({ level, message, metadata: redactMetadata(metadata) });
  }
}
