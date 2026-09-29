import { AdminProductsController } from './admin-products.controller.js';
import type { AdminProductsService } from './admin-products.service.js';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const VARIANT_ID = '01920000-0000-7000-8000-000000000010';
const PRODUCT = { id: PRODUCT_ID, name: 'Burger' };
const VARIANT = { id: VARIANT_ID, name: 'Single' };

function createController() {
  const admin = {
    createProduct: vi.fn().mockResolvedValue(PRODUCT),
    updateProduct: vi.fn().mockResolvedValue(PRODUCT),
    deactivateProduct: vi.fn().mockResolvedValue(undefined),
    addVariant: vi.fn().mockResolvedValue(VARIANT),
    updateVariant: vi.fn().mockResolvedValue(VARIANT),
    deactivateVariant: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new AdminProductsController(
    admin as unknown as AdminProductsService,
  );

  return { controller, admin };
}

describe('AdminProductsController', () => {
  it('creates a product', async () => {
    const { controller, admin } = createController();
    const dto = {
      name: 'Burger',
      variants: [{ name: 'Single', sku: 'BURGER-SINGLE', priceCents: 699 }],
    };

    await expect(controller.createProduct(dto)).resolves.toBe(PRODUCT);
    expect(admin.createProduct).toHaveBeenCalledWith(dto);
  });

  it('updates a product', async () => {
    const { controller, admin } = createController();

    await expect(
      controller.updateProduct(PRODUCT_ID, { name: 'Cheeseburger' }),
    ).resolves.toBe(PRODUCT);
    expect(admin.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, {
      name: 'Cheeseburger',
    });
  });

  it('deletes a product', async () => {
    const { controller, admin } = createController();

    await controller.deleteProduct(PRODUCT_ID);

    expect(admin.deactivateProduct).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it('adds a variant to a product', async () => {
    const { controller, admin } = createController();
    const dto = { name: 'Triple', sku: 'BURGER-TRIPLE', priceCents: 1299 };

    await expect(controller.addVariant(PRODUCT_ID, dto)).resolves.toBe(VARIANT);
    expect(admin.addVariant).toHaveBeenCalledWith(PRODUCT_ID, dto);
  });

  it('updates a variant', async () => {
    const { controller, admin } = createController();

    await expect(
      controller.updateVariant(VARIANT_ID, { priceCents: 749 }),
    ).resolves.toBe(VARIANT);
    expect(admin.updateVariant).toHaveBeenCalledWith(VARIANT_ID, {
      priceCents: 749,
    });
  });

  it('deletes a variant', async () => {
    const { controller, admin } = createController();

    await controller.deleteVariant(VARIANT_ID);

    expect(admin.deactivateVariant).toHaveBeenCalledWith(VARIANT_ID);
  });
});
