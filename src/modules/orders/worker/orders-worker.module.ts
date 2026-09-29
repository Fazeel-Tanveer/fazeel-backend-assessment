import { Module } from '@nestjs/common';
import { MessagingModule } from '../../../infra/messaging/messaging.module.js';
import { MockPaymentGateway } from './mock-payment.gateway.js';
import { OrdersConsumer } from './orders.consumer.js';
import { OrdersProcessor } from './orders.processor.js';
import { PaymentGateway } from './payment-gateway.js';

@Module({
  imports: [MessagingModule],
  controllers: [OrdersConsumer],
  providers: [
    OrdersProcessor,
    { provide: PaymentGateway, useClass: MockPaymentGateway },
  ],
})
export class OrdersWorkerModule {}
