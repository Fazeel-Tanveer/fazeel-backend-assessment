import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  NOTIFICATION_SEND,
  NOTIFICATIONS_CLIENT,
  type NotificationMessage,
  ORDER_CREATED,
  type OrderCreatedMessage,
  ORDERS_CLIENT,
} from './queues.js';

async function emit(
  client: ClientProxy,
  pattern: string,
  data: object,
): Promise<void> {
  await lastValueFrom(client.emit(pattern, data), { defaultValue: undefined });
}

@Injectable()
export class EventPublisher {
  constructor(
    @Inject(NOTIFICATIONS_CLIENT) private readonly notifications: ClientProxy,
    @Inject(ORDERS_CLIENT) private readonly orders: ClientProxy,
  ) {}

  publishNotification(notification: NotificationMessage): Promise<void> {
    return emit(this.notifications, NOTIFICATION_SEND, notification);
  }

  publishOrderCreated(event: OrderCreatedMessage): Promise<void> {
    return emit(this.orders, ORDER_CREATED, event);
  }
}
