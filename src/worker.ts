import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env.validation.js';
import { NOTIFICATIONS_QUEUE, ORDERS_QUEUE } from './infra/messaging/queues.js';
import {
  assertDeadLetterQueues,
  consumerOptions,
} from './infra/messaging/rmq.config.js';
import { WorkerModule } from './worker.module.js';

const QUEUES = [NOTIFICATIONS_QUEUE, ORDERS_QUEUE];

async function bootstrap() {
  // the worker never calls listen(), so it consumes queues without serving HTTP
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const url = app
    .get<ConfigService<Env, true>>(ConfigService)
    .get('RABBITMQ_URL', { infer: true });
  await assertDeadLetterQueues(url, QUEUES);
  for (const queue of QUEUES) {
    app.connectMicroservice(consumerOptions(url, queue));
  }

  await app.init();
  await app.startAllMicroservices();
}

await bootstrap();
