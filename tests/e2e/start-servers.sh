#!/bin/bash
# Start servers for E2E testing
# Location: /home/mnh/projects/research-agent/tests/e2e/start-servers.sh

set -e

echo "======================================"
echo "Starting E2E Test Environment"
echo "======================================"

# Navigate to project root
cd "$(dirname "$0")/../.."

echo ""
echo "[1/4] Starting PostgreSQL..."
docker-compose up -d postgres

echo ""
echo "[2/4] Waiting for PostgreSQL to be ready..."
sleep 3
docker-compose exec -T postgres pg_isready -U research_agent || echo "Warning: PostgreSQL may not be ready"

echo ""
echo "[3/4] Running database migrations..."
npm run migration:run

echo ""
echo "[4/4] Starting backend and frontend servers..."
echo "Backend will start on: http://localhost:3000"
echo "Frontend will start on: http://localhost:4200"
echo ""
echo "Press Ctrl+C to stop servers"
echo "======================================"
echo ""

# Start both servers
npm run dev
