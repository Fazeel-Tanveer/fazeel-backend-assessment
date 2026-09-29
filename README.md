# Food Ordering API

A NestJS backend for a food ordering app, built for a Node.js interview assignment. It covers password and OTP login, a product catalog with variants, a cart and orders that get paid for in a background worker.

Swagger UI is at `/docs` once the app is running. [docs/SCALING.md](docs/SCALING.md) explains how the system scales.

Stack: NestJS, TypeScript, PostgreSQL with Prisma, Redis, RabbitMQ, Vitest and Docker.

## Requirements

- Node 22 or newer
- pnpm 11 (`npm install -g pnpm`)
- Docker

## Configuration

```bash
cp .env.example .env
```

All values in `.env.example` are empty. These work with the Docker services:

```bash
NODE_ENV=development
PORT=3000
CORS_ORIGINS=

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=food_ordering
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/food_ordering

REDIS_URL=redis://localhost:6380

RABBITMQ_USER=food
RABBITMQ_PASSWORD=food
RABBITMQ_URL=amqp://food:food@localhost:5672

JWT_ACCESS_SECRET=
OTP_SECRET=

SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=
```

`JWT_ACCESS_SECRET` and `OTP_SECRET` need two different random strings of at least 32 characters (`openssl rand -base64 48` makes one). `SEED_ADMIN_PASSWORD` is the password for the seeded admin. Only `CORS_ORIGINS` can stay empty. The app checks its config on startup and won't start if something is missing or invalid.

These are optional and commented out in `.env.example`:

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_POOL_SIZE` | 10 | Postgres connections per process |
| `JWT_ACCESS_TTL_SECONDS` | 900 | Access token lifetime (max 3600) |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Refresh token lifetime |
| `BCRYPT_ROUNDS` | 12 | bcrypt cost (10 to 15) |
| `THROTTLE_TTL_MS` | 60000 | Rate limit window |
| `THROTTLE_LIMIT` | 100 | Requests per client per route in each window |
| `LOG_NOTIFICATION_CONTENT` | false | Print emails and SMS, login codes included, to the worker log in production |

## Running with Docker

```bash
docker compose up --build -d
docker compose run --rm migrate prisma db seed
```

This starts Postgres, Redis and RabbitMQ, runs the migrations, then starts the API on http://localhost:3000 along with the worker. The seed adds the admin and some sample products.

There's no real email or SMS provider, so the worker prints login codes to its log (`docker compose logs worker`). `docker compose up -d --scale api=3` runs three API replicas on ports 3000 to 3002. `docker compose down -v` stops everything and deletes the data.

## Running locally

```bash
pnpm install
docker compose up -d postgres redis rabbitmq
pnpm prisma migrate dev
pnpm prisma db seed
pnpm start:dev          # API on http://localhost:3000
pnpm start:worker:dev   # worker, in a second terminal
```

The API and the worker are built from the same code. The API answers HTTP requests and puts slow work on RabbitMQ. The worker picks it up. If the Docker `api` container is running, stop it first since it also uses port 3000.

## Using the API

All routes are under `/api/v1`. They need a `Bearer` token unless Swagger marks them as public. Errors come back as `{ statusCode, message, error }`.

![Registering a user from Swagger UI](docs/images/swagger-register.png)

For admin routes, log in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, click **Authorize** in Swagger and paste the `accessToken`.

### Auth

`POST /auth/register` and `POST /auth/login` (email or phone plus password) return an access token that lasts 15 minutes and a refresh token that lasts 7 days. `POST /auth/refresh` swaps the refresh token for a new pair. Reusing an old refresh token signs out all of that user's sessions. `POST /auth/logout` revokes it. Login allows 5 attempts a minute per client and `GET /users/me` returns your profile.

### OTP login

`POST /auth/otp/request` sends a 6-digit code to an email or phone number. It always answers `202` with the same message so it can't be used to find out which accounts exist. `POST /auth/otp/verify` trades the code for the same tokens as a password login. A code expires after 5 minutes, works once and stops working after 5 wrong tries. You can ask for a new one once a minute.

### Products

`GET /products` and `GET /products/:id` are public. Lists are paginated with `?page=1&limit=20` (50 at most). Prices are integer cents, so `899` is 8.99. Admins manage products and variants under `/admin`. Deletes are soft so past orders still point at the product. The catalog is cached in Redis for 5 minutes and cleared on every admin change.

### Cart

`GET /cart` returns your items and the total. `POST /cart/items` adds a variant, `PATCH /cart/items/:variantId` changes its quantity and `DELETE /cart/items/:variantId` removes it. `DELETE /cart` empties the cart. The total always uses current prices from the database.

### Orders

`POST /orders` with `{ "paymentType": "CARD" }` or `"COD"` turns the cart into an order and returns `202` with the order in `PENDING`. It needs an `Idempotency-Key` header with a UUID, so sending the same request twice never places two orders. The worker charges card orders through a mock gateway and marks them `PAID` or `FAILED`. Cash orders stay `PENDING` until delivery. Either way the customer gets an email. `GET /orders` and `GET /orders/:id` only show your own orders.

### Queues

The API publishes `order.created` to the `orders` queue. Login codes and order emails go through `notifications`. Messages the worker can't process end up in `orders.dlq` or `notifications.dlq` for 3 days. The RabbitMQ dashboard is at http://localhost:15672 (`food` / `food`).

## Tests

```bash
pnpm test        # unit tests
pnpm test:cov    # unit tests with coverage, fails under 80%
pnpm test:e2e    # e2e tests, needs the Docker services and a migrated database
```

The e2e tests run the app against real Postgres, Redis and RabbitMQ. Only payments and the email/SMS sender are faked.

Other useful scripts are `pnpm lint`, `pnpm build`, `pnpm start:prod`, `pnpm start:worker:prod` and `pnpm prisma:studio`.
