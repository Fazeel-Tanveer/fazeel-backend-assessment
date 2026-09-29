import { OrderStatus, PaymentType } from '../../generated/prisma/enums.js';
import {
  type CartLine,
  isOrderable,
  type OrderRow,
  toOrderItem,
  toOrderResponse,
} from './orders.mapper.js';

const ORDER_ID = '01920000-0000-7000-8000-000000000300';
const USER_ID = '01920000-0000-7000-8000-000000000001';
const VARIANT_ID = '01920000-0000-7000-8000-000000000010';
const CREATED_AT = new Date('2026-09-29T10:00:00.000Z');

function cartLine(
  variant: Partial<CartLine['variant']> = {},
  product: Partial<CartLine['variant']['product']> = {},
): CartLine {
  return {
    variantId: VARIANT_ID,
    quantity: 3,
    variant: {
      name: '8pc',
      priceCents: 899,
      isAvailable: true,
      ...variant,
      product: { name: 'Chicken Wings', isActive: true, ...product },
    },
  };
}

describe('orders mapper', () => {
  describe('toOrderResponse', () => {
    it('adds a line total to each item and keeps the order fields', () => {
      const row: OrderRow = {
        id: ORDER_ID,
        userId: USER_ID,
        status: OrderStatus.PENDING,
        paymentType: PaymentType.CARD,
        totalCents: 2697,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        items: [
          {
            variantId: VARIANT_ID,
            productName: 'Chicken Wings',
            variantName: '8pc',
            unitPriceCents: 899,
            quantity: 3,
          },
        ],
      };

      expect(toOrderResponse(row)).toEqual({
        ...row,
        items: [{ ...row.items[0], lineTotalCents: 2697 }],
      });
    });
  });

  describe('toOrderItem', () => {
    it('snapshots the names and current price of a cart line', () => {
      expect(toOrderItem(cartLine())).toEqual({
        variantId: VARIANT_ID,
        productName: 'Chicken Wings',
        variantName: '8pc',
        unitPriceCents: 899,
        quantity: 3,
      });
    });
  });

  describe('isOrderable', () => {
    it('accepts an available variant of an active product', () => {
      expect(isOrderable(cartLine())).toBe(true);
    });

    it('rejects a variant taken off the menu', () => {
      expect(isOrderable(cartLine({ isAvailable: false }))).toBe(false);
    });

    it('rejects a variant of a deleted product', () => {
      expect(isOrderable(cartLine({}, { isActive: false }))).toBe(false);
    });
  });
});
