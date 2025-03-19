# Multi-stage build for TráfegoDNS

# Stage 1: Generate package-lock.json
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json .
RUN npm install --package-lock-only
RUN npm install --omit=dev

# Stage 2: Build the frontend/Web UI
FROM node:20-alpine AS webui-build
WORKDIR /app
COPY src/webui/package.json ./
RUN npm install
COPY src/webui/ ./
RUN npm run build

# Stage 3: Build the application
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src

# Stage 4: Final image
FROM node:20-alpine
WORKDIR /app

# Install required packages
RUN apk add --no-cache bash shadow curl

# Create non-root user
RUN addgroup -g 1001 abc && \
    adduser -u 1001 -G abc -h /home/abc -s /bin/bash -D abc && \
    mkdir -p /config && \
    chown -R abc:abc /config

# Copy application files from build stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src

# Copy the web UI build files
COPY --from=webui-build /app/build ./src/webui/build

# Create data directory for record tracking
RUN mkdir -p /config/data && \
    chown -R abc:abc /config

# Set permissions
RUN chown -R abc:abc /app

# Set up volumes
VOLUME /config

# Expose port for web UI
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production \
    ENABLE_WEB_UI=true \
    WEB_UI_PORT=8080

# Create entrypoint script
RUN echo '#!/bin/bash\n\
# Set user based on PUID/PGID env vars\n\
PUID=${PUID:-1001}\n\
PGID=${PGID:-1001}\n\
\n\
echo "Setting up user with PUID=$PUID and PGID=$PGID"\n\
groupmod -o -g "$PGID" abc\n\
usermod -o -u "$PUID" abc\n\
\n\
# Handle Docker socket permission if present\n\
if [ -e /var/run/docker.sock ]; then\n\
  DOCKER_GID=$(stat -c "%g" /var/run/docker.sock)\n\
  echo "Docker socket is present with GID $DOCKER_GID"\n\
  \n\
  # Create docker group with the correct GID if it doesn'\''t exist\n\
  if getent group $DOCKER_GID > /dev/null; then\n\
    DOCKER_GROUP=$(getent group $DOCKER_GID | cut -d: -f1)\n\
    echo "Group with GID $DOCKER_GID already exists as $DOCKER_GROUP"\n\
  else\n\
    addgroup -g $DOCKER_GID docker-external\n\
    DOCKER_GROUP="docker-external"\n\
    echo "Created docker-external group with GID: $DOCKER_GID"\n\
  fi\n\
  \n\
  # Add abc user to the docker group\n\
  echo "Adding abc user to $DOCKER_GROUP group"\n\
  addgroup abc $DOCKER_GROUP\n\
fi\n\
\n\
# Fix permissions\n\
chown -R abc:abc /app /config\n\
\n\
echo "Starting TráfegoDNS..."\n\
exec su-exec abc node src/app.js\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

# Install su-exec for dropping privileges
RUN apk add --no-cache su-exec

# Run with the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]