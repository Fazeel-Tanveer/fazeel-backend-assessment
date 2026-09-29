import { Module } from '@nestjs/common';
import { CoreModule } from './config/core.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersWorkerModule } from './modules/orders/worker/orders-worker.module.js';

@Module({
  imports: [CoreModule, PrismaModule, NotificationsModule, OrdersWorkerModule],
})
export class WorkerModule {}
