import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../types/auth-user.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const SECRET = 'test-access-secret-with-at-least-32-chars';
const USER_ID = '01920000-0000-7000-8000-000000000200';

const jwt = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256' },
  verifyOptions: { algorithms: ['HS256'] },
});

function createRequest(authorization?: string) {
  return { headers: { authorization } } as AuthenticatedRequest;
}

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    getHandler: () => createContext,
    getClass: () => JwtAuthGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createGuard(isPublic = false) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);

  return new JwtAuthGuard(reflector, jwt);
}

describe('JwtAuthGuard', () => {
  it('lets public routes through without a token', async () => {
    const guard = createGuard(true);

    await expect(
      guard.canActivate(createContext(createRequest())),
    ).resolves.toBe(true);
  });

  it('rejects a request without a bearer token', async () => {
    const guard = createGuard();

    await expect(
      guard.canActivate(createContext(createRequest('Basic dXNlcjpwYXNz'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const guard = createGuard();
    const forged = await new JwtService({
      secret: 'another-secret-that-is-also-32-chars-long',
    }).signAsync({ sub: USER_ID, role: Role.ADMIN });

    await expect(
      guard.canActivate(createContext(createRequest(`Bearer ${forged}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const guard = createGuard();
    const expired = await jwt.signAsync({
      sub: USER_ID,
      role: Role.USER,
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(
      guard.canActivate(createContext(createRequest(`Bearer ${expired}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['a missing user id', { role: Role.USER }],
    ['an unknown role', { sub: USER_ID, role: 'SUPERUSER' }],
  ])('rejects a signed token with %s', async (_case, payload) => {
    const guard = createGuard();
    const token = await jwt.signAsync(payload);

    await expect(
      guard.canActivate(createContext(createRequest(`Bearer ${token}`))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the user from a valid token', async () => {
    const guard = createGuard();
    const token = await jwt.signAsync({ sub: USER_ID, role: Role.USER });
    const request = createRequest(`Bearer ${token}`);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: USER_ID, role: Role.USER });
  });
});
