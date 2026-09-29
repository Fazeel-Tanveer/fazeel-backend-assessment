import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation.js';
import { OtpStore } from './otp.store.js';

const SECRET = 'test-otp-secret-with-at-least-32-chars';
const IDENTIFIER = 'alice@example.com';
const CODE = '123456';

const config = { get: () => SECRET } as unknown as ConfigService<Env, true>;

function hmac(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}

const CODE_KEY = `otp:code:${hmac(IDENTIFIER)}`;
const COOLDOWN_KEY = `otp:cooldown:${hmac(IDENTIFIER)}`;

function createStore() {
  const transaction = {
    hset: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };
  transaction.hset.mockReturnValue(transaction);
  transaction.expire.mockReturnValue(transaction);
  const redis = {
    set: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    eval: vi.fn(),
    multi: vi.fn().mockReturnValue(transaction),
  };
  const store = new OtpStore(redis as unknown as Redis, config);

  return { store, redis, transaction };
}

describe('OtpStore', () => {
  describe('createCode', () => {
    it('stores only an hmac of a fresh 6-digit code for 5 minutes', async () => {
      const { store, transaction } = createStore();

      const code = await store.createCode(IDENTIFIER);

      expect(code).toMatch(/^\d{6}$/);
      expect(transaction.hset).toHaveBeenCalledWith(CODE_KEY, {
        codeHash: hmac(code),
        attempts: 0,
      });
      expect(transaction.expire).toHaveBeenCalledWith(CODE_KEY, 300);
      expect(transaction.exec).toHaveBeenCalled();
    });
  });

  describe('cooldown', () => {
    it('starts a 60 second cooldown when none is running', async () => {
      const { store, redis } = createStore();
      redis.set.mockResolvedValue('OK');

      await expect(store.startCooldown(IDENTIFIER)).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith(COOLDOWN_KEY, '1', 'EX', 60, 'NX');
    });

    it('reports a cooldown that is already running', async () => {
      const { store, redis } = createStore();
      redis.set.mockResolvedValue(null);

      await expect(store.startCooldown(IDENTIFIER)).resolves.toBe(false);
    });

    it('clears the cooldown', async () => {
      const { store, redis } = createStore();

      await store.clearCooldown(IDENTIFIER);

      expect(redis.del).toHaveBeenCalledWith(COOLDOWN_KEY);
    });
  });

  describe('verify', () => {
    it('accepts the right code and deletes it', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue([hmac(CODE), 1]);

      await expect(store.verify(IDENTIFIER, CODE)).resolves.toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        CODE_KEY,
        5,
      );
      expect(redis.del).toHaveBeenCalledWith(CODE_KEY);
    });

    it('rejects a code that is missing, expired or out of attempts', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue(null);

      await expect(store.verify(IDENTIFIER, CODE)).resolves.toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('keeps the code after a wrong guess with attempts left', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue([hmac(CODE), 4]);

      await expect(store.verify(IDENTIFIER, '654321')).resolves.toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('deletes the code after the fifth wrong guess', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue([hmac(CODE), 5]);

      await expect(store.verify(IDENTIFIER, '654321')).resolves.toBe(false);
      expect(redis.del).toHaveBeenCalledWith(CODE_KEY);
    });

    it('rejects the right code when a concurrent request already used it', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue([hmac(CODE), 2]);
      redis.del.mockResolvedValue(0);

      await expect(store.verify(IDENTIFIER, CODE)).resolves.toBe(false);
    });

    it('rejects a stored hash that is not a valid digest', async () => {
      const { store, redis } = createStore();
      redis.eval.mockResolvedValue(['abc', 1]);

      await expect(store.verify(IDENTIFIER, CODE)).resolves.toBe(false);
    });
  });
});
