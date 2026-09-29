import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../infra/redis/redis.constants.js';

const PING_TIMEOUT_MS = 1_000;

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check that the database and Redis are reachable' })
  check() {
    return this.health.check([
      () => this.ping('database', () => this.prisma.$queryRaw`SELECT 1`),
      () => this.ping('redis', () => this.redis.ping()),
    ]);
  }

  private ping(key: string, probe: () => Promise<unknown>) {
    return this.indicators
      .check(key)
      .attempt(async () => {
        await probe();
      })
      .withTimeout(PING_TIMEOUT_MS);
  }
}
