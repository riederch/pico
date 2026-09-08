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

# ADR 0154 RO1/RO7. Administration, on a third port and on loopback. Also not
# exposed: an operator administering from their own device publishes it
# deliberately, behind a transport they chose. A relay nobody has claimed
# writes a one-time claim code to its log; the Pico Client trades it for the
# operator credential. There is no CLI in this image, on purpose.
ENV PICO_RELAY_OPERATOR_HOST=127.0.0.1
ENV PICO_RELAY_OPERATOR_PORT=3202

VOLUME ["/data"]

# **No USER either, for the same reason the Home image gives** (Befund B90).
# A host mounts /data at runtime, and running as the image's non-root `node`
# user makes that mounted directory unwritable for SQLite on some
# installations. So this image stays root-based until startup can prepare
# /data ownership and drop privileges itself - the same condition, written
# here rather than inherited silently from the file next door.
#
# **No HEALTHCHECK instruction here, and that is a finding rather than an
# omission.** One was written, and building this file twice showed what it is
# worth: with `--format docker` the check lands in the image config, and with
# the OCI format - which is what a pushed multi-arch manifest uses - it is
# dropped with a warning, because the OCI image config has no field for it.
#
#     podman inspect pico-relay:oci    --format '{{json .HealthCheck}}'  -> null
#     podman inspect pico-relay:docker --format '{{json .HealthCheck}}'  -> {...}
#
# An instruction that survives in one format and vanishes in the one we
# publish is worse than none: it makes the image look like it carries a check
# it does not. Forcing Docker media types would bring it back and would trade
# a verifiable property for two build flags nobody here can test.
#
# So the check belongs to whoever runs the relay, which is where it was going
# to live anyway - compose, systemd and Kubernetes all declare their own and
# ignore the image's. What the image owes them is an endpoint, and it has one.
# The command, for any of those:
#
#     node -e "fetch('http://127.0.0.1:3201/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
#
# Node rather than curl, because curl is not in the slim image and adding a
# package to ask one question is a larger attack surface than the question.

CMD ["node", "apps/relay/dist/main.js"]
