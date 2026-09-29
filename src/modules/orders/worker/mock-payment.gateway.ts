import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentGateway,
  type PaymentOutcome,
  type PaymentRequest,
} from './payment-gateway.js';

// stands in for a real card provider until one is connected, and approves every charge
@Injectable()
export class MockPaymentGateway extends PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);

  charge({ orderId, amountCents }: PaymentRequest): Promise<PaymentOutcome> {
    this.logger.log(
      `Approved a mock charge of ${amountCents} cents for order ${orderId}`,
    );
    return Promise.resolve('approved');
  }
}
