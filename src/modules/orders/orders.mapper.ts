import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderResponseDto } from './dto/order-response.dto.js';
import type { CART_LINE_SELECT, ORDER_SELECT } from './orders.constants.js';

export type OrderRow = Prisma.OrderGetPayload<{
  select: typeof ORDER_SELECT;
}>;

export type CartLine = Prisma.CartItemGetPayload<{
  select: typeof CART_LINE_SELECT;
}>;

export function toOrderResponse({
  items,
  ...order
}: OrderRow): OrderResponseDto {
  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      lineTotalCents: item.unitPriceCents * item.quantity,
    })),
  };
}

export function toOrderItem({
  variantId,
  quantity,
  variant,
}: CartLine): Prisma.OrderItemCreateManyOrderInput {
  return {
    variantId,
    productName: variant.product.name,
    variantName: variant.name,
    unitPriceCents: variant.priceCents,
    quantity,
  };
}

export function isOrderable({ variant }: CartLine): boolean {
  return variant.isAvailable && variant.product.isActive;
}
