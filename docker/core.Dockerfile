FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/sync/package.json packages/sync/package.json

RUN pnpm install --no-frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm build

EXPOSE 3100

ENV NODE_ENV=production
ENV PICO_HOST=0.0.0.0
ENV PICO_PORT=3100
ENV PICO_DATABASE_PATH=/data/pico.sqlite

VOLUME ["/data"]

CMD ["pnpm", "--filter", "@pico/core", "start"]
