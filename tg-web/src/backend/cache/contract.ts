export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  healthcheck(): Promise<void>;
}

export async function exerciseCacheContract(cache: Cache): Promise<void> {
  const key = 'ticker:NVDA';

  await cache.set(key, 'value', 60);
  if ((await cache.get(key)) !== 'value') {
    throw new Error('Cache did not return the stored value');
  }
  await cache.delete(key);
  if ((await cache.get(key)) !== null) {
    throw new Error('Cache did not delete the stored value');
  }
}
