# Stage 1: Generate package-lock.json
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package.json .
RUN npm install --package-lock-only

# Install build dependencies for native modules
RUN apk add --no-cache python3 py3-pip make g++ sqlite-dev python3-dev py3-setuptools

# Install production dependencies including better-sqlite3
RUN npm install --omit=dev --build-from-source better-sqlite3

# Stage 2: Build the application
FROM node:18-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
COPY bin ./bin

# Stage 3: Create the production image with s6-overlay
FROM node:18-alpine
WORKDIR /app

# Install s6-overlay v3
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG TARGETARCH

# Switch to root for installation
USER root

# Install required packages
RUN apk add --no-cache shadow curl xz tar bash sqlite sqlite-dev python3 py3-pip make g++ python3-dev py3-setuptools

# Set architecture for s6-overlay download
RUN case "${TARGETARCH}" in \
        "amd64")  S6_ARCH="x86_64"  ;; \
        "386")    S6_ARCH="i686"    ;; \
        "arm64")  S6_ARCH="aarch64" ;; \
        "arm")    S6_ARCH="armhf"   ;; \
        *)        S6_ARCH="${TARGETARCH}" ;; \
    esac && \
    echo "Building for architecture: ${TARGETARCH}, s6-overlay arch: ${S6_ARCH}" && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz | tar -Jxpf - -C /

# Create abc user for PUID/PGID support
RUN addgroup -g 1001 abc && \
    adduser -u 1001 -G abc -h /home/abc -s /bin/bash -D abc && \
    mkdir -p /config && \
    chown -R abc:abc /config

# Copy application files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/bin ./bin
RUN chown -R abc:abc /app

# Create necessary directories for s6-overlay scripts
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns

# Copy your prepared scripts
COPY docker-s6/root/ /

# Create CLI directory structure
RUN mkdir -p /app/docker-s6/scripts /usr/local/bin /usr/bin

# Copy CLI setup scripts
COPY docker-s6/scripts/ /app/docker-s6/scripts/
RUN chmod +x /app/docker-s6/scripts/*.sh

# Set up CLI tool
RUN mkdir -p /usr/local/bin && \
    echo '#!/bin/sh' > /usr/local/bin/trafego && \
    echo 'exec node /app/bin/trafego "$@"' >> /usr/local/bin/trafego && \
    chmod +x /usr/local/bin/trafego

# Run the setup script
RUN /app/docker-s6/scripts/setup-cli.sh && \
    ln -sf /usr/local/bin/trafego /bin/trafego

# Update the scripts to use command/with-contenv and fix any issues
RUN for script in /etc/cont-init.d/* /etc/services.d/trafegodns/*; do \
    if [ -f "$script" ]; then \
        # Replace the shebang line correctly \
        sed -i '1s|^#!/usr/bin/with-contenv.*|#!/command/with-contenv bash|' "$script"; \
        # Make executable \
        chmod +x "$script"; \
        # Remove Windows line endings \
        sed -i 's/\r$//' "$script"; \
    fi; \
done

# Verify the scripts have the correct shebang
RUN head -1 /etc/cont-init.d/* /etc/services.d/trafegodns/*

# Configure volumes
VOLUME /config

# Expose API port
EXPOSE 3000

# Avoid timeout errors adjusting permissions during first run
ENV S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0

# CLI tool configuration
ENV CLI_TOKEN=trafegodns-cli
ENV API_URL=http://localhost:3000
ENV CONTAINER=true
ENV TRAFEGO_CLI=true
ENV CONFIG_DIR=/config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]