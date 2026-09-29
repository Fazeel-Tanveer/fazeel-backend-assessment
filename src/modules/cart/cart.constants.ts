import type { Prisma } from '../../generated/prisma/client.js';

export const MAX_ITEM_QUANTITY = 20;
// bounds the unpaginated cart response and keeps an order total within int4
export const MAX_CART_LINES = 50;

export const VARIANT_NOT_FOUND = 'Variant not found';
export const VARIANT_UNAVAILABLE = 'Variant is not available';
export const ITEM_NOT_IN_CART = 'Item is not in the cart';
export const ITEM_QUANTITY_EXCEEDED = `A cart holds at most ${MAX_ITEM_QUANTITY} of each variant`;
export const CART_LINES_EXCEEDED = `A cart holds at most ${MAX_CART_LINES} different variants`;

export const CART_ITEM_SELECT = {
  variantId: true,
  quantity: true,
  variant: {
    select: {
      name: true,
      priceCents: true,
      isAvailable: true,
      product: { select: { id: true, name: true, isActive: true } },
    },
  },
} satisfies Prisma.CartItemSelect;

export const CART_ITEM_ORDER = [
  { createdAt: 'asc' },
  { variantId: 'asc' },
] satisfies Prisma.CartItemOrderByWithRelationInput[];
