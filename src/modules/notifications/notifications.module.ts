import { Module } from '@nestjs/common';
import { LoggerNotificationSender } from './logger-notification.sender.js';
import { NotificationSender } from './notification-sender.js';
import { NotificationsConsumer } from './notifications.consumer.js';

@Module({
  controllers: [NotificationsConsumer],
  providers: [
    { provide: NotificationSender, useClass: LoggerNotificationSender },
  ],
})
export class NotificationsModule {}
