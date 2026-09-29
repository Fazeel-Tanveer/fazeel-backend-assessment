import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { CatalogCacheService } from '../src/modules/products/catalog-cache.service.js';

const RUN_ID = randomUUID().slice(0, 8);
const USER_ID = '01920000-0000-7000-8000-000000000300';
const MISSING_ID = '01920000-0000-7000-8000-00000000ffff';
const MAX_PAGE_SIZE = 50;

interface VariantBody {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  isAvailable: boolean;
}

interface ProductBody {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  variants: VariantBody[];
}

interface ProductPage {
  items: ProductBody[];
  page: number;
  limit: number;
  total: number;
}

let productCount = 0;

function newProduct() {
  productCount += 1;
  const tag = `${RUN_ID}-${productCount}`;
  return {
    name: `Test Wrap ${tag}`,
    description: 'Grilled chicken wrap',
    variants: [
      { name: 'Large', sku: `wrap-${tag}-lrg`, priceCents: 799 },
      { name: 'Regular', sku: `wrap-${tag}-reg`, priceCents: 599 },
    ],
  };
}

describe('Products (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  const throttlerStorage = new ThrottlerStorageService();

  function asAdmin(call: request.Test) {
    return call.auth(adminToken, { type: 'bearer' });
  }

  async function createProduct(body = newProduct()): Promise<ProductBody> {
    const response = await asAdmin(
      request(server).post('/api/v1/admin/products'),
    )
      .send(body)
      .expect(HttpStatus.CREATED);
    return response.body as ProductBody;
  }

  function getProduct(id: string) {
    return request(server).get(`/api/v1/products/${id}`);
  }

  function listProducts(page: number, limit: number) {
    return request(server).get('/api/v1/products').query({ page, limit });
  }

  async function listAllIds(): Promise<string[]> {
    const ids: string[] = [];
    let page = 1;
    let items: ProductBody[];
    do {
      const response = await listProducts(page, MAX_PAGE_SIZE);
      items = (response.body as ProductPage).items;
      ids.push(...items.map((item) => item.id));
      page += 1;
    } while (items.length === MAX_PAGE_SIZE);
    return ids;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(throttlerStorage)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: USER_ID, role: Role.ADMIN });
    userToken = await jwt.signAsync({ sub: USER_ID, role: Role.USER });
  });

  beforeEach(() => {
    throttlerStorage.onApplicationShutdown();
  });

  afterAll(async () => {
    const byRun = { name: { contains: RUN_ID } };
    await prisma.productVariant.deleteMany({ where: { product: byRun } });
    await prisma.product.deleteMany({ where: byRun });
    await app.get(CatalogCacheService).invalidate();
    await app.close();
    throttlerStorage.onApplicationShutdown();
  });

  describe('public catalog', () => {
    it('shows a product with only its available variants, cheapest first', async () => {
      const product = await createProduct();
      const [large] = product.variants.filter((v) => v.name === 'Large');
      await asAdmin(
        request(server).delete(`/api/v1/admin/variants/${large.id}`),
      ).expect(HttpStatus.NO_CONTENT);

      const response = await getProduct(product.id);

      expect(response.status).toBe(HttpStatus.OK);
      expect((response.body as ProductBody).variants).toEqual([
        expect.objectContaining({ name: 'Regular', priceCents: 599 }),
      ]);
    });

    it('paginates without repeating products across pages', async () => {
      await Promise.all([createProduct(), createProduct(), createProduct()]);

      const first = (await listProducts(1, 2)).body as ProductPage;
      const second = (await listProducts(2, 2)).body as ProductPage;

      expect(first).toMatchObject({ page: 1, limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.total).toBeGreaterThanOrEqual(3);
      const firstIds = first.items.map((item) => item.id);
      expect(second.items.some((item) => firstIds.includes(item.id))).toBe(
        false,
      );
    });

    it('rejects a page size over 50', async () => {
      const response = await listProducts(1, MAX_PAGE_SIZE + 1);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('hides a deleted product from the list and its detail page', async () => {
      const product = await createProduct();
      await getProduct(product.id).expect(HttpStatus.OK);

      await asAdmin(
        request(server).delete(`/api/v1/admin/products/${product.id}`),
      ).expect(HttpStatus.NO_CONTENT);

      expect((await getProduct(product.id)).status).toBe(HttpStatus.NOT_FOUND);
      expect(await listAllIds()).not.toContain(product.id);
    });

    it('returns 404 for an unknown product', async () => {
      const response = await getProduct(MISSING_ID);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body).toMatchObject({ message: 'Product not found' });
    });

    it('rejects an id that is not a uuid', async () => {
      const response = await getProduct('not-a-uuid');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('needs no access token', async () => {
      const response = await listProducts(1, 1);

      expect(response.status).toBe(HttpStatus.OK);
    });
  });

  describe('caching', () => {
    it('serves the cached product until an admin write invalidates the catalog', async () => {
      const product = await createProduct();
      await getProduct(product.id).expect(HttpStatus.OK);
      const renamed = `${product.name} renamed`;
      await prisma.product.update({
        where: { id: product.id },
        data: { name: renamed },
      });

      const cached = await getProduct(product.id);
      const other = await createProduct();
      const fresh = await getProduct(product.id);

      expect(other.id).not.toBe(product.id);
      expect((cached.body as ProductBody).name).toBe(product.name);
      expect((fresh.body as ProductBody).name).toBe(renamed);
    });

    it('refreshes cached list pages after a new product is added', async () => {
      const before = (await listProducts(1, 1)).body as ProductPage;

      await createProduct();
      const after = (await listProducts(1, 1)).body as ProductPage;

      expect(after.total).toBe(before.total + 1);
    });
  });

  describe('admin products', () => {
    it('creates a product with its variants', async () => {
      const body = newProduct();

      const product = await createProduct(body);

      expect(product).toMatchObject({
        name: body.name,
        description: body.description,
        isActive: true,
      });
      expect(product.variants.map((variant) => variant.sku)).toEqual([
        body.variants[1].sku.toUpperCase(),
        body.variants[0].sku.toUpperCase(),
      ]);
    });

    it('forbids regular users', async () => {
      const response = await request(server)
        .post('/api/v1/admin/products')
        .auth(userToken, { type: 'bearer' })
        .send(newProduct());

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('requires an access token', async () => {
      const response = await request(server)
        .post('/api/v1/admin/products')
        .send(newProduct());

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects a negative price', async () => {
      const body = newProduct();
      body.variants[0].priceCents = -1;

      const response = await asAdmin(
        request(server).post('/api/v1/admin/products'),
      ).send(body);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body).toMatchObject({
        message: ['variants.0.priceCents must not be less than 0'],
      });
    });

    it('rejects a product without variants', async () => {
      const response = await asAdmin(
        request(server).post('/api/v1/admin/products'),
      ).send({ ...newProduct(), variants: [] });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('rejects a sku that another product already uses', async () => {
      const existing = await createProduct();
      const body = newProduct();
      body.variants[0].sku = existing.variants[0].sku;

      const response = await asAdmin(
        request(server).post('/api/v1/admin/products'),
      ).send(body);

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('updates a product and restores it after a delete', async () => {
      const product = await createProduct();
      await asAdmin(
        request(server).delete(`/api/v1/admin/products/${product.id}`),
      ).expect(HttpStatus.NO_CONTENT);

      const response = await asAdmin(
        request(server).patch(`/api/v1/admin/products/${product.id}`),
      ).send({ description: null, isActive: true });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toMatchObject({
        description: null,
        isActive: true,
      });
      expect((await getProduct(product.id)).status).toBe(HttpStatus.OK);
    });

    it('rejects null for a required field', async () => {
      const product = await createProduct();

      const response = await asAdmin(
        request(server).patch(`/api/v1/admin/products/${product.id}`),
      ).send({ name: null });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns 404 when updating an unknown product', async () => {
      const response = await asAdmin(
        request(server).patch(`/api/v1/admin/products/${MISSING_ID}`),
      ).send({ name: 'Ghost' });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('admin variants', () => {
    it('adds, reprices and removes a variant', async () => {
      const product = await createProduct();

      const added = await asAdmin(
        request(server).post(`/api/v1/admin/products/${product.id}/variants`),
      )
        .send({ name: 'Family', sku: `wrap-${RUN_ID}-fam`, priceCents: 1499 })
        .expect(HttpStatus.CREATED);
      const variantId = (added.body as VariantBody).id;
      const repriced = await asAdmin(
        request(server).patch(`/api/v1/admin/variants/${variantId}`),
      ).send({ priceCents: 1299 });
      const afterReprice = (await getProduct(product.id)).body as ProductBody;
      await asAdmin(
        request(server).delete(`/api/v1/admin/variants/${variantId}`),
      ).expect(HttpStatus.NO_CONTENT);
      const afterDelete = (await getProduct(product.id)).body as ProductBody;

      expect(added.body).toMatchObject({
        sku: `WRAP-${RUN_ID.toUpperCase()}-FAM`,
      });
      expect(repriced.body).toMatchObject({ priceCents: 1299 });
      expect(afterReprice.variants).toContainEqual(
        expect.objectContaining({ id: variantId, priceCents: 1299 }),
      );
      expect(afterDelete.variants.map((variant) => variant.id)).not.toContain(
        variantId,
      );
    });

    it('returns 404 when adding a variant to an unknown product', async () => {
      const response = await asAdmin(
        request(server).post(`/api/v1/admin/products/${MISSING_ID}/variants`),
      ).send({ name: 'Ghost', sku: `ghost-${RUN_ID}`, priceCents: 100 });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns 404 when updating an unknown variant', async () => {
      const response = await asAdmin(
        request(server).patch(`/api/v1/admin/variants/${MISSING_ID}`),
      ).send({ priceCents: 100 });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
