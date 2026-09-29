import { Logger, NotFoundException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { CatalogCacheService } from './catalog-cache.service.js';

const KEY = 'product:01920000-0000-7000-8000-000000000001';
const PRODUCT = { id: '01920000-0000-7000-8000-000000000001', name: 'Burger' };

function createCache() {
  const redis = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(2),
  };
  const cache = new CatalogCacheService(redis as unknown as Redis);

  return { cache, redis };
}

describe('CatalogCacheService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOrLoad', () => {
    it('returns a cached value without loading it again', async () => {
      const { cache, redis } = createCache();
      redis.get
        .mockResolvedValueOnce('3')
        .mockResolvedValueOnce(JSON.stringify(PRODUCT));
      const load = vi.fn();

      await expect(cache.getOrLoad(KEY, load)).resolves.toEqual(PRODUCT);
      expect(load).not.toHaveBeenCalled();
      expect(redis.get).toHaveBeenNthCalledWith(1, 'catalog:version');
      expect(redis.get).toHaveBeenNthCalledWith(2, `catalog:v3:${KEY}`);
    });

    it('loads a missing value and caches it for five minutes under the current version', async () => {
      const { cache, redis } = createCache();
      redis.get.mockResolvedValueOnce('3').mockResolvedValueOnce(null);

      await expect(
        cache.getOrLoad(KEY, () => Promise.resolve(PRODUCT)),
      ).resolves.toEqual(PRODUCT);
      expect(redis.set).toHaveBeenCalledWith(
        `catalog:v3:${KEY}`,
        JSON.stringify(PRODUCT),
        'EX',
        300,
      );
    });

    it('starts at version zero before any admin write', async () => {
      const { cache, redis } = createCache();
      redis.get.mockResolvedValue(null);

      await cache.getOrLoad(KEY, () => Promise.resolve(PRODUCT));

      expect(redis.set).toHaveBeenCalledWith(
        `catalog:v0:${KEY}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('does not cache a value that failed to load', async () => {
      const { cache, redis } = createCache();
      redis.get.mockResolvedValue(null);

      await expect(
        cache.getOrLoad(KEY, () => Promise.reject(new NotFoundException())),
      ).rejects.toThrow(NotFoundException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('falls back to the loader when redis is unavailable', async () => {
      const { cache, redis } = createCache();
      redis.get.mockRejectedValue(new Error('Command timed out'));

      await expect(
        cache.getOrLoad(KEY, () => Promise.resolve(PRODUCT)),
      ).resolves.toEqual(PRODUCT);
      expect(redis.set).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledOnce();
    });

    it('still returns the loaded value when caching it fails', async () => {
      const { cache, redis } = createCache();
      redis.get.mockResolvedValue(null);
      redis.set.mockRejectedValue(new Error('Command timed out'));

      await expect(
        cache.getOrLoad(KEY, () => Promise.resolve(PRODUCT)),
      ).resolves.toEqual(PRODUCT);
      expect(Logger.prototype.warn).toHaveBeenCalledOnce();
    });
  });

  describe('invalidate', () => {
    it('bumps the catalog version so every cached entry goes stale', async () => {
      const { cache, redis } = createCache();

      await cache.invalidate();

      expect(redis.incr).toHaveBeenCalledWith('catalog:version');
    });

    it('logs instead of failing the admin write when the version cannot be bumped', async () => {
      const { cache, redis } = createCache();
      redis.incr.mockRejectedValue(new Error('Command timed out'));

      await expect(cache.invalidate()).resolves.toBeUndefined();
      expect(Logger.prototype.error).toHaveBeenCalledOnce();
    });
  });
});
