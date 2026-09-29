import { Logger } from '@nestjs/common';
import { MockPaymentGateway } from './mock-payment.gateway.js';

describe('MockPaymentGateway', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('approves every charge', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await expect(
      new MockPaymentGateway().charge({
        orderId: '01920000-0000-7000-8000-000000000300',
        amountCents: 1798,
      }),
    ).resolves.toBe('approved');
  });
});
