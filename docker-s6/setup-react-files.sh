#!/bin/bash

# Create directory structure for React app public files
mkdir -p webui/public

# Create index.html
cat > webui/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="TráfegoDNS Web UI - Manage DNS records for your Traefik containers"
    />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <title>TráfegoDNS</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF

# Create manifest.json
cat > webui/public/manifest.json << 'EOF'
{
  "short_name": "TráfegoDNS",
  "name": "TráfegoDNS Web UI",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#3498db",
  "background_color": "#ffffff"
}
EOF

# Create robots.txt
cat > webui/public/robots.txt << 'EOF'
# https://www.robotstxt.org/robotstxt.html
User-agent: *
Disallow:
EOF

# Create a simple favicon.ico placeholder
# This is just a placeholder - you might want to replace it with a proper favicon
touch webui/public/favicon.ico

# Create placeholder images for the manifest
touch webui/public/logo192.png
touch webui/public/logo512.png

echo "React public directory structure has been created successfully!"
echo "You can now build the Docker image with:"
echo "docker build -t trafegodns -f docker-s6/Dockerfile ."
