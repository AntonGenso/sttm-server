#!/bin/sh
#
# Manual deploy, for when you want to roll out without pushing to main — or
# when GitHub Actions is unavailable. The pipeline normally does this itself
# over ssh at the end of .github/workflows/build.yaml.
#
#   cd ~/sttm-server && ./scripts/deploy.sh
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
