import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ProductsController } from './products.controller.js';
import type { ProductsService } from './products.service.js';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000002';
const PAGE = { items: [], page: 1, limit: 20, total: 0 };
const PRODUCT = { id: PRODUCT_ID, name: 'Burger' };

function createController() {
  const products = {
    findPage: vi.fn().mockResolvedValue(PAGE),
    findOne: vi.fn().mockResolvedValue(PRODUCT),
  };
  const controller = new ProductsController(
    products as unknown as ProductsService,
  );

  return { controller, products };
}

describe('ProductsController', () => {
  it('lists a page of products', async () => {
    const { controller, products } = createController();
    const query = new PaginationQueryDto();

    await expect(controller.findPage(query)).resolves.toBe(PAGE);
    expect(products.findPage).toHaveBeenCalledWith(query);
  });

  it('returns one product by id', async () => {
    const { controller, products } = createController();

    await expect(controller.findOne(PRODUCT_ID)).resolves.toBe(PRODUCT);
    expect(products.findOne).toHaveBeenCalledWith(PRODUCT_ID);
  });
});
