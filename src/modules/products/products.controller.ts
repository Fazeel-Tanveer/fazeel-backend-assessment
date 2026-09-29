import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  ProductPageDto,
  ProductResponseDto,
} from './dto/product-response.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active products with their available variants',
  })
  @ApiOkResponse({ type: ProductPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page or limit' })
  findPage(@Query() query: PaginationQueryDto): Promise<ProductPageDto> {
    return this.products.findPage(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an active product with its variants' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'id is not a UUID' })
  @ApiNotFoundResponse({ description: 'Product does not exist or is inactive' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.products.findOne(id);
  }
}
