# Stage 1: Generate package-lock.json
FROM node:23-alpine AS dependencies
WORKDIR /app
COPY package.json .
RUN npm install --package-lock-only
RUN npm install --omit=dev

# Stage 2: Build the application
FROM node:23-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src

# Stage 3: Create the production image with s6-overlay
FROM node:23-alpine
WORKDIR /app

# Install s6-overlay v3
ARG S6_OVERLAY_VERSION=3.1.5.0

# Switch to root for installation
USER root

# Install required packages
RUN apk add --no-cache shadow curl xz tar bash

# Download and install s6-overlay
RUN curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz | tar -Jxpf - -C /

# Create abc user for PUID/PGID support
RUN addgroup -g 1001 abc && \
    adduser -u 1001 -G abc -h /home/abc -s /bin/bash -D abc && \
    mkdir -p /config && \
    chown -R abc:abc /config

# Copy application files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
RUN chown -R abc:abc /app

# Create necessary directories for s6-overlay scripts
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns

# Copy your prepared scripts
COPY docker-s6/root/ /

# Update shebang line in scripts to use command/with-contenv bash
RUN sed -i '1s#^#!/usr/bin/with-contenv.*##!/command/with-contenv bash#' /etc/cont-init.d/* && \
    sed -i '1s#^#!/usr/bin/with-contenv.*##!/command/with-contenv bash#' /etc/services.d/trafegodns/*

# Make scripts executable and fix line endings
RUN chmod +x /etc/cont-init.d/* /etc/services.d/trafegodns/* && \
    sed -i 's/\r$//' /etc/cont-init.d/* /etc/services.d/trafegodns/*

# Configure volumes
VOLUME /config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]