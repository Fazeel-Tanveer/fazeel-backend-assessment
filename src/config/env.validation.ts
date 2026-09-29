import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const DEFAULT_DATABASE_POOL_SIZE = 10;
const MAX_DATABASE_POOL_SIZE = 100;
const MIN_SECRET_LENGTH = 32;
const DEFAULT_THROTTLE_TTL_MS = 60_000;
const DEFAULT_THROTTLE_LIMIT = 100;
const DEFAULT_JWT_ACCESS_TTL_SECONDS = 900;
const MAX_JWT_ACCESS_TTL_SECONDS = 3600;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_REFRESH_TOKEN_TTL_DAYS = 90;
const DEFAULT_BCRYPT_ROUNDS = 12;
const MIN_BCRYPT_ROUNDS = 10;
const MAX_BCRYPT_ROUNDS = 15;

function splitList({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// reads the raw string because implicit conversion turns "false" into true
function parseBoolean({
  key,
  obj,
}: {
  key: string;
  obj: Record<string, unknown>;
}): unknown {
  const raw = obj[key];
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  return raw;
}

export class Env {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(MAX_PORT)
  PORT: number = DEFAULT_PORT;

  @Transform(splitList)
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  CORS_ORIGINS: string[] = [];

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_POOL_SIZE)
  DATABASE_POOL_SIZE: number = DEFAULT_DATABASE_POOL_SIZE;

  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  @IsUrl({ protocols: ['amqp', 'amqps'], require_tld: false })
  RABBITMQ_URL: string;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  JWT_ACCESS_SECRET: string;

  @IsInt()
  @Min(1)
  @Max(MAX_JWT_ACCESS_TTL_SECONDS)
  JWT_ACCESS_TTL_SECONDS: number = DEFAULT_JWT_ACCESS_TTL_SECONDS;

  @IsInt()
  @Min(1)
  @Max(MAX_REFRESH_TOKEN_TTL_DAYS)
  REFRESH_TOKEN_TTL_DAYS: number = DEFAULT_REFRESH_TOKEN_TTL_DAYS;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  OTP_SECRET: string;

  @IsInt()
  @Min(MIN_BCRYPT_ROUNDS)
  @Max(MAX_BCRYPT_ROUNDS)
  BCRYPT_ROUNDS: number = DEFAULT_BCRYPT_ROUNDS;

  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS: number = DEFAULT_THROTTLE_TTL_MS;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = DEFAULT_THROTTLE_LIMIT;

  @Transform(parseBoolean)
  @IsBoolean()
  LOG_NOTIFICATION_CONTENT = false;
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env);

  if (errors.length > 0) {
    const details = errors.flatMap((error) =>
      Object.values({ ...error.constraints }),
    );
    throw new Error(
      `Invalid environment configuration:\n${details.join('\n')}`,
    );
  }

  return env;
}
