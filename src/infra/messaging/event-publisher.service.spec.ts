import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { EventPublisher } from './event-publisher.service.js';
import type { NotificationMessage } from './queues.js';

const NOTIFICATION: NotificationMessage = {
  channel: 'email',
  to: 'alice@example.com',
  message: 'Your login code is 123456',
};
const ORDER_ID = '01920000-0000-7000-8000-000000000300';

function createPublisher() {
  const notifications = { emit: vi.fn().mockReturnValue(of(undefined)) };
  const orders = { emit: vi.fn().mockReturnValue(of(undefined)) };
  const publisher = new EventPublisher(
    notifications as unknown as ClientProxy,
    orders as unknown as ClientProxy,
  );

  return { publisher, notifications, orders };
}

describe('EventPublisher', () => {
  it('emits a notification.send event on the notifications queue', async () => {
    const { publisher, notifications, orders } = createPublisher();

    await publisher.publishNotification(NOTIFICATION);

    expect(notifications.emit).toHaveBeenCalledWith(
      'notification.send',
      NOTIFICATION,
    );
    expect(orders.emit).not.toHaveBeenCalled();
  });

  it('emits an order.created event on the orders queue', async () => {
    const { publisher, notifications, orders } = createPublisher();

    await publisher.publishOrderCreated({ orderId: ORDER_ID });

    expect(orders.emit).toHaveBeenCalledWith('order.created', {
      orderId: ORDER_ID,
    });
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('fails when the broker does not accept the message', async () => {
    const { publisher, orders } = createPublisher();
    const failure = new Error('broker unavailable');
    orders.emit.mockReturnValue(throwError(() => failure));

    await expect(
      publisher.publishOrderCreated({ orderId: ORDER_ID }),
    ).rejects.toBe(failure);
  });
});
