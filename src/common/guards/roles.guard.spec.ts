import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../types/auth-user.js';
import { RolesGuard } from './roles.guard.js';

const USER_ID = '01920000-0000-7000-8000-000000000200';

function createContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => createContext,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles?: Role[]) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route with no role requirement', () => {
    const guard = createGuard();

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows a user who has a required role', () => {
    const guard = createGuard([Role.ADMIN]);

    const allowed = guard.canActivate(
      createContext({ id: USER_ID, role: Role.ADMIN }),
    );

    expect(allowed).toBe(true);
  });

  it('rejects a user without a required role', () => {
    const guard = createGuard([Role.ADMIN]);

    const allowed = guard.canActivate(
      createContext({ id: USER_ID, role: Role.USER }),
    );

    expect(allowed).toBe(false);
  });

  it('rejects a request with no authenticated user', () => {
    const guard = createGuard([Role.ADMIN]);

    expect(guard.canActivate(createContext())).toBe(false);
  });
});
