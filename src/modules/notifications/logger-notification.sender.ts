import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env, NodeEnv } from '../../config/env.validation.js';
import type { NotificationMessage } from '../../infra/messaging/queues.js';
import { NotificationSender } from './notification-sender.js';

// stands in for a real email/SMS provider and is the only place a login code may be printed
@Injectable()
export class LoggerNotificationSender extends NotificationSender {
  private readonly logger = new Logger(LoggerNotificationSender.name);
  private readonly printsContent: boolean;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.printsContent =
      config.get('NODE_ENV', { infer: true }) !== NodeEnv.Production ||
      config.get('LOG_NOTIFICATION_CONTENT', { infer: true });
  }

  send({ channel, to, message }: NotificationMessage): Promise<void> {
    if (this.printsContent) {
      this.logger.log(`${channel} to ${to}: ${message}`);
    } else {
      this.logger.warn(`No ${channel} provider is configured; message dropped`);
    }
    return Promise.resolve();
  }
}
