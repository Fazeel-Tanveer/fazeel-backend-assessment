import type { HealthCheckService } from '@nestjs/terminus';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type { PrismaService } from '../infra/prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

function createController(options: { redisDown?: boolean } = {}) {
  const healthCheck = {
    check: (indicators: (() => PromiseLike<unknown>)[]) =>
      Promise.all(indicators.map((indicator) => indicator())),
  } as unknown as HealthCheckService;
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
  } as unknown as PrismaService;
  const redis = {
    ping: options.redisDown
      ? vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
      : vi.fn().mockResolvedValue('PONG'),
  } as unknown as Redis;

  return new HealthController(
    healthCheck,
    new HealthIndicatorService(),
    prisma,
    redis,
  );
}

describe('HealthController', () => {
  it('reports the database and redis as up when both respond', async () => {
    const results = await createController().check();

    expect(results).toEqual([
      { database: expect.objectContaining({ status: 'up' }) as unknown },
      { redis: expect.objectContaining({ status: 'up' }) as unknown },
    ]);
  });

  it('reports redis as down when it stops responding', async () => {
    const results = await createController({ redisDown: true }).check();

    expect(results).toContainEqual({
      redis: expect.objectContaining({ status: 'down' }) as unknown,
    });
  });
});
