import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

const RUN_ID = randomUUID().slice(0, 8);
const MISSING_ID = '01920000-0000-7000-8000-00000000ffff';
const SMALL_PRICE = 499;
const LARGE_PRICE = 899;

interface CartItemBody {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  isAvailable: boolean;
}

interface CartBody {
  userId: string;
  items: CartItemBody[];
  totalCents: number;
}

interface Menu {
  productId: string;
  smallId: string;
  largeId: string;
}

let userCount = 0;
let productCount = 0;

describe('Cart (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let jwt: JwtService;
  let menu: Menu;
  const throttlerStorage = new ThrottlerStorageService();

  async function newShopper(): Promise<{ id: string; token: string }> {
    userCount += 1;
    const { id } = await prisma.user.create({
      data: {
        name: 'Cart Tester',
        email: `cart${userCount}-${RUN_ID}@example.test`,
        phone: `+44${randomInt(1_000_000_000, 9_999_999_999)}`,
        passwordHash: 'not-a-real-hash',
      },
      select: { id: true },
    });
    return { id, token: await jwt.signAsync({ sub: id, role: Role.USER }) };
  }

  async function newMenu(): Promise<Menu> {
    productCount += 1;
    const tag = `${RUN_ID}-${productCount}`.toUpperCase();
    const product = await prisma.product.create({
      data: {
        name: `Cart Wings ${RUN_ID}`,
        variants: {
          create: [
            { name: '8pc', sku: `CART-${tag}-8`, priceCents: SMALL_PRICE },
            { name: '16pc', sku: `CART-${tag}-16`, priceCents: LARGE_PRICE },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true, name: true } } },
    });
    const idOf = (name: string) =>
      product.variants.find((variant) => variant.name === name)?.id ?? '';
    return {
      productId: product.id,
      smallId: idOf('8pc'),
      largeId: idOf('16pc'),
    };
  }

  function addItem(token: string, variantId: string, quantity: number) {
    return request(server)
      .post('/api/v1/cart/items')
      .auth(token, { type: 'bearer' })
      .send({ variantId, quantity });
  }

  function updateItem(token: string, variantId: string, quantity: number) {
    return request(server)
      .patch(`/api/v1/cart/items/${variantId}`)
      .auth(token, { type: 'bearer' })
      .send({ quantity });
  }

  function removeItem(token: string, variantId: string) {
    return request(server)
      .delete(`/api/v1/cart/items/${variantId}`)
      .auth(token, { type: 'bearer' });
  }

  async function getCart(token: string): Promise<CartBody> {
    const response = await request(server)
      .get('/api/v1/cart')
      .auth(token, { type: 'bearer' })
      .expect(HttpStatus.OK);
    return response.body as CartBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    menu = await newMenu();
  });

  beforeEach(() => {
    throttlerStorage.onApplicationShutdown();
  });

  afterAll(async () => {
    const byRun = { name: { contains: RUN_ID } };
    await prisma.user.deleteMany({ where: { email: { contains: RUN_ID } } });
    await prisma.productVariant.deleteMany({ where: { product: byRun } });
    await prisma.product.deleteMany({ where: byRun });
    await app.close();
    throttlerStorage.onApplicationShutdown();
  });

  describe('reading', () => {
    it('returns an empty cart for a user who has not added anything', async () => {
      const shopper = await newShopper();

      await expect(getCart(shopper.token)).resolves.toEqual({
        userId: shopper.id,
        items: [],
        totalCents: 0,
      });
    });

    it('requires an access token', async () => {
      const response = await request(server).get('/api/v1/cart');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('adding', () => {
    it('adds several variants of a product and totals them', async () => {
      const shopper = await newShopper();

      await addItem(shopper.token, menu.smallId, 2).expect(HttpStatus.OK);
      const response = await addItem(shopper.token, menu.largeId, 1);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toEqual({
        userId: shopper.id,
        items: [
          expect.objectContaining({
            productId: menu.productId,
            variantId: menu.smallId,
            variantName: '8pc',
            quantity: 2,
            lineTotalCents: 2 * SMALL_PRICE,
          }),
          expect.objectContaining({ variantId: menu.largeId, quantity: 1 }),
        ],
        totalCents: 2 * SMALL_PRICE + LARGE_PRICE,
      });
    });

    it('adds to the existing line when the same variant is added again', async () => {
      const shopper = await newShopper();

      await addItem(shopper.token, menu.smallId, 2).expect(HttpStatus.OK);
      await addItem(shopper.token, menu.smallId, 3).expect(HttpStatus.OK);

      const cart = await getCart(shopper.token);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({ quantity: 5 });
    });

    it('rejects going past 20 of one variant and keeps the cart as it was', async () => {
      const shopper = await newShopper();
      await addItem(shopper.token, menu.smallId, 15).expect(HttpStatus.OK);

      const response = await addItem(shopper.token, menu.smallId, 6);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect((await getCart(shopper.token)).items[0]).toMatchObject({
        quantity: 15,
      });
    });

    it('keeps concurrent adds within the limit of 20', async () => {
      const shopper = await newShopper();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          addItem(shopper.token, menu.largeId, 5),
        ),
      );

      const statuses = responses
        .map((response) => response.status)
        .sort((a, b) => a - b);
      expect(statuses).toEqual([
        HttpStatus.OK,
        HttpStatus.OK,
        HttpStatus.OK,
        HttpStatus.OK,
        HttpStatus.BAD_REQUEST,
      ]);
      expect((await getCart(shopper.token)).items[0]).toMatchObject({
        quantity: 20,
      });
    });

    it('returns 404 for an unknown variant', async () => {
      const shopper = await newShopper();

      const response = await addItem(shopper.token, MISSING_ID, 1);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('rejects a variant that is no longer available', async () => {
      const shopper = await newShopper();
      const { smallId } = await newMenu();
      await prisma.productVariant.update({
        where: { id: smallId },
        data: { isAvailable: false },
      });

      const response = await addItem(shopper.token, smallId, 1);

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body).toMatchObject({
        message: 'Variant is not available',
      });
    });

    it('rejects a variant of a deleted product', async () => {
      const shopper = await newShopper();
      const { productId, smallId } = await newMenu();
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });

      const response = await addItem(shopper.token, smallId, 1);

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it.each([
      ['a zero quantity', { quantity: 0 }],
      ['more than 20 at once', { quantity: 21 }],
      ['a fractional quantity', { quantity: 1.5 }],
      ['a variant id that is not a uuid', { variantId: 'wings' }],
    ])('rejects %s', async (_case, change) => {
      const shopper = await newShopper();

      const response = await request(server)
        .post('/api/v1/cart/items')
        .auth(shopper.token, { type: 'bearer' })
        .send({ variantId: menu.smallId, quantity: 1, ...change });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('changing', () => {
    it('sets a new quantity for an item', async () => {
      const shopper = await newShopper();
      await addItem(shopper.token, menu.smallId, 2).expect(HttpStatus.OK);

      const response = await updateItem(shopper.token, menu.smallId, 7);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toMatchObject({
        items: [expect.objectContaining({ quantity: 7 })],
        totalCents: 7 * SMALL_PRICE,
      });
    });

    it('removes an item', async () => {
      const shopper = await newShopper();
      await addItem(shopper.token, menu.smallId, 1).expect(HttpStatus.OK);
      await addItem(shopper.token, menu.largeId, 1).expect(HttpStatus.OK);

      await removeItem(shopper.token, menu.smallId).expect(
        HttpStatus.NO_CONTENT,
      );

      const cart = await getCart(shopper.token);
      expect(cart.items.map((item) => item.variantId)).toEqual([menu.largeId]);
      expect(cart.totalCents).toBe(LARGE_PRICE);
    });

    it('returns 404 for an item that is not in the cart', async () => {
      const shopper = await newShopper();

      const update = await updateItem(shopper.token, menu.smallId, 1);
      const remove = await removeItem(shopper.token, menu.smallId);

      expect(update.status).toBe(HttpStatus.NOT_FOUND);
      expect(remove.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('clears the cart', async () => {
      const shopper = await newShopper();
      await addItem(shopper.token, menu.smallId, 1).expect(HttpStatus.OK);
      await addItem(shopper.token, menu.largeId, 1).expect(HttpStatus.OK);

      const response = await request(server)
        .delete('/api/v1/cart')
        .auth(shopper.token, { type: 'bearer' });

      expect(response.status).toBe(HttpStatus.NO_CONTENT);
      expect(await getCart(shopper.token)).toMatchObject({
        items: [],
        totalCents: 0,
      });
    });

    it('flags an item that became unavailable and leaves it out of the total', async () => {
      const shopper = await newShopper();
      const { smallId, largeId } = await newMenu();
      await addItem(shopper.token, smallId, 1).expect(HttpStatus.OK);
      await addItem(shopper.token, largeId, 1).expect(HttpStatus.OK);

      await prisma.productVariant.update({
        where: { id: largeId },
        data: { isAvailable: false },
      });

      const cart = await getCart(shopper.token);
      expect(cart.items).toEqual([
        expect.objectContaining({ variantId: smallId, isAvailable: true }),
        expect.objectContaining({ variantId: largeId, isAvailable: false }),
      ]);
      expect(cart.totalCents).toBe(SMALL_PRICE);
    });
  });

  describe('ownership', () => {
    it("does not let a user change or remove another user's items", async () => {
      const owner = await newShopper();
      const other = await newShopper();
      await addItem(owner.token, menu.smallId, 3).expect(HttpStatus.OK);

      const update = await updateItem(other.token, menu.smallId, 1);
      const remove = await removeItem(other.token, menu.smallId);
      await request(server)
        .delete('/api/v1/cart')
        .auth(other.token, { type: 'bearer' })
        .expect(HttpStatus.NO_CONTENT);

      expect(update.status).toBe(HttpStatus.NOT_FOUND);
      expect(remove.status).toBe(HttpStatus.NOT_FOUND);
      expect((await getCart(owner.token)).items).toEqual([
        expect.objectContaining({ variantId: menu.smallId, quantity: 3 }),
      ]);
      expect((await getCart(other.token)).items).toEqual([]);
    });
  });
});
