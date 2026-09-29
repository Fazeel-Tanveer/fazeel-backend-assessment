import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants.js';
import { CATALOG_CACHE_TTL_SECONDS } from './products.constants.js';

const VERSION_KEY = 'catalog:version';
const INITIAL_VERSION = '0';

interface CacheLookup<T> {
  key: string;
  value?: T;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = await this.lookup<T>(key);
    if (cached?.value !== undefined) {
      return cached.value;
    }

    const value = await load();
    if (cached) {
      await this.store(cached.key, value);
    }
    return value;
  }

  async invalidate(): Promise<void> {
    try {
      await this.redis.incr(VERSION_KEY);
    } catch (error) {
      this.logger.error(
        `Could not invalidate the catalog cache, entries may be stale for up to ${CATALOG_CACHE_TTL_SECONDS}s: ${describeError(error)}`,
      );
    }
  }

  // the version is read once, before loading, so data loaded ahead of an admin write never lands under the new version
  private async lookup<T>(key: string): Promise<CacheLookup<T> | undefined> {
    try {
      const version = (await this.redis.get(VERSION_KEY)) ?? INITIAL_VERSION;
      const versionedKey = `catalog:v${version}:${key}`;
      const raw = await this.redis.get(versionedKey);
      return {
        key: versionedKey,
        value: raw === null ? undefined : (JSON.parse(raw) as T),
      };
    } catch (error) {
      this.logger.warn(
        `Catalog cache unavailable, reading from the database: ${describeError(error)}`,
      );
      return undefined;
    }
  }

  private async store(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        CATALOG_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Could not cache ${key}: ${describeError(error)}`);
    }
  }
}
