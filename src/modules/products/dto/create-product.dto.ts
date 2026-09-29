import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../common/dto/transforms.js';
import {
  IMAGE_URL_MAX_LENGTH,
  MAX_VARIANTS_PER_REQUEST,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
} from '../products.constants.js';
import { CreateVariantDto } from './create-variant.dto.js';

export class CreateProductDto {
  @ApiProperty({ example: 'Chicken Wings', maxLength: PRODUCT_NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 'Crispy wings tossed in buffalo sauce',
    maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/wings.jpg',
    maxLength: IMAGE_URL_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(IMAGE_URL_MAX_LENGTH)
  imageUrl?: string | null;

  @ApiProperty({
    type: [CreateVariantDto],
    minItems: 1,
    maxItems: MAX_VARIANTS_PER_REQUEST,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VARIANTS_PER_REQUEST)
  @ArrayUnique((variant?: CreateVariantDto) => variant?.sku, {
    message: 'variants must not repeat a sku',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
