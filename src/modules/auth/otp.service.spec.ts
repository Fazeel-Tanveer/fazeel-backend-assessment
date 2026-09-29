import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import type { EventPublisher } from '../../infra/messaging/event-publisher.service.js';
import type { UsersService } from '../users/users.service.js';
import { OtpService } from './otp.service.js';
import type { OtpStore } from './otp.store.js';
import type { TokenService } from './token.service.js';

const USER = { id: '01920000-0000-7000-8000-000000000200', role: Role.USER };
const EMAIL = 'alice@example.com';
const PHONE = '+15551234567';
const CODE = '123456';
const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function createService() {
  const users = { findByIdentifier: vi.fn().mockResolvedValue(USER) };
  const tokens = { issue: vi.fn().mockResolvedValue(TOKENS) };
  const events = { publishNotification: vi.fn().mockResolvedValue(undefined) };
  const store = {
    startCooldown: vi.fn().mockResolvedValue(true),
    clearCooldown: vi.fn().mockResolvedValue(undefined),
    createCode: vi.fn().mockResolvedValue(CODE),
    verify: vi.fn().mockResolvedValue(true),
  };
  const service = new OtpService(
    users as unknown as UsersService,
    tokens as unknown as TokenService,
    events as unknown as EventPublisher,
    store as unknown as OtpStore,
  );

  return { service, users, tokens, events, store };
}

describe('OtpService', () => {
  describe('requestCode', () => {
    it('emails a new code to a known email address', async () => {
      const { service, store, events } = createService();

      await service.requestCode(EMAIL);

      expect(store.createCode).toHaveBeenCalledWith(EMAIL);
      expect(events.publishNotification).toHaveBeenCalledWith({
        channel: 'email',
        to: EMAIL,
        message: expect.stringContaining(CODE) as string,
      });
    });

    it('texts the code when the identifier is a phone number', async () => {
      const { service, events } = createService();

      await service.requestCode(PHONE);

      expect(events.publishNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'sms', to: PHONE }),
      );
    });

    it('sends nothing to an unknown identifier but still succeeds', async () => {
      const { service, users, store, events } = createService();
      users.findByIdentifier.mockResolvedValue(null);

      await expect(service.requestCode(EMAIL)).resolves.toBeUndefined();
      expect(store.createCode).not.toHaveBeenCalled();
      expect(events.publishNotification).not.toHaveBeenCalled();
      expect(store.clearCooldown).not.toHaveBeenCalled();
    });

    it('refuses a new code while the resend cooldown is running', async () => {
      const { service, users, store } = createService();
      store.startCooldown.mockResolvedValue(false);

      await expect(service.requestCode(EMAIL)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(users.findByIdentifier).not.toHaveBeenCalled();
    });

    it('lifts the cooldown when the code cannot be queued', async () => {
      const { service, events, store } = createService();
      const failure = new Error('broker unavailable');
      events.publishNotification.mockRejectedValue(failure);

      await expect(service.requestCode(EMAIL)).rejects.toBe(failure);
      expect(store.clearCooldown).toHaveBeenCalledWith(EMAIL);
    });
  });

  describe('verifyCode', () => {
    it('issues tokens for a valid code', async () => {
      const { service, store, users, tokens } = createService();

      const result = await service.verifyCode({
        identifier: EMAIL,
        code: CODE,
      });

      expect(store.verify).toHaveBeenCalledWith(EMAIL, CODE);
      expect(users.findByIdentifier).toHaveBeenCalledWith(EMAIL);
      expect(tokens.issue).toHaveBeenCalledWith(USER);
      expect(result).toBe(TOKENS);
    });

    it('rejects an invalid or expired code with a generic message', async () => {
      const { service, store, users } = createService();
      store.verify.mockResolvedValue(false);

      await expect(
        service.verifyCode({ identifier: EMAIL, code: CODE }),
      ).rejects.toThrow(new UnauthorizedException('Invalid or expired code'));
      expect(users.findByIdentifier).not.toHaveBeenCalled();
    });

    it('rejects a valid code when the account no longer exists', async () => {
      const { service, users, tokens } = createService();
      users.findByIdentifier.mockResolvedValue(null);

      await expect(
        service.verifyCode({ identifier: EMAIL, code: CODE }),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokens.issue).not.toHaveBeenCalled();
    });
  });
});
