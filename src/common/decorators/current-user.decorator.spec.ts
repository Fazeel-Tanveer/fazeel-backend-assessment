import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../types/auth-user.js';
import { CurrentUser } from './current-user.decorator.js';

type ParamFactory = (data: unknown, context: ExecutionContext) => AuthUser;

function getParamFactory(): ParamFactory {
  class ProfileController {
    show(@CurrentUser() user: AuthUser) {
      return user;
    }
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    ProfileController,
    'show',
  ) as Record<string, { factory: ParamFactory }>;
  const [param] = Object.values(metadata);

  return param.factory;
}

function createContext(user?: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser', () => {
  const factory = getParamFactory();

  it('returns the authenticated user', () => {
    const user = {
      id: '01920000-0000-7000-8000-000000000200',
      role: Role.USER,
    };

    expect(factory(undefined, createContext(user))).toEqual(user);
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => factory(undefined, createContext())).toThrow(
      UnauthorizedException,
    );
  });
});
