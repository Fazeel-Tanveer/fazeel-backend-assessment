import type { NotificationMessage } from '../../infra/messaging/queues.js';

export abstract class NotificationSender {
  abstract send(notification: NotificationMessage): Promise<void>;
}
