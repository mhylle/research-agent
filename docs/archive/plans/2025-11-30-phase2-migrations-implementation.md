# PostgreSQL Migration Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace auto-sync with TypeORM migrations for production-safe schema management

**Architecture:** Single DataSource configuration used by both CLI and runtime, manual migration execution with transaction safety, migration files stored in version control

**Tech Stack:** TypeORM 0.3.x, PostgreSQL 16, ts-node, dotenv

---

## Task 1: Create DataSource Configuration

**Files:**
- Create: `/home/mhylle/projects/research_agent/src/data-source.ts`

### Step 1: Create data-source.ts file

```typescript
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { LogEntryEntity } from './logging/entities/log-entry.entity';
import { ResearchResultEntity } from './research/entities/research-result.entity';
import { EvaluationRecordEntity } from './evaluation/entities/evaluation-record.entity';

config(); // Load .env file

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

Save to: `/home/mhylle/projects/research_agent/src/data-source.ts`

### Step 2: Verify TypeScript compilation

```bash
npm run build
```

Expected: Successful build with no errors

### Step 3: Commit DataSource configuration

```bash
git add src/data-source.ts
git commit -m "feat: add TypeORM DataSource configuration

Create unified DataSource for CLI and runtime
- Single source of truth for database config
- Direct environment variable access
- Entity imports for type safety

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Update Package Scripts

**Files:**
- Modify: `/home/mhylle/projects/research_agent/package.json`

### Step 1: Read current package.json scripts

```bash
cat package.json | grep -A 15 '"scripts"'
```

Verify current scripts section

### Step 2: Add migration scripts to package.json

Add these scripts to the "scripts" section in package.json:

```json
{
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/src/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "typeorm": "typeorm-ts-node-commonjs",
    "migration:generate": "npm run typeorm migration:generate -- -d src/data-source.ts",
    "migration:run": "npm run typeorm migration:run -- -d src/data-source.ts",
    "migration:revert": "npm run typeorm migration:revert -- -d src/data-source.ts"
  }
}
```

**Note**: Add the last 4 lines (`typeorm`, `migration:generate`, `migration:run`, `migration:revert`) to the existing scripts.

### Step 3: Verify package.json is valid JSON

```bash
npm run typeorm -- --help
```

Expected: TypeORM help output (confirms script works)

### Step 4: Commit package.json changes

```bash
git add package.json
git commit -m "feat: add TypeORM migration scripts

Add npm scripts for migration management
- migration:generate - Create new migration
- migration:run - Execute pending migrations
- migration:revert - Rollback last migration

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Create Migrations Directory

**Files:**
- Create: `/home/mhylle/projects/research_agent/src/migrations/` (directory)
- Create: `/home/mhylle/projects/research_agent/src/migrations/.gitkeep`

### Step 1: Create migrations directory

```bash
mkdir -p /home/mhylle/projects/research_agent/src/migrations
```

Expected: Directory created successfully

### Step 2: Create .gitkeep file

```bash
touch /home/mhylle/projects/research_agent/src/migrations/.gitkeep
```

Expected: Empty .gitkeep file created

### Step 3: Verify directory exists

```bash
ls -la /home/mhylle/projects/research_agent/src/migrations
```

Expected: Directory with .gitkeep file visible

### Step 4: Commit migrations directory

```bash
git add src/migrations/.gitkeep
git commit -m "feat: create migrations directory

Add src/migrations/ for storing migration files
- Version-controlled with .gitkeep
- Ready for migration generation

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Generate Initial Migration

**Files:**
- Create: `/home/mhylle/projects/research_agent/src/migrations/*-InitialSchema.ts` (generated)

### Step 1: Generate migration from current schema

**IMPORTANT**: This step requires a running PostgreSQL database with tables already created by auto-sync.

```bash
npm run migration:generate src/migrations/InitialSchema
```

Expected output:
```
Migration /home/mhylle/projects/research_agent/src/migrations/1234567890-InitialSchema.ts has been generated successfully.
```

**Note**: The timestamp will be different (current Unix timestamp)

### Step 2: Verify migration file was created

```bash
ls -la /home/mhylle/projects/research_agent/src/migrations/
```

Expected: One .ts file with pattern `*-InitialSchema.ts`

### Step 3: Review generated migration content

```bash
cat /home/mhylle/projects/research_agent/src/migrations/*-InitialSchema.ts | head -50
```

Verify:
- Contains `up()` method with CREATE TABLE statements
- Contains `down()` method with DROP TABLE statements
- All three tables included (log_entries, research_results, evaluation_records)

### Step 4: Commit initial migration

```bash
git add src/migrations/*-InitialSchema.ts
git commit -m "feat: generate initial schema migration

Create baseline migration from current PostgreSQL schema
- Captures all three tables (log_entries, research_results, evaluation_records)
- Includes all indexes and constraints
- Provides rollback capability

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Update Runtime Configuration

**Files:**
- Modify: `/home/mhylle/projects/research_agent/src/app.module.ts`

### Step 1: Read current TypeORM configuration

```bash
grep -A 20 "TypeOrmModule.forRootAsync" /home/mhylle/projects/research_agent/src/app.module.ts
```

Identify the current configuration block

### Step 2: Backup current configuration

```bash
cp /home/mhylle/projects/research_agent/src/app.module.ts /home/mhylle/projects/research_agent/src/app.module.ts.phase2-backup
```

### Step 3: Update TypeORM configuration

Replace the TypeORM configuration in `src/app.module.ts`:

**Find the import section** (near top of file):
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
// ... other imports
```

**Add this import**:
```typescript
import { AppDataSource } from './data-source';
```

**Find the TypeORM configuration** (in imports array):
```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.getOrThrow<string>('DB_HOST'),
    port: configService.getOrThrow<number>('DB_PORT'),
    username: configService.getOrThrow<string>('DB_USERNAME'),
    password: configService.getOrThrow<string>('DB_PASSWORD'),
    database: configService.getOrThrow<string>('DB_DATABASE'),
    entities: [
      LogEntryEntity,
      ResearchResultEntity,
      EvaluationRecordEntity,
    ],
    synchronize: configService.get('NODE_ENV') === 'development',
    logging: configService.get('NODE_ENV') === 'development',
  }),
}),
```

**Replace with**:
```typescript
TypeOrmModule.forRoot({
  ...AppDataSource.options,
  migrations: ['dist/migrations/*.js'],
  migrationsRun: false,
}),
```

### Step 4: Verify TypeScript compilation

```bash
npm run build
```

Expected: Successful build with no errors

### Step 5: Remove backup file

```bash
rm /home/mhylle/projects/research_agent/src/app.module.ts.phase2-backup
```

### Step 6: Commit configuration changes

```bash
git add src/app.module.ts
git commit -m "feat: switch to migration-based schema management

Replace auto-sync with explicit migrations
- Import and use AppDataSource configuration
- Set migrationsRun to false (manual execution)
- Point to compiled migrations in dist/
- Remove synchronize configuration

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Test Fresh Database Migration

**Files:**
- None (runtime verification)

### Step 1: Stop application and PostgreSQL

```bash
# Stop any running application
lsof -ti:3000 | xargs -r kill

# Stop and remove PostgreSQL data
docker-compose down -v
```

Expected:
```
Volume research_agent_postgres_data  Removing
Volume research_agent_postgres_data  Removed
```

### Step 2: Start fresh PostgreSQL

```bash
docker-compose up -d postgres
```

Expected:
```
Creating research_agent_postgres ...
Container research_agent_postgres  Started
```

### Step 3: Wait for PostgreSQL to be healthy

```bash
sleep 10 && docker-compose ps
```

Expected: `research_agent_postgres` status shows `Up (healthy)`

### Step 4: Build application

```bash
npm run build
```

Expected: Successful build

### Step 5: Run migrations

```bash
npm run migration:run
```

Expected output:
```
query: SELECT * FROM current_schema()
query: SELECT * FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND "table_name" = 'migrations'
query: CREATE TABLE "migrations" (...)
query: SELECT * FROM "migrations" "migrations" ORDER BY "id" DESC
0 migrations are already loaded in the database.
1 migrations were found in the source code.
1 migrations are new migrations that needs to be executed.
query: START TRANSACTION
query: CREATE TABLE "log_entries" (...)
query: CREATE INDEX "IDX_af3cdef36fa31bf844dd447f55" ON "log_entries" ("logId")
...
query: INSERT INTO "migrations"("timestamp", "name") VALUES ($1, $2)
Migration InitialSchema1234567890 has been executed successfully.
query: COMMIT
```

### Step 6: Verify migrations table

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT * FROM migrations;"
```

Expected: One row showing InitialSchema migration

### Step 7: Verify tables created

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "\dt"
```

Expected output showing:
- log_entries
- research_results
- evaluation_records
- migrations

### Step 8: Start application

```bash
npm start
```

Expected: Application starts successfully, no errors about missing tables

### Step 9: Stop application

```bash
# Press Ctrl+C or:
lsof -ti:3000 | xargs -r kill
```

---

## Task 7: Test Migration Rollback

**Files:**
- None (runtime verification)

### Step 1: Revert migration

```bash
npm run migration:revert
```

Expected output:
```
query: SELECT * FROM current_schema()
query: SELECT * FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND "table_name" = 'migrations'
query: SELECT * FROM "migrations" "migrations" ORDER BY "id" DESC
1 migrations are already loaded in the database.
InitialSchema1234567890 is the last executed migration. It was executed on [timestamp].
query: START TRANSACTION
query: DROP TABLE "research_results"
query: DROP TABLE "evaluation_records"
query: DROP TABLE "log_entries"
query: DELETE FROM "migrations" WHERE "timestamp" = $1 AND "name" = $2
Migration InitialSchema1234567890 has been reverted successfully.
query: COMMIT
```

### Step 2: Verify tables dropped

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "\dt"
```

Expected: Only `migrations` table exists (should be empty)

### Step 3: Verify migrations table is empty

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT * FROM migrations;"
```

Expected: 0 rows

### Step 4: Re-run migration

```bash
npm run migration:run
```

Expected: Migration executes successfully again

### Step 5: Verify tables recreated

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "\dt"
```

Expected: All four tables exist (log_entries, research_results, evaluation_records, migrations)

---

## Task 8: Run E2E Tests

**Files:**
- None (using existing E2E test suite)

### Step 1: Start application

```bash
npm start > /tmp/phase2-validation.log 2>&1 &
```

Wait for application to start (5-10 seconds)

### Step 2: Run E2E test suite via subagent

Use the same E2E testing approach from Phase 1:
- Health endpoint verification
- API endpoint testing
- Complete research workflow
- Data persistence verification

Expected: All tests pass, no regressions

### Step 3: Review test results

Check that:
- All endpoints respond correctly
- Data persists in PostgreSQL
- No auto-sync related errors
- Migration table has one entry

### Step 4: Stop application

```bash
lsof -ti:3000 | xargs -r kill
```

---

## Task 9: Update Documentation

**Files:**
- Modify: `/home/mhylle/projects/research_agent/README.md`

### Step 1: Read current Database Setup section

```bash
grep -A 30 "## Database Setup" /home/mhylle/projects/research_agent/README.md
```

### Step 2: Update README.md

Add migration workflow section after the existing Database Setup section:

```markdown
## Database Setup

### PostgreSQL (Development)

The application uses PostgreSQL for data persistence. Start the database with Docker Compose:

\`\`\`bash
# Start PostgreSQL
docker-compose up -d postgres

# Verify PostgreSQL is running
docker-compose ps

# View PostgreSQL logs
docker-compose logs -f postgres
\`\`\`

### Environment Configuration

Copy the example environment file and configure your database:

\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` with your database credentials (defaults work for local development).

### Database Migrations

The application uses TypeORM migrations for schema management.

\`\`\`bash
# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate new migration (after entity changes)
npm run migration:generate src/migrations/FeatureName
\`\`\`

**First-time setup:**
1. Start PostgreSQL: `docker-compose up -d postgres`
2. Run migrations: `npm run migration:run`
3. Start application: `npm start`

**Schema changes workflow:**
1. Modify entity files in `src/*/entities/`
2. Generate migration: `npm run migration:generate src/migrations/FeatureName`
3. Review migration: Check `src/migrations/*-FeatureName.ts`
4. Build: `npm run build`
5. Run migration: `npm run migration:run`
6. Test changes

### Database Management

\`\`\`bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U research_agent -d research_agent_db

# View tables
\\dt

# View migrations
SELECT * FROM migrations;

# Stop PostgreSQL
docker-compose down

# Remove all data (clean slate)
docker-compose down -v
\`\`\`
```

### Step 3: Verify README formatting

```bash
head -100 /home/mhylle/projects/research_agent/README.md
```

Check that markdown formatting is correct

### Step 4: Commit documentation updates

```bash
git add README.md
git commit -m "docs: add TypeORM migration workflow to README

Add migration management section to database setup
- Migration commands and workflow
- First-time setup instructions
- Schema change workflow
- Update database management commands

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Final Validation

**Files:**
- None (comprehensive verification)

### Step 1: Verify all commits created

```bash
git log --oneline -10
```

Expected: 7 new commits for Phase 2:
1. DataSource configuration
2. Migration scripts
3. Migrations directory
4. Initial migration
5. Runtime configuration
6. Documentation updates
7. (Plus any test-related commits)

### Step 2: Verify no auto-sync in config

```bash
grep -n "synchronize" /home/mhylle/projects/research_agent/src/app.module.ts
```

Expected: No matches (synchronize removed)

### Step 3: Verify migration files exist

```bash
ls -la /home/mhylle/projects/research_agent/src/migrations/
```

Expected: At least one migration file (*-InitialSchema.ts)

### Step 4: Verify application is using migrations

```bash
grep -n "migrations" /home/mhylle/projects/research_agent/src/app.module.ts
```

Expected: Line showing `migrations: ['dist/migrations/*.js']`

### Step 5: Clean environment test

```bash
# Stop everything
docker-compose down -v

# Start PostgreSQL
docker-compose up -d postgres

# Wait for healthy
sleep 10

# Build application
npm run build

# Run migrations
npm run migration:run

# Start application
npm start > /tmp/clean-env-test.log 2>&1 &

# Wait for startup
sleep 5

# Test health endpoint
curl http://localhost:3000/api/health

# Stop application
lsof -ti:3000 | xargs -r kill
```

Expected: All steps complete successfully, health endpoint returns 200 OK

### Step 6: Review final state

Checklist:
- ✅ DataSource configuration created
- ✅ Migration scripts added to package.json
- ✅ Migrations directory exists
- ✅ Initial migration generated
- ✅ Runtime config updated to use migrations
- ✅ No synchronize in configuration
- ✅ Documentation updated
- ✅ All tests pass
- ✅ Migration rollback works
- ✅ Fresh database setup works

---

## Success Criteria

Phase 2 is complete when:

- ✅ `src/data-source.ts` exists with unified configuration
- ✅ Migration scripts added to `package.json`
- ✅ Initial migration file exists in `src/migrations/`
- ✅ `app.module.ts` uses DataSource and migrations
- ✅ No `synchronize` configuration in runtime config
- ✅ Fresh database can be initialized via migration
- ✅ Migration rollback and re-run works correctly
- ✅ All E2E tests pass
- ✅ Documentation updated with migration workflow
- ✅ All changes committed to git

---

## Troubleshooting

### Migration Generation Fails

**Error**: `Cannot find module 'typeorm-ts-node-commonjs'`

**Solution**:
```bash
npm install -D ts-node tsconfig-paths
```

### Migration Execution Fails

**Error**: `QueryFailedError: relation "migrations" does not exist`

**Solution**: This is expected on first run. The migrations table will be created automatically.

**Error**: `Connection refused`

**Solution**: Ensure PostgreSQL is running:
```bash
docker-compose ps
docker-compose logs postgres
```

### Application Fails to Start

**Error**: `Cannot find module './data-source'`

**Solution**: Run build:
```bash
npm run build
```

**Error**: `Entity not found`

**Solution**: Verify entities are properly imported in data-source.ts

---

## Rollback Procedure

If critical issues are encountered during Phase 2:

### Step 1: Stop application and PostgreSQL

```bash
lsof -ti:3000 | xargs -r kill
docker-compose down
```

### Step 2: Revert commits

```bash
# View commits
git log --oneline -10

# Revert Phase 2 commits (use actual commit hashes)
git revert <commit-hash>..HEAD
```

### Step 3: Re-enable auto-sync temporarily

Manually edit `src/app.module.ts` to restore ConfigService-based configuration with `synchronize: true`

### Step 4: Restart with auto-sync

```bash
docker-compose up -d postgres
npm run build
npm start
```

---

## Next Steps

After Phase 2 validation:
- **Phase 3**: Production Dockerfile with multi-stage build
- Consider migration automation in CI/CD
- Document migration best practices for team
