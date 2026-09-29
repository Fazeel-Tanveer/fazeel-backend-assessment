import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { IdempotencyKey } from './idempotency-key.decorator.js';

type ParamFactory = (data: unknown, context: ExecutionContext) => string;

const KEY = '01920000-0000-7000-8000-000000000400';

function getParamFactory(): ParamFactory {
  class CheckoutController {
    place(@IdempotencyKey() key: string) {
      return key;
    }
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    CheckoutController,
    'place',
  ) as Record<string, { factory: ParamFactory }>;
  const [param] = Object.values(metadata);

  return param.factory;
}

function createContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyKey', () => {
  const factory = getParamFactory();

  it('returns the Idempotency-Key header', () => {
    expect(factory(undefined, createContext({ 'idempotency-key': KEY }))).toBe(
      KEY,
    );
  });

  it.each([
    ['missing', {}],
    ['empty', { 'idempotency-key': '' }],
    ['not a uuid', { 'idempotency-key': 'order-1' }],
    ['sent twice', { 'idempotency-key': [KEY, KEY] }],
  ])('rejects a header that is %s', (_case, headers) => {
    expect(() => factory(undefined, createContext(headers))).toThrow(
      new BadRequestException('Idempotency-Key header must be a UUID'),
    );
  });
});
