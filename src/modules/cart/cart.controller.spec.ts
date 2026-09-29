import { Role } from '../../generated/prisma/enums.js';
import { CartController } from './cart.controller.js';
import type { CartService } from './cart.service.js';

const USER = { id: '01920000-0000-7000-8000-000000000001', role: Role.USER };
const VARIANT_ID = '01920000-0000-7000-8000-000000000010';
const CART = { userId: USER.id, items: [], totalCents: 0 };

function createController() {
  const cart = {
    getCart: vi.fn().mockResolvedValue(CART),
    addItem: vi.fn().mockResolvedValue(CART),
    updateItem: vi.fn().mockResolvedValue(CART),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new CartController(cart as unknown as CartService);

  return { controller, cart };
}

describe('CartController', () => {
  it("returns the signed-in user's cart", async () => {
    const { controller, cart } = createController();

    await expect(controller.getCart(USER)).resolves.toBe(CART);
    expect(cart.getCart).toHaveBeenCalledWith(USER.id);
  });

  it('adds an item for the signed-in user', async () => {
    const { controller, cart } = createController();
    const dto = { variantId: VARIANT_ID, quantity: 2 };

    await expect(controller.addItem(USER, dto)).resolves.toBe(CART);
    expect(cart.addItem).toHaveBeenCalledWith(USER.id, dto);
  });

  it('updates the quantity of an item', async () => {
    const { controller, cart } = createController();

    await expect(
      controller.updateItem(USER, VARIANT_ID, { quantity: 3 }),
    ).resolves.toBe(CART);
    expect(cart.updateItem).toHaveBeenCalledWith(USER.id, VARIANT_ID, {
      quantity: 3,
    });
  });

  it('removes an item', async () => {
    const { controller, cart } = createController();

    await controller.removeItem(USER, VARIANT_ID);

    expect(cart.removeItem).toHaveBeenCalledWith(USER.id, VARIANT_ID);
  });

  it('clears the cart', async () => {
    const { controller, cart } = createController();

    await controller.clear(USER);

    expect(cart.clear).toHaveBeenCalledWith(USER.id);
  });
});
