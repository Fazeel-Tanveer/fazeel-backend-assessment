import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ITEM_NOT_IN_CART } from './cart.constants.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { CartResponseDto } from './dto/cart-response.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

const INVALID_INPUT = 'Validation failed or the variant id is not a UUID';

@ApiTags('cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get your cart with current prices and total' })
  @ApiOkResponse({ type: CartResponseDto })
  getCart(@CurrentUser() user: AuthUser): Promise<CartResponseDto> {
    return this.cart.getCart(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove every item from your cart' })
  @ApiNoContentResponse({ description: 'Cart is empty' })
  clear(@CurrentUser() user: AuthUser): Promise<void> {
    return this.cart.clear(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add a variant to your cart, or add to its quantity',
  })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed or a cart limit was reached',
  })
  @ApiNotFoundResponse({ description: 'Variant does not exist' })
  @ApiConflictResponse({ description: 'Variant is not available' })
  addItem(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cart.addItem(user.id, dto);
  }

  @Patch('items/:variantId')
  @ApiOperation({ summary: 'Change the quantity of a variant in your cart' })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: ITEM_NOT_IN_CART })
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cart.updateItem(user.id, variantId, dto);
  }

  @Delete('items/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a variant from your cart' })
  @ApiNoContentResponse({ description: 'Item removed' })
  @ApiBadRequestResponse({ description: INVALID_INPUT })
  @ApiNotFoundResponse({ description: ITEM_NOT_IN_CART })
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    return this.cart.removeItem(user.id, variantId);
  }
}
