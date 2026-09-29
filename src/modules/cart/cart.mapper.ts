import type { Prisma } from '../../generated/prisma/client.js';
import type { CART_ITEM_SELECT } from './cart.constants.js';
import type {
  CartItemResponseDto,
  CartResponseDto,
} from './dto/cart-response.dto.js';

export type CartItemRow = Prisma.CartItemGetPayload<{
  select: typeof CART_ITEM_SELECT;
}>;

function toCartItem({
  variantId,
  quantity,
  variant,
}: CartItemRow): CartItemResponseDto {
  const { product } = variant;
  return {
    productId: product.id,
    productName: product.name,
    variantId,
    variantName: variant.name,
    unitPriceCents: variant.priceCents,
    quantity,
    lineTotalCents: variant.priceCents * quantity,
    isAvailable: variant.isAvailable && product.isActive,
  };
}

export function toCartResponse(
  userId: string,
  rows: CartItemRow[],
): CartResponseDto {
  const items = rows.map(toCartItem);
  const totalCents = items
    .filter((item) => item.isAvailable)
    .reduce((sum, item) => sum + item.lineTotalCents, 0);
  return { userId, items, totalCents };
}
