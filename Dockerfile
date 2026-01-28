# Bun base image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies into temp directory (cached)
FROM base AS install

# Install dev dependencies (needed for build + prisma generate)
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install production dependencies only
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build stage - use Node for Prisma CLI compatibility
FROM node:22-slim AS build
WORKDIR /app

# Install bun in build stage
RUN npm install -g bun

COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Generate Prisma client (using npx for WASM compatibility)
RUN npx prisma generate

# Build TypeScript
RUN bun run build

# Production image
FROM base AS release

# Install ffmpeg for audio conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies
COPY --from=install /temp/prod/node_modules node_modules

# Copy built application
COPY --from=build /app/dist dist

# Copy Prisma schema (needed for migrations)
COPY --from=build /app/prisma prisma

# Copy generated Prisma client
COPY --from=build /app/src/generated/prisma dist/generated/prisma

# Copy package.json (needed for bun to resolve modules)
COPY package.json .

# Create uploads directory
RUN mkdir -p uploads && chown bun:bun uploads

# Run as non-root user
USER bun

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Start the application
CMD ["bun", "run", "dist/index.js"]
