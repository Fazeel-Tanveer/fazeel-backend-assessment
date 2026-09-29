import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY } from '../cart.constants.js';

export class UpdateCartItemDto {
  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: MAX_ITEM_QUANTITY,
    description: 'Replaces the quantity in the cart',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;
}
