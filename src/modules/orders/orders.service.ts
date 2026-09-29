import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PaymentType } from '../../generated/prisma/enums.js';
import { EventPublisher } from '../../infra/messaging/event-publisher.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  OrderPageDto,
  OrderResponseDto,
} from './dto/order-response.dto.js';
import {
  CART_LINE_SELECT,
  EMPTY_CART,
  IDEMPOTENCY_KEY_REUSED,
  NEWEST_FIRST,
  ORDER_NOT_FOUND,
  ORDER_SELECT,
} from './orders.constants.js';
import {
  type CartLine,
  isOrderable,
  type OrderRow,
  toOrderItem,
  toOrderResponse,
} from './orders.mapper.js';

export interface PlaceOrderInput {
  userId: string;
  idempotencyKey: string;
  paymentType: PaymentType;
}

interface PlacedOrder {
  order: OrderRow;
  created: boolean;
}

function assertOrderable(lines: CartLine[]): void {
  if (lines.length === 0) {
    throw new BadRequestException(EMPTY_CART);
  }
  const unavailable = lines
    .filter((line) => !isOrderable(line))
    .map(
      ({ variant }) =>
        `${variant.product.name} (${variant.name}) is no longer available`,
    );
  if (unavailable.length > 0) {
    throw new ConflictException(unavailable);
  }
}

function totalCentsOf(items: Prisma.OrderItemCreateManyOrderInput[]): number {
  return items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventPublisher,
  ) {}

  async placeOrder(input: PlaceOrderInput): Promise<OrderResponseDto> {
    const { order, created } = await this.prisma.$transaction((tx) =>
      this.createFromCart(tx, input),
    );
    if (created) {
      await this.announce(order.id);
    }
    return toOrderResponse(order);
  }

  async findPage(
    userId: string,
    { page, limit, skip }: PaginationQueryDto,
  ): Promise<OrderPageDto> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: NEWEST_FIRST,
        skip,
        take: limit,
        select: ORDER_SELECT,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(toOrderResponse), page, limit, total };
  }

  async findOne(userId: string, id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id, userId },
      select: ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException(ORDER_NOT_FOUND);
    }
    return toOrderResponse(order);
  }

  private async createFromCart(
    tx: Prisma.TransactionClient,
    input: PlaceOrderInput,
  ): Promise<PlacedOrder> {
    const { userId, idempotencyKey, paymentType } = input;
    // the upsert locks the cart row (creating it if needed), so a user's checkouts run one at a time and a racing retry finds the order below
    await tx.cart.upsert({
      where: { userId },
      create: { userId },
      update: { updatedAt: new Date() },
      select: { id: true },
    });
    const existing = await this.findByIdempotencyKey(tx, input);
    if (existing) {
      return { order: existing, created: false };
    }

    const lines = await tx.cartItem.findMany({
      where: { cart: { userId } },
      select: CART_LINE_SELECT,
    });
    assertOrderable(lines);
    const items = lines.map(toOrderItem);
    const order = await tx.order.create({
      data: {
        userId,
        idempotencyKey,
        paymentType,
        totalCents: totalCentsOf(items),
        items: { createMany: { data: items } },
      },
      select: ORDER_SELECT,
    });
    await tx.cartItem.deleteMany({ where: { cart: { userId } } });
    return { order, created: true };
  }

  private async findByIdempotencyKey(
    tx: Prisma.TransactionClient,
    { userId, idempotencyKey, paymentType }: PlaceOrderInput,
  ): Promise<OrderRow | null> {
    const order = await tx.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      select: ORDER_SELECT,
    });
    if (order && order.paymentType !== paymentType) {
      throw new UnprocessableEntityException(IDEMPOTENCY_KEY_REUSED);
    }
    return order;
  }

  private async announce(orderId: string): Promise<void> {
    try {
      await this.events.publishOrderCreated({ orderId });
    } catch (error) {
      // the order is already committed, so the client still gets it back; it stays PENDING and this log is how to find it
      this.logger.error(
        `Order ${orderId} was saved but order.created could not be published`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
