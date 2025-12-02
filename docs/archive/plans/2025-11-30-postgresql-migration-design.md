# PostgreSQL Migration Design
**Date**: 2025-11-30
**Author**: System Design
**Status**: Approved

## Overview

Migrate research_agent from SQLite to PostgreSQL with Docker containerization for production readiness. This design uses a 3-phase incremental approach to minimize risk and enable testing at each step.

## Current State

**Database**: SQLite with better-sqlite3 driver
- File location: `./data/logs/research.db`
- TypeORM with `synchronize: true` (auto-schema)
- Three entities: LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity

**Infrastructure**: No containerization
- NestJS backend on port 3000
- External Ollama server on port 11434
- Angular frontend served statically

## Requirements

1. **Primary Driver**: Production readiness
2. **Data Strategy**: Start fresh (no migration from SQLite)
3. **Docker Scope**: Development + Production environments
4. **Ollama Integration**: Keep external (not containerized)

## Design Decisions

### Database Selection: PostgreSQL 16

**Rationale**:
- Production-grade RDBMS with ACID compliance
- Superior concurrent query handling vs. SQLite
- Native JSONB support for event data
- UUID support via uuid-ossp extension
- Industry standard for NestJS applications

**Port Configuration**: 5433 (host) → 5432 (container)
- Avoids conflicts with other PostgreSQL instances
- Standard internal PostgreSQL port maintained

### Incremental Migration Strategy

**Phase 1**: PostgreSQL + Docker Compose (Development)
- Get PostgreSQL running with auto-sync
- Validate entity compatibility
- Low risk, quick feedback

**Phase 2**: TypeORM Migrations
- Switch from auto-sync to migrations
- Production-safe schema management
- Enable rollback capability

**Phase 3**: Production Dockerfile
- Multi-stage build for optimized images
- Environment-based configuration
- Production deployment ready

## Phase 1: PostgreSQL + Docker Compose Setup

### Docker Compose Configuration

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: research_agent_postgres
    restart: unless-stopped
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: ${DB_USERNAME:-research_agent}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-dev_password}
      POSTGRES_DB: ${DB_DATABASE:-research_agent_db}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U research_agent"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - research_agent_network

volumes:
  postgres_data:
    driver: local

networks:
  research_agent_network:
    driver: bridge
```

**Key Features**:
- Alpine-based image for minimal footprint
- Named volume for data persistence
- Health checks for connection readiness
- Isolated network for service communication
- Environment variable defaults for quick startup

### PostgreSQL Initialization

**File**: `docker/init-db.sql`

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostgreSQL-specific setup completes here
```

### Environment Configuration

**File**: `.env` (gitignored)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=research_agent
DB_PASSWORD=dev_password_change_in_prod
DB_DATABASE=research_agent_db

# Application
NODE_ENV=development
```

**File**: `.env.example` (committed template)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=research_agent
DB_PASSWORD=your_secure_password_here
DB_DATABASE=research_agent_db

# Application
NODE_ENV=development
```

### Dependencies Update

**File**: `package.json`

```json
{
  "dependencies": {
    "pg": "^8.11.0",
    // Remove: "better-sqlite3": "^12.4.0"
  }
}
```

### TypeORM Configuration

**File**: `src/app.module.ts`

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.get('DB_HOST'),
    port: configService.get('DB_PORT'),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_DATABASE'),
    entities: [LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity],
    synchronize: configService.get('NODE_ENV') === 'development',
    logging: configService.get('NODE_ENV') === 'development',
  }),
}),
```

**Changes from SQLite**:
- `type`: 'better-sqlite3' → 'postgres'
- Connection params: file path → host/port/credentials
- Driver: better-sqlite3 → pg

### Git Configuration

**File**: `.gitignore` (additions)

```
# Environment variables
.env

# PostgreSQL data
data/postgres/
```

**File**: `.dockerignore`

```
node_modules
dist
.git
.env
data/
logs/
*.log
*.md
.vscode
```

### Development Workflow

**Start PostgreSQL**:
```bash
docker-compose up -d postgres
```

**View logs**:
```bash
docker-compose logs -f postgres
```

**Connect to database**:
```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db
```

**Stop services**:
```bash
docker-compose down
```

**Clean slate** (removes data):
```bash
docker-compose down -v
```

### Phase 1 Validation

1. Start PostgreSQL: `docker-compose up -d postgres`
2. Start NestJS app: `npm start`
3. Verify TypeORM connection logs show success
4. Test entity operations:
   - Create log entry via API
   - Create research result
   - Create evaluation record
5. Verify data persistence:
   - Stop app
   - Restart app
   - Confirm data remains
6. Manual inspection:
   - Connect via psql
   - Run `\dt` to list tables
   - Query tables to verify schema

**Success Criteria**: Application connects to PostgreSQL, creates tables automatically, and persists data across restarts.

## Phase 2: TypeORM Migrations

**Trigger**: After Phase 1 validation completes successfully

### Migration Setup

**Create directory**: `src/migrations/`

**Add scripts to package.json**:

```json
{
  "scripts": {
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli",
    "migration:generate": "npm run typeorm -- migration:generate",
    "migration:run": "npm run typeorm -- migration:run",
    "migration:revert": "npm run typeorm -- migration:revert"
  }
}
```

### Generate Initial Migration

```bash
npm run migration:generate -- src/migrations/InitialSchema
```

This creates a migration file with:
- `up()`: SQL to create tables, indexes, constraints
- `down()`: SQL to rollback changes

### Update TypeORM Configuration

**File**: `src/app.module.ts`

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.get('DB_HOST'),
    port: configService.get('DB_PORT'),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_DATABASE'),
    entities: [LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity],
    synchronize: false,  // Changed from true
    migrations: ['dist/migrations/*.js'],
    migrationsRun: true,  // Auto-run on startup
    logging: configService.get('NODE_ENV') === 'development',
  }),
}),
```

**Key Changes**:
- `synchronize: false` - Never auto-modify schema
- `migrations: ['dist/migrations/*.js']` - Migration file location
- `migrationsRun: true` - Auto-execute pending migrations on startup

### Phase 2 Validation

1. Build project: `npm run build`
2. Run migration: `npm run migration:run`
3. Verify migration table: `SELECT * FROM migrations;`
4. Test schema: Application starts without errors
5. Test rollback: `npm run migration:revert`
6. Re-run migration: `npm run migration:run`
7. Verify data operations: Create/read entities successfully

**Success Criteria**: Migrations run successfully, schema matches entities exactly, rollback works correctly.

## Phase 3: Production Docker Setup

**Trigger**: After Phase 2 validation completes successfully

### Multi-Stage Dockerfile

**File**: `Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose application port
EXPOSE 3000

# Start application
CMD ["node", "dist/main"]
```

**Build Optimization**:
- Multi-stage build reduces final image size
- Separate builder stage for TypeScript compilation
- Production stage contains only runtime dependencies
- No source code in production image

### Production Environment Variables

Production deployments will use externally hosted PostgreSQL (not Docker Compose).

**Required environment variables**:
```bash
DB_HOST=<production-postgres-host>
DB_PORT=5432
DB_USERNAME=<production-db-user>
DB_PASSWORD=<production-db-password>
DB_DATABASE=research_agent_db
NODE_ENV=production
```

### Build and Run

**Build production image**:
```bash
docker build -t research-agent:latest .
```

**Run production container**:
```bash
docker run -d \
  --name research-agent \
  -p 3000:3000 \
  -e DB_HOST=<postgres-host> \
  -e DB_PORT=5432 \
  -e DB_USERNAME=<username> \
  -e DB_PASSWORD=<password> \
  -e DB_DATABASE=research_agent_db \
  -e NODE_ENV=production \
  research-agent:latest
```

### Phase 3 Validation

1. Build Docker image successfully
2. Run container with production environment variables
3. Verify application starts and connects to external PostgreSQL
4. Test health endpoint: `curl http://localhost:3000/health`
5. Test API endpoints with production database
6. Verify migrations run on first startup
7. Test container restart behavior

**Success Criteria**: Production container runs successfully, connects to external PostgreSQL, executes migrations, serves requests.

## Entity Compatibility

### Existing Entities

All three entities work with PostgreSQL with zero code changes:

**LogEntryEntity**:
- UUID primary key: `@PrimaryGeneratedColumn('uuid')` supported via uuid-ossp
- JSON data column: SQLite JSON → PostgreSQL JSONB (superior performance)
- Timestamps: Work identically
- Indexes: Recreated automatically

**ResearchResultEntity**:
- Same UUID and JSON compatibility
- Foreign key relationships maintained
- Array columns: PostgreSQL native array support

**EvaluationRecordEntity**:
- Numeric columns: Better precision in PostgreSQL
- JSON metadata: JSONB with query capabilities
- Composite scoring: No changes needed

### Migration Considerations

**No breaking changes required**:
- TypeORM abstracts database differences
- Entity decorators remain identical
- Repository methods unchanged
- Query builders compatible

## Error Handling

### Connection Failures

TypeORM automatically retries PostgreSQL connections on startup. No additional error handling required.

### Migration Failures

PostgreSQL migrations are transactional by default:
- Migration failure triggers rollback
- Database remains in previous consistent state
- Error logged with details for debugging

### Environment Validation

Application startup validates required environment variables via NestJS ConfigModule:
- Missing variables cause startup failure
- Clear error messages indicate which variables are missing
- Prevents runtime errors from misconfiguration

## Testing Strategy

### Phase 1 Testing
- Connection establishment
- Entity CRUD operations
- Data persistence across restarts
- Manual schema inspection via psql

### Phase 2 Testing
- Migration generation
- Migration execution
- Schema verification
- Rollback capability
- Re-migration after rollback

### Phase 3 Testing
- Docker image build
- Container startup
- External database connection
- Health check verification
- API endpoint functionality

## Files to Create/Modify

### Create
- `docker-compose.yml` - Development PostgreSQL orchestration
- `docker/init-db.sql` - PostgreSQL initialization script
- `.env` - Local development secrets (gitignored)
- `.env.example` - Environment variable template
- `Dockerfile` - Production container definition
- `.dockerignore` - Docker build exclusions
- `src/migrations/` - Migration directory (Phase 2)
- `docs/plans/2025-11-30-postgresql-migration-design.md` - This document

### Modify
- `package.json` - Update dependencies and add migration scripts
- `src/app.module.ts` - Switch TypeORM from SQLite to PostgreSQL
- `.gitignore` - Add `.env` and `data/postgres/`

## Rollback Plan

If critical issues arise during any phase:

**Phase 1**:
- Stop Docker Compose
- Revert `package.json` and `app.module.ts` changes
- Remove PostgreSQL dependencies
- Restore SQLite configuration

**Phase 2**:
- Run `npm run migration:revert`
- Re-enable `synchronize: true`
- Continue with auto-sync temporarily

**Phase 3**:
- Use previous deployment method
- Continue using Phase 2 setup (migrations without Docker)

## Timeline Estimate

- **Phase 1**: 1-2 hours (Docker setup, configuration, testing)
- **Phase 2**: 1 hour (Migration setup and validation)
- **Phase 3**: 1 hour (Dockerfile creation and testing)

**Total**: ~3-4 hours for complete migration

## Success Metrics

1. **Phase 1**: Application runs on PostgreSQL with auto-sync
2. **Phase 2**: Migrations execute successfully without auto-sync
3. **Phase 3**: Production Docker image deploys and connects to external database
4. **Overall**: Zero data loss, all features functional, production-ready infrastructure

## References

- TypeORM Documentation: https://typeorm.io/
- PostgreSQL 16 Documentation: https://www.postgresql.org/docs/16/
- Docker Compose Specification: https://docs.docker.com/compose/
- NestJS Database Integration: https://docs.nestjs.com/techniques/database
