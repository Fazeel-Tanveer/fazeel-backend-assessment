import type { Prisma } from '../../generated/prisma/client.js';

export const PRODUCT_NAME_MAX_LENGTH = 100;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;
export const IMAGE_URL_MAX_LENGTH = 2048;
export const VARIANT_NAME_MAX_LENGTH = 50;
export const SKU_MAX_LENGTH = 64;
export const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
// keeps line totals far below the int4 limit of the price and total columns
export const MAX_PRICE_CENTS = 1_000_000;
export const MAX_VARIANTS_PER_REQUEST = 20;

export const CATALOG_CACHE_TTL_SECONDS = 300;
export const PRODUCT_NOT_FOUND = 'Product not found';

export const VARIANT_SELECT = {
  id: true,
  name: true,
  sku: true,
  priceCents: true,
  isAvailable: true,
} satisfies Prisma.ProductVariantSelect;

const VARIANT_ORDER = [
  { priceCents: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductVariantOrderByWithRelationInput[];

const PRODUCT_FIELDS = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  isActive: true,
} satisfies Prisma.ProductSelect;

export const CATALOG_PRODUCT_SELECT = {
  ...PRODUCT_FIELDS,
  variants: {
    where: { isAvailable: true },
    orderBy: VARIANT_ORDER,
    select: VARIANT_SELECT,
  },
} satisfies Prisma.ProductSelect;

export const ADMIN_PRODUCT_SELECT = {
  ...PRODUCT_FIELDS,
  variants: { orderBy: VARIANT_ORDER, select: VARIANT_SELECT },
} satisfies Prisma.ProductSelect;
