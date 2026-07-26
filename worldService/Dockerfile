# The single-writer World Service (todo.md §14.2). One always-on container that
# owns the world in memory, serializes every mutation, and snapshots to a volume.
#
# Build:  docker build -f worldService/Dockerfile -t woe-world-service .
# Run:    docker run -p 4000:4000 -v woe_data:/data \
#           -e WORLD_SERVICE_SECRET=change-me -e WORLD_SERVICE_DATA_DIR=/data woe-world-service
#
# Runs anywhere Docker does (Fly.io, Railway, Render, a VM). See README.md.

FROM node:22-slim
WORKDIR /app

RUN corepack enable

# Install deps (tsx + engine deps) against the frozen lockfile.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# The service imports the shared engine (lib/) + entrypoint (worldService/).
COPY . .

ENV NODE_ENV=production \
    PORT=4000 \
    WORLD_SERVICE_DATA_DIR=/data

# Durable state lives on the mounted volume.
VOLUME /data
EXPOSE 4000

# Graceful stop: the service snapshots on SIGTERM before exiting.
STOPSIGNAL SIGTERM

CMD ["pnpm", "world-service"]
