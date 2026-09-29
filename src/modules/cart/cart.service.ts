import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  CART_ITEM_ORDER,
  CART_ITEM_SELECT,
  CART_LINES_EXCEEDED,
  ITEM_NOT_IN_CART,
  ITEM_QUANTITY_EXCEEDED,
  MAX_CART_LINES,
  MAX_ITEM_QUANTITY,
  VARIANT_NOT_FOUND,
  VARIANT_UNAVAILABLE,
} from './cart.constants.js';
import { toCartResponse } from './cart.mapper.js';
import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { CartResponseDto } from './dto/cart-response.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string): Promise<CartResponseDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        items: { orderBy: CART_ITEM_ORDER, select: CART_ITEM_SELECT },
      },
    });
    return toCartResponse(userId, cart?.items ?? []);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponseDto> {
    await this.assertOrderable(dto.variantId);
    await this.prisma.$transaction((tx) => this.addToCart(tx, userId, dto));
    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    variantId: string,
    { quantity }: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const { count } = await this.prisma.cartItem.updateMany({
      where: { variantId, cart: { userId } },
      data: { quantity },
    });
    if (count === 0) {
      throw new NotFoundException(ITEM_NOT_IN_CART);
    }
    return this.getCart(userId);
  }

  async removeItem(userId: string, variantId: string): Promise<void> {
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { variantId, cart: { userId } },
    });
    if (count === 0) {
      throw new NotFoundException(ITEM_NOT_IN_CART);
    }
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  }

  private async assertOrderable(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { isAvailable: true, product: { select: { isActive: true } } },
    });
    if (!variant) {
      throw new NotFoundException(VARIANT_NOT_FOUND);
    }
    if (!variant.isAvailable || !variant.product.isActive) {
      throw new ConflictException(VARIANT_UNAVAILABLE);
    }
  }

  private async addToCart(
    tx: Prisma.TransactionClient,
    userId: string,
    { variantId, quantity }: AddCartItemDto,
  ): Promise<void> {
    // a non-empty update makes Prisma emit ON CONFLICT DO UPDATE, which locks the cart row so one user's adds run one at a time
    const { id: cartId } = await tx.cart.upsert({
      where: { userId },
      create: { userId },
      update: { updatedAt: new Date() },
      select: { id: true },
    });
    const item = await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity },
      update: { quantity: { increment: quantity } },
      select: { quantity: true },
    });
    if (item.quantity > MAX_ITEM_QUANTITY) {
      throw new BadRequestException(ITEM_QUANTITY_EXCEEDED);
    }
    const lines = await tx.cartItem.count({ where: { cartId } });
    if (lines > MAX_CART_LINES) {
      throw new BadRequestException(CART_LINES_EXCEEDED);
    }
  }
}
