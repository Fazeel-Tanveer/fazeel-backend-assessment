export interface PaymentRequest {
  orderId: string;
  amountCents: number;
}

export type PaymentOutcome = 'approved' | 'declined';

export abstract class PaymentGateway {
  // orderId doubles as the provider's idempotency key, so a redelivered event can't charge twice
  abstract charge(request: PaymentRequest): Promise<PaymentOutcome>;
}
