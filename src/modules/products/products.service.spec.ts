import { NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CatalogCacheService } from './catalog-cache.service.js';
import { ProductsService } from './products.service.js';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const PRODUCT = {
  id: PRODUCT_ID,
  name: 'Burger',
  description: null,
  imageUrl: null,
  isActive: true,
  variants: [
    {
      id: '01920000-0000-7000-8000-000000000010',
      name: 'Single',
      sku: 'BURGER-SINGLE',
      priceCents: 699,
      isAvailable: true,
    },
  ],
};

function createService() {
  const product = {
    findMany: vi.fn().mockResolvedValue([PRODUCT]),
    count: vi.fn().mockResolvedValue(21),
    findUnique: vi.fn(),
  };
  const cache = {
    getOrLoad: vi.fn((_key: string, load: () => Promise<unknown>) => load()),
  };
  const service = new ProductsService(
    { product } as unknown as PrismaService,
    cache as unknown as CatalogCacheService,
  );

  return { service, product, cache };
}

function pageQuery(page: number, limit: number): PaginationQueryDto {
  return Object.assign(new PaginationQueryDto(), { page, limit });
}

describe('ProductsService', () => {
  describe('findPage', () => {
    it('lists only active products with their available variants', async () => {
      const { service, product } = createService();

      await service.findPage(pageQuery(1, 20));

      expect(product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          select: expect.objectContaining({
            variants: expect.objectContaining({
              where: { isAvailable: true },
            }) as unknown,
          }) as unknown,
        }),
      );
      expect(product.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it('returns the requested page with the total count', async () => {
      const { service, product } = createService();

      const page = await service.findPage(pageQuery(3, 10));

      expect(product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(page).toEqual({ items: [PRODUCT], page: 3, limit: 10, total: 21 });
    });

    it('orders by creation time then id so pages never overlap', async () => {
      const { service, product } = createService();

      await service.findPage(pageQuery(1, 20));

      expect(product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('caches each page under its own key', async () => {
      const { service, cache } = createService();

      await service.findPage(pageQuery(2, 5));

      expect(cache.getOrLoad).toHaveBeenCalledWith(
        'products:page:2:5',
        expect.any(Function),
      );
    });
  });

  describe('findOne', () => {
    it('returns an active product through the cache', async () => {
      const { service, product, cache } = createService();
      product.findUnique.mockResolvedValue(PRODUCT);

      await expect(service.findOne(PRODUCT_ID)).resolves.toEqual(PRODUCT);
      expect(cache.getOrLoad).toHaveBeenCalledWith(
        `product:${PRODUCT_ID}`,
        expect.any(Function),
      );
      expect(product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PRODUCT_ID, isActive: true } }),
      );
    });

    it('throws not found for a missing or inactive product', async () => {
      const { service, product } = createService();
      product.findUnique.mockResolvedValue(null);

      await expect(service.findOne(PRODUCT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
