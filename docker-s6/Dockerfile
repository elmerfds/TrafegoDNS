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
RUN apk add --no-cache shadow curl xz tar

# Download and install s6-overlay
RUN curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz | tar -Jxpf - -C / && \
    curl -sSL https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_OVERLAY_ARCH}.tar.xz | tar -Jxpf - -C /

# Create abc user for PUID/PGID support
RUN addgroup -g 1001 abc && \
    adduser -u 1001 -G abc -h /home/abc -s /bin/sh -D abc && \
    mkdir -p /config && \
    chown -R abc:abc /config

# Copy application files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
RUN chown -R abc:abc /app

# Instead of copying files, create them directly
RUN mkdir -p /etc/cont-init.d /etc/services.d/trafegodns

# Create init scripts with correct content
RUN echo '#!/usr/bin/with-contenv sh\n\nPUID=${PUID:-1001}\nPGID=${PGID:-1001}\n\necho "-------------------------------------"\necho "User/Group Information"\necho "-------------------------------------"\necho "User uid:    $(id -u abc)"\necho "User gid:    $(id -g abc)"\necho "Changing to: uid:$PUID gid:$PGID"\necho "-------------------------------------"\n\n# Change UID and GID of abc user\ngroupmod -o -g "$PGID" abc\nusermod -o -u "$PUID" abc\n\n# Handle Docker socket permission if present\nif [ -e /var/run/docker.sock ]; then\n  DOCKER_GID=$(stat -c '\''%g'\'' /var/run/docker.sock)\n  echo "Docker socket GID: $DOCKER_GID"\n  \n  # Create docker group with the correct GID\n  if getent group $DOCKER_GID > /dev/null; then\n    # Group with this GID already exists\n    DOCKER_GROUP=$(getent group $DOCKER_GID | cut -d: -f1)\n    echo "Group with GID $DOCKER_GID already exists as $DOCKER_GROUP"\n  else\n    # Create new group\n    addgroup -g $DOCKER_GID docker-external\n    DOCKER_GROUP="docker-external"\n    echo "Created docker-external group with GID: $DOCKER_GID"\n  fi\n  \n  # Add abc user to the docker group\n  echo "Adding abc user to $DOCKER_GROUP group"\n  addgroup abc $DOCKER_GROUP\n  \n  # Check permissions\n  echo "Docker socket permissions:"\n  ls -la /var/run/docker.sock\n  \n  echo "Group membership for abc:"\n  id abc\nfi\n\n# Fix permissions\nchown -R abc:abc \\\n    /app \\\n    /config\n\necho "PUID/PGID setup complete"' > /etc/cont-init.d/10-adduser

RUN echo '#!/usr/bin/with-contenv sh\n\n# Set up DNS records file\nif [ ! -f /config/dns-records.json ]; then\n  echo "Creating initial DNS records file"\n  echo "[]" > /config/dns-records.json\n  chown abc:abc /config/dns-records.json\nfi\n\n# Create symlink from config to app directory\nif [ -L /app/dns-records.json ]; then\n  rm /app/dns-records.json\nfi\nln -sf /config/dns-records.json /app/dns-records.json\nchown -h abc:abc /app/dns-records.json\n\necho "TráfegoDNS configuration setup complete"' > /etc/cont-init.d/20-config

RUN echo '#!/usr/bin/with-contenv sh\n\necho "Starting TráfegoDNS..."\ncd /app\nexec s6-setuidgid abc node src/app.js' > /etc/services.d/trafegodns/run

RUN echo '#!/usr/bin/with-contenv sh\n\necho "TráfegoDNS has exited with status $?. Restarting..."\nexit 0' > /etc/services.d/trafegodns/finish

# Make scripts executable
RUN chmod +x /etc/cont-init.d/* && \
    chmod +x /etc/services.d/trafegodns/*

VOLUME /config

# Set entrypoint to s6-overlay init
ENTRYPOINT ["/init"]