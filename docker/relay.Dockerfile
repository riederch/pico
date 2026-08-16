# Pico Relay - a queue with a door on it, and nothing else (ADR 0149).
#
# Deliberately not a Home Assistant add-on (ADR 0153): a relay has to stay
# reachable when one household's Supervisor is restarting, and an add-on's
# lifecycle belongs to that Supervisor.
#
# ADR 0122 Y1. Pinned by digest, with the tag kept as a comment: a tag says
# what an image was called, a digest says which bytes were built against.
FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

FROM base AS build

# The whole workspace, from the lockfile, in one step - the same reasoning as
# the Home image: a hand-kept list of package manifests caches better and
# drifts silently, which is how packages once went missing from an image.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --offline --prod --config.confirmModulesPurge=false

FROM base AS runtime

COPY --from=build /app /app
RUN mkdir -p /data

# The public surface. Five POST routes, and an unknown route answers exactly
# like a wrong method, so this port carries no map of itself (ADR 0149).
EXPOSE 3200

ENV NODE_ENV=production
ENV PICO_RELAY_HOST=0.0.0.0
ENV PICO_RELAY_PORT=3200
ENV PICO_RELAY_DATABASE_PATH=/data/relay.sqlite

# ADR 0153 PK3. The health listener is a second port on loopback, so the check
# below runs inside the container and the public surface stays five routes.
# It is deliberately NOT exposed; an operator who terminates health checks
# elsewhere sets PICO_RELAY_HEALTH_HOST and publishes it themselves.
ENV PICO_RELAY_HEALTH_HOST=127.0.0.1
ENV PICO_RELAY_HEALTH_PORT=3201

# PICO_RELAY_OPERATOR has no default and the process refuses to start without
# it. It is the hostname senders resolve to reach this relay, so a guessed one
# would issue addresses pointing at somebody else's machine.

VOLUME ["/data"]

# Node rather than curl, because curl is not in the slim image and adding a
# package to ask one question is a larger attack surface than the question.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PICO_RELAY_HEALTH_PORT||3201)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/relay/dist/main.js"]
