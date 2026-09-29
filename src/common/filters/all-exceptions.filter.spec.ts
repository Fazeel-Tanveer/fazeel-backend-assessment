import {
  type ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('database error', {
    code,
    clientVersion: '7.10.0',
  });
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the status and message of an http exception', () => {
    const { host, response } = createHost();

    filter.catch(new NotFoundException('Order not found'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Order not found',
      error: 'Not Found',
    });
  });

  it('keeps every validation message', () => {
    const { host, response } = createHost();
    const messages = ['name must be a string', 'property x should not exist'];

    filter.catch(new BadRequestException(messages), host);

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: messages,
      error: 'Bad Request',
    });
  });

  it('maps a unique constraint violation to 409', () => {
    const { host, response } = createHost();

    filter.catch(prismaError('P2002'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Resource already exists',
      error: 'Conflict',
    });
  });

  it('maps a missing record to 404', () => {
    const { host, response } = createHost();

    filter.catch(prismaError('P2025'), host);

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Resource not found',
      error: 'Not Found',
    });
  });

  it('returns a generic 500 for other database errors', () => {
    const { host, response } = createHost();

    filter.catch(prismaError('P2003'), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('hides the details of unexpected errors and logs them', () => {
    const { host, response } = createHost();

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(Logger.prototype.error).toHaveBeenCalledOnce();
  });

  it('keeps client errors raised by the body parser', () => {
    const { host, response } = createHost();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
      expose: true,
    });

    filter.catch(tooLarge, host);

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 413,
      message: 'request entity too large',
      error: 'Payload Too Large',
    });
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });
});
