import { Logger } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { OrdersConsumer } from './orders.consumer.js';
import type { OrdersProcessor } from './orders.processor.js';

const ORDER_ID = '01920000-0000-7000-8000-000000000300';

function createConsumer() {
  const processor = { process: vi.fn().mockResolvedValue(undefined) };
  const channel = { ack: vi.fn(), nack: vi.fn() };
  const message = { content: Buffer.from('{}') };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;
  const consumer = new OrdersConsumer(processor as unknown as OrdersProcessor);

  return { consumer, processor, channel, message, context };
}

describe('OrdersConsumer', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes the order and acks the event', async () => {
    const { consumer, processor, channel, message, context } = createConsumer();

    await consumer.processOrder({ orderId: ORDER_ID }, context);

    expect(processor.process).toHaveBeenCalledWith(ORDER_ID);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('dead-letters an event the processor fails on', async () => {
    const { consumer, processor, channel, message, context } = createConsumer();
    processor.process.mockRejectedValue(new Error('gateway timeout'));

    await consumer.processOrder({ orderId: ORDER_ID }, context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining(ORDER_ID),
      expect.any(String),
    );
  });

  it.each([
    ['a missing order id', {}],
    ['an order id that is not a uuid', { orderId: '42' }],
    ['a non-object payload', ORDER_ID],
    ['a null payload', null],
  ])('dead-letters %s without processing it', async (_case, payload) => {
    const { consumer, processor, channel, message, context } = createConsumer();

    await consumer.processOrder(payload, context);

    expect(processor.process).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });
});
