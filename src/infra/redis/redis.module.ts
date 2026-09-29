import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation.js';
import { REDIS_CLIENT } from './redis.constants.js';

// without a timeout, commands queue for over a minute while Redis is unreachable
const COMMAND_TIMEOUT_MS = 500;

function createRedisClient(config: ConfigService<Env, true>): Redis {
  const logger = new Logger('Redis');
  const redis = new Redis(config.get('REDIS_URL', { infer: true }), {
    commandTimeout: COMMAND_TIMEOUT_MS,
  });
  redis.on('error', (error: Error) => {
    logger.error(`Redis connection error: ${error.message}`);
  });
  return redis;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
