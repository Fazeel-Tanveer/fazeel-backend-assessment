# Scaling

How the API handles more load and what to change as it grows. The numbers here are estimates. Nothing has been load tested yet.

## How it works today

```
client ─► api × N ──┬─► Postgres   users, carts, orders
                    ├─► Redis      catalog cache, rate limits, OTP codes
                    └─► RabbitMQ   orders, notifications ─► worker × M
```

The API and the worker are two processes built from the same code. Placing an order only does the part that has to be consistent: one short transaction locks the user's cart, reads current prices, saves the order with its items and clears the cart. Then the API publishes `order.created` and returns `202`. Payment and emails happen in the worker, so a slow payment provider or mail server never slows down a request.

## Scaling the API

The API keeps nothing in memory between requests. Access tokens are JWTs checked with a shared secret. Refresh tokens live in Postgres. OTP codes, rate limit counters and the catalog cache live in Redis. Any replica can serve any request, so more traffic means more replicas:

- Docker Compose: `docker compose up -d --scale api=3`, with one host port per replica from 3000 to 3002
- Kubernetes: a Deployment with a HorizontalPodAutoscaler, using `/api/v1/health` as the readiness probe
- One server without containers: PM2 cluster mode (`pm2 start dist/main.js -i max`) runs a process per CPU core

Database connections usually run out before CPU does. Each process opens up to `DATABASE_POOL_SIZE` connections (10 by default) while Postgres allows 100. PgBouncer is the first thing to add when the replica count goes up.

Migrations run once before the new code starts (the `migrate` service in Compose, a Job in Kubernetes) so replicas never race each other. While old and new replicas run side by side, schema changes have to stay backward compatible.

## The queue absorbs spikes

At dinner time orders can arrive faster than a payment provider accepts charges. The API only has to save orders as fast as Postgres allows. Workers work through the queue as fast as payments allow. During a spike the queue grows for a while and then drains.

Workers scale separately (`--scale worker=4`, or KEDA on queue length in Kubernetes). Running several is safe. Each one takes up to 10 messages at a time, skips orders that are no longer `PENDING` and changes the status with a conditional update so two workers can't settle the same order. A message the worker can't process goes to a dead-letter queue instead of being retried forever.

## Database

Every query has an index behind it. Order history uses `(user_id, created_at DESC)` and a unique `(user_id, idempotency_key)` blocks duplicate orders. Money is stored as integer cents. Checkout only locks the current user's cart row, so different users never wait on each other.

As load grows:

1. PgBouncer in transaction mode lets thousands of app connections share about a hundred real ones.
2. Read replicas can serve order history. `POST /orders` already returns the new order, so a second of replication lag is fine for the list.
3. Monthly partitions keep `orders` manageable once it reaches hundreds of millions of rows. Postgres requires unique constraints to include the partition key, so idempotency keys would move to their own table or to Redis.
4. Sharding by `userId` comes last, when one primary can't keep up with the writes. Everything in a checkout belongs to one user, which makes it a natural shard key.

## Redis

The catalog is the busiest read path. It's cached for 5 minutes with a version number in the key. Every admin change bumps the version, which makes all old entries stale at once. If Redis is down, catalog reads fall back to Postgres. The product list is the same for everyone, so a CDN in front of it would take most of that traffic off the API.

At scale the cache should run on a separate Redis instance from the rate limits and OTP codes. The cache is allowed to evict keys under memory pressure but login codes aren't.

## Kafka

RabbitMQ is enough for a long time. Kafka starts to make sense when several services need the same order events (kitchen, delivery, analytics), when events need to be replayed or when the volume outgrows a RabbitMQ cluster. The order topic would be partitioned by `userId` so each user's events stay in order.

## Known gap: publishing after commit

The API publishes `order.created` after the transaction commits. If RabbitMQ is down or the process dies in between, the order is saved but stays `PENDING`. The only trace is an error log with the order id.

The proper fix is a transactional outbox: write the event to an `outbox` table in the same transaction and let a relay publish it. A simpler first step is a job that republishes card orders stuck in `PENDING` for a few minutes. The `(status, created_at)` index already supports that query.

## Rate limiting behind a load balancer

The rate limiter keys on the client IP and keeps its counters in Redis, so limits hold across replicas. Behind a load balancer every request seems to come from the balancer's IP though. The fix is to rate limit at the edge (an API gateway, WAF or CDN) or to set Express `trust proxy` for the known proxy so the real client IP is used.

## Monitoring

Logs are structured JSON with secrets redacted. Every response carries an `x-request-id`. Next would come metrics (latency, queue depth, connection pool wait, cache hit rate), OpenTelemetry tracing from the API through the worker and alerts on a non-empty dead-letter queue or card orders stuck in `PENDING`.

## About "5 million orders in parallel"

No database takes 5 million inserts at the same instant. What matters is the peak rate:

| 5M orders spread over | Average | 10× peak |
|---|---|---|
| a day | ~60/s | ~600/s |
| an hour | ~1,400/s | ~14,000/s |

One well-sized Postgres primary should handle a few thousand orders per second. Up to about 2,000/s this design works as it is with more replicas, PgBouncer and more workers. Around 10,000/s the writes need sharding by `userId` and the events move to Kafka. For flash-sale spikes beyond that, orders would first go into a durable log with a waiting room at the edge, then get written to Postgres asynchronously.

Most people hitting the app at once are browsing rather than ordering. Browsing is served from Redis and could be served from a CDN. Before building any of this, load test the Compose stack with k6 and fix the first real bottleneck.
