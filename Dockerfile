# syntax=docker/dockerfile:1

# ============================================
# Base image with Bun and runtime dependencies
# ============================================
FROM oven/bun:1.3.7-alpine AS base

WORKDIR /app

# Install runtime dependencies (ffmpeg for audio processing)
RUN apk add --no-cache ffmpeg

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ nodejs npm

# Copy package files
COPY package.json bun.lock ./

# Install dependencies (ignore scripts to avoid Prisma/Bun issues)
RUN bun install --frozen-lockfile --ignore-scripts

# ============================================
# Prisma generation stage
# ============================================
FROM deps AS prisma

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client using npx (more stable than bun for this)
RUN npx --yes prisma@7.3.0 generate

# ============================================
# Builder stage
# ============================================
FROM prisma AS builder

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# ============================================
# Production stage
# ============================================
FROM base AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy built server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma schema for migrations
COPY --from=builder /app/prisma ./prisma

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

# Start server
CMD ["bun", "dist/index.js"]
