import { Logger } from '@nestjs/common';
import { OrderStatus, PaymentType } from '../../../generated/prisma/enums.js';
import type { EventPublisher } from '../../../infra/messaging/event-publisher.service.js';
import type { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { OrdersProcessor } from './orders.processor.js';

const ORDER_ID = '01920000-0000-7000-8000-000000000300';
const EMAIL = 'alice@example.com';
const CARD_ORDER = {
  id: ORDER_ID,
  status: OrderStatus.PENDING,
  paymentType: PaymentType.CARD,
  totalCents: 1798,
  user: { email: EMAIL },
};

function createProcessor() {
  const order = {
    findUnique: vi.fn().mockResolvedValue(CARD_ORDER),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const payments = { charge: vi.fn().mockResolvedValue('approved') };
  const events = { publishNotification: vi.fn().mockResolvedValue(undefined) };
  const processor = new OrdersProcessor(
    { order } as unknown as PrismaService,
    payments,
    events as unknown as EventPublisher,
  );

  return { processor, order, payments, events };
}

describe('OrdersProcessor', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charges a card order for its total with the order id as the payment reference', async () => {
    const { processor, payments } = createProcessor();

    await processor.process(ORDER_ID);

    expect(payments.charge).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      amountCents: 1798,
    });
  });

  it('marks a card order PAID only while it is still PENDING', async () => {
    const { processor, order } = createProcessor();

    await processor.process(ORDER_ID);

    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, status: OrderStatus.PENDING },
      data: {
        status: OrderStatus.PAID,
        updatedAt: expect.any(Date) as unknown,
      },
    });
  });

  it('emails the customer a receipt once the order is paid', async () => {
    const { processor, events } = createProcessor();

    await processor.process(ORDER_ID);

    expect(events.publishNotification).toHaveBeenCalledWith({
      channel: 'email',
      to: EMAIL,
      message: `Payment of 17.98 received. Order ${ORDER_ID} is confirmed.`,
    });
  });

  it('marks a card order FAILED and tells the customer when the charge is declined', async () => {
    const { processor, order, payments, events } = createProcessor();
    payments.charge.mockResolvedValue('declined');

    await processor.process(ORDER_ID);

    expect(order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.FAILED,
        }) as unknown,
      }),
    );
    expect(events.publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Payment for order ${ORDER_ID} was declined. Please place a new order.`,
      }),
    );
  });

  it('leaves a cash-on-delivery order PENDING without charging and confirms it', async () => {
    const { processor, order, payments, events } = createProcessor();
    order.findUnique.mockResolvedValue({
      ...CARD_ORDER,
      paymentType: PaymentType.COD,
    });

    await processor.process(ORDER_ID);

    expect(payments.charge).not.toHaveBeenCalled();
    expect(order.updateMany).not.toHaveBeenCalled();
    expect(events.publishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Order ${ORDER_ID} is confirmed. Please pay 17.98 on delivery.`,
      }),
    );
  });

  it.each([OrderStatus.PAID, OrderStatus.FAILED])(
    'skips an order that is already %s so a redelivered event does nothing',
    async (status) => {
      const { processor, order, payments, events } = createProcessor();
      order.findUnique.mockResolvedValue({ ...CARD_ORDER, status });

      await processor.process(ORDER_ID);

      expect(payments.charge).not.toHaveBeenCalled();
      expect(order.updateMany).not.toHaveBeenCalled();
      expect(events.publishNotification).not.toHaveBeenCalled();
    },
  );

  it('does not notify twice when another worker settled the order first', async () => {
    const { processor, order, events } = createProcessor();
    order.updateMany.mockResolvedValue({ count: 0 });

    await processor.process(ORDER_ID);

    expect(events.publishNotification).not.toHaveBeenCalled();
  });

  it('still settles the order when the notification cannot be queued', async () => {
    const { processor, order, events } = createProcessor();
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    events.publishNotification.mockRejectedValue(new Error('broker down'));

    await expect(processor.process(ORDER_ID)).resolves.toBeUndefined();
    expect(order.updateMany).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(ORDER_ID),
      expect.any(String),
    );
  });

  it('fails for an order that does not exist', async () => {
    const { processor, order, payments } = createProcessor();
    order.findUnique.mockResolvedValue(null);

    await expect(processor.process(ORDER_ID)).rejects.toThrow(ORDER_ID);
    expect(payments.charge).not.toHaveBeenCalled();
  });

  it('leaves the order PENDING when the payment gateway errors', async () => {
    const { processor, order, payments } = createProcessor();
    const failure = new Error('gateway timeout');
    payments.charge.mockRejectedValue(failure);

    await expect(processor.process(ORDER_ID)).rejects.toBe(failure);
    expect(order.updateMany).not.toHaveBeenCalled();
  });
});
