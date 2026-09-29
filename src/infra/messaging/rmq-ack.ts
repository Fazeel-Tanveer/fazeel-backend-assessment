import type { RmqContext } from '@nestjs/microservices';
import type { Channel, Message } from 'amqplib';

function channelOf(context: RmqContext): Channel {
  return context.getChannelRef() as Channel;
}

export function ack(context: RmqContext): void {
  channelOf(context).ack(context.getMessage() as Message);
}

// without requeue, RabbitMQ routes the message to the queue's dead-letter queue
export function deadLetter(context: RmqContext): void {
  channelOf(context).nack(context.getMessage() as Message, false, false);
}
