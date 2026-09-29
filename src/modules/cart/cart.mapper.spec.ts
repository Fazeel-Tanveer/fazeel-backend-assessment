import { type CartItemRow, toCartResponse } from './cart.mapper.js';

const USER_ID = '01920000-0000-7000-8000-000000000001';
const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const SMALL_ID = '01920000-0000-7000-8000-000000000010';
const LARGE_ID = '01920000-0000-7000-8000-000000000011';

function row(overrides: {
  variantId?: string;
  quantity?: number;
  priceCents?: number;
  isAvailable?: boolean;
  isActive?: boolean;
}): CartItemRow {
  return {
    variantId: overrides.variantId ?? SMALL_ID,
    quantity: overrides.quantity ?? 1,
    variant: {
      name: '8pc',
      priceCents: overrides.priceCents ?? 899,
      isAvailable: overrides.isAvailable ?? true,
      product: {
        id: PRODUCT_ID,
        name: 'Chicken Wings',
        isActive: overrides.isActive ?? true,
      },
    },
  };
}

describe('toCartResponse', () => {
  it('returns an empty cart with a zero total', () => {
    expect(toCartResponse(USER_ID, [])).toEqual({
      userId: USER_ID,
      items: [],
      totalCents: 0,
    });
  });

  it('describes each item with its product, variant and line total', () => {
    const cart = toCartResponse(USER_ID, [row({ quantity: 3 })]);

    expect(cart.items).toEqual([
      {
        productId: PRODUCT_ID,
        productName: 'Chicken Wings',
        variantId: SMALL_ID,
        variantName: '8pc',
        unitPriceCents: 899,
        quantity: 3,
        lineTotalCents: 2697,
        isAvailable: true,
      },
    ]);
  });

  it('adds up every line at its current price', () => {
    const cart = toCartResponse(USER_ID, [
      row({ variantId: SMALL_ID, quantity: 2, priceCents: 899 }),
      row({ variantId: LARGE_ID, quantity: 1, priceCents: 1599 }),
    ]);

    expect(cart.totalCents).toBe(3397);
  });

  it.each([
    ['its variant is unavailable', { isAvailable: false }],
    ['its product was deleted', { isActive: false }],
  ])('flags an item when %s and leaves it out of the total', (_case, state) => {
    const cart = toCartResponse(USER_ID, [
      row({ variantId: SMALL_ID, quantity: 2, priceCents: 899 }),
      row({ variantId: LARGE_ID, quantity: 1, priceCents: 1599, ...state }),
    ]);

    expect(cart.items.map((item) => item.isAvailable)).toEqual([true, false]);
    expect(cart.totalCents).toBe(1798);
  });
});
