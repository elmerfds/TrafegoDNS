# docker-s6/Dockerfile
# Enhanced Dockerfile for TráfegoDNS with Web UI support

# Stage 1: Generate package-lock.json
FROM node:23-alpine AS dependencies
WORKDIR /app
COPY package.json .
RUN npm install --package-lock-only
RUN npm install --omit=dev

# Stage 2: Build the frontend
FROM node:23-alpine AS webui-build
WORKDIR /app

# Copy the setup script and execute it
# No need to chmod locally - we set permissions in the container
COPY setup-react-files.sh /app/
RUN chmod +x /app/setup-react-files.sh && /app/setup-react-files.sh

# Copy package.json first to leverage Docker caching
COPY src/webui/package.json /app/webui/
WORKDIR /app/webui
RUN npm install

# Copy source files
COPY src/webui/ /app/webui/src/

# Run the build
RUN npm run build

# Stage 3: Build the application
FROM node:23-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src

# Stage 4: Create the production image with s6-overlay
FROM node:23-alpine
WORKDIR /app

# Install s6-overlay v3
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG TARGETARCH

# Switch to root for installation
USER root

# Install required packages
RUN apk add --no-cache shadow curl xz tar bash

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

# Copy the web UI build files
COPY --from=webui-build /app/webui/build ./webui/build

RUN chown -R abc:abc /app

# Create necessary directories for s6-overlay scripts
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns /etc/services.d/webui

# Copy your prepared scripts
COPY docker-s6/root/ /

# Update the scripts to use command/with-contenv and fix any issues
RUN for script in /etc/cont-init.d/* /etc/services.d/trafegodns/* /etc/services.d/webui/*; do \
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
RUN head -1 /etc/cont-init.d/* /etc/services.d/trafegodns/* /etc/services.d/webui/*

# Configure volumes
VOLUME /config

# Expose ports
EXPOSE 8080

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]