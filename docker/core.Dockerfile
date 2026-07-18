FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/sync/package.json packages/sync/package.json
COPY packages/vault/package.json packages/vault/package.json

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm build
RUN mkdir -p /data

EXPOSE 3100

ENV NODE_ENV=production
ENV PICO_HOST=0.0.0.0
ENV PICO_PORT=3100
ENV PICO_DATABASE_PATH=/data/pico.sqlite

VOLUME ["/data"]

# Home Assistant mounts /data at runtime. Running as the image's non-root
# node user makes that mounted directory read-only for SQLite on some add-on
# installations. Keep the foundation add-on root-based until startup can safely
# prepare /data ownership and drop privileges.
CMD ["node", "apps/core/dist/addon-entrypoint.js"]
