#!/bin/sh
#
# Pull-based deploy, run from cron on the production server:
#
#   */2 * * * * flock -n /tmp/sttm-deploy.lock /home/sttm/sttm-server/scripts/deploy.sh >> /home/sttm/sttm-server/deploy.log 2>&1
#
# CI only builds the image and pushes it to ghcr — port 22 is closed, so
# nothing reaches in from outside. This is the other half of the deploy.
set -e

# The compose file and .env live one level up, next to this script's directory.
cd "$(dirname "$0")/.."

# `pull -q` is silent unless a new image is actually fetched, so the log stays
# empty on the runs where nothing changed.
docker compose -f docker-compose.prod.yml pull -q

# Deliberately no --force-recreate: compose only recreates the container when
# the image digest changed, so this is a no-op between releases instead of a
# restart every couple of minutes.
docker compose -f docker-compose.prod.yml up -d

docker image prune -f >/dev/null
