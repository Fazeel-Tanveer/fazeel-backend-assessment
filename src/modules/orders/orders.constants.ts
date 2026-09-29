import type { Prisma } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const INVALID_IDEMPOTENCY_KEY = `${IDEMPOTENCY_KEY_HEADER} header must be a UUID`;
export const IDEMPOTENCY_KEY_REUSED = `${IDEMPOTENCY_KEY_HEADER} was already used for an order with a different payment type`;
export const EMPTY_CART = 'Cart is empty';
export const ORDER_NOT_FOUND = 'Order not found';

export const ORDER_SELECT = {
  id: true,
  userId: true,
  status: true,
  paymentType: true,
  totalCents: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: [
      { productName: 'asc' },
      { unitPriceCents: 'asc' },
      { variantId: 'asc' },
    ],
    select: {
      variantId: true,
      productName: true,
      variantName: true,
      unitPriceCents: true,
      quantity: true,
    },
  },
} satisfies Prisma.OrderSelect;

export const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.OrderOrderByWithRelationInput[];

export const CART_LINE_SELECT = {
  variantId: true,
  quantity: true,
  variant: {
    select: {
      name: true,
      priceCents: true,
      isAvailable: true,
      product: { select: { name: true, isActive: true } },
    },
  },
} satisfies Prisma.CartItemSelect;

export const ORDER_TO_PROCESS_SELECT = {
  id: true,
  status: true,
  paymentType: true,
  totalCents: true,
  user: { select: { email: true } },
} satisfies Prisma.OrderSelect;

const MONEY_DECIMALS = 2;
const CENTS_PER_UNIT = 10 ** MONEY_DECIMALS;

function formatCents(cents: number): string {
  return (cents / CENTS_PER_UNIT).toFixed(MONEY_DECIMALS);
}

interface OrderSummary {
  id: string;
  totalCents: number;
}

export const ORDER_MESSAGES: Record<
  OrderStatus,
  (order: OrderSummary) => string
> = {
  [OrderStatus.PENDING]: ({ id, totalCents }) =>
    `Order ${id} is confirmed. Please pay ${formatCents(totalCents)} on delivery.`,
  [OrderStatus.PAID]: ({ id, totalCents }) =>
    `Payment of ${formatCents(totalCents)} received. Order ${id} is confirmed.`,
  [OrderStatus.FAILED]: ({ id }) =>
    `Payment for order ${id} was declined. Please place a new order.`,
};
