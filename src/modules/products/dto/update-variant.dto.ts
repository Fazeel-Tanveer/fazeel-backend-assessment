import { ApiProperty, IntersectionType, PartialType } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { CreateVariantDto } from './create-variant.dto.js';

class VariantStatusDto {
  @ApiProperty({
    description: 'false takes the variant off the menu; true restores it',
  })
  @IsBoolean()
  isAvailable: boolean;
}

// skipNullProperties: false makes null fail validation instead of reaching a non-nullable column
export class UpdateVariantDto extends PartialType(
  IntersectionType(CreateVariantDto, VariantStatusDto),
  { skipNullProperties: false },
) {}
