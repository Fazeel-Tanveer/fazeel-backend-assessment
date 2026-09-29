import { ApiProperty } from '@nestjs/swagger';

export class CartItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ example: 'Chicken Wings' })
  productName: string;

  @ApiProperty({ format: 'uuid' })
  variantId: string;

  @ApiProperty({ example: '8pc' })
  variantName: string;

  @ApiProperty({ example: 899, description: 'Current price in cents' })
  unitPriceCents: number;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 1798, description: 'unitPriceCents × quantity' })
  lineTotalCents: number;

  @ApiProperty({
    example: true,
    description:
      'false when the variant or its product was taken off the menu; remove it before ordering',
  })
  isAvailable: boolean;
}

export class CartResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({
    type: [CartItemResponseDto],
    description: 'In the order they were added',
  })
  items: CartItemResponseDto[];

  @ApiProperty({
    example: 1798,
    description: 'Sum of the available items at current prices, in cents',
  })
  totalCents: number;
}
