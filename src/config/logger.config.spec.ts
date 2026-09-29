import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { NodeEnv } from './env.validation.js';
import { buildPinoOptions } from './logger.config.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });

  return { lines, stream };
}

describe('buildPinoOptions', () => {
  it('redacts credentials from log lines', () => {
    const { lines, stream } = captureLogs();
    const logger = pino(
      { redact: buildPinoOptions(NodeEnv.Production).redact },
      stream,
    );

    logger.info({
      password: 'hunter2-password',
      dto: { code: '123456', refreshToken: 'opaque-refresh-token' },
      req: {
        headers: { authorization: 'Bearer signed.jwt.token' },
        body: { password: 'nested-password' },
      },
    });

    const [line] = lines;
    expect(line).not.toMatch(
      /hunter2|123456|opaque-refresh|signed\.jwt|nested-password/,
    );
  });

  it('uses pretty output only in development', () => {
    expect(buildPinoOptions(NodeEnv.Development).transport).toBeDefined();
    expect(buildPinoOptions(NodeEnv.Production).transport).toBeUndefined();
  });

  it('silences logs during tests', () => {
    expect(buildPinoOptions(NodeEnv.Test).level).toBe('silent');
  });

  it('skips request logs for the health check', () => {
    const { autoLogging } = buildPinoOptions(NodeEnv.Production);
    const ignore = typeof autoLogging === 'object' ? autoLogging.ignore : null;

    expect(ignore?.({ url: '/api/v1/health' } as IncomingMessage)).toBe(true);
    expect(ignore?.({ url: '/api/v1/products' } as IncomingMessage)).toBe(
      false,
    );
  });

  it('tags each request with an id and returns it in a header', () => {
    const { genReqId } = buildPinoOptions(NodeEnv.Production);
    const response = { setHeader: vi.fn() };

    const id = genReqId?.(
      {} as IncomingMessage,
      response as unknown as ServerResponse,
    );

    expect(id).toMatch(UUID_PATTERN);
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });
});
