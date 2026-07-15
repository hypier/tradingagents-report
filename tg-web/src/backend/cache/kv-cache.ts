import type { Cache } from './contract';
import { Logger } from '../logging/logger';

export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

const HEALTHCHECK_KEY = '__cache_healthcheck__';

export class KvCache implements Cache {
  constructor(
    private readonly namespace: KvNamespace,
    private readonly logger: Logger,
  ) {}

  get(key: string): Promise<string | null> {
    return this.execute('get', key, () => this.namespace.get(key));
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    return this.execute('set', key, () =>
      this.namespace.put(key, value, { expirationTtl: ttlSeconds }),
    );
  }

  delete(key: string): Promise<void> {
    return this.execute('delete', key, () => this.namespace.delete(key));
  }

  async healthcheck(): Promise<void> {
    await this.execute('healthcheck', HEALTHCHECK_KEY, () =>
      this.namespace.get(HEALTHCHECK_KEY),
    );
  }

  private async execute<T>(
    operation: string,
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      this.logger.error(`KV cache ${operation} failed`, { key });
      throw error;
    }
  }
}
