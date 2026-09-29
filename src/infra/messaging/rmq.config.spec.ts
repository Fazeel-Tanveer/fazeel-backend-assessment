import { connect } from 'amqplib';
import {
  assertDeadLetterQueues,
  consumerOptions,
  deadLetterQueue,
  producerOptions,
} from './rmq.config.js';

vi.mock('amqplib', () => ({ connect: vi.fn() }));

const URL = 'amqp://food:food@localhost:5672';
const QUEUE = 'notifications';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function mockBroker() {
  const channel = { assertQueue: vi.fn().mockResolvedValue({}) };
  const connection = {
    createChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(connect).mockResolvedValue(
    connection as unknown as Awaited<ReturnType<typeof connect>>,
  );

  return { channel, connection };
}

describe('rmq config', () => {
  it('names the dead-letter queue after its source queue', () => {
    expect(deadLetterQueue(QUEUE)).toBe('notifications.dlq');
  });

  it('declares the queue identically for producers and consumers', () => {
    const producer = producerOptions(URL, QUEUE).options;
    const consumer = consumerOptions(URL, QUEUE).options;

    expect(producer?.queueOptions).toEqual({
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: 'notifications.dlq',
    });
    expect(consumer?.queueOptions).toEqual(producer?.queueOptions);
    expect(consumer?.queue).toBe(QUEUE);
    expect(consumer?.urls).toEqual([URL]);
  });

  it('publishes persistent messages', () => {
    expect(producerOptions(URL, QUEUE).options?.persistent).toBe(true);
  });

  it('consumes with manual acks and a bounded prefetch', () => {
    const { options } = consumerOptions(URL, QUEUE);

    expect(options?.noAck).toBe(false);
    expect(options?.prefetchCount).toBeGreaterThan(0);
  });

  describe('assertDeadLetterQueues', () => {
    it('declares a durable dead-letter queue for each queue that keeps messages for 3 days', async () => {
      const { channel, connection } = mockBroker();
      const options = { durable: true, messageTtl: THREE_DAYS_MS };

      await assertDeadLetterQueues(URL, [QUEUE, 'orders']);

      expect(connect).toHaveBeenCalledWith(URL);
      expect(channel.assertQueue).toHaveBeenCalledWith(
        'notifications.dlq',
        options,
      );
      expect(channel.assertQueue).toHaveBeenCalledWith('orders.dlq', options);
      expect(connection.close).toHaveBeenCalled();
    });

    it('closes the connection when a declaration fails', async () => {
      const { channel, connection } = mockBroker();
      const failure = new Error('access refused');
      channel.assertQueue.mockRejectedValue(failure);

      await expect(assertDeadLetterQueues(URL, [QUEUE])).rejects.toBe(failure);
      expect(connection.close).toHaveBeenCalled();
    });
  });
});
