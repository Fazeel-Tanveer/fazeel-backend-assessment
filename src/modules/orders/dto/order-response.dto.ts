import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentType } from '../../../generated/prisma/enums.js';

export class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  variantId: string;

  @ApiProperty({ example: 'Chicken Wings' })
  productName: string;

  @ApiProperty({ example: '8pc' })
  variantName: string;

  @ApiProperty({
    example: 899,
    description: 'Price in cents when the order was placed',
  })
  unitPriceCents: number;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 1798, description: 'unitPriceCents × quantity' })
  lineTotalCents: number;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({
    enum: OrderStatus,
    enumName: 'OrderStatus',
    description:
      'PENDING until the worker settles a CARD payment, or until delivery for COD',
  })
  status: OrderStatus;

  @ApiProperty({ enum: PaymentType, enumName: 'PaymentType' })
  paymentType: PaymentType;

  @ApiProperty({ example: 1798, description: 'Order total in cents' })
  totalCents: number;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OrderPageDto {
  @ApiProperty({ type: [OrderResponseDto], description: 'Newest first' })
  items: OrderResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3, description: 'Orders you have placed' })
  total: number;
}
