import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MockInstance } from 'vitest';
import { type Env, NodeEnv } from '../../config/env.validation.js';
import type { NotificationMessage } from '../../infra/messaging/queues.js';
import { LoggerNotificationSender } from './logger-notification.sender.js';

const NOTIFICATION: NotificationMessage = {
  channel: 'email',
  to: 'alice@example.com',
  message: 'Your login code is 123456',
};

function createSender(nodeEnv: NodeEnv, logContent = false) {
  const values: Partial<Env> = {
    NODE_ENV: nodeEnv,
    LOG_NOTIFICATION_CONTENT: logContent,
  };
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new LoggerNotificationSender(config);
}

describe('LoggerNotificationSender', () => {
  let log: MockInstance<Logger['log']>;
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the message outside production so developers can read the code', async () => {
    await createSender(NodeEnv.Development).send(NOTIFICATION);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(NOTIFICATION.message),
    );
  });

  it('never prints the message in production', async () => {
    await createSender(NodeEnv.Production).send(NOTIFICATION);

    const printed = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(printed).not.toContain('123456');
    expect(printed).not.toContain(NOTIFICATION.to);
    expect(warn).toHaveBeenCalled();
  });

  it('prints the message in production when LOG_NOTIFICATION_CONTENT is on', async () => {
    await createSender(NodeEnv.Production, true).send(NOTIFICATION);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(NOTIFICATION.message),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
