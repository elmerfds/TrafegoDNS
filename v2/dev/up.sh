#!/usr/bin/env bash
# Build and start the local test environment, then register the BIND9 provider.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${TRAFEGO_DEV_PORT:-3170}"
API="http://127.0.0.1:${PORT}/api/v1"

docker compose up -d --build
echo "Waiting for TrafegoDNS..."
for _ in $(seq 1 60); do curl -sf "$API/health" >/dev/null && break; sleep 2; done

TOKEN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"DevPassword123!"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if ! curl -sf "$API/providers" -H "Authorization: Bearer $TOKEN" | grep -q '"name":"bind9-test"'; then
  curl -sf -X POST "$API/providers" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
    "name": "bind9-test", "type": "rfc2136", "isDefault": true,
    "credentials": {"server": "bind9", "port": "53", "zone": "test.local",
      "keyName": "trafego-key", "keyAlgorithm": "hmac-sha256",
      "keySecret": "dGVzdC1rZXktc2VjcmV0LWZvci10cmFmZWdvZG5zLXRlc3Rpbmc="}
  }' >/dev/null
  echo "Registered bind9-test provider; restarting (providers load at startup)"
  docker compose restart trafegodns
  for _ in $(seq 1 60); do curl -sf "$API/health" >/dev/null && break; sleep 2; done
fi
echo "Ready: $API (admin / DevPassword123!)"
