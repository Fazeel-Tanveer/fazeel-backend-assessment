import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartService } from './cart.service.js';

const USER_ID = '01920000-0000-7000-8000-000000000001';
const CART_ID = '01920000-0000-7000-8000-000000000005';
const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const VARIANT_ID = '01920000-0000-7000-8000-000000000010';
const ORDERABLE = { isAvailable: true, product: { isActive: true } };
const ITEM_ROW = {
  variantId: VARIANT_ID,
  quantity: 2,
  variant: {
    name: '8pc',
    priceCents: 899,
    isAvailable: true,
    product: { id: PRODUCT_ID, name: 'Chicken Wings', isActive: true },
  },
};

function createService() {
  const cart = {
    findUnique: vi.fn().mockResolvedValue({ items: [ITEM_ROW] }),
    upsert: vi.fn().mockResolvedValue({ id: CART_ID }),
  };
  const cartItem = {
    upsert: vi.fn().mockResolvedValue({ quantity: 2 }),
    count: vi.fn().mockResolvedValue(1),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const productVariant = { findUnique: vi.fn().mockResolvedValue(ORDERABLE) };
  const tx = { cart, cartItem };
  const prisma = {
    cart,
    cartItem,
    productVariant,
    $transaction: vi.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const service = new CartService(prisma as unknown as PrismaService);

  return { service, prisma, cart, cartItem, productVariant };
}

describe('CartService', () => {
  describe('getCart', () => {
    it("reads the current user's cart with items in the order they were added", async () => {
      const { service, cart } = createService();

      const result = await service.getCart(USER_ID);

      expect(cart.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID } }),
      );
      expect(cart.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            items: expect.objectContaining({
              orderBy: [{ createdAt: 'asc' }, { variantId: 'asc' }],
            }) as unknown,
          },
        }),
      );
      expect(result).toMatchObject({ userId: USER_ID, totalCents: 1798 });
    });

    it('returns an empty cart when the user has none yet', async () => {
      const { service, cart } = createService();
      cart.findUnique.mockResolvedValue(null);

      await expect(service.getCart(USER_ID)).resolves.toEqual({
        userId: USER_ID,
        items: [],
        totalCents: 0,
      });
    });
  });

  describe('addItem', () => {
    const dto = { variantId: VARIANT_ID, quantity: 2 };

    it('creates the cart on the first add and adds the variant to it', async () => {
      const { service, cart, cartItem } = createService();

      await service.addItem(USER_ID, dto);

      expect(cart.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          create: { userId: USER_ID },
        }),
      );
      expect(cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId_variantId: { cartId: CART_ID, variantId: VARIANT_ID },
          },
          create: { cartId: CART_ID, variantId: VARIANT_ID, quantity: 2 },
        }),
      );
    });

    it('touches an existing cart so concurrent adds for one user wait on its row lock', async () => {
      const { service, cart } = createService();

      await service.addItem(USER_ID, dto);

      expect(cart.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { updatedAt: expect.any(Date) as unknown },
        }),
      );
    });

    it('adds to the quantity when the variant is already in the cart', async () => {
      const { service, cartItem } = createService();

      await service.addItem(USER_ID, dto);

      expect(cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { quantity: { increment: 2 } },
        }),
      );
    });

    it('returns the updated cart', async () => {
      const { service } = createService();

      await expect(service.addItem(USER_ID, dto)).resolves.toMatchObject({
        userId: USER_ID,
        items: [expect.objectContaining({ variantId: VARIANT_ID })],
      });
    });

    it('rejects an unknown variant without touching the cart', async () => {
      const { service, prisma, productVariant } = createService();
      productVariant.findUnique.mockResolvedValue(null);

      await expect(service.addItem(USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      [
        'an unavailable variant',
        { isAvailable: false, product: { isActive: true } },
      ],
      [
        'a variant of a deleted product',
        { isAvailable: true, product: { isActive: false } },
      ],
    ])('rejects %s', async (_case, variant) => {
      const { service, prisma, productVariant } = createService();
      productVariant.findUnique.mockResolvedValue(variant);

      await expect(service.addItem(USER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an add that takes a line past 20 so the transaction rolls back', async () => {
      const { service, cartItem } = createService();
      cartItem.upsert.mockResolvedValue({ quantity: 21 });

      await expect(service.addItem(USER_ID, dto)).rejects.toThrow(
        new BadRequestException('A cart holds at most 20 of each variant'),
      );
    });

    it('accepts exactly 20 of a variant', async () => {
      const { service, cartItem } = createService();
      cartItem.upsert.mockResolvedValue({ quantity: 20 });

      await expect(service.addItem(USER_ID, dto)).resolves.toBeDefined();
    });

    it('rejects a new variant once the cart holds 50 different ones', async () => {
      const { service, cartItem } = createService();
      cartItem.count.mockResolvedValue(51);

      await expect(service.addItem(USER_ID, dto)).rejects.toThrow(
        new BadRequestException('A cart holds at most 50 different variants'),
      );
      expect(cartItem.count).toHaveBeenCalledWith({
        where: { cartId: CART_ID },
      });
    });
  });

  describe('updateItem', () => {
    it("sets the quantity on the current user's line only", async () => {
      const { service, cartItem } = createService();

      await service.updateItem(USER_ID, VARIANT_ID, { quantity: 5 });

      expect(cartItem.updateMany).toHaveBeenCalledWith({
        where: { variantId: VARIANT_ID, cart: { userId: USER_ID } },
        data: { quantity: 5 },
      });
    });

    it('returns the updated cart', async () => {
      const { service } = createService();

      await expect(
        service.updateItem(USER_ID, VARIANT_ID, { quantity: 5 }),
      ).resolves.toMatchObject({ userId: USER_ID });
    });

    it("returns not found when the item is not in the user's cart", async () => {
      const { service, cartItem } = createService();
      cartItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateItem(USER_ID, VARIANT_ID, { quantity: 5 }),
      ).rejects.toThrow(new NotFoundException('Item is not in the cart'));
    });
  });

  describe('removeItem', () => {
    it("deletes the line from the current user's cart only", async () => {
      const { service, cartItem } = createService();

      await service.removeItem(USER_ID, VARIANT_ID);

      expect(cartItem.deleteMany).toHaveBeenCalledWith({
        where: { variantId: VARIANT_ID, cart: { userId: USER_ID } },
      });
    });

    it("returns not found when the item is not in the user's cart", async () => {
      const { service, cartItem } = createService();
      cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeItem(USER_ID, VARIANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('clear', () => {
    it("empties the current user's cart", async () => {
      const { service, cartItem } = createService();

      await service.clear(USER_ID);

      expect(cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cart: { userId: USER_ID } },
      });
    });

    it('succeeds when the cart is already empty', async () => {
      const { service, cartItem } = createService();
      cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.clear(USER_ID)).resolves.toBeUndefined();
    });
  });
});
