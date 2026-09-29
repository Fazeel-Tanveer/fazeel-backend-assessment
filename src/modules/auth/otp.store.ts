import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation.js';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants.js';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from './auth.constants.js';

const CODE_KEY_PREFIX = 'otp:code:';
const COOLDOWN_KEY_PREFIX = 'otp:cooldown:';
const CODE_UPPER_BOUND = 10 ** OTP_LENGTH;
const randomIntAsync = promisify<number, number>(randomInt);

// counts the attempt before the caller compares, so parallel guesses can never exceed the limit
const CLAIM_ATTEMPT_SCRIPT = `
local codeHash = redis.call('HGET', KEYS[1], 'codeHash')
if not codeHash then return nil end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts > tonumber(ARGV[1]) then return nil end
return {codeHash, attempts}
`;

function isClaimedAttempt(value: unknown): value is [string, number] {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  );
}

@Injectable()
export class OtpStore {
  private readonly secret: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('OTP_SECRET', { infer: true });
  }

  async createCode(identifier: string): Promise<string> {
    const code = (await randomIntAsync(CODE_UPPER_BOUND))
      .toString()
      .padStart(OTP_LENGTH, '0');
    const key = this.codeKey(identifier);

    await this.redis
      .multi()
      .hset(key, { codeHash: this.hmac(code), attempts: 0 })
      .expire(key, OTP_TTL_SECONDS)
      .exec();
    return code;
  }

  async startCooldown(identifier: string): Promise<boolean> {
    const started = await this.redis.set(
      this.cooldownKey(identifier),
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    return started !== null;
  }

  async clearCooldown(identifier: string): Promise<void> {
    await this.redis.del(this.cooldownKey(identifier));
  }

  async verify(identifier: string, code: string): Promise<boolean> {
    const key = this.codeKey(identifier);
    const claimed = await this.redis.eval(
      CLAIM_ATTEMPT_SCRIPT,
      1,
      key,
      OTP_MAX_ATTEMPTS,
    );
    if (!isClaimedAttempt(claimed)) {
      return false;
    }

    const [codeHash, attempts] = claimed;
    if (!this.matches(codeHash, code)) {
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.del(key);
      }
      return false;
    }
    // only the request that actually deletes the code gets to use it
    return (await this.redis.del(key)) === 1;
  }

  private matches(codeHash: string, code: string): boolean {
    const expected = Buffer.from(codeHash, 'hex');
    const actual = Buffer.from(this.hmac(code), 'hex');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  // keys hold an hmac of the identifier so emails and phone numbers never appear in Redis
  private codeKey(identifier: string): string {
    return `${CODE_KEY_PREFIX}${this.hmac(identifier)}`;
  }

  private cooldownKey(identifier: string): string {
    return `${COOLDOWN_KEY_PREFIX}${this.hmac(identifier)}`;
  }
}
