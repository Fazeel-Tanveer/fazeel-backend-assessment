import { randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { type ChannelModel, connect } from 'amqplib';
import type { Env } from '../src/config/env.validation.js';
import { EventPublisher } from '../src/infra/messaging/event-publisher.service.js';
import type { NotificationMessage } from '../src/infra/messaging/queues.js';
import {
  assertDeadLetterQueues,
  consumerOptions,
  deadLetterQueue,
  producerOptions,
} from '../src/infra/messaging/rmq.config.js';
import { NotificationSender } from '../src/modules/notifications/notification-sender.js';
import { WorkerModule } from '../src/worker.module.js';

const QUEUE = `notifications-e2e-${randomUUID().slice(0, 8)}`;
const WAIT = { timeout: 5_000, interval: 50 };

const NOTIFICATION: NotificationMessage = {
  channel: 'email',
  to: 'alice@example.test',
  message: 'Your login code is 123456',
};

describe('Notifications worker (e2e)', () => {
  let app: INestApplication;
  let client: ClientProxy;
  let publisher: EventPublisher;
  let broker: ChannelModel;
  const sender = {
    send: vi.fn<(message: NotificationMessage) => Promise<void>>(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(NotificationSender)
      .useValue(sender)
      .compile();

    app = moduleRef.createNestApplication();
    const url = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('RABBITMQ_URL', { infer: true });
    await assertDeadLetterQueues(url, [QUEUE]);
    app.connectMicroservice(consumerOptions(url, QUEUE));
    await app.init();
    await app.startAllMicroservices();

    client = ClientProxyFactory.create(producerOptions(url, QUEUE));
    publisher = new EventPublisher(client, client);
    broker = await connect(url);
  });

  afterAll(async () => {
    await client.close();
    await app.close();
    const channel = await broker.createChannel();
    await channel.deleteQueue(QUEUE);
    await channel.deleteQueue(deadLetterQueue(QUEUE));
    await broker.close();
  });

  beforeEach(() => {
    sender.send.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers a published notification to the sender', async () => {
    sender.send.mockResolvedValue(undefined);

    await publisher.publishNotification(NOTIFICATION);

    await vi.waitFor(() => {
      expect(sender.send).toHaveBeenCalledWith(NOTIFICATION);
    }, WAIT);
  });

  it('moves a notification the sender cannot deliver to the dead-letter queue', async () => {
    sender.send.mockRejectedValue(new Error('provider down'));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const channel = await broker.createChannel();

    await publisher.publishNotification(NOTIFICATION);

    const deadLetter = await vi.waitFor(async () => {
      const message = await channel.get(deadLetterQueue(QUEUE), {
        noAck: true,
      });
      if (!message) {
        throw new Error('not dead-lettered yet');
      }
      return message;
    }, WAIT);
    expect(JSON.parse(deadLetter.content.toString())).toMatchObject({
      pattern: 'notification.send',
      data: NOTIFICATION,
    });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
