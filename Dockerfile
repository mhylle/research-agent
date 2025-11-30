# ================================
# Stage 1: Backend Builder
# ================================
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy package files for backend
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy backend source code
COPY src ./src

# Build the NestJS application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ================================
# Stage 2: Frontend Builder
# ================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./
COPY client/tsconfig*.json ./
COPY client/angular.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source code
COPY client/src ./src
COPY client/public ./public

# Build Angular application for production
RUN npm run build -- --configuration production

# ================================
# Stage 3: Production Runtime
# ================================
FROM node:20-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built backend from backend-builder stage
COPY --from=backend-builder --chown=nestjs:nodejs /app/dist ./dist

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder --chown=nestjs:nodejs /app/client/dist/client/browser ./client/dist/client/browser

# Copy migrations
COPY --chown=nestjs:nodejs src/migrations ./src/migrations

# Copy necessary config files
COPY --chown=nestjs:nodejs nest-cli.json ./
COPY --chown=nestjs:nodejs tsconfig*.json ./

# Create logs directory
RUN mkdir -p logs && chown -R nestjs:nodejs logs

# Create data directory for screenshots
RUN mkdir -p data/screenshots && chown -R nestjs:nodejs data

# Switch to non-root user
USER nestjs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "dist/src/main.js"]
