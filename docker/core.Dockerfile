FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/sync/package.json packages/sync/package.json

# A lockfile is not committed yet, so this intentionally remains non-frozen.
# Switch to --frozen-lockfile as soon as pnpm-lock.yaml is committed.
RUN pnpm install --no-frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm build
RUN pnpm deploy --filter @pico/core --prod /runtime

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PICO_HOST=0.0.0.0
ENV PICO_PORT=3100
ENV PICO_DATABASE_PATH=/data/pico.sqlite

WORKDIR /app

COPY --from=build /runtime ./

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 3100
VOLUME ["/data"]

CMD ["node", "dist/index.js"]
