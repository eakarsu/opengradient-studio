#!/usr/bin/env bash
set -euo pipefail
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22.12+ and npm are required. Install Node.js, then run ./start.sh again."
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<12)){console.error("Node.js 22.12+ is required.");process.exit(1)}'

mkdir -p .runtime
if [[ ! -f package-lock.json ]]; then
  npm install --no-fund --no-audit
fi
dependency_hash="$(node -e 'const fs=require("fs"),crypto=require("crypto");console.log(crypto.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex"))')"
if [[ ! -d node_modules || ! -f .runtime/dependencies || "$(cat .runtime/dependencies)" != "$dependency_hash" ]]; then
  echo "Installing application dependencies…"
  npm ci --no-fund --no-audit
  printf '%s' "$dependency_hash" > .runtime/dependencies
fi

if [[ "${USE_DOCKER:-0}" == "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for USE_DOCKER=1. Start Docker or use an existing PostgreSQL server."
    exit 1
  fi
  if [[ -z "${APP_DB_PASSWORD:-}" ]]; then
    if [[ ! -f .runtime/docker-password ]]; then
      (umask 077; node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))' > .runtime/docker-password)
    fi
    APP_DB_PASSWORD="$(cat .runtime/docker-password)"
    export APP_DB_PASSWORD
  fi
  docker compose up -d --wait postgres
  export PGHOST=127.0.0.1 PGPORT="${DOCKER_PGPORT:-55432}" PGUSER=opengradient PGPASSWORD="$APP_DB_PASSWORD" PGDATABASE=opengradient_studio
  # An empty shell value prevents dotenv from overriding Docker mode with .env.
  export DATABASE_URL=''
fi

echo "Preparing model execution runtime…"
npm run runtime:setup
echo "Preparing PostgreSQL…"
npm run db:setup
echo "Building OpenGradient Studio…"
npm run build
echo "Starting OpenGradient Studio. Press Ctrl+C to stop the app."
exec node server/index.mjs
