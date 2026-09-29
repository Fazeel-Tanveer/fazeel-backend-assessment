import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.validation.js';
import { EventPublisher } from '../src/infra/messaging/event-publisher.service.js';
import type { NotificationMessage } from '../src/infra/messaging/queues.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.constants.js';

const RUN_ID = randomUUID().slice(0, 8);
const MAX_ATTEMPTS = 5;
const REQUEST_LIMIT = 3;
const OTP_TTL_SECONDS = 300;
const SENT_MESSAGE = 'If the account exists, a login code has been sent';
const CODE_IN_MESSAGE = /\b(\d{6})\b/;

let userCount = 0;

function newIdentity() {
  userCount += 1;
  return {
    email: `otp${userCount}-${RUN_ID}@example.test`,
    phone: `+44${randomInt(1_000_000_000, 9_999_999_999)}`,
  };
}

function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
}

describe('OTP login (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let redis: Redis;
  let otpSecret: string;
  const throttlerStorage = new ThrottlerStorageService();
  const events = {
    publishNotification:
      vi.fn<(message: NotificationMessage) => Promise<void>>(),
  };

  async function createUser() {
    const identity = newIdentity();
    await prisma.user.create({
      data: { ...identity, name: 'OTP User', passwordHash: 'unused' },
    });
    return identity;
  }

  function requestCode(identifier: string) {
    return request(server)
      .post('/api/v1/auth/otp/request')
      .send({ identifier });
  }

  function verifyCode(identifier: string, code: string) {
    return request(server)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier, code });
  }

  function lastSentCode(): string {
    const [notification] = events.publishNotification.mock.lastCall ?? [];
    const code = notification?.message.match(CODE_IN_MESSAGE)?.[1];
    if (!code) {
      throw new Error('no code was sent');
    }
    return code;
  }

  async function sendCode(identifier: string): Promise<string> {
    await requestCode(identifier).expect(HttpStatus.ACCEPTED);
    return lastSentCode();
  }

  function codeKey(identifier: string): string {
    const hash = createHmac('sha256', otpSecret)
      .update(identifier)
      .digest('hex');
    return `otp:code:${hash}`;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .overrideProvider(EventPublisher)
      .useValue(events)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    otpSecret = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('OTP_SECRET', { infer: true });
  });

  beforeEach(() => {
    throttlerStorage.onApplicationShutdown();
    events.publishNotification.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: RUN_ID } } });
    await app.close();
    throttlerStorage.onApplicationShutdown();
  });

  it('emails a code that signs the user in', async () => {
    const { email } = await createUser();

    const requested = await requestCode(email);
    const verified = await verifyCode(email, lastSentCode());

    expect(requested.status).toBe(HttpStatus.ACCEPTED);
    expect(requested.body).toEqual({ message: SENT_MESSAGE });
    expect(events.publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email', to: email }),
    );
    expect(verified.status).toBe(HttpStatus.OK);
    const me = await request(server)
      .get('/api/v1/users/me')
      .auth((verified.body as { accessToken: string }).accessToken, {
        type: 'bearer',
      });
    expect(me.body).toMatchObject({ email });
  });

  it('texts the code when the user signs in with a phone number', async () => {
    const { phone } = await createUser();

    const code = await sendCode(phone);

    expect(events.publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', to: phone }),
    );
    expect((await verifyCode(phone, code)).status).toBe(HttpStatus.OK);
  });

  it('gives an unknown identifier the same response without sending anything', async () => {
    const response = await requestCode(`nobody-${RUN_ID}@example.test`);

    expect(response.status).toBe(HttpStatus.ACCEPTED);
    expect(response.body).toEqual({ message: SENT_MESSAGE });
    expect(events.publishNotification).not.toHaveBeenCalled();
  });

  it('accepts a code only once', async () => {
    const { email } = await createUser();
    const code = await sendCode(email);

    const first = await verifyCode(email, code);
    const second = await verifyCode(email, code);

    expect(first.status).toBe(HttpStatus.OK);
    expect(second.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects a wrong code with a generic message', async () => {
    const { email } = await createUser();
    const code = await sendCode(email);

    const response = await verifyCode(email, wrongCode(code));

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(response.body).toEqual({
      statusCode: 401,
      message: 'Invalid or expired code',
      error: 'Unauthorized',
    });
  });

  it('locks the code after five wrong attempts', async () => {
    const { email } = await createUser();
    const code = await sendCode(email);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await verifyCode(email, wrongCode(code)).expect(HttpStatus.UNAUTHORIZED);
    }
    throttlerStorage.onApplicationShutdown();
    const response = await verifyCode(email, code);

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(await redis.exists(codeKey(email))).toBe(0);
  });

  it('rejects an expired code', async () => {
    const { email } = await createUser();
    const code = await sendCode(email);
    const ttl = await redis.ttl(codeKey(email));
    await redis.expire(codeKey(email), 0);

    const response = await verifyCode(email, code);

    expect(ttl).toBeGreaterThan(OTP_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(OTP_TTL_SECONDS);
    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('enforces a resend cooldown for known and unknown identifiers alike', async () => {
    const { email } = await createUser();
    const unknown = `nobody-cooldown-${RUN_ID}@example.test`;
    await requestCode(email).expect(HttpStatus.ACCEPTED);
    await requestCode(unknown).expect(HttpStatus.ACCEPTED);
    throttlerStorage.onApplicationShutdown();

    const known = await requestCode(email);
    const stranger = await requestCode(unknown);

    expect(known.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(stranger.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(stranger.body).toEqual(known.body);
    expect(events.publishNotification).toHaveBeenCalledTimes(1);
  });

  it('rate limits code requests from one client', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt <= REQUEST_LIMIT; attempt += 1) {
      const identifier = `nobody-limit${attempt}-${RUN_ID}@example.test`;
      statuses.push((await requestCode(identifier)).status);
    }

    expect(statuses).toEqual([
      ...Array<number>(REQUEST_LIMIT).fill(HttpStatus.ACCEPTED),
      HttpStatus.TOO_MANY_REQUESTS,
    ]);
  });

  it('rejects a malformed code before touching the store', async () => {
    const response = await verifyCode('alice@example.test', '12ab56');

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
