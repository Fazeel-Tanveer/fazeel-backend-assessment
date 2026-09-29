# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

FROM base AS build
# the Prisma schema engine used by `migrate deploy` links against openssl
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

FROM build AS migrate
ENV PATH=/app/node_modules/.bin:$PATH
USER node
CMD ["prisma", "migrate", "deploy"]

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# scripts are skipped: postinstall needs the Prisma CLI (a dev dependency) and bcrypt ships prebuilt binaries.
# --no-optional drops the CLI that @prisma/client lists as an optional peer, about 250MB the app never loads
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --no-optional

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
