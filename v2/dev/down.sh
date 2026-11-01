#!/usr/bin/env bash
# Stop the local test environment. Pass -v to also delete its volumes.
cd "$(dirname "$0")" && docker compose down "$@"
