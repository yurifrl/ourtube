FROM oven/bun:1 AS base

WORKDIR /app

# Copy package files
COPY package.json ./
RUN bun install

# Copy source
COPY . .

# Build frontend
RUN bun run build

# Create data directory
RUN mkdir -p /data/store/videos

ENV OT_STORAGE_DIR=/data/store
ENV OT_PORT=3000
ENV OT_POLL_INTERVAL_SECONDS=300

EXPOSE 3000

CMD ["bun", "run", "src/server/index.ts"]
