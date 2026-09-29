import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import {
  IDEMPOTENCY_KEY_HEADER,
  INVALID_IDEMPOTENCY_KEY,
} from './orders.constants.js';

const HEADER_FIELD = IDEMPOTENCY_KEY_HEADER.toLowerCase();

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context.switchToHttp().getRequest<Request>().headers[
      HEADER_FIELD
    ];
    if (typeof key !== 'string' || !isUUID(key)) {
      throw new BadRequestException(INVALID_IDEMPOTENCY_KEY);
    }
    return key;
  },
);
