# PostgreSQL Migration Phase 2: TypeORM Migrations Design

**Date**: 2025-11-30
**Author**: System Design
**Status**: Approved
**Prerequisites**: Phase 1 Complete (PostgreSQL + Docker Compose)

## Overview

Replace auto-sync schema management (`synchronize: true`) with explicit TypeORM migrations for production-safe schema changes with version control and rollback capability.

## Design Decisions

### Single Configuration Approach

**Decision**: Use single DataSource configuration for both CLI and runtime

**Rationale**:
- Eliminates duplication and maintenance burden
- Single source of truth for database configuration
- Simpler to maintain and understand
- Trade-off: Lose ConfigService integration, but gain simplicity

**Implementation**: `src/data-source.ts` used by both TypeORM CLI and NestJS runtime

### Manual Migration Execution

**Decision**: `migrationsRun: false` with manual npm scripts

**Rationale**:
- Explicit control over when migrations execute
- Can verify migrations before starting application
- Standard practice for production deployments
- Enables separation of migration from app startup
- Better for CI/CD pipelines

**Workflow**: `npm run migration:run && npm start`

## Architecture

### Core Components

1. **DataSource Configuration** (`src/data-source.ts`)
   - Single unified configuration
   - Used by both CLI and runtime
   - Loads environment variables directly

2. **Migration Directory** (`src/migrations/`)
   - Stores migration files
   - Version-controlled with git
   - Never edit existing migrations

3. **Migration Scripts** (`package.json`)
   - `migration:generate` - Create new migration
   - `migration:run` - Execute pending migrations
   - `migration:revert` - Rollback last migration

4. **Runtime Configuration** (`app.module.ts`)
   - Import and use DataSource
   - `migrationsRun: false` for manual control
   - Points to compiled migrations in `dist/`

### File Structure

```
src/
├── data-source.ts              # NEW: Unified DataSource config
├── migrations/                  # NEW: Migration directory
│   └── 1234567890-InitialSchema.ts
├── app.module.ts               # MODIFIED: Use DataSource
└── [entities remain unchanged]
```

## Configuration Details

### DataSource Configuration

**File**: `src/data-source.ts`

```typescript
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { LogEntryEntity } from './logging/entities/log-entry.entity';
import { ResearchResultEntity } from './research/entities/research-result.entity';
import { EvaluationRecordEntity } from './evaluation/entities/evaluation-record.entity';

config(); // Load .env

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  username: process.env.DB_USERNAME || 'research_agent',
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DATABASE || 'research_agent_db',
  entities: [LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity],
  migrations: [__dirname + '/migrations/*.ts'],
  logging: process.env.NODE_ENV === 'development',
});
```

**Key Features**:
- Direct environment variable access
- Entity imports for type safety
- Source migrations (*.ts) for CLI
- Development logging enabled

### Runtime Configuration

**File**: `src/app.module.ts`

```typescript
import { AppDataSource } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...AppDataSource.options,
      migrations: ['dist/migrations/*.js'], // Compiled migrations
      migrationsRun: false,                 // Manual execution
    }),
    // ... other imports
  ],
})
```

**Key Changes**:
- Import DataSource options
- Override migrations path to compiled JS
- Disable automatic migration execution

### Package Scripts

**File**: `package.json`

```json
{
  "scripts": {
    "typeorm": "typeorm-ts-node-commonjs",
    "migration:generate": "npm run typeorm migration:generate -- -d src/data-source.ts",
    "migration:run": "npm run typeorm migration:run -- -d src/data-source.ts",
    "migration:revert": "npm run typeorm migration:revert -- -d src/data-source.ts"
  }
}
```

## Migration Workflow

### Initial Migration Creation

```bash
# 1. Generate migration from current schema
npm run migration:generate src/migrations/InitialSchema

# 2. Build TypeScript to JavaScript
npm run build

# 3. Execute migration
npm run migration:run

# 4. Start application
npm start
```

### Future Schema Changes

```bash
# 1. Modify entity (add field, index, etc.)
# Edit src/*/entities/*.entity.ts

# 2. Generate migration for changes
npm run migration:generate src/migrations/AddFeatureName

# 3. Review generated migration
# Verify SQL in src/migrations/*-AddFeatureName.ts

# 4. Build and run
npm run build
npm run migration:run
npm start
```

### Rollback Process

```bash
# Revert last migration
npm run migration:revert

# Re-run if needed
npm run migration:run
```

## Testing Strategy

### Phase 2 Validation Tests

**Fresh Database Test** (one-time during Phase 2):
1. Drop/recreate database: `docker-compose down -v && docker-compose up -d`
2. Generate initial migration: `npm run migration:generate src/migrations/InitialSchema`
3. Build project: `npm run build`
4. Run migrations: `npm run migration:run`
5. Verify migrations table: `SELECT * FROM migrations;`
6. Start app: `npm start`
7. Verify tables created via migration (not auto-sync)

**Migration Verification**:
```sql
-- Check migrations table
SELECT * FROM migrations;

-- Verify table structure
\d log_entries
\d research_results
\d evaluation_records
```

**Rollback Test**:
1. Revert: `npm run migration:revert`
2. Verify tables dropped
3. Re-run: `npm run migration:run`
4. Verify tables recreated

**Functionality Test**:
- Run full E2E test suite from Phase 1
- Verify all CRUD operations work
- Test data persistence
- Confirm no regressions

### Success Criteria

- ✅ Initial migration generates successfully
- ✅ Fresh database initializes via migration only
- ✅ Rollback and re-run work correctly
- ✅ No `synchronize` in configuration
- ✅ All E2E tests pass
- ✅ Migration files committed to git
- ✅ Single DataSource configuration used everywhere

## Production Deployment

### Deployment Workflow

**Development**:
```bash
npm run migration:generate src/migrations/FeatureName
npm run build
npm run migration:run
npm start
```

**Production** (Docker/CI/CD):
```bash
npm ci --only=production
npm run build
npm run migration:run  # Run BEFORE starting app
npm run start:prod
```

### Safety Measures

1. **Transaction Safety**: Each migration runs in a transaction (auto-rollback on error)
2. **Idempotency**: Migrations tracked in database (won't re-run)
3. **Ordering**: Timestamp-based execution order
4. **Backup**: Always backup before production migrations
5. **Testing**: Test migrations on staging environment first

### Git Strategy

- ✅ Commit all migration files to version control
- ✅ Never edit existing migration files
- ✅ New schema changes = new migration files
- ✅ Migration files are immutable once committed

## Migration Patterns

### Initial Migration (Phase 2)

Creates baseline schema:
- All three tables (log_entries, research_results, evaluation_records)
- All indexes and constraints
- UUID extension setup

### Future Migrations (Post-Phase 2)

Incremental changes only:
```typescript
// Example: Adding email column to users
export class AddUserEmail1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN email VARCHAR(255)`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN email`
    );
  }
}
```

**Never**:
- ❌ Drop tables in production migrations
- ❌ Edit existing migration files
- ❌ Skip migrations in sequence

**Always**:
- ✅ Additive changes (ALTER, CREATE)
- ✅ Provide rollback in down()
- ✅ Test on fresh database
- ✅ Review generated SQL

## Deliverables

### Files Created

1. `src/data-source.ts` - Unified DataSource configuration
2. `src/migrations/` - Migration directory (empty initially)
3. `src/migrations/*-InitialSchema.ts` - First migration file
4. Test report validating migration functionality

### Files Modified

1. `package.json` - Add migration scripts
2. `src/app.module.ts` - Use DataSource, disable synchronize
3. `README.md` - Update with migration workflow

### Documentation

1. Phase 2 design document (this file)
2. Phase 2 implementation plan
3. Migration workflow in README
4. Test report

## Risk Mitigation

### Potential Issues

1. **Migration Generation Fails**
   - Solution: Verify entities match current schema
   - Check TypeORM compatibility

2. **Migration Execution Fails**
   - Solution: Run in transaction (auto-rollback)
   - Check database connectivity
   - Verify environment variables

3. **Schema Mismatch After Migration**
   - Solution: Compare entity definitions to database schema
   - Re-generate migration if needed (during Phase 2 only)

### Rollback Plan

If critical issues arise:
1. Revert migration: `npm run migration:revert`
2. Fix entity or migration code
3. Re-generate migration
4. Test on fresh database
5. Re-run migration

## Timeline

**Estimated Duration**: 1-2 hours

**Tasks**:
1. Create data-source.ts (15 min)
2. Update package.json (5 min)
3. Update app.module.ts (10 min)
4. Generate initial migration (10 min)
5. Test on fresh database (15 min)
6. Test rollback/re-run (10 min)
7. Run E2E tests (10 min)
8. Documentation (15 min)

## Next Steps

After Phase 2 validation:
- **Phase 3**: Production Dockerfile with multi-stage build
- Consider migration automation in CI/CD
- Document migration best practices for team

## References

- TypeORM Migrations: https://typeorm.io/migrations
- NestJS Database: https://docs.nestjs.com/techniques/database
- Phase 1 Design: `docs/plans/2025-11-30-postgresql-migration-design.md`
- Phase 1 Test Report: `docs/test-reports/postgresql-migration-e2e-test-2025-11-30.md`
