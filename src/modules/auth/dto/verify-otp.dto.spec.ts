import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestOtpDto } from './request-otp.dto.js';
import { VerifyOtpDto } from './verify-otp.dto.js';

async function invalidFields(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(VerifyOtpDto, input));
  return errors.map((error) => error.property);
}

describe('RequestOtpDto', () => {
  it('trims and lowercases the identifier', () => {
    const dto = plainToInstance(RequestOtpDto, {
      identifier: ' Alice@Example.com ',
    });

    expect(dto.identifier).toBe('alice@example.com');
  });

  it('rejects an empty identifier', async () => {
    const errors = await validate(
      plainToInstance(RequestOtpDto, { identifier: '  ' }),
    );

    expect(errors.map((error) => error.property)).toEqual(['identifier']);
  });
});

describe('VerifyOtpDto', () => {
  it('accepts an identifier with a 6-digit code', async () => {
    await expect(
      invalidFields({ identifier: 'alice@example.com', code: '012345' }),
    ).resolves.toEqual([]);
  });

  it.each(['12345', '1234567', 'abcdef', ' 12345', 123456])(
    'rejects the code %s',
    async (code) => {
      await expect(
        invalidFields({ identifier: 'alice@example.com', code }),
      ).resolves.toEqual(['code']);
    },
  );
});
