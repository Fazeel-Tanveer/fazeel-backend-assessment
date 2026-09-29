import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { OrderPageDto, OrderResponseDto } from './dto/order-response.dto.js';
import { PlaceOrderDto } from './dto/place-order.dto.js';
import { IdempotencyKey } from './idempotency-key.decorator.js';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_REUSED,
  ORDER_NOT_FOUND,
} from './orders.constants.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Place an order from your cart; payment is processed in the background',
  })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description:
      'A UUID you generate for this order. Retrying with the same key returns the same order',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiAcceptedResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({
    description:
      'Validation failed, the Idempotency-Key header is missing or not a UUID, or the cart is empty',
  })
  @ApiConflictResponse({
    description: 'Some cart items are no longer available; each one is listed',
  })
  @ApiUnprocessableEntityResponse({ description: IDEMPOTENCY_KEY_REUSED })
  placeOrder(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string,
    @Body() { paymentType }: PlaceOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orders.placeOrder({
      userId: user.id,
      idempotencyKey,
      paymentType,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List your orders, newest first' })
  @ApiOkResponse({ type: OrderPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page or limit' })
  findPage(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<OrderPageDto> {
    return this.orders.findPage(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your orders' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiBadRequestResponse({ description: 'id is not a UUID' })
  @ApiNotFoundResponse({ description: ORDER_NOT_FOUND })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.findOne(user.id, id);
  }
}
