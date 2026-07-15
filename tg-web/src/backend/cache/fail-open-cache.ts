import type { Cache } from './contract';
import { Logger } from '../logging/logger';

export class FailOpenCache implements Cache {
  constructor(
    private readonly cache: Cache,
    private readonly logger: Logger,
  ) {}

  get(key: string): Promise<string | null> {
    return this.execute('get', key, null, () => this.cache.get(key));
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    return this.execute('set', key, undefined, () =>
      this.cache.set(key, value, ttlSeconds),
    );
  }

  delete(key: string): Promise<void> {
    return this.execute('delete', key, undefined, () => this.cache.delete(key));
  }

  healthcheck(): Promise<void> {
    return this.cache.healthcheck();
  }

  private async execute<T>(
    operation: string,
    key: string,
    fallback: T,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch {
      this.logger.warn(`Cache ${operation} failed; continuing without cache`, {
        key,
      });
      return fallback;
    }
  }
}
