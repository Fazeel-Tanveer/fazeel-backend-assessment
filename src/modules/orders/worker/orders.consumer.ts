import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { isUUID } from 'class-validator';
import {
  ORDER_CREATED,
  type OrderCreatedMessage,
} from '../../../infra/messaging/queues.js';
import { ack, deadLetter } from '../../../infra/messaging/rmq-ack.js';
import { OrdersProcessor } from './orders.processor.js';

function isOrderCreatedMessage(value: unknown): value is OrderCreatedMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'orderId' in value &&
    isUUID(value.orderId)
  );
}

@Controller()
export class OrdersConsumer {
  private readonly logger = new Logger(OrdersConsumer.name);

  constructor(private readonly processor: OrdersProcessor) {}

  @EventPattern<string>(ORDER_CREATED)
  async processOrder(
    @Payload() data: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    if (!isOrderCreatedMessage(data)) {
      this.logger.warn('Malformed order event moved to the dead-letter queue');
      deadLetter(context);
      return;
    }

    try {
      await this.processor.process(data.orderId);
    } catch (error) {
      this.logger.error(
        `Could not process order ${data.orderId}; moved its event to the dead-letter queue`,
        error instanceof Error ? error.stack : undefined,
      );
      deadLetter(context);
      return;
    }
    ack(context);
  }
}
