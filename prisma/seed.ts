import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const BCRYPT_ROUNDS = 12;
const ADMIN_ID = '01920000-0000-7000-8000-000000000100';
const ADMIN_NAME = 'Admin';
const ADMIN_PHONE = '+15550000000';

interface SeedProduct {
  id: string;
  name: string;
  description: string;
  variants: { sku: string; name: string; priceCents: number }[];
}

// fixed ids let the upserts find the same rows on every run, even if the admin email changes
const PRODUCTS: SeedProduct[] = [
  {
    id: '01920000-0000-7000-8000-000000000001',
    name: 'Chicken Wings',
    description: 'Crispy wings tossed in buffalo sauce',
    variants: [
      { sku: 'WINGS-8PC', name: '8pc', priceCents: 899 },
      { sku: 'WINGS-16PC', name: '16pc', priceCents: 1599 },
    ],
  },
  {
    id: '01920000-0000-7000-8000-000000000002',
    name: 'Burger',
    description: 'Beef patty with cheese, lettuce and pickles',
    variants: [
      { sku: 'BURGER-SINGLE', name: 'Single', priceCents: 699 },
      { sku: 'BURGER-DOUBLE', name: 'Double', priceCents: 999 },
    ],
  },
  {
    id: '01920000-0000-7000-8000-000000000003',
    name: 'Margherita Pizza',
    description: 'Tomato, mozzarella and basil',
    variants: [
      { sku: 'PIZZA-MARG-M', name: 'Medium', priceCents: 1099 },
      { sku: 'PIZZA-MARG-L', name: 'Large', priceCents: 1499 },
    ],
  },
  {
    id: '01920000-0000-7000-8000-000000000004',
    name: 'Fries',
    description: 'Salted skin-on fries',
    variants: [
      { sku: 'FRIES-REG', name: 'Regular', priceCents: 299 },
      { sku: 'FRIES-LRG', name: 'Large', priceCents: 399 },
    ],
  },
  {
    id: '01920000-0000-7000-8000-000000000005',
    name: 'Cola',
    description: 'Chilled soft drink',
    variants: [
      { sku: 'COLA-CAN', name: 'Can', priceCents: 199 },
      { sku: 'COLA-1500ML', name: '1.5L Bottle', priceCents: 349 },
    ],
  },
];

const logger = new Logger('Seed');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to run the seed`);
  }
  return value;
}

async function seedAdmin(prisma: PrismaClient) {
  const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const passwordHash = await hash(
    requireEnv('SEED_ADMIN_PASSWORD'),
    BCRYPT_ROUNDS,
  );

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    create: {
      id: ADMIN_ID,
      name: ADMIN_NAME,
      email,
      phone: ADMIN_PHONE,
      passwordHash,
      role: Role.ADMIN,
    },
    update: { email, passwordHash, role: Role.ADMIN },
  });
}

function upsertProducts(prisma: PrismaClient) {
  return PRODUCTS.flatMap(({ variants, ...product }) => [
    prisma.product.upsert({
      where: { id: product.id },
      create: product,
      update: product,
    }),
    ...variants.map((variant) => {
      const data = { ...variant, productId: product.id };
      return prisma.productVariant.upsert({
        where: { sku: variant.sku },
        create: data,
        update: data,
      });
    }),
  ]);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  try {
    await Promise.all([
      seedAdmin(prisma),
      prisma.$transaction(upsertProducts(prisma)),
    ]);
    logger.log(`Seeded the admin user and ${PRODUCTS.length} products`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
