# TrafegoDNS v2 Dockerfile
# Multi-stage build for Node.js + Web UI

# ============================================
# Stage 1: Build dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Build Web UI
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

# ============================================
# Stage 3: Production image
# ============================================
FROM node:20-alpine AS production

# Install s6-overlay with architecture detection
ARG S6_OVERLAY_VERSION=3.1.6.2
ARG TARGETARCH

RUN apk add --no-cache curl xz \
    && case "${TARGETARCH}" in \
        "amd64")  S6_ARCH="x86_64"  ;; \
        "arm64")  S6_ARCH="aarch64" ;; \
        "arm")    S6_ARCH="armhf"   ;; \
        *)        S6_ARCH="${TARGETARCH}" ;; \
    esac \
    && curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / \
    && curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz | tar -Jxpf - -C /

# Create abc user for PUID/PGID support (use different IDs to avoid conflict with node user)
RUN addgroup -g 1001 abc \
    && adduser -D -u 1001 -G abc abc

WORKDIR /app

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

# Copy package.json for version info
COPY package.json ./

# Copy s6 service files
COPY docker-s6/root /

# Create config directory
RUN mkdir -p /config/data \
    && chown -R abc:abc /config

# Environment variables
ENV NODE_ENV=production \
    DATA_DIR=/config/data \
    LOG_LEVEL=info \
    API_HOST=0.0.0.0 \
    API_PORT=3000

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use s6-overlay as entrypoint
ENTRYPOINT ["/init"]
