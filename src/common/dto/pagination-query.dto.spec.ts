import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto.js';

function parse(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query);

  return { dto, errors: validateSync(dto) };
}

describe('PaginationQueryDto', () => {
  it('defaults to the first page of 20', () => {
    const { dto, errors } = parse({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20, skip: 0 });
  });

  it('converts query strings and computes the offset', () => {
    const { dto, errors } = parse({ page: '3', limit: '10' });

    expect(errors).toHaveLength(0);
    expect(dto.skip).toBe(20);
  });

  it.each([
    ['a page below 1', { page: '0' }],
    ['a page above 1000', { page: '1001' }],
    ['a limit above 50', { limit: '51' }],
    ['a non-numeric limit', { limit: 'ten' }],
  ])('rejects %s', (_case, query) => {
    expect(parse(query).errors).not.toHaveLength(0);
  });
});
