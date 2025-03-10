# Stage 1: Generate package-lock.json
FROM node:23-alpine AS dependencies
WORKDIR /app
COPY ../package.json .
RUN npm install --package-lock-only
RUN npm install --omit=dev

# Stage 2: Build the application
FROM node:23-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY ../src ./src

# Stage 3: Create the production image with s6-overlay
FROM node:23-alpine
WORKDIR /app

# Install s6-overlay
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG S6_OVERLAY_ARCH=x86_64

# Switch to root to install dependencies and set up s6
USER root

# Install required packages
RUN apk add --no-cache shadow curl xz tar

# Download and install s6-overlay
RUN curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_OVERLAY_ARCH}.tar.xz | tar -Jxpf - -C /

# Create abc user for PUID/PGID support
RUN addgroup -g 1000 abc && \
    adduser -u 1000 -G abc -h /home/abc -s /bin/sh -D abc && \
    mkdir -p /config && \
    chown -R abc:abc /config

# Copy application files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
RUN chown -R abc:abc /app

# Copy s6-overlay configuration
COPY root/ /

# Make scripts executable
RUN chmod -R +x /etc/cont-init.d && \
    chmod -R +x /etc/services.d

VOLUME /config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]