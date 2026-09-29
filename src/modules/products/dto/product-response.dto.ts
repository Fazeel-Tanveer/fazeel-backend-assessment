import { ApiProperty } from '@nestjs/swagger';

export class VariantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '8pc' })
  name: string;

  @ApiProperty({ example: 'WINGS-8PC' })
  sku: string;

  @ApiProperty({ example: 899, description: 'Price in cents' })
  priceCents: number;

  @ApiProperty({ example: true })
  isAvailable: boolean;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Chicken Wings' })
  name: string;

  @ApiProperty({
    example: 'Crispy wings tossed in buffalo sauce',
    nullable: true,
    type: String,
  })
  description: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/wings.jpg',
    nullable: true,
    type: String,
  })
  imageUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({
    type: [VariantResponseDto],
    description: 'Cheapest first. The public catalog lists only available ones',
  })
  variants: VariantResponseDto[];
}

export class ProductPageDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items: ProductResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42, description: 'Active products in the catalog' })
  total: number;
}
