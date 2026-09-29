import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { PaymentType, Role } from '../../generated/prisma/enums.js';
import { OrdersController } from './orders.controller.js';
import type { OrdersService } from './orders.service.js';

const USER = { id: '01920000-0000-7000-8000-000000000001', role: Role.USER };
const ORDER_ID = '01920000-0000-7000-8000-000000000300';
const KEY = '01920000-0000-7000-8000-000000000400';
const ORDER = { id: ORDER_ID };
const PAGE = { items: [ORDER], page: 1, limit: 20, total: 1 };

function createController() {
  const orders = {
    placeOrder: vi.fn().mockResolvedValue(ORDER),
    findPage: vi.fn().mockResolvedValue(PAGE),
    findOne: vi.fn().mockResolvedValue(ORDER),
  };
  const controller = new OrdersController(orders as unknown as OrdersService);

  return { controller, orders };
}

describe('OrdersController', () => {
  it('places an order for the signed-in user with the idempotency key', async () => {
    const { controller, orders } = createController();

    await expect(
      controller.placeOrder(USER, KEY, { paymentType: PaymentType.COD }),
    ).resolves.toBe(ORDER);
    expect(orders.placeOrder).toHaveBeenCalledWith({
      userId: USER.id,
      idempotencyKey: KEY,
      paymentType: PaymentType.COD,
    });
  });

  it("lists the signed-in user's orders", async () => {
    const { controller, orders } = createController();
    const query = new PaginationQueryDto();

    await expect(controller.findPage(USER, query)).resolves.toBe(PAGE);
    expect(orders.findPage).toHaveBeenCalledWith(USER.id, query);
  });

  it("returns one of the signed-in user's orders", async () => {
    const { controller, orders } = createController();

    await expect(controller.findOne(USER, ORDER_ID)).resolves.toBe(ORDER);
    expect(orders.findOne).toHaveBeenCalledWith(USER.id, ORDER_ID);
  });
});
