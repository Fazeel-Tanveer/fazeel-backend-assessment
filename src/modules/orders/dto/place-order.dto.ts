import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PaymentType } from '../../../generated/prisma/enums.js';

export class PlaceOrderDto {
  @ApiProperty({
    enum: PaymentType,
    enumName: 'PaymentType',
    example: PaymentType.CARD,
    description: 'CARD is charged right away, COD is paid on delivery',
  })
  @IsEnum(PaymentType)
  paymentType: PaymentType;
}
