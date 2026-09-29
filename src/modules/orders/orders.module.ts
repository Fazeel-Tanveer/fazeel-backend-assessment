import { Module } from '@nestjs/common';
import { MessagingModule } from '../../infra/messaging/messaging.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [MessagingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
