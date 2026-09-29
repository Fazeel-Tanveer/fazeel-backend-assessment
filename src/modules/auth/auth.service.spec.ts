import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import type { Env } from '../../config/env.validation.js';
import { Role } from '../../generated/prisma/enums.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

const TEST_BCRYPT_ROUNDS = 4;
const USER = { id: '01920000-0000-7000-8000-000000000200', role: Role.USER };
const PASSWORD = 'secret123';
const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};

const config = {
  get: () => TEST_BCRYPT_ROUNDS,
} as unknown as ConfigService<Env, true>;

async function createService() {
  const users = {
    create: vi.fn().mockResolvedValue(USER),
    findCredentials: vi.fn(),
  };
  const tokens = { issue: vi.fn().mockResolvedValue(TOKENS) };
  const service = new AuthService(
    users as unknown as UsersService,
    tokens as unknown as TokenService,
    config,
  );
  await service.onModuleInit();

  return { service, users, tokens };
}

describe('AuthService', () => {
  describe('register', () => {
    it('stores a bcrypt hash of the password and issues tokens', async () => {
      const { service, users, tokens } = await createService();

      const result = await service.register({
        name: 'Alice',
        email: 'alice@example.com',
        phone: '+15551234567',
        password: PASSWORD,
      });

      const [{ passwordHash }] = users.create.mock.calls[0] as [
        { passwordHash: string },
      ];
      expect(passwordHash).not.toBe(PASSWORD);
      await expect(compare(PASSWORD, passwordHash)).resolves.toBe(true);
      expect(tokens.issue).toHaveBeenCalledWith(USER);
      expect(result).toBe(TOKENS);
    });
  });

  describe('login', () => {
    it('issues tokens when the password matches', async () => {
      const { service, users, tokens } = await createService();
      users.findCredentials.mockResolvedValue({
        ...USER,
        passwordHash: await hash(PASSWORD, TEST_BCRYPT_ROUNDS),
      });

      const result = await service.login({
        identifier: 'alice@example.com',
        password: PASSWORD,
      });

      expect(users.findCredentials).toHaveBeenCalledWith('alice@example.com');
      expect(tokens.issue).toHaveBeenCalledWith(USER);
      expect(result).toBe(TOKENS);
    });

    it('rejects a wrong password with a generic error', async () => {
      const { service, users, tokens } = await createService();
      users.findCredentials.mockResolvedValue({
        ...USER,
        passwordHash: await hash(PASSWORD, TEST_BCRYPT_ROUNDS),
      });

      await expect(
        service.login({
          identifier: 'alice@example.com',
          password: 'wrong123',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(tokens.issue).not.toHaveBeenCalled();
    });

    it('rejects an unknown user with the same error', async () => {
      const { service, users, tokens } = await createService();
      users.findCredentials.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(tokens.issue).not.toHaveBeenCalled();
    });
  });
});
