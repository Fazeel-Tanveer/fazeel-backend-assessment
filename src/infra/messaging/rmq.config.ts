import { type RmqOptions, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';

const DEAD_LETTER_SUFFIX = '.dlq';
// long enough to inspect failures, short enough that recipients' contact details don't pile up
const DEAD_LETTER_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PREFETCH_COUNT = 10;

type RmqClientOptions = NonNullable<RmqOptions['options']>;

export function deadLetterQueue(queue: string): string {
  return `${queue}${DEAD_LETTER_SUFFIX}`;
}

// producer and consumer both assert the queue, and RabbitMQ refuses the channel if their arguments differ
function rmqOptions(
  url: string,
  queue: string,
  options: RmqClientOptions,
): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue,
      queueOptions: {
        durable: true,
        // the default exchange routes by queue name, so rejected messages land straight in the dead-letter queue
        deadLetterExchange: '',
        deadLetterRoutingKey: deadLetterQueue(queue),
      },
      ...options,
    },
  };
}

export function producerOptions(url: string, queue: string): RmqOptions {
  return rmqOptions(url, queue, { persistent: true });
}

export function consumerOptions(url: string, queue: string): RmqOptions {
  return rmqOptions(url, queue, {
    noAck: false,
    prefetchCount: PREFETCH_COUNT,
  });
}

export async function assertDeadLetterQueues(
  url: string,
  queues: readonly string[],
): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await Promise.all(
      queues.map((queue) =>
        channel.assertQueue(deadLetterQueue(queue), {
          durable: true,
          messageTtl: DEAD_LETTER_TTL_MS,
        }),
      ),
    );
  } finally {
    await connection.close();
  }
}
