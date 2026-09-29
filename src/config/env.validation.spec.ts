import { NodeEnv, validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/food_ordering',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://food:food@localhost:5672',
  JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-chars',
  OTP_SECRET: 'test-otp-secret-with-at-least-32-chars',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_POOL_SIZE).toBe(10);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.THROTTLE_TTL_MS).toBe(60_000);
    expect(env.THROTTLE_LIMIT).toBe(100);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.BCRYPT_ROUNDS).toBe(12);
    expect(env.LOG_NOTIFICATION_CONTENT).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads LOG_NOTIFICATION_CONTENT=%s as %s', (value, expected) => {
    const env = validateEnv({ ...validEnv, LOG_NOTIFICATION_CONTENT: value });

    expect(env.LOG_NOTIFICATION_CONTENT).toBe(expected);
  });

  it('converts PORT from a string to a number', () => {
    const env = validateEnv({ ...validEnv, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('splits CORS_ORIGINS into a trimmed list', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:5173, https://shop.example.com,',
    });

    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:5173',
      'https://shop.example.com',
    ]);
  });

  it.each([
    ['REDIS_URL', { REDIS_URL: undefined }],
    ['DATABASE_URL', { DATABASE_URL: 'mysql://root@localhost:3306/app' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['PORT', { PORT: '70000' }],
    ['DATABASE_POOL_SIZE', { DATABASE_POOL_SIZE: '0' }],
    ['DATABASE_POOL_SIZE', { DATABASE_POOL_SIZE: '500' }],
    ['JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: undefined }],
    ['JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'too-short' }],
    ['OTP_SECRET', { OTP_SECRET: undefined }],
    ['OTP_SECRET', { OTP_SECRET: 'too-short' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: 'not a url' }],
    ['THROTTLE_LIMIT', { THROTTLE_LIMIT: '0' }],
    ['JWT_ACCESS_TTL_SECONDS', { JWT_ACCESS_TTL_SECONDS: '0' }],
    ['JWT_ACCESS_TTL_SECONDS', { JWT_ACCESS_TTL_SECONDS: '90000' }],
    ['REFRESH_TOKEN_TTL_DAYS', { REFRESH_TOKEN_TTL_DAYS: '0' }],
    ['BCRYPT_ROUNDS', { BCRYPT_ROUNDS: '8' }],
    ['BCRYPT_ROUNDS', { BCRYPT_ROUNDS: '16' }],
    ['LOG_NOTIFICATION_CONTENT', { LOG_NOTIFICATION_CONTENT: 'yes' }],
  ])('rejects an invalid %s', (name, override) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(name);
  });
});
