#!/bin/bash
set -e

echo "Building Angular frontend..."
cd client && npm run build

echo "Building NestJS backend..."
cd ..
npm run build

echo "Copying Angular build to NestJS dist..."
mkdir -p dist/client
cp -r client/dist/client/browser/* dist/client/

echo "Production build complete!"
echo "Run: NODE_ENV=production npm run start:prod"
