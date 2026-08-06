# ADR 0122 Y1. Pinned by digest, with the tag kept as a comment: a tag says
# what an image was called, a digest says which bytes were built against.
FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

FROM base AS build

# The whole workspace is installed from the lockfile in one step. Listing single
# package manifests would cache better, but that list silently drifts whenever a
# workspace package is added, which is exactly how packages/identity and
# packages/vault once went missing from the image.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Reinstall production dependencies only, before the runtime stage copies
# node_modules: the TypeScript compiler, vitest and tsx are build tools and must
# not ship in a published image. Pruning in place would drop their links but
# leave the packages in the virtual store, so the modules directories are
# rebuilt from the pnpm store, which stays behind in this stage. The purge
# confirmation is answered up front because a build has no one to ask.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --offline --prod --config.confirmModulesPurge=false

FROM base AS runtime

COPY --from=build /app /app
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
