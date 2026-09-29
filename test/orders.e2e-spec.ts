import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/enums.js';
import { EventPublisher } from '../src/infra/messaging/event-publisher.service.js';
import type { OrderCreatedMessage } from '../src/infra/messaging/queues.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';

const RUN_ID = randomUUID().slice(0, 8);
const MISSING_ID = '01920000-0000-7000-8000-00000000ffff';
const SMALL_PRICE = 499;
const LARGE_PRICE = 899;
const CARD = { paymentType: 'CARD' };

interface OrderBody {
  id: string;
}

interface Shopper {
  id: string;
  token: string;
}

interface Menu {
  productName: string;
  smallId: string;
  largeId: string;
}

let userCount = 0;
let productCount = 0;

describe('Orders (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let jwt: JwtService;
  let menu: Menu;
  const throttlerStorage = new ThrottlerStorageService();
  const events = {
    publishNotification: vi.fn(),
    publishOrderCreated: vi.fn<(event: OrderCreatedMessage) => Promise<void>>(),
  };

  async function newShopper(): Promise<Shopper> {
    userCount += 1;
    const { id } = await prisma.user.create({
      data: {
        name: 'Order Tester',
        email: `order${userCount}-${RUN_ID}@example.test`,
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
        name: `Order Wings ${RUN_ID}`,
        variants: {
          create: [
            { name: '8pc', sku: `ORDER-${tag}-8`, priceCents: SMALL_PRICE },
            { name: '16pc', sku: `ORDER-${tag}-16`, priceCents: LARGE_PRICE },
          ],
        },
      },
      select: { name: true, variants: { select: { id: true, name: true } } },
    });
    const idOf = (name: string) =>
      product.variants.find((variant) => variant.name === name)?.id ?? '';
    return {
      productName: product.name,
      smallId: idOf('8pc'),
      largeId: idOf('16pc'),
    };
  }

  function addToCart(shopper: Shopper, variantId: string, quantity: number) {
    return request(server)
      .post('/api/v1/cart/items')
      .auth(shopper.token, { type: 'bearer' })
      .send({ variantId, quantity })
      .expect(HttpStatus.OK);
  }

  function placeOrder(
    shopper: Shopper,
    key: string | null = randomUUID(),
    body: object = CARD,
  ) {
    const post = request(server)
      .post('/api/v1/orders')
      .auth(shopper.token, { type: 'bearer' });
    return (key === null ? post : post.set('Idempotency-Key', key)).send(body);
  }

  async function placeAcceptedOrder(shopper: Shopper, key?: string) {
    const response = await placeOrder(shopper, key).expect(HttpStatus.ACCEPTED);
    return response.body as OrderBody;
  }

  function getOrders(shopper: Shopper, path = '') {
    return request(server)
      .get(`/api/v1/orders${path}`)
      .auth(shopper.token, { type: 'bearer' });
  }

  async function cartItems(shopper: Shopper): Promise<unknown[]> {
    const response = await request(server)
      .get('/api/v1/cart')
      .auth(shopper.token, { type: 'bearer' })
      .expect(HttpStatus.OK);
    return (response.body as { items: unknown[] }).items;
  }

  function countOrders(shopper: Shopper): Promise<number> {
    return prisma.order.count({ where: { userId: shopper.id } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .overrideProvider(EventPublisher)
      .useValue(events)
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
    events.publishOrderCreated.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const byRun = { name: { contains: RUN_ID } };
    const byUser = { email: { contains: RUN_ID } };
    await prisma.order.deleteMany({ where: { user: byUser } });
    await prisma.user.deleteMany({ where: byUser });
    await prisma.productVariant.deleteMany({ where: { product: byRun } });
    await prisma.product.deleteMany({ where: byRun });
    await app.close();
    throttlerStorage.onApplicationShutdown();
  });

  describe('placing', () => {
    it('accepts the order, snapshots the cart at current prices and empties it', async () => {
      const shopper = await newShopper();
      await addToCart(shopper, menu.smallId, 2);
      await addToCart(shopper, menu.largeId, 1);

      const response = await placeOrder(shopper);

      expect(response.status).toBe(HttpStatus.ACCEPTED);
      const order = response.body as OrderBody;
      expect(order).toMatchObject({
        userId: shopper.id,
        status: 'PENDING',
        paymentType: 'CARD',
        totalCents: 2 * SMALL_PRICE + LARGE_PRICE,
        items: [
          {
            variantId: menu.smallId,
            productName: menu.productName,
            variantName: '8pc',
            unitPriceCents: SMALL_PRICE,
            quantity: 2,
            lineTotalCents: 2 * SMALL_PRICE,
          },
          expect.objectContaining({ variantId: menu.largeId, quantity: 1 }),
        ],
      });
      expect(events.publishOrderCreated).toHaveBeenCalledWith({
        orderId: order.id,
      });
      expect(await cartItems(shopper)).toEqual([]);
    });

    it('returns the same order when the request is retried with the same key', async () => {
      const shopper = await newShopper();
      const key = randomUUID();
      await addToCart(shopper, menu.smallId, 1);
      const first = await placeAcceptedOrder(shopper, key);
      await addToCart(shopper, menu.largeId, 1);

      const retry = await placeOrder(shopper, key);

      expect(retry.status).toBe(HttpStatus.ACCEPTED);
      expect(retry.body).toEqual(first);
      expect(events.publishOrderCreated).toHaveBeenCalledTimes(1);
      expect(await countOrders(shopper)).toBe(1);
      expect(await cartItems(shopper)).toEqual([
        expect.objectContaining({ variantId: menu.largeId }),
      ]);
    });

    it('places one order when the same key is sent twice at once', async () => {
      const shopper = await newShopper();
      const key = randomUUID();
      await addToCart(shopper, menu.smallId, 1);

      const [first, second] = await Promise.all([
        placeOrder(shopper, key),
        placeOrder(shopper, key),
      ]);

      expect([first.status, second.status]).toEqual([
        HttpStatus.ACCEPTED,
        HttpStatus.ACCEPTED,
      ]);
      expect((first.body as OrderBody).id).toBe((second.body as OrderBody).id);
      expect(await countOrders(shopper)).toBe(1);
    });

    it('places one order when two different keys race for the same cart', async () => {
      const shopper = await newShopper();
      await addToCart(shopper, menu.smallId, 1);

      const responses = await Promise.all([
        placeOrder(shopper),
        placeOrder(shopper),
      ]);

      const statuses = responses
        .map((response) => response.status)
        .sort((a, b) => a - b);
      expect(statuses).toEqual([HttpStatus.ACCEPTED, HttpStatus.BAD_REQUEST]);
      expect(await countOrders(shopper)).toBe(1);
    });

    it('rejects a reused key sent with a different payment type', async () => {
      const shopper = await newShopper();
      const key = randomUUID();
      await addToCart(shopper, menu.smallId, 1);
      await placeAcceptedOrder(shopper, key);

      const response = await placeOrder(shopper, key, { paymentType: 'COD' });

      expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('rejects an empty cart', async () => {
      const shopper = await newShopper();

      const response = await placeOrder(shopper);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body).toMatchObject({ message: 'Cart is empty' });
      expect(events.publishOrderCreated).not.toHaveBeenCalled();
    });

    it('rejects a cart with unavailable items, names them and keeps the cart', async () => {
      const shopper = await newShopper();
      const { productName, smallId, largeId } = await newMenu();
      await addToCart(shopper, smallId, 1);
      await addToCart(shopper, largeId, 2);
      await prisma.productVariant.update({
        where: { id: largeId },
        data: { isAvailable: false },
      });

      const response = await placeOrder(shopper);

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body).toMatchObject({
        message: [`${productName} (16pc) is no longer available`],
      });
      expect(await cartItems(shopper)).toHaveLength(2);
      expect(await countOrders(shopper)).toBe(0);
    });

    it.each([
      ['no Idempotency-Key header', null, CARD],
      ['an Idempotency-Key that is not a uuid', 'order-1', CARD],
      ['an unknown payment type', randomUUID(), { paymentType: 'PAYPAL' }],
      ['a client-sent total', randomUUID(), { ...CARD, totalCents: 1 }],
    ])('rejects %s', async (_case, key, body) => {
      const shopper = await newShopper();
      await addToCart(shopper, menu.smallId, 1);

      const response = await placeOrder(shopper, key, body);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(await countOrders(shopper)).toBe(0);
    });

    it('still accepts the order when order.created cannot be published', async () => {
      const shopper = await newShopper();
      await addToCart(shopper, menu.smallId, 1);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      events.publishOrderCreated.mockRejectedValue(new Error('broker down'));

      const response = await placeOrder(shopper);

      expect(response.status).toBe(HttpStatus.ACCEPTED);
      expect(await countOrders(shopper)).toBe(1);
    });

    it('requires an access token', async () => {
      const response = await request(server)
        .post('/api/v1/orders')
        .set('Idempotency-Key', randomUUID())
        .send(CARD);

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('reading', () => {
    it('lists your orders newest first, a page at a time', async () => {
      const shopper = await newShopper();
      await addToCart(shopper, menu.smallId, 1);
      const older = await placeAcceptedOrder(shopper);
      await addToCart(shopper, menu.largeId, 1);
      const newer = await placeAcceptedOrder(shopper);

      const first = await getOrders(shopper, '?limit=1');
      const second = await getOrders(shopper, '?limit=1&page=2');

      expect(first.status).toBe(HttpStatus.OK);
      expect(first.body).toMatchObject({
        page: 1,
        limit: 1,
        total: 2,
        items: [{ id: newer.id }],
      });
      expect(second.body).toMatchObject({ page: 2, items: [{ id: older.id }] });
    });

    it('keeps the price an order was placed at after the menu price changes', async () => {
      const shopper = await newShopper();
      const { smallId } = await newMenu();
      await addToCart(shopper, smallId, 2);
      const placed = await placeAcceptedOrder(shopper);
      await prisma.productVariant.update({
        where: { id: smallId },
        data: { priceCents: SMALL_PRICE + 500 },
      });

      const response = await getOrders(shopper, `/${placed.id}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toMatchObject({
        totalCents: 2 * SMALL_PRICE,
        items: [
          { unitPriceCents: SMALL_PRICE, lineTotalCents: 2 * SMALL_PRICE },
        ],
      });
    });

    it("does not show a user another user's order", async () => {
      const owner = await newShopper();
      const other = await newShopper();
      await addToCart(owner, menu.smallId, 1);
      const placed = await placeAcceptedOrder(owner);

      const detail = await getOrders(other, `/${placed.id}`);
      const list = await getOrders(other);

      expect(detail.status).toBe(HttpStatus.NOT_FOUND);
      expect(list.body).toMatchObject({ items: [], total: 0 });
    });

    it('returns 404 for an unknown order and 400 for an id that is not a uuid', async () => {
      const shopper = await newShopper();

      const unknown = await getOrders(shopper, `/${MISSING_ID}`);
      const malformed = await getOrders(shopper, '/latest');

      expect(unknown.status).toBe(HttpStatus.NOT_FOUND);
      expect(malformed.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
