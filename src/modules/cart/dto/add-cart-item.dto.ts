import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY } from '../cart.constants.js';

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: MAX_ITEM_QUANTITY,
    description: 'Added to the quantity already in the cart',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;
}
