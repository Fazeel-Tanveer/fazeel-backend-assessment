import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CreateProductDto } from './create-product.dto.js';
import { UpdateProductDto } from './update-product.dto.js';
import { UpdateVariantDto } from './update-variant.dto.js';

const validVariant = { name: '8pc', sku: 'WINGS-8PC', priceCents: 899 };
const validProduct = {
  name: 'Chicken Wings',
  description: 'Crispy wings tossed in buffalo sauce',
  imageUrl: 'https://cdn.example.com/wings.jpg',
  variants: [
    validVariant,
    { name: '16pc', sku: 'WINGS-16PC', priceCents: 1599 },
  ],
};

function errorPaths(errors: ValidationError[], parent?: string): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    return error.children?.length ? errorPaths(error.children, path) : [path];
  });
}

async function invalidFields<T extends object>(
  dto: ClassConstructor<T>,
  input: Record<string, unknown>,
) {
  const errors = await validate(plainToInstance(dto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errorPaths(errors);
}

describe('CreateProductDto', () => {
  it('accepts a product with variants', async () => {
    await expect(
      invalidFields(CreateProductDto, validProduct),
    ).resolves.toEqual([]);
  });

  it('trims names and normalises skus to upper case', () => {
    const dto = plainToInstance(CreateProductDto, {
      ...validProduct,
      name: '  Chicken Wings ',
      variants: [{ ...validVariant, name: ' 8pc ', sku: ' wings-8pc ' }],
    });

    expect(dto.name).toBe('Chicken Wings');
    expect(dto.variants[0]).toMatchObject({ name: '8pc', sku: 'WINGS-8PC' });
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
  ])('rejects a product whose variants are %s', async (_case, variants) => {
    await expect(
      invalidFields(CreateProductDto, { ...validProduct, variants }),
    ).resolves.toEqual(['variants']);
  });

  it.each([
    ['negative', -1],
    ['fractional', 899.5],
    ['a string', '899'],
    ['over the maximum', 1_000_001],
  ])('rejects a price that is %s', async (_case, priceCents) => {
    await expect(
      invalidFields(CreateProductDto, {
        ...validProduct,
        variants: [{ ...validVariant, priceCents }],
      }),
    ).resolves.toEqual(['variants.0.priceCents']);
  });

  it('accepts a free variant', async () => {
    await expect(
      invalidFields(CreateProductDto, {
        ...validProduct,
        variants: [{ ...validVariant, priceCents: 0 }],
      }),
    ).resolves.toEqual([]);
  });

  it('rejects two variants with the same sku in one request', async () => {
    await expect(
      invalidFields(CreateProductDto, {
        ...validProduct,
        variants: [validVariant, { ...validVariant, sku: 'wings-8pc' }],
      }),
    ).resolves.toEqual(['variants']);
  });

  it.each(['WINGS 8PC', 'WINGS--8PC', '-WINGS', 'WINGS_8PC', '', 42])(
    'rejects the malformed sku "%s"',
    async (sku) => {
      await expect(
        invalidFields(CreateProductDto, {
          ...validProduct,
          variants: [{ ...validVariant, sku }],
        }),
      ).resolves.toEqual(['variants.0.sku']);
    },
  );

  it('rejects a variant that is not an object without throwing', async () => {
    await expect(
      invalidFields(CreateProductDto, { ...validProduct, variants: [null] }),
    ).resolves.toEqual(['variants.0']);
  });

  it.each(['javascript:alert(1)', 'ftp://cdn.example.com/a.jpg', 'wings.jpg'])(
    'rejects the image url %s',
    async (imageUrl) => {
      await expect(
        invalidFields(CreateProductDto, { ...validProduct, imageUrl }),
      ).resolves.toEqual(['imageUrl']);
    },
  );

  it('rejects an empty name', async () => {
    await expect(
      invalidFields(CreateProductDto, { ...validProduct, name: '   ' }),
    ).resolves.toEqual(['name']);
  });
});

describe('UpdateProductDto', () => {
  it('accepts a partial update', async () => {
    await expect(
      invalidFields(UpdateProductDto, { name: 'Wings' }),
    ).resolves.toEqual([]);
  });

  it('accepts restoring a deleted product', async () => {
    await expect(
      invalidFields(UpdateProductDto, { isActive: true }),
    ).resolves.toEqual([]);
  });

  it('lets null clear the optional description and image', async () => {
    await expect(
      invalidFields(UpdateProductDto, { description: null, imageUrl: null }),
    ).resolves.toEqual([]);
  });

  it('rejects null for required fields instead of passing it to the database', async () => {
    await expect(
      invalidFields(UpdateProductDto, { name: null, isActive: null }),
    ).resolves.toEqual(['name', 'isActive']);
  });

  it('does not accept variants, which have their own routes', async () => {
    await expect(
      invalidFields(UpdateProductDto, { variants: [validVariant] }),
    ).resolves.toEqual(['variants']);
  });
});

describe('UpdateVariantDto', () => {
  it('accepts marking a variant unavailable', async () => {
    await expect(
      invalidFields(UpdateVariantDto, { isAvailable: false }),
    ).resolves.toEqual([]);
  });

  it('rejects a negative price', async () => {
    await expect(
      invalidFields(UpdateVariantDto, { priceCents: -100 }),
    ).resolves.toEqual(['priceCents']);
  });

  it('rejects null instead of passing it to the database', async () => {
    await expect(
      invalidFields(UpdateVariantDto, { priceCents: null, isAvailable: null }),
    ).resolves.toEqual(['priceCents', 'isAvailable']);
  });
});
