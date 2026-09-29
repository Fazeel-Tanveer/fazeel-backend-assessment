import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCartItemDto } from './add-cart-item.dto.js';
import { UpdateCartItemDto } from './update-cart-item.dto.js';

const VARIANT_ID = '01920000-0000-7000-8000-000000000010';

async function invalidFields<T extends object>(
  dto: ClassConstructor<T>,
  input: Record<string, unknown>,
) {
  const errors = await validate(plainToInstance(dto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('AddCartItemDto', () => {
  it('accepts a variant id and a quantity', async () => {
    await expect(
      invalidFields(AddCartItemDto, { variantId: VARIANT_ID, quantity: 20 }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['zero', 0],
    ['over 20', 21],
    ['fractional', 1.5],
    ['a string', '2'],
    ['missing', undefined],
  ])('rejects a quantity that is %s', async (_case, quantity) => {
    await expect(
      invalidFields(AddCartItemDto, { variantId: VARIANT_ID, quantity }),
    ).resolves.toEqual(['quantity']);
  });

  it.each(['not-a-uuid', 42, undefined])(
    'rejects the variant id %s',
    async (variantId) => {
      await expect(
        invalidFields(AddCartItemDto, { variantId, quantity: 1 }),
      ).resolves.toEqual(['variantId']);
    },
  );

  it('rejects a client-sent price', async () => {
    await expect(
      invalidFields(AddCartItemDto, {
        variantId: VARIANT_ID,
        quantity: 1,
        priceCents: 1,
      }),
    ).resolves.toEqual(['priceCents']);
  });
});

describe('UpdateCartItemDto', () => {
  it('accepts a new quantity', async () => {
    await expect(
      invalidFields(UpdateCartItemDto, { quantity: 1 }),
    ).resolves.toEqual([]);
  });

  it.each([0, 21, null])('rejects the quantity %s', async (quantity) => {
    await expect(
      invalidFields(UpdateCartItemDto, { quantity }),
    ).resolves.toEqual(['quantity']);
  });
});
