import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim, trimAndUppercase } from '../../../common/dto/transforms.js';
import {
  MAX_PRICE_CENTS,
  SKU_MAX_LENGTH,
  SKU_PATTERN,
  VARIANT_NAME_MAX_LENGTH,
} from '../products.constants.js';

export class CreateVariantDto {
  @ApiProperty({ example: '8pc', maxLength: VARIANT_NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(VARIANT_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({
    example: 'WINGS-8PC',
    maxLength: SKU_MAX_LENGTH,
    description: 'Unique across all variants; stored in upper case',
  })
  @Transform(trimAndUppercase)
  @IsString()
  @MaxLength(SKU_MAX_LENGTH)
  @Matches(SKU_PATTERN, {
    message: 'sku must be letters and digits separated by single dashes',
  })
  sku: string;

  @ApiProperty({
    example: 899,
    minimum: 0,
    maximum: MAX_PRICE_CENTS,
    description: 'Price in cents',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents: number;
}
