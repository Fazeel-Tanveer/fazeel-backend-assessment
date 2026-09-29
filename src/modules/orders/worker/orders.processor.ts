import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { OrderStatus, PaymentType } from '../../../generated/prisma/enums.js';
import { EventPublisher } from '../../../infra/messaging/event-publisher.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import {
  ORDER_MESSAGES,
  ORDER_TO_PROCESS_SELECT,
} from '../orders.constants.js';
import { PaymentGateway, type PaymentOutcome } from './payment-gateway.js';

type OrderToProcess = Prisma.OrderGetPayload<{
  select: typeof ORDER_TO_PROCESS_SELECT;
}>;

const STATUS_AFTER_PAYMENT: Record<PaymentOutcome, OrderStatus> = {
  approved: OrderStatus.PAID,
  declined: OrderStatus.FAILED,
};

@Injectable()
export class OrdersProcessor {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentGateway,
    private readonly events: EventPublisher,
  ) {}

  async process(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_TO_PROCESS_SELECT,
    });
    if (!order) {
      throw new Error(`Order ${orderId} does not exist`);
    }
    if (order.status !== OrderStatus.PENDING) {
      this.logger.log(`Order ${orderId} is already ${order.status}; skipped`);
      return;
    }

    const status = await this.settlePayment(order);
    if (
      status !== OrderStatus.PENDING &&
      !(await this.setStatusIfPending(orderId, status))
    ) {
      this.logger.log(`Order ${orderId} was settled by another worker`);
      return;
    }
    await this.notifyCustomer(order, status);
  }

  private async notifyCustomer(
    order: OrderToProcess,
    status: OrderStatus,
  ): Promise<void> {
    try {
      await this.events.publishNotification({
        channel: 'email',
        to: order.user.email,
        message: ORDER_MESSAGES[status](order),
      });
    } catch (error) {
      // the new status is already saved and a redelivery would skip the order, so dead-lettering can't bring the email back
      this.logger.error(
        `Order ${order.id} is ${status} but its notification could not be queued`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async settlePayment(order: OrderToProcess): Promise<OrderStatus> {
    // cash is collected by the driver, so the order stays PENDING until delivery
    if (order.paymentType === PaymentType.COD) {
      return OrderStatus.PENDING;
    }
    const outcome = await this.payments.charge({
      orderId: order.id,
      amountCents: order.totalCents,
    });
    return STATUS_AFTER_PAYMENT[outcome];
  }

  private async setStatusIfPending(
    id: string,
    status: OrderStatus,
  ): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: OrderStatus.PENDING },
      data: { status, updatedAt: new Date() },
    });
    return count === 1;
  }
}
