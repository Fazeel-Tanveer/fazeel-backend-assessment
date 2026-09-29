import { Role } from '../../generated/prisma/enums.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

const USER = { id: 'user-id', role: Role.USER };
const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function createController() {
  const auth = {
    register: vi.fn().mockResolvedValue(TOKENS),
    login: vi.fn().mockResolvedValue(TOKENS),
  };
  const tokens = {
    rotate: vi.fn().mockResolvedValue(TOKENS),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new AuthController(
    auth as unknown as AuthService,
    tokens as unknown as TokenService,
  );

  return { controller, auth, tokens };
}

describe('AuthController', () => {
  it('registers through the auth service', async () => {
    const { controller, auth } = createController();
    const dto = {
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+15551234567',
      password: 'secret123',
    };

    await expect(controller.register(dto)).resolves.toBe(TOKENS);
    expect(auth.register).toHaveBeenCalledWith(dto);
  });

  it('logs in through the auth service', async () => {
    const { controller, auth } = createController();
    const dto = { identifier: 'alice@example.com', password: 'secret123' };

    await expect(controller.login(dto)).resolves.toBe(TOKENS);
    expect(auth.login).toHaveBeenCalledWith(dto);
  });

  it('rotates the refresh token', async () => {
    const { controller, tokens } = createController();

    await expect(controller.refresh({ refreshToken: 'old' })).resolves.toBe(
      TOKENS,
    );
    expect(tokens.rotate).toHaveBeenCalledWith('old');
  });

  it('revokes the refresh token of the current user on logout', async () => {
    const { controller, tokens } = createController();

    await controller.logout(USER, { refreshToken: 'current' });

    expect(tokens.revoke).toHaveBeenCalledWith(USER.id, 'current');
  });
});
