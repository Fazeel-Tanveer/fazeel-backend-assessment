export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATIONS_CLIENT = Symbol('NOTIFICATIONS_CLIENT');
export const ORDERS_QUEUE = 'orders';
export const ORDERS_CLIENT = Symbol('ORDERS_CLIENT');

export const NOTIFICATION_SEND = 'notification.send';
export const ORDER_CREATED = 'order.created';

export const NOTIFICATION_CHANNELS = ['email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationMessage {
  channel: NotificationChannel;
  to: string;
  message: string;
}

export interface OrderCreatedMessage {
  orderId: string;
}
