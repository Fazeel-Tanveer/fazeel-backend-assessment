import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminProductsService } from './admin-products.service.js';
import type { CatalogCacheService } from './catalog-cache.service.js';
import { ADMIN_PRODUCT_SELECT, VARIANT_SELECT } from './products.constants.js';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const VARIANT_ID = '01920000-0000-7000-8000-000000000010';
const VARIANT = {
  id: VARIANT_ID,
  name: 'Single',
  sku: 'BURGER-SINGLE',
  priceCents: 699,
  isAvailable: true,
};
const PRODUCT = {
  id: PRODUCT_ID,
  name: 'Burger',
  description: 'Beef patty',
  imageUrl: null,
  isActive: true,
  variants: [VARIANT],
};

function createService() {
  const product = {
    create: vi.fn().mockResolvedValue(PRODUCT),
    update: vi.fn().mockResolvedValue(PRODUCT),
  };
  const productVariant = {
    create: vi.fn().mockResolvedValue(VARIANT),
    update: vi.fn().mockResolvedValue(VARIANT),
  };
  const cache = { invalidate: vi.fn().mockResolvedValue(undefined) };
  const service = new AdminProductsService(
    { product, productVariant } as unknown as PrismaService,
    cache as unknown as CatalogCacheService,
  );

  return { service, product, productVariant, cache };
}

describe('AdminProductsService', () => {
  describe('products', () => {
    it('creates a product with its variants in one write and invalidates the catalog', async () => {
      const { service, product, cache } = createService();
      const variants = [
        { name: 'Single', sku: 'BURGER-SINGLE', priceCents: 699 },
        { name: 'Double', sku: 'BURGER-DOUBLE', priceCents: 999 },
      ];

      const created = await service.createProduct({
        name: 'Burger',
        description: 'Beef patty',
        variants,
      });

      expect(created).toBe(PRODUCT);
      expect(product.create).toHaveBeenCalledWith({
        data: {
          name: 'Burger',
          description: 'Beef patty',
          variants: { create: variants },
        },
        select: ADMIN_PRODUCT_SELECT,
      });
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });

    it('leaves the cache alone when the write fails', async () => {
      const { service, product, cache } = createService();
      product.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        service.createProduct({ name: 'Burger', variants: [] }),
      ).rejects.toThrow('Unique constraint failed');
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('updates a product and returns it with every variant', async () => {
      const { service, product, cache } = createService();

      await expect(
        service.updateProduct(PRODUCT_ID, { name: 'Cheeseburger' }),
      ).resolves.toBe(PRODUCT);
      expect(product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { name: 'Cheeseburger' },
        select: ADMIN_PRODUCT_SELECT,
      });
      expect(ADMIN_PRODUCT_SELECT.variants).not.toHaveProperty('where');
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });

    it('soft-deletes a product by marking it inactive', async () => {
      const { service, product, cache } = createService();

      await service.deactivateProduct(PRODUCT_ID);

      expect(product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PRODUCT_ID },
          data: { isActive: false },
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });
  });

  describe('variants', () => {
    it('adds a variant to an existing product', async () => {
      const { service, productVariant, cache } = createService();
      const dto = { name: 'Triple', sku: 'BURGER-TRIPLE', priceCents: 1299 };

      await expect(service.addVariant(PRODUCT_ID, dto)).resolves.toBe(VARIANT);
      expect(productVariant.create).toHaveBeenCalledWith({
        data: { ...dto, product: { connect: { id: PRODUCT_ID } } },
        select: VARIANT_SELECT,
      });
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });

    it('updates a variant', async () => {
      const { service, productVariant, cache } = createService();

      await expect(
        service.updateVariant(VARIANT_ID, { priceCents: 749 }),
      ).resolves.toBe(VARIANT);
      expect(productVariant.update).toHaveBeenCalledWith({
        where: { id: VARIANT_ID },
        data: { priceCents: 749 },
        select: VARIANT_SELECT,
      });
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });

    it('soft-deletes a variant by marking it unavailable', async () => {
      const { service, productVariant, cache } = createService();

      await service.deactivateVariant(VARIANT_ID);

      expect(productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VARIANT_ID },
          data: { isAvailable: false },
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledOnce();
    });
  });
});
