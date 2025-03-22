# Stage 1: Build the WebUI
FROM node:20-alpine AS webui-build
WORKDIR /app
COPY webui/package*.json ./webui/
WORKDIR /app/webui
RUN npm install
COPY webui/ ./
RUN mkdir -p dist
# We're creating an empty public folder as a fallback
RUN mkdir -p public
# Create a simple index.html if build fails
RUN echo '<html><body><h1>TráfegoDNS API</h1><p>Web UI not available. API is accessible at /api</p></body></html>' > public/index.html
# Try to build, but don't fail if it errors
RUN npm run build || cp -r public dist/

# Stage 2: Generate package-lock.json
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json .
RUN npm install --package-lock-only
RUN npm install --omit=dev

# Stage 3: Build the application
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
COPY --from=webui-build /app/webui/dist ./webui/dist

# Stage 4: Create the production image with s6-overlay
FROM node:20-alpine
WORKDIR /app

# Install s6-overlay v3
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG TARGETARCH

# Switch to root for installation
USER root

# Install required packages - added python3, make, g++, sqlite-dev for bcrypt and sqlite3
# Added wget for health check
RUN apk add --no-cache shadow curl xz tar bash python3 make g++ sqlite-dev wget

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
COPY --from=build /app/webui/dist ./webui/dist
RUN chown -R abc:abc /app

# Create necessary directories for s6-overlay scripts
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns

# Copy your prepared scripts
COPY docker-s6/root/ /

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

# Create auth database directory
RUN mkdir -p /config/data && \
    chown -R abc:abc /config/data

# Set default environment variables
ENV NODE_ENV=production \
    API_PORT=3000 \
    LOG_LEVEL=INFO \
    AUTH_ENABLED=true \
    JWT_EXPIRES_IN=24h

# Expose the API port
EXPOSE 3000

# Configure volumes for persistent data
VOLUME /config

# Add health check using the provided script
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD /etc/services.d/trafegodns/check

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]