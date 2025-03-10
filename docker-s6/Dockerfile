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

# Create script content directly - easier to debug
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns

# Create the init scripts directly
RUN echo '#!/command/with-contenv bash' > /etc/cont-init.d/10-adduser && \
    echo 'PUID=${PUID:-1001}' >> /etc/cont-init.d/10-adduser && \
    echo 'PGID=${PGID:-1001}' >> /etc/cont-init.d/10-adduser && \
    echo 'echo "User/Group IDs"' >> /etc/cont-init.d/10-adduser && \
    echo 'echo "User uid: $(id -u abc) gid: $(id -g abc)"' >> /etc/cont-init.d/10-adduser && \
    echo 'echo "Setting uid:$PUID gid:$PGID"' >> /etc/cont-init.d/10-adduser && \
    echo 'groupmod -o -g "$PGID" abc' >> /etc/cont-init.d/10-adduser && \
    echo 'usermod -o -u "$PUID" abc' >> /etc/cont-init.d/10-adduser && \
    echo 'if [ -e /var/run/docker.sock ]; then' >> /etc/cont-init.d/10-adduser && \
    echo '  DOCKER_GID=$(stat -c "%g" /var/run/docker.sock)' >> /etc/cont-init.d/10-adduser && \
    echo '  echo "Docker socket GID: $DOCKER_GID"' >> /etc/cont-init.d/10-adduser && \
    echo '  addgroup -g $DOCKER_GID docker-external 2>/dev/null || true' >> /etc/cont-init.d/10-adduser && \
    echo '  addgroup abc docker-external' >> /etc/cont-init.d/10-adduser && \
    echo 'fi' >> /etc/cont-init.d/10-adduser && \
    echo 'chown -R abc:abc /app /config' >> /etc/cont-init.d/10-adduser

RUN echo '#!/command/with-contenv bash' > /etc/cont-init.d/20-config && \
    echo 'if [ ! -f /config/dns-records.json ]; then' >> /etc/cont-init.d/20-config && \
    echo '  echo "Creating initial DNS records file"' >> /etc/cont-init.d/20-config && \
    echo '  echo "[]" > /config/dns-records.json' >> /etc/cont-init.d/20-config && \
    echo '  chown abc:abc /config/dns-records.json' >> /etc/cont-init.d/20-config && \
    echo 'fi' >> /etc/cont-init.d/20-config && \
    echo 'if [ -L /app/dns-records.json ]; then' >> /etc/cont-init.d/20-config && \
    echo '  rm /app/dns-records.json' >> /etc/cont-init.d/20-config && \
    echo 'fi' >> /etc/cont-init.d/20-config && \
    echo 'ln -sf /config/dns-records.json /app/dns-records.json' >> /etc/cont-init.d/20-config && \
    echo 'chown -h abc:abc /app/dns-records.json' >> /etc/cont-init.d/20-config

RUN echo '#!/command/with-contenv bash' > /etc/services.d/trafegodns/run && \
    echo 'cd /app' >> /etc/services.d/trafegodns/run && \
    echo 'echo "Starting TráfegoDNS..."' >> /etc/services.d/trafegodns/run && \
    echo 'exec s6-setuidgid abc node src/app.js' >> /etc/services.d/trafegodns/run

RUN echo '#!/command/with-contenv bash' > /etc/services.d/trafegodns/finish && \
    echo 'echo "TráfegoDNS exited with status $?"' >> /etc/services.d/trafegodns/finish && \
    echo 'exit 0' >> /etc/services.d/trafegodns/finish

# Make scripts executable
RUN chmod +x /etc/cont-init.d/* /etc/services.d/trafegodns/*

# Configure volumes
VOLUME /config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]