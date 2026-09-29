import { randomInt, randomUUID } from 'node:crypto';
import { HttpStatus, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import { connect } from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.validation.js';
import { OrderStatus } from '../src/generated/prisma/enums.js';
import {
  NOTIFICATIONS_CLIENT,
  type NotificationMessage,
  ORDERS_CLIENT,
} from '../src/infra/messaging/queues.js';
import {
  assertDeadLetterQueues,
  consumerOptions,
  deadLetterQueue,
  producerOptions,
} from '../src/infra/messaging/rmq.config.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { NotificationSender } from '../src/modules/notifications/notification-sender.js';
import {
  PaymentGateway,
  type PaymentOutcome,
  type PaymentRequest,
} from '../src/modules/orders/worker/payment-gateway.js';
import { WorkerModule } from '../src/worker.module.js';

const RUN_ID = randomUUID().slice(0, 8);
// run-scoped queues so a local worker on the shared queues can't take these messages
const ORDERS_QUEUE = `order-flow-orders-${RUN_ID}`;
const NOTIFICATIONS_QUEUE = `order-flow-notifications-${RUN_ID}`;
const QUEUES = [ORDERS_QUEUE, NOTIFICATIONS_QUEUE];
const WAIT = { timeout: 5_000, interval: 50 };
const EMAIL = `flow-${RUN_ID}@example.test`;
const PASSWORD = 'secret123';
const PRICE_CENTS = 899;
const QUANTITY = 2;

interface ProductBody {
  variants: { id: string }[];
}

interface OrderBody {
  id: string;
  status: OrderStatus;
  totalCents: number;
}

describe('Order flow (e2e)', () => {
  let api: NestExpressApplication;
  let worker: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let url: string;
  let productId: string;
  let token: string;
  const clients: ClientProxy[] = [];
  const throttlerStorage = new ThrottlerStorageService();
  const payments = {
    charge: vi
      .fn<(request: PaymentRequest) => Promise<PaymentOutcome>>()
      .mockResolvedValue('approved'),
  };
  const sender = {
    send: vi
      .fn<(notification: NotificationMessage) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  function producerFor(queue: string) {
    return {
      inject: [ConfigService],
      factory: (config: ConfigService<Env, true>) => {
        const client = ClientProxyFactory.create(
          producerOptions(config.get('RABBITMQ_URL', { infer: true }), queue),
        );
        clients.push(client);
        return client;
      },
    };
  }

  async function startApi(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .overrideProvider(ORDERS_CLIENT)
      .useFactory(producerFor(ORDERS_QUEUE))
      .overrideProvider(NOTIFICATIONS_CLIENT)
      .useFactory(producerFor(NOTIFICATIONS_QUEUE))
      .compile();

    api = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(api);
    await api.init();
    server = api.getHttpServer();
    prisma = api.get(PrismaService);
  }

  async function startWorker(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(PaymentGateway)
      .useValue(payments)
      .overrideProvider(NotificationSender)
      .useValue(sender)
      .overrideProvider(NOTIFICATIONS_CLIENT)
      .useFactory(producerFor(NOTIFICATIONS_QUEUE))
      .compile();

    worker = moduleRef.createNestApplication();
    url = worker
      .get<ConfigService<Env, true>>(ConfigService)
      .get('RABBITMQ_URL', { infer: true });
    await assertDeadLetterQueues(url, QUEUES);
    for (const queue of QUEUES) {
      worker.connectMicroservice(consumerOptions(url, queue));
    }
    await worker.init();
    await worker.startAllMicroservices();
  }

  async function deleteQueues(): Promise<void> {
    const broker = await connect(url);
    const channel = await broker.createChannel();
    for (const queue of QUEUES) {
      await channel.deleteQueue(queue);
      await channel.deleteQueue(deadLetterQueue(queue));
    }
    await broker.close();
  }

  async function signUp(): Promise<string> {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        name: 'Flow Tester',
        email: EMAIL,
        phone: `+44${randomInt(1_000_000_000, 9_999_999_999)}`,
        password: PASSWORD,
      })
      .expect(HttpStatus.CREATED);
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(HttpStatus.OK);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function pickVariant(): Promise<string> {
    const response = await request(server)
      .get(`/api/v1/products/${productId}`)
      .expect(HttpStatus.OK);
    const [variant] = (response.body as ProductBody).variants;
    return variant.id;
  }

  async function placeOrder(): Promise<OrderBody> {
    const response = await request(server)
      .post('/api/v1/orders')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ paymentType: 'CARD' })
      .expect(HttpStatus.ACCEPTED);
    return response.body as OrderBody;
  }

  async function currentStatus(orderId: string): Promise<OrderStatus> {
    const response = await request(server)
      .get(`/api/v1/orders/${orderId}`)
      .auth(token, { type: 'bearer' })
      .expect(HttpStatus.OK);
    return (response.body as OrderBody).status;
  }

  beforeAll(async () => {
    await startApi();
    await startWorker();
    ({ id: productId } = await prisma.product.create({
      data: {
        name: `Flow Burger ${RUN_ID}`,
        variants: {
          create: {
            name: 'Single',
            sku: `FLOW-${RUN_ID}`.toUpperCase(),
            priceCents: PRICE_CENTS,
          },
        },
      },
      select: { id: true },
    }));
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { user: { email: EMAIL } } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await Promise.all([api.close(), worker.close()]);
    for (const client of clients) {
      await client.close();
    }
    await deleteQueues();
    throttlerStorage.onApplicationShutdown();
  });

  it('takes a new customer from sign-up to a paid order and an emailed receipt', async () => {
    token = await signUp();
    const variantId = await pickVariant();
    await request(server)
      .post('/api/v1/cart/items')
      .auth(token, { type: 'bearer' })
      .send({ variantId, quantity: QUANTITY })
      .expect(HttpStatus.OK);

    const order = await placeOrder();

    expect(order).toMatchObject({
      status: OrderStatus.PENDING,
      totalCents: PRICE_CENTS * QUANTITY,
    });
    await vi.waitFor(async () => {
      expect(await currentStatus(order.id)).toBe(OrderStatus.PAID);
    }, WAIT);
    expect(payments.charge).toHaveBeenCalledWith({
      orderId: order.id,
      amountCents: PRICE_CENTS * QUANTITY,
    });
    await vi.waitFor(() => {
      expect(sender.send).toHaveBeenCalledWith({
        channel: 'email',
        to: EMAIL,
        message: expect.stringContaining(order.id) as unknown,
      });
    }, WAIT);
  });
});
