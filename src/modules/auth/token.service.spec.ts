import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.validation.js';
import { Role } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TokenService } from './token.service.js';

const USER = { id: '01920000-0000-7000-8000-000000000200', role: Role.USER };
const TOKEN_ID = '01920000-0000-7000-8000-000000000300';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const jwt = new JwtService({
  secret: 'test-access-secret-with-at-least-32-chars',
});

const config = {
  get: (key: keyof Env) =>
    ({ JWT_ACCESS_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 7 })[key as string],
} as unknown as ConfigService<Env, true>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createService() {
  const refreshToken = {
    create: vi.fn().mockResolvedValue({ id: TOKEN_ID }),
    findUnique: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = { refreshToken } as unknown as PrismaService;

  return { service: new TokenService(prisma, jwt, config), refreshToken };
}

function storedToken(overrides: { expiresAt?: Date } = {}) {
  return {
    id: TOKEN_ID,
    userId: USER.id,
    expiresAt: new Date(NOW.getTime() + SEVEN_DAYS_MS),
    user: { role: USER.role },
    ...overrides,
  };
}

describe('TokenService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('issue', () => {
    it('signs an access token carrying the user id and role', async () => {
      const { service } = createService();

      const tokens = await service.issue(USER);

      await expect(jwt.verifyAsync(tokens.accessToken)).resolves.toMatchObject({
        sub: USER.id,
        role: USER.role,
      });
      expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    });

    it('stores only the hash of the refresh token with a 7 day expiry', async () => {
      const { service, refreshToken } = createService();

      const tokens = await service.issue(USER);

      expect(refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: USER.id,
          tokenHash: sha256(tokens.refreshToken),
          expiresAt: new Date(NOW.getTime() + SEVEN_DAYS_MS),
        },
        select: { id: true },
      });
    });

    it('issues a different refresh token every time', async () => {
      const { service } = createService();

      const first = await service.issue(USER);
      const second = await service.issue(USER);

      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe('rotate', () => {
    it('revokes the used token and issues a new pair', async () => {
      const { service, refreshToken } = createService();
      refreshToken.findUnique.mockResolvedValue(storedToken());

      const tokens = await service.rotate('old-token');

      expect(refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256('old-token') } }),
      );
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: TOKEN_ID, revokedAt: null },
        data: { revokedAt: NOW },
      });
      expect(tokens.refreshToken).not.toBe('old-token');
      expect(refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown token', async () => {
      const { service, refreshToken } = createService();
      refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate('unknown')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const { service, refreshToken } = createService();
      refreshToken.findUnique.mockResolvedValue(
        storedToken({ expiresAt: new Date(NOW.getTime() - 1) }),
      );

      await expect(service.rotate('expired')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes every session of the user when a rotated token is reused', async () => {
      const { service, refreshToken } = createService();
      refreshToken.findUnique.mockResolvedValue(storedToken());
      refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.rotate('reused')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshToken.updateMany).toHaveBeenLastCalledWith({
        where: { userId: USER.id, revokedAt: null },
        data: { revokedAt: NOW },
      });
      expect(refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revokes the given token only for its owner', async () => {
      const { service, refreshToken } = createService();

      await service.revoke(USER.id, 'current-token');

      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          tokenHash: sha256('current-token'),
          revokedAt: null,
        },
        data: { revokedAt: NOW },
      });
    });
  });
});
