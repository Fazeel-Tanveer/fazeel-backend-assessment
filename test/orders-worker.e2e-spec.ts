import { randomInt, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { connect } from 'amqplib';
import { lastValueFrom } from 'rxjs';
import type { Env } from '../src/config/env.validation.js';
import { OrderStatus, PaymentType } from '../src/generated/prisma/enums.js';
import { EventPublisher } from '../src/infra/messaging/event-publisher.service.js';
import {
  type NotificationMessage,
  ORDER_CREATED,
} from '../src/infra/messaging/queues.js';
import {
  assertDeadLetterQueues,
  consumerOptions,
  deadLetterQueue,
  producerOptions,
} from '../src/infra/messaging/rmq.config.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import {
  PaymentGateway,
  type PaymentOutcome,
  type PaymentRequest,
} from '../src/modules/orders/worker/payment-gateway.js';
import { WorkerModule } from '../src/worker.module.js';

const RUN_ID = randomUUID().slice(0, 8);
const QUEUE = `orders-e2e-${RUN_ID}`;
const WAIT = { timeout: 5_000, interval: 50 };
const TOTAL_CENTS = 1798;
const EMAIL = `worker-${RUN_ID}@example.test`;

describe('Orders worker (e2e)', () => {
  let app: INestApplication;
  let client: ClientProxy;
  let prisma: PrismaService;
  let url: string;
  let userId: string;
  const payments = {
    charge: vi.fn<(request: PaymentRequest) => Promise<PaymentOutcome>>(),
  };
  const events = {
    publishNotification:
      vi.fn<(notification: NotificationMessage) => Promise<void>>(),
    publishOrderCreated: vi.fn(),
  };

  async function newOrder(paymentType: PaymentType): Promise<string> {
    const { id } = await prisma.order.create({
      data: {
        userId,
        paymentType,
        totalCents: TOTAL_CENTS,
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    return id;
  }

  async function publishOrderCreated(orderId: string): Promise<void> {
    await lastValueFrom(client.emit(ORDER_CREATED, { orderId }), {
      defaultValue: undefined,
    });
  }

  async function statusOf(id: string): Promise<OrderStatus> {
    const { status } = await prisma.order.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    return status;
  }

  async function notifiedAbout(orderId: string): Promise<NotificationMessage> {
    return vi.waitFor(() => {
      const notification = events.publishNotification.mock.calls
        .map(([message]) => message)
        .find((message) => message.message.includes(orderId));
      if (!notification) {
        throw new Error('no notification yet');
      }
      return notification;
    }, WAIT);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(PaymentGateway)
      .useValue(payments)
      .overrideProvider(EventPublisher)
      .useValue(events)
      .compile();

    app = moduleRef.createNestApplication();
    url = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('RABBITMQ_URL', { infer: true });
    await assertDeadLetterQueues(url, [QUEUE]);
    app.connectMicroservice(consumerOptions(url, QUEUE));
    await app.init();
    await app.startAllMicroservices();

    client = ClientProxyFactory.create(producerOptions(url, QUEUE));
    prisma = app.get(PrismaService);
    ({ id: userId } = await prisma.user.create({
      data: {
        name: 'Worker Tester',
        email: EMAIL,
        phone: `+44${randomInt(1_000_000_000, 9_999_999_999)}`,
        passwordHash: 'not-a-real-hash',
      },
      select: { id: true },
    }));
  });

  beforeEach(() => {
    payments.charge.mockReset().mockResolvedValue('approved');
    events.publishNotification.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await client.close();
    await app.close();
    const broker = await connect(url);
    const channel = await broker.createChannel();
    await channel.deleteQueue(QUEUE);
    await channel.deleteQueue(deadLetterQueue(QUEUE));
    await broker.close();
  });

  it('charges a card order, marks it PAID and emails the customer', async () => {
    const orderId = await newOrder(PaymentType.CARD);

    await publishOrderCreated(orderId);

    await expect(notifiedAbout(orderId)).resolves.toMatchObject({
      channel: 'email',
      to: EMAIL,
    });
    expect(await statusOf(orderId)).toBe(OrderStatus.PAID);
    expect(payments.charge).toHaveBeenCalledWith({
      orderId,
      amountCents: TOTAL_CENTS,
    });
  });

  it('marks a card order FAILED when the charge is declined', async () => {
    payments.charge.mockResolvedValue('declined');
    const orderId = await newOrder(PaymentType.CARD);

    await publishOrderCreated(orderId);

    await expect(notifiedAbout(orderId)).resolves.toMatchObject({
      message: expect.stringContaining('declined') as unknown,
    });
    expect(await statusOf(orderId)).toBe(OrderStatus.FAILED);
  });

  it('keeps a cash-on-delivery order PENDING and confirms it without charging', async () => {
    const orderId = await newOrder(PaymentType.COD);

    await publishOrderCreated(orderId);

    await expect(notifiedAbout(orderId)).resolves.toMatchObject({
      message: expect.stringContaining('on delivery') as unknown,
    });
    expect(await statusOf(orderId)).toBe(OrderStatus.PENDING);
    expect(payments.charge).not.toHaveBeenCalled();
  });
});
