import { OtpController } from './otp.controller.js';
import type { OtpService } from './otp.service.js';

const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function createController() {
  const otp = {
    requestCode: vi.fn().mockResolvedValue(undefined),
    verifyCode: vi.fn().mockResolvedValue(TOKENS),
  };
  const controller = new OtpController(otp as unknown as OtpService);

  return { controller, otp };
}

describe('OtpController', () => {
  it('requests a code and answers with the same message for every identifier', async () => {
    const { controller, otp } = createController();

    const response = await controller.request({
      identifier: 'alice@example.com',
    });

    expect(otp.requestCode).toHaveBeenCalledWith('alice@example.com');
    expect(response).toEqual({
      message: 'If the account exists, a login code has been sent',
    });
  });

  it('verifies a code through the otp service', async () => {
    const { controller, otp } = createController();
    const dto = { identifier: 'alice@example.com', code: '123456' };

    await expect(controller.verify(dto)).resolves.toBe(TOKENS);
    expect(otp.verifyCode).toHaveBeenCalledWith(dto);
  });
});
