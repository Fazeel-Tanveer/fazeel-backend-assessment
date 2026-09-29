import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import { AdminProductsService } from './admin-products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CreateVariantDto } from './dto/create-variant.dto.js';
import {
  ProductResponseDto,
  VariantResponseDto,
} from './dto/product-response.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateVariantDto } from './dto/update-variant.dto.js';

const INVALID_INPUT = 'Validation failed or the id is not a UUID';
const SKU_TAKEN = 'A variant already uses this sku';

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Signed-in user is not an admin' })
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminProductsController {
  constructor(private readonly admin: AdminProductsService) {}

  @Post('products')
  @ApiOperation({ summary: 'Create a product together with its variants' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: SKU_TAKEN })
  createProduct(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.admin.createProduct(dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update a product or restore a deleted one' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: 'Product does not exist' })
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.admin.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hide a product from the catalog (soft delete)' })
  @ApiNoContentResponse({ description: 'Product is no longer listed' })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: 'Product does not exist' })
  deleteProduct(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.deactivateProduct(id);
  }

  @Post('products/:id/variants')
  @ApiOperation({ summary: 'Add a variant to a product' })
  @ApiCreatedResponse({ type: VariantResponseDto })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: 'Product does not exist' })
  @ApiConflictResponse({ description: SKU_TAKEN })
  addVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ): Promise<VariantResponseDto> {
    return this.admin.addVariant(productId, dto);
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: 'Update a variant or restore a removed one' })
  @ApiOkResponse({ type: VariantResponseDto })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: 'Variant does not exist' })
  @ApiConflictResponse({ description: SKU_TAKEN })
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<VariantResponseDto> {
    return this.admin.updateVariant(id, dto);
  }

  @Delete('variants/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Take a variant off the menu (soft delete)' })
  @ApiNoContentResponse({ description: 'Variant is no longer listed' })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: 'Variant does not exist' })
  deleteVariant(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.deactivateVariant(id);
  }
}
