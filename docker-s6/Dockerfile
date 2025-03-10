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

# Install s6-overlay
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG S6_OVERLAY_ARCH=x86_64

# Switch to root to install dependencies and set up s6
USER root

# Install required packages
RUN apk add --no-cache shadow curl xz tar bash

# Download and install s6-overlay
RUN curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_OVERLAY_ARCH}.tar.xz | tar -Jxpf - -C /

# Debug: Show directory structure after s6 installation
RUN find / -path "*/s6*" -type d | sort

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

# Copy your scripts with an explicit path
RUN mkdir -p /etc/services.d/trafegodns && mkdir -p /etc/cont-init.d

# Create initialization scripts with explicit content
COPY docker-s6/root/etc/cont-init.d/10-adduser /etc/cont-init.d/10-adduser
COPY docker-s6/root/etc/cont-init.d/20-config /etc/cont-init.d/20-config
COPY docker-s6/root/etc/services.d/trafegodns/run /etc/services.d/trafegodns/run
COPY docker-s6/root/etc/services.d/trafegodns/finish /etc/services.d/trafegodns/finish

# Debug: Show script files
RUN ls -la /etc/cont-init.d/ && \
    ls -la /etc/services.d/trafegodns/

# Make scripts executable and fix line endings
RUN chmod +x /etc/cont-init.d/* && \
    chmod +x /etc/services.d/trafegodns/* && \
    sed -i -e 's/\r$//' /etc/cont-init.d/* && \
    sed -i -e 's/\r$//' /etc/services.d/trafegodns/*

VOLUME /config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]