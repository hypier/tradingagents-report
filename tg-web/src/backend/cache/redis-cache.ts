import type Redis from 'ioredis';

import type { Cache } from './contract';
import { Logger } from '../logging/logger';

export class RedisCache implements Cache {
  constructor(
    private readonly client: Redis,
    private readonly logger: Logger,
  ) {}

  get(key: string): Promise<string | null> {
    return this.execute('get', key, () => this.client.get(key));
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    return this.execute('set', key, async () => {
      await this.client.set(key, value, 'EX', ttlSeconds);
    });
  }

  delete(key: string): Promise<void> {
    return this.execute('delete', key, async () => {
      await this.client.del(key);
    });
  }

  healthcheck(): Promise<void> {
    return this.execute('healthcheck', 'healthcheck', async () => {
      await this.client.ping();
    });
  }

  private async execute<T>(
    operation: string,
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      this.logger.error(`Redis cache ${operation} failed`, { key });
      throw error;
    }
  }
}
