import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from './prisma.service.js';

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(function PrismaPg() {
    return { provider: 'postgres', adapterName: '@prisma/adapter-pg' };
  }),
}));

const env: Pick<Env, 'DATABASE_URL' | 'DATABASE_POOL_SIZE'> = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/food_ordering',
  DATABASE_POOL_SIZE: 7,
};

function createPrismaService() {
  const config = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<Env, true>;

  return new PrismaService(config);
}

describe('PrismaService', () => {
  it('builds the pg adapter from the database url and pool size', () => {
    createPrismaService();

    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_SIZE,
    });
  });

  it('connects when the module starts', async () => {
    const prisma = createPrismaService();
    const connect = vi.spyOn(prisma, '$connect').mockResolvedValue();

    await prisma.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
  });

  it('disconnects when the app shuts down', async () => {
    const prisma = createPrismaService();
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue();

    await prisma.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
