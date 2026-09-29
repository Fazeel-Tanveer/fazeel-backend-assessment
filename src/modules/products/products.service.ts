import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CatalogCacheService } from './catalog-cache.service.js';
import type {
  ProductPageDto,
  ProductResponseDto,
} from './dto/product-response.dto.js';
import {
  CATALOG_PRODUCT_SELECT,
  PRODUCT_NOT_FOUND,
} from './products.constants.js';

const ACTIVE = { isActive: true } satisfies Prisma.ProductWhereInput;
const CATALOG_ORDER = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductOrderByWithRelationInput[];

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  findPage(query: PaginationQueryDto): Promise<ProductPageDto> {
    return this.cache.getOrLoad(
      `products:page:${query.page}:${query.limit}`,
      () => this.loadPage(query),
    );
  }

  findOne(id: string): Promise<ProductResponseDto> {
    return this.cache.getOrLoad(`product:${id}`, () =>
      this.loadActiveProduct(id),
    );
  }

  private async loadPage({
    page,
    limit,
    skip,
  }: PaginationQueryDto): Promise<ProductPageDto> {
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where: ACTIVE,
        orderBy: CATALOG_ORDER,
        skip,
        take: limit,
        select: CATALOG_PRODUCT_SELECT,
      }),
      this.prisma.product.count({ where: ACTIVE }),
    ]);
    return { items, page, limit, total };
  }

  private async loadActiveProduct(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id, ...ACTIVE },
      select: CATALOG_PRODUCT_SELECT,
    });
    if (!product) {
      throw new NotFoundException(PRODUCT_NOT_FOUND);
    }
    return product;
  }
}
