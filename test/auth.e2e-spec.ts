import { createHash, randomInt, randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

const RUN_ID = randomUUID().slice(0, 8);
const PASSWORD = 'secret123';
const LOGIN_LIMIT = 5;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let userCount = 0;

function newUser() {
  userCount += 1;
  return {
    name: 'Test User',
    email: `user${userCount}-${RUN_ID}@example.test`,
    phone: `+44${randomInt(1_000_000_000, 9_999_999_999)}`,
    password: PASSWORD,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  const throttlerStorage = new ThrottlerStorageService();

  function postRegister(user: ReturnType<typeof newUser>) {
    return request(server).post('/api/v1/auth/register').send(user);
  }

  async function register(user = newUser()) {
    const response = await postRegister(user).expect(HttpStatus.CREATED);
    return { user, tokens: response.body as TokenPair };
  }

  function login(identifier: string, password = PASSWORD) {
    return request(server)
      .post('/api/v1/auth/login')
      .send({ identifier, password });
  }

  function refresh(refreshToken: string) {
    return request(server).post('/api/v1/auth/refresh').send({ refreshToken });
  }

  function logout(refreshToken: string, accessToken?: string) {
    const call = request(server).post('/api/v1/auth/logout');
    if (accessToken) {
      call.auth(accessToken, { type: 'bearer' });
    }
    return call.send({ refreshToken });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    throttlerStorage.onApplicationShutdown();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: RUN_ID } } });
    await app.close();
    throttlerStorage.onApplicationShutdown();
  });

  describe('register', () => {
    it('creates an account and returns a token pair', async () => {
      const { tokens } = await register();

      expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(tokens.accessToken).toBeTypeOf('string');
      expect(tokens.refreshToken).toBeTypeOf('string');
    });

    it('rejects a duplicate email', async () => {
      const { user } = await register();

      const response = await postRegister({
        ...newUser(),
        email: user.email.toUpperCase(),
      });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('rejects a duplicate phone', async () => {
      const { user } = await register();

      const response = await postRegister({ ...newUser(), phone: user.phone });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('rejects a weak password', async () => {
      const response = await postRegister({
        ...newUser(),
        password: 'password',
      });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body).toMatchObject({
        message: ['password must contain a number'],
      });
    });
  });

  describe('login', () => {
    it('logs in by email regardless of case', async () => {
      const { user } = await register();

      const response = await login(user.email.toUpperCase());

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toMatchObject({ tokenType: 'Bearer' });
    });

    it('logs in by phone', async () => {
      const { user } = await register();

      const response = await login(user.phone);

      expect(response.status).toBe(HttpStatus.OK);
    });

    it('rejects a wrong password with a generic message', async () => {
      const { user } = await register();

      const response = await login(user.email, 'wrong-password1');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body).toEqual({
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized',
      });
    });

    it('gives an unknown user the same response as a wrong password', async () => {
      const response = await login(`nobody-${RUN_ID}@example.test`);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body).toMatchObject({ message: 'Invalid credentials' });
    });

    it('rate limits login attempts from one client', async () => {
      const identifier = `nobody-${RUN_ID}@example.test`;
      const statuses: number[] = [];

      for (let attempt = 0; attempt <= LOGIN_LIMIT; attempt += 1) {
        statuses.push((await login(identifier)).status);
      }

      expect(statuses).toEqual([
        ...Array<number>(LOGIN_LIMIT).fill(HttpStatus.UNAUTHORIZED),
        HttpStatus.TOO_MANY_REQUESTS,
      ]);
    });
  });

  describe('users/me', () => {
    it('returns the profile without the password hash', async () => {
      const { user, tokens } = await register();

      const response = await request(server)
        .get('/api/v1/users/me')
        .auth(tokens.accessToken, { type: 'bearer' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toMatchObject({
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: 'USER',
      });
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a request without a token', async () => {
      const response = await request(server).get('/api/v1/users/me');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const { tokens } = await register();

      const response = await refresh(tokens.refreshToken);
      const rotated = response.body as TokenPair;

      expect(response.status).toBe(HttpStatus.OK);
      expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
      expect((await refresh(rotated.refreshToken)).status).toBe(HttpStatus.OK);
    });

    it('revokes every session when a used refresh token is replayed', async () => {
      const { tokens } = await register();
      const rotated = (await refresh(tokens.refreshToken)).body as TokenPair;

      const replay = await refresh(tokens.refreshToken);
      const afterReplay = await refresh(rotated.refreshToken);

      expect(replay.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(afterReplay.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects an expired refresh token', async () => {
      const { tokens } = await register();
      await prisma.refreshToken.update({
        where: { tokenHash: sha256(tokens.refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const response = await refresh(tokens.refreshToken);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects an unknown refresh token', async () => {
      const response = await refresh('not-a-real-token');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const { tokens } = await register();

      const response = await logout(tokens.refreshToken, tokens.accessToken);

      expect(response.status).toBe(HttpStatus.NO_CONTENT);
      expect((await refresh(tokens.refreshToken)).status).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });

    it('requires an access token', async () => {
      const { tokens } = await register();

      const response = await logout(tokens.refreshToken);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});
