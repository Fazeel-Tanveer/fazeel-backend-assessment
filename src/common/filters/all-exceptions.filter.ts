import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorResponseDto as ErrorBody } from '../dto/error-response.dto.js';

const INTERNAL_ERROR_MESSAGE = 'Internal server error';
const FIRST_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;
const FALLBACK_ERROR_NAME = 'Error';

const PRISMA_ERRORS: Partial<
  Record<string, { status: HttpStatus; message: string }>
> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Resource not found' },
};

function buildBody(statusCode: number, message: string | string[]): ErrorBody {
  return {
    statusCode,
    message,
    error: STATUS_CODES[statusCode] ?? FALLBACK_ERROR_NAME,
  };
}

function isMessage(value: unknown): value is string | string[] {
  return typeof value === 'string' || Array.isArray(value);
}

function fromHttpException(exception: HttpException): ErrorBody {
  const response = exception.getResponse();
  const message =
    typeof response === 'object' && 'message' in response
      ? response.message
      : undefined;

  return buildBody(
    exception.getStatus(),
    isMessage(message) ? message : exception.message,
  );
}

// errors thrown by express middleware (e.g. the body parser) before Nest routing
function isExposedClientError(
  exception: unknown,
): exception is Error & { statusCode: number } {
  return (
    exception instanceof Error &&
    'expose' in exception &&
    exception.expose === true &&
    'statusCode' in exception &&
    typeof exception.statusCode === 'number'
  );
}

function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof HttpException) {
    return fromHttpException(exception);
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERRORS[exception.code];
    if (mapped) {
      return buildBody(mapped.status, mapped.message);
    }
  }
  if (isExposedClientError(exception)) {
    return buildBody(exception.statusCode, exception.message);
  }
  return buildBody(HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_ERROR_MESSAGE);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toErrorBody(exception);
    if (body.statusCode >= FIRST_SERVER_ERROR_STATUS) {
      this.logger.error(exception);
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(body.statusCode)
      .json(body);
  }
}
