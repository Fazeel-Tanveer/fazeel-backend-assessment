import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';
import { RegisterDto } from './register.dto.js';

const validInput = {
  name: 'Alice',
  email: 'alice@example.com',
  phone: '+15551234567',
  password: 'secret123',
};

async function invalidFields(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(RegisterDto, input));
  return errors.map((error) => error.property);
}

describe('RegisterDto', () => {
  it('accepts a valid registration', async () => {
    await expect(invalidFields(validInput)).resolves.toEqual([]);
  });

  it('trims the phone', () => {
    const dto = plainToInstance(RegisterDto, {
      ...validInput,
      phone: ' +15551234567 ',
    });

    expect(dto.phone).toBe('+15551234567');
  });

  it('trims and lowercases the email', () => {
    const dto = plainToInstance(RegisterDto, {
      ...validInput,
      email: '  Alice@Example.COM ',
    });

    expect(dto.email).toBe('alice@example.com');
  });

  it.each([
    ['shorter than 8 characters', 'abc123'],
    ['without a number', 'secretpassword'],
    ['without a letter', '12345678'],
    ['longer than bcrypt accepts', `a1${'x'.repeat(71)}`],
  ])('rejects a password %s', async (_case, password) => {
    await expect(invalidFields({ ...validInput, password })).resolves.toEqual([
      'password',
    ]);
  });

  it.each(['05551234567', '+0551234567', '+1 555 123 4567', '+1555'])(
    'rejects the non E.164 phone %s',
    async (phone) => {
      await expect(invalidFields({ ...validInput, phone })).resolves.toEqual([
        'phone',
      ]);
    },
  );

  it('rejects an invalid email', async () => {
    await expect(
      invalidFields({ ...validInput, email: 'not-an-email' }),
    ).resolves.toEqual(['email']);
  });

  it('rejects an empty name', async () => {
    await expect(invalidFields({ ...validInput, name: '  ' })).resolves.toEqual(
      ['name'],
    );
  });

  it('rejects non-string values instead of coercing them', async () => {
    await expect(
      invalidFields({ ...validInput, name: 42, email: 42 }),
    ).resolves.toEqual(['name', 'email']);
  });
});

describe('LoginDto', () => {
  it('trims and lowercases the identifier', () => {
    const dto = plainToInstance(LoginDto, {
      identifier: ' Alice@Example.com ',
      password: 'secret123',
    });

    expect(dto.identifier).toBe('alice@example.com');
  });

  it('rejects a password over 72 bytes even when it is under 72 characters', async () => {
    const dto = plainToInstance(LoginDto, {
      identifier: 'alice@example.com',
      password: 'é'.repeat(40),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(['password']);
  });
});
