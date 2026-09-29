import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AccessTokenPayload,
  AuthUser,
} from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  INVALID_REFRESH_TOKEN,
  REFRESH_TOKEN_BYTES,
  TOKEN_TYPE,
} from './auth.constants.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const randomBytesAsync = promisify(randomBytes);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    this.refreshTtlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * MS_PER_DAY;
  }

  async issue(user: AuthUser): Promise<AuthResponseDto> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const refreshToken = (await randomBytesAsync(REFRESH_TOKEN_BYTES)).toString(
      'base64url',
    );

    const [accessToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
        select: { id: true },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: TOKEN_TYPE,
      expiresIn: this.accessTtlSeconds,
    };
  }

  async rotate(refreshToken: string): Promise<AuthResponseDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        user: { select: { role: true } },
      },
    });
    if (!stored || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      // a token that was already used is being replayed, so treat every session as stolen
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    return this.issue({ id: stored.userId, role: stored.user.role });
  }

  async revoke(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
