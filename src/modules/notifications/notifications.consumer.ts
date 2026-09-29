import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SEND,
  type NotificationMessage,
} from '../../infra/messaging/queues.js';
import { ack, deadLetter } from '../../infra/messaging/rmq-ack.js';
import { NotificationSender } from './notification-sender.js';

function isNotificationMessage(value: unknown): value is NotificationMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'channel' in value &&
    NOTIFICATION_CHANNELS.some((channel) => channel === value.channel) &&
    'to' in value &&
    typeof value.to === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

@Controller()
export class NotificationsConsumer {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(private readonly sender: NotificationSender) {}

  @EventPattern<string>(NOTIFICATION_SEND)
  async send(
    @Payload() data: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    if (!isNotificationMessage(data)) {
      this.logger.warn('Malformed notification moved to the dead-letter queue');
      deadLetter(context);
      return;
    }

    try {
      await this.sender.send(data);
    } catch (error) {
      this.logger.error(
        `Could not deliver a ${data.channel} notification; moved it to the dead-letter queue`,
        error instanceof Error ? error.stack : undefined,
      );
      deadLetter(context);
      return;
    }
    ack(context);
  }
}
