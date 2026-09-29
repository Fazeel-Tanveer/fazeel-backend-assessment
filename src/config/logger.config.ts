import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { NodeEnv } from './env.validation.js';

const REQUEST_ID_HEADER = 'x-request-id';
const HEALTH_CHECK_URL = '/api/v1/health';
const REDACTED = '[redacted]';
const SENSITIVE_KEYS = ['password', 'code', 'refreshToken', 'accessToken'];

const LOG_LEVELS: Record<NodeEnv, string> = {
  [NodeEnv.Development]: 'debug',
  [NodeEnv.Production]: 'info',
  [NodeEnv.Test]: 'silent',
};

function assignRequestId(_req: IncomingMessage, res: ServerResponse) {
  const id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function buildPinoOptions(nodeEnv: NodeEnv): Options {
  return {
    level: LOG_LEVELS[nodeEnv],
    genReqId: assignRequestId,
    // container and load balancer probes hit this every few seconds per replica
    autoLogging: { ignore: (req) => req.url === HEALTH_CHECK_URL },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
      ],
      censor: REDACTED,
    },
    transport:
      nodeEnv === NodeEnv.Development
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  };
}
