import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CatalogCacheService } from './catalog-cache.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { CreateVariantDto } from './dto/create-variant.dto.js';
import type {
  ProductResponseDto,
  VariantResponseDto,
} from './dto/product-response.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { UpdateVariantDto } from './dto/update-variant.dto.js';
import { ADMIN_PRODUCT_SELECT, VARIANT_SELECT } from './products.constants.js';

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  createProduct({
    variants,
    ...product
  }: CreateProductDto): Promise<ProductResponseDto> {
    return this.invalidateAfter(
      this.prisma.product.create({
        data: { ...product, variants: { create: variants } },
        select: ADMIN_PRODUCT_SELECT,
      }),
    );
  }

  updateProduct(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.invalidateAfter(
      this.prisma.product.update({
        where: { id },
        data: dto,
        select: ADMIN_PRODUCT_SELECT,
      }),
    );
  }

  async deactivateProduct(id: string): Promise<void> {
    await this.invalidateAfter(
      this.prisma.product.update({
        where: { id },
        data: { isActive: false },
        select: { id: true },
      }),
    );
  }

  addVariant(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<VariantResponseDto> {
    return this.invalidateAfter(
      this.prisma.productVariant.create({
        data: { ...dto, product: { connect: { id: productId } } },
        select: VARIANT_SELECT,
      }),
    );
  }

  updateVariant(
    id: string,
    dto: UpdateVariantDto,
  ): Promise<VariantResponseDto> {
    return this.invalidateAfter(
      this.prisma.productVariant.update({
        where: { id },
        data: dto,
        select: VARIANT_SELECT,
      }),
    );
  }

  async deactivateVariant(id: string): Promise<void> {
    await this.invalidateAfter(
      this.prisma.productVariant.update({
        where: { id },
        data: { isAvailable: false },
        select: { id: true },
      }),
    );
  }

  private async invalidateAfter<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await this.cache.invalidate();
    return result;
  }
}
