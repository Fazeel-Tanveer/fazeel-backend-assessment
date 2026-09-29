import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { OrderStatus, PaymentType } from '../../generated/prisma/enums.js';
import type { EventPublisher } from '../../infra/messaging/event-publisher.service.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

const USER_ID = '01920000-0000-7000-8000-000000000001';
const ORDER_ID = '01920000-0000-7000-8000-000000000300';
const KEY = '01920000-0000-7000-8000-000000000400';
const CART_ID = '01920000-0000-7000-8000-000000000005';
const WINGS_ID = '01920000-0000-7000-8000-000000000010';
const BURGER_ID = '01920000-0000-7000-8000-000000000011';
const CREATED_AT = new Date('2026-09-29T10:00:00.000Z');
const INPUT = {
  userId: USER_ID,
  idempotencyKey: KEY,
  paymentType: PaymentType.CARD,
};

const WINGS_LINE = {
  variantId: WINGS_ID,
  quantity: 2,
  variant: {
    name: '8pc',
    priceCents: 899,
    isAvailable: true,
    product: { name: 'Chicken Wings', isActive: true },
  },
};
const BURGER_LINE = {
  variantId: BURGER_ID,
  quantity: 1,
  variant: {
    name: 'Double',
    priceCents: 1299,
    isAvailable: true,
    product: { name: 'Burger', isActive: true },
  },
};
const ORDER_ROW = {
  id: ORDER_ID,
  userId: USER_ID,
  status: OrderStatus.PENDING,
  paymentType: PaymentType.CARD,
  totalCents: 3097,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  items: [
    {
      variantId: WINGS_ID,
      productName: 'Chicken Wings',
      variantName: '8pc',
      unitPriceCents: 899,
      quantity: 2,
    },
  ],
};

function createService() {
  const cart = { upsert: vi.fn().mockResolvedValue({ id: CART_ID }) };
  const cartItem = {
    findMany: vi.fn().mockResolvedValue([WINGS_LINE, BURGER_LINE]),
    deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
  };
  const order = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([ORDER_ROW]),
    count: vi.fn().mockResolvedValue(1),
    create: vi.fn().mockResolvedValue(ORDER_ROW),
  };
  const tx = { cart, cartItem, order };
  const prisma = {
    ...tx,
    $transaction: vi.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const events = { publishOrderCreated: vi.fn().mockResolvedValue(undefined) };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    events as unknown as EventPublisher,
  );

  return { service, prisma, cart, cartItem, order, events };
}

describe('OrdersService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('placeOrder', () => {
    it('locks the cart, creating it if needed, before checking the key or reading items', async () => {
      const { service, cart, cartItem, order } = createService();

      await service.placeOrder(INPUT);

      expect(cart.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID },
        update: { updatedAt: expect.any(Date) as unknown },
        select: { id: true },
      });
      const [lockedAt] = cart.upsert.mock.invocationCallOrder;
      expect(lockedAt).toBeLessThan(
        order.findUnique.mock.invocationCallOrder[0],
      );
      expect(lockedAt).toBeLessThan(
        cartItem.findMany.mock.invocationCallOrder[0],
      );
    });

    it('creates a pending order from current prices with item snapshots', async () => {
      const { service, order } = createService();

      await service.placeOrder(INPUT);

      expect(order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: USER_ID,
            idempotencyKey: KEY,
            paymentType: PaymentType.CARD,
            totalCents: 2 * 899 + 1299,
            items: {
              createMany: {
                data: [
                  {
                    variantId: WINGS_ID,
                    productName: 'Chicken Wings',
                    variantName: '8pc',
                    unitPriceCents: 899,
                    quantity: 2,
                  },
                  {
                    variantId: BURGER_ID,
                    productName: 'Burger',
                    variantName: 'Double',
                    unitPriceCents: 1299,
                    quantity: 1,
                  },
                ],
              },
            },
          },
        }),
      );
    });

    it("reads and clears only the current user's cart", async () => {
      const { service, cartItem } = createService();

      await service.placeOrder(INPUT);

      const byUser = { where: { cart: { userId: USER_ID } } };
      expect(cartItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining(byUser),
      );
      expect(cartItem.deleteMany).toHaveBeenCalledWith(byUser);
    });

    it('publishes order.created after the transaction and returns the order', async () => {
      const { service, prisma, events } = createService();

      const result = await service.placeOrder(INPUT);

      expect(events.publishOrderCreated).toHaveBeenCalledWith({
        orderId: ORDER_ID,
      });
      expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
        events.publishOrderCreated.mock.invocationCallOrder[0],
      );
      expect(result).toMatchObject({
        id: ORDER_ID,
        status: OrderStatus.PENDING,
        items: [expect.objectContaining({ lineTotalCents: 1798 })],
      });
    });

    it('returns the existing order for a repeated key without touching the cart or publishing', async () => {
      const { service, order, cartItem, events } = createService();
      order.findUnique.mockResolvedValue(ORDER_ROW);

      const result = await service.placeOrder(INPUT);

      expect(order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_idempotencyKey: { userId: USER_ID, idempotencyKey: KEY },
          },
        }),
      );
      expect(result).toMatchObject({ id: ORDER_ID });
      expect(cartItem.findMany).not.toHaveBeenCalled();
      expect(order.create).not.toHaveBeenCalled();
      expect(events.publishOrderCreated).not.toHaveBeenCalled();
    });

    it('rejects a repeated key sent with a different payment type', async () => {
      const { service, order } = createService();
      order.findUnique.mockResolvedValue(ORDER_ROW);

      await expect(
        service.placeOrder({ ...INPUT, paymentType: PaymentType.COD }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects an empty cart', async () => {
      const { service, cartItem, order } = createService();
      cartItem.findMany.mockResolvedValue([]);

      await expect(service.placeOrder(INPUT)).rejects.toThrow(
        new BadRequestException('Cart is empty'),
      );
      expect(order.create).not.toHaveBeenCalled();
    });

    it('rejects a cart with unavailable items and names each one', async () => {
      const { service, cartItem, order } = createService();
      cartItem.findMany.mockResolvedValue([
        {
          ...WINGS_LINE,
          variant: { ...WINGS_LINE.variant, isAvailable: false },
        },
        BURGER_LINE,
        {
          ...BURGER_LINE,
          variant: {
            ...BURGER_LINE.variant,
            name: 'Single',
            product: { name: 'Burger', isActive: false },
          },
        },
      ]);

      const error = await service.placeOrder(INPUT).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        message: [
          'Chicken Wings (8pc) is no longer available',
          'Burger (Single) is no longer available',
        ],
      });
      expect(order.create).not.toHaveBeenCalled();
    });

    it('still returns the saved order when order.created cannot be published', async () => {
      const { service, events } = createService();
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      events.publishOrderCreated.mockRejectedValue(new Error('broker down'));

      await expect(service.placeOrder(INPUT)).resolves.toMatchObject({
        id: ORDER_ID,
      });
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(ORDER_ID),
        expect.any(String),
      );
    });
  });

  describe('findPage', () => {
    it("lists the user's orders newest first", async () => {
      const { service, order } = createService();
      const query = Object.assign(new PaginationQueryDto(), {
        page: 2,
        limit: 10,
      });

      const result = await service.findPage(USER_ID, query);

      expect(order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 10,
          take: 10,
        }),
      );
      expect(order.count).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(result).toMatchObject({ page: 2, limit: 10, total: 1 });
      expect(result.items[0].items[0]).toMatchObject({ lineTotalCents: 1798 });
    });
  });

  describe('findOne', () => {
    it("returns the user's order", async () => {
      const { service, order } = createService();
      order.findUnique.mockResolvedValue(ORDER_ROW);

      await expect(service.findOne(USER_ID, ORDER_ID)).resolves.toMatchObject({
        id: ORDER_ID,
      });
      expect(order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID, userId: USER_ID } }),
      );
    });

    it("returns not found for another user's order", async () => {
      const { service } = createService();

      await expect(service.findOne(USER_ID, ORDER_ID)).rejects.toThrow(
        new NotFoundException('Order not found'),
      );
    });
  });
});
