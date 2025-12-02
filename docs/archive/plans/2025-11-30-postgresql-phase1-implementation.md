# PostgreSQL Migration Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate research_agent from SQLite to PostgreSQL with Docker Compose for development environment

**Architecture:** Replace SQLite database with PostgreSQL running in Docker container, update TypeORM configuration to use PostgreSQL driver, maintain existing entity structure with zero code changes

**Tech Stack:** PostgreSQL 16 Alpine, Docker Compose 3.8, TypeORM, pg (PostgreSQL driver), @nestjs/config

---

## Task 1: Create Docker Infrastructure Files

**Files:**
- Create: `/home/mhylle/projects/research_agent/docker-compose.yml`
- Create: `/home/mhylle/projects/research_agent/docker/init-db.sql`
- Create: `/home/mhylle/projects/research_agent/.dockerignore`

### Step 1: Create Docker directory

```bash
mkdir -p /home/mhylle/projects/research_agent/docker
```

### Step 2: Create docker-compose.yml

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

### Step 3: Create PostgreSQL initialization script

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PostgreSQL-specific initialization completes here
```

Save to: `/home/mhylle/projects/research_agent/docker/init-db.sql`

### Step 4: Create .dockerignore

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
coverage
.nyc_output
```

Save to: `/home/mhylle/projects/research_agent/.dockerignore`

### Step 5: Verify Docker Compose configuration

```bash
docker-compose config
```

Expected: Valid YAML output with no errors

### Step 6: Commit Docker infrastructure

```bash
git add docker-compose.yml docker/init-db.sql .dockerignore
git commit -m "feat: add Docker Compose PostgreSQL setup

Add Docker Compose configuration for PostgreSQL 16
- Port 5433 on host to avoid conflicts
- PostgreSQL initialization with uuid-ossp extension
- Named volume for data persistence
- Health checks for connection readiness

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Environment Configuration

**Files:**
- Create: `/home/mhylle/projects/research_agent/.env`
- Create: `/home/mhylle/projects/research_agent/.env.example`
- Modify: `/home/mhylle/projects/research_agent/.gitignore`

### Step 1: Create .env file

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

Save to: `/home/mhylle/projects/research_agent/.env`

### Step 2: Create .env.example template

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

Save to: `/home/mhylle/projects/research_agent/.env.example`

### Step 3: Update .gitignore

Read existing `.gitignore` and add these entries if not present:

```
# Environment variables
.env

# PostgreSQL data
data/postgres/
```

Location: `/home/mhylle/projects/research_agent/.gitignore`

### Step 4: Verify .env is gitignored

```bash
git status --ignored | grep .env
```

Expected: `.env` appears in ignored files list

### Step 5: Commit environment configuration

```bash
git add .env.example .gitignore
git commit -m "feat: add environment configuration for PostgreSQL

Add environment variable templates and update gitignore
- .env.example template for team
- Gitignore .env and PostgreSQL data directory

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Update Package Dependencies

**Files:**
- Modify: `/home/mhylle/projects/research_agent/package.json`

### Step 1: Read current package.json

```bash
cat /home/mhylle/projects/research_agent/package.json
```

Verify current dependencies include `better-sqlite3`

### Step 2: Remove SQLite dependency

```bash
npm uninstall better-sqlite3
```

Expected: `better-sqlite3` removed from `dependencies` in package.json

### Step 3: Install PostgreSQL driver

```bash
npm install pg@^8.11.0
```

Expected: `pg` added to `dependencies` in package.json

### Step 4: Verify dependencies

```bash
npm list pg
npm list better-sqlite3
```

Expected:
- `pg@8.11.x` listed
- `better-sqlite3` shows error (not found)

### Step 5: Commit dependency changes

```bash
git add package.json package-lock.json
git commit -m "feat: switch from SQLite to PostgreSQL driver

Replace better-sqlite3 with pg driver for PostgreSQL support
- Add: pg@^8.11.0
- Remove: better-sqlite3

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Update TypeORM Configuration

**Files:**
- Modify: `/home/mhylle/projects/research_agent/src/app.module.ts`

### Step 1: Read current TypeORM configuration

```bash
grep -A 20 "TypeOrmModule.forRootAsync" /home/mhylle/projects/research_agent/src/app.module.ts
```

Identify the TypeORM configuration block

### Step 2: Backup current configuration

```bash
cp /home/mhylle/projects/research_agent/src/app.module.ts /home/mhylle/projects/research_agent/src/app.module.ts.backup
```

### Step 3: Update TypeORM configuration

Find and replace the TypeORM configuration in `src/app.module.ts`:

**OLD (SQLite configuration):**
```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'better-sqlite3',
    database: './data/logs/research.db',
    entities: [LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity],
    synchronize: true,
    logging: true,
  }),
}),
```

**NEW (PostgreSQL configuration):**
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

### Step 4: Verify TypeScript compilation

```bash
npm run build
```

Expected: Successful build with no errors

### Step 5: Commit TypeORM configuration changes

```bash
git add src/app.module.ts
git commit -m "feat: migrate TypeORM from SQLite to PostgreSQL

Update database configuration to use PostgreSQL
- Switch type from 'better-sqlite3' to 'postgres'
- Add connection parameters from environment variables
- Environment-aware synchronize and logging settings

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Start PostgreSQL and Verify Connection

**Files:**
- None (runtime verification)

### Step 1: Start PostgreSQL container

```bash
docker-compose up -d postgres
```

Expected:
```
Creating network "research_agent_network" ...
Creating volume "research_agent_postgres_data" ...
Creating research_agent_postgres ...
```

### Step 2: Wait for PostgreSQL to be healthy

```bash
docker-compose ps
```

Expected: `research_agent_postgres` status shows `Up (healthy)`

### Step 3: Verify PostgreSQL is accessible

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT version();"
```

Expected: PostgreSQL version output (16.x)

### Step 4: Check UUID extension is installed

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';"
```

Expected: Row showing uuid-ossp extension

### Step 5: Start NestJS application

```bash
npm start
```

Expected in logs:
- No SQLite-related errors
- TypeORM connection established
- Tables created automatically (log_entries, research_results, evaluation_records)

### Step 6: Verify tables were created

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "\dt"
```

Expected output showing tables:
- `log_entries`
- `research_results`
- `evaluation_records`
- `migrations` (TypeORM metadata)

---

## Task 6: Test Entity Operations

**Files:**
- None (runtime testing via API or psql)

### Step 1: Test log entry creation

Start the application and trigger a research query through the API to create log entries.

Alternative manual test via psql:
```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "
INSERT INTO log_entries (id, \"logId\", timestamp, \"eventType\", data)
VALUES (
  uuid_generate_v4(),
  'test-log-id',
  NOW(),
  'test.event',
  '{\"message\": \"test entry\"}'::jsonb
);
"
```

Expected: 1 row inserted successfully

### Step 2: Verify data was inserted

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT * FROM log_entries;"
```

Expected: Row with test data visible

### Step 3: Test data persistence

Stop and restart the application:
```bash
# Stop app with Ctrl+C
npm start
```

Re-query the database:
```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db -c "SELECT COUNT(*) FROM log_entries;"
```

Expected: Same row count as before restart (data persisted)

### Step 4: Stop application

```bash
# Stop NestJS with Ctrl+C
docker-compose down
```

Expected: PostgreSQL container stops gracefully

---

## Task 7: Update Documentation

**Files:**
- Modify: `/home/mhylle/projects/research_agent/README.md`

### Step 1: Read current README

```bash
head -50 /home/mhylle/projects/research_agent/README.md
```

Identify where to add PostgreSQL setup instructions

### Step 2: Add PostgreSQL setup section

Add this section after the "Installation" section in README.md:

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

### Database Management

\`\`\`bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U research_agent -d research_agent_db

# View tables
\dt

# Stop PostgreSQL
docker-compose down

# Remove all data (clean slate)
docker-compose down -v
\`\`\`
```

### Step 3: Update Technology Stack section

Find the "Technology Stack" or "Built With" section and update database entry:

**OLD:**
- Database: SQLite with better-sqlite3

**NEW:**
- Database: PostgreSQL 16 with TypeORM
- Development: Docker Compose

### Step 4: Commit documentation updates

```bash
git add README.md
git commit -m "docs: add PostgreSQL setup instructions

Add database setup section with Docker Compose usage
- PostgreSQL startup commands
- Environment configuration steps
- Database management commands
- Update technology stack

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Clean Up Old SQLite Files

**Files:**
- Delete: `/home/mhylle/projects/research_agent/data/logs/research.db` (if exists)
- Delete: `/home/mhylle/projects/research_agent/src/app.module.ts.backup`

### Step 1: Remove SQLite database file

```bash
rm -f /home/mhylle/projects/research_agent/data/logs/research.db
rm -f /home/mhylle/projects/research_agent/data/logs/research.db-shm
rm -f /home/mhylle/projects/research_agent/data/logs/research.db-wal
```

Expected: SQLite files removed (no error if they don't exist)

### Step 2: Remove backup file

```bash
rm -f /home/mhylle/projects/research_agent/src/app.module.ts.backup
```

### Step 3: Verify no SQLite files remain

```bash
find /home/mhylle/projects/research_agent -name "*.db" -o -name "*.db-*"
```

Expected: No output (no .db files found)

---

## Task 9: Final Validation

**Files:**
- None (comprehensive testing)

### Step 1: Clean environment test

```bash
# Stop everything
docker-compose down -v

# Remove node_modules and rebuild
rm -rf node_modules
npm install

# Start PostgreSQL
docker-compose up -d postgres

# Wait for healthy status
sleep 10

# Start application
npm start
```

Expected: Application starts successfully, connects to PostgreSQL

### Step 2: Verify all entities are working

Through the application API or directly in psql, verify:
- Log entries can be created and queried
- Research results can be created and queried
- Evaluation records can be created and queried

### Step 3: Check for any TypeORM errors

Review application logs for:
- ✅ Successful database connection
- ✅ Tables created automatically
- ✅ No synchronization errors
- ✅ No foreign key constraint errors

### Step 4: Performance check

Run a research query and verify:
- Query completes successfully
- Data is persisted to PostgreSQL
- No performance degradation compared to SQLite

---

## Rollback Procedure

If critical issues are encountered:

### Step 1: Stop application and PostgreSQL

```bash
docker-compose down -v
```

### Step 2: Revert commits

```bash
# View recent commits
git log --oneline -10

# Revert to before PostgreSQL migration
git revert <commit-hash>...HEAD
```

### Step 3: Restore SQLite dependencies

```bash
npm install better-sqlite3
npm uninstall pg
```

### Step 4: Restore SQLite configuration in app.module.ts

Manually revert TypeORM configuration to SQLite settings.

---

## Success Criteria

Phase 1 is complete when:

- ✅ PostgreSQL 16 running in Docker on port 5433
- ✅ Application connects to PostgreSQL successfully
- ✅ All three entities (LogEntry, ResearchResult, EvaluationRecord) work correctly
- ✅ Data persists across application restarts
- ✅ No SQLite files remain in project
- ✅ Documentation updated with PostgreSQL setup instructions
- ✅ All commits follow conventional commit format
- ✅ No regression in application functionality

---

## Next Steps

After Phase 1 validation:
- **Phase 2**: Implement TypeORM migrations (disable auto-sync)
- **Phase 3**: Create production Dockerfile
