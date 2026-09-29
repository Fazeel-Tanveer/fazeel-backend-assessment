import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
  AuthUser,
} from '../types/auth-user.js';

const BEARER_SCHEME = 'bearer';
const ROLES = Object.values<string>(Role);

function extractBearerToken(request: Request): string | undefined {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme?.toLowerCase() === BEARER_SCHEME && token ? token : undefined;
}

function isAccessTokenPayload(payload: object): payload is AccessTokenPayload {
  return (
    'sub' in payload &&
    typeof payload.sub === 'string' &&
    'role' in payload &&
    typeof payload.role === 'string' &&
    ROLES.includes(payload.role)
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    request.user = await this.verify(token);
    return true;
  }

  private async verify(token: string): Promise<AuthUser> {
    const payload = await this.jwt
      .verifyAsync<object>(token)
      .catch((error: unknown) => {
        // expired, malformed and forged tokens all get the same generic 401
        throw new UnauthorizedException(undefined, { cause: error });
      });
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, role: payload.role };
  }
}
