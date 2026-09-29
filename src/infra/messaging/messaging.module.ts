import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ClientsProviderAsyncOptions,
  ClientsModule,
} from '@nestjs/microservices';
import type { Env } from '../../config/env.validation.js';
import { EventPublisher } from './event-publisher.service.js';
import {
  NOTIFICATIONS_CLIENT,
  NOTIFICATIONS_QUEUE,
  ORDERS_CLIENT,
  ORDERS_QUEUE,
} from './queues.js';
import { producerOptions } from './rmq.config.js';

function producer(name: symbol, queue: string): ClientsProviderAsyncOptions {
  return {
    name,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) =>
      producerOptions(config.get('RABBITMQ_URL', { infer: true }), queue),
  };
}

@Module({
  imports: [
    ClientsModule.registerAsync([
      producer(NOTIFICATIONS_CLIENT, NOTIFICATIONS_QUEUE),
      producer(ORDERS_CLIENT, ORDERS_QUEUE),
    ]),
  ],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class MessagingModule {}
