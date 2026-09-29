import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlaceOrderDto } from './place-order.dto.js';

async function invalidFields(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(PlaceOrderDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('PlaceOrderDto', () => {
  it.each(['COD', 'CARD'])(
    'accepts the payment type %s',
    async (paymentType) => {
      await expect(invalidFields({ paymentType })).resolves.toEqual([]);
    },
  );

  it.each(['card', 'PAYPAL', undefined])(
    'rejects the payment type %s',
    async (paymentType) => {
      await expect(invalidFields({ paymentType })).resolves.toEqual([
        'paymentType',
      ]);
    },
  );

  it('rejects a client-sent total', async () => {
    await expect(
      invalidFields({ paymentType: 'COD', totalCents: 1 }),
    ).resolves.toEqual(['totalCents']);
  });
});
