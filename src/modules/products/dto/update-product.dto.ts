import {
  ApiProperty,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { CreateProductDto } from './create-product.dto.js';

class ProductStatusDto {
  @ApiProperty({
    description: 'false hides the product from the catalog; true restores it',
  })
  @IsBoolean()
  isActive: boolean;
}

// skipNullProperties: false makes null fail validation instead of reaching a non-nullable column
export class UpdateProductDto extends PartialType(
  IntersectionType(
    OmitType(CreateProductDto, ['variants'] as const),
    ProductStatusDto,
  ),
  { skipNullProperties: false },
) {}
