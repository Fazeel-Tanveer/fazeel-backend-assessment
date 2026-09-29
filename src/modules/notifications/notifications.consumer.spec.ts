import { Logger } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import type { NotificationMessage } from '../../infra/messaging/queues.js';
import { NotificationsConsumer } from './notifications.consumer.js';

const NOTIFICATION: NotificationMessage = {
  channel: 'sms',
  to: '+15551234567',
  message: 'Your login code is 123456',
};

function createConsumer() {
  const sender = { send: vi.fn().mockResolvedValue(undefined) };
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const message = { content: Buffer.from('{}') };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  const consumer = new NotificationsConsumer(sender);

  return { consumer, sender, channel, message, context };
}

describe('NotificationsConsumer', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the notification to the sender and acks it', async () => {
    const { consumer, sender, channel, message, context } = createConsumer();

    await consumer.send(NOTIFICATION, context);

    expect(sender.send).toHaveBeenCalledWith(NOTIFICATION);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('dead-letters a notification the sender fails to deliver', async () => {
    const { consumer, sender, channel, message, context } = createConsumer();
    sender.send.mockRejectedValue(new Error('provider down'));

    await consumer.send(NOTIFICATION, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it.each([
    ['an unknown channel', { ...NOTIFICATION, channel: 'fax' }],
    ['a missing recipient', { channel: 'email', message: 'hello' }],
    ['a non-object payload', 'hello'],
  ])('dead-letters %s without sending it', async (_case, payload) => {
    const { consumer, sender, channel, message, context } = createConsumer();

    await consumer.send(payload, context);

    expect(sender.send).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });
});
