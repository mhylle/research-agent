# Docker Quick Start Guide

Get the Research Agent running in Docker in under 5 minutes.

## Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ installed
- Ollama running (or accessible remotely)
- Tavily API key

## Quick Start

### 1. Configure Environment

```bash
# Copy the template
cp .env.production.template .env.production

# Edit with your settings (required: DB_PASSWORD and TAVILY_API_KEY)
nano .env.production
```

**Minimum required changes**:
```env
DB_PASSWORD=your_secure_password_here
TAVILY_API_KEY=tvly-your-api-key-here
```

### 2. Build and Start

```bash
# Build the Docker image
npm run docker:build

# Start all services (PostgreSQL + Application)
npm run docker:up

# View logs to monitor startup
npm run docker:logs
```

### 3. Initialize Database

```bash
# Run database migrations
npm run docker:migrate
```

### 4. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Expected response:
# {"status":"healthy","services":{"ollama":"healthy","database":"healthy"}}
```

## Common Commands

```bash
# View application logs
npm run docker:logs

# View all service logs
npm run docker:logs:all

# Check service status
npm run docker:ps

# Restart application
npm run docker:restart

# Stop all services
npm run docker:down

# Stop and remove all data (⚠️ careful!)
npm run docker:down:volumes

# Access application shell
npm run docker:shell

# Access database shell
npm run docker:db:shell
```

## Development Mode

For hot-reload development:

```bash
# Start in development mode
npm run docker:dev:up

# View development logs
npm run docker:dev:logs

# Stop development mode
npm run docker:dev:down
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
npm run docker:logs:all

# Verify configuration
docker-compose config
```

### Database Connection Issues

```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready

# Verify database credentials in .env.production
cat .env.production | grep DB_
```

### Ollama Connection Issues

```bash
# Test Ollama from container
docker-compose exec app sh -c "wget -O- http://host.docker.internal:11434/api/version"

# Verify Ollama is running on host
curl http://localhost:11434/api/version
```

### Port Already in Use

Edit `.env.production` and change the port:
```env
PORT=3001
```

Then restart:
```bash
npm run docker:down
npm run docker:up
```

## Next Steps

- See full documentation: `docs/deployment/docker-production.md`
- Configure SSL/TLS with reverse proxy (Nginx/Traefik)
- Set up automated backups
- Configure monitoring and alerting

## Health Checks

Application automatically performs health checks:
- **Application**: Every 30 seconds
- **Database**: Every 10 seconds

View health status:
```bash
docker-compose ps
```

## Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U research_agent -d research_agent_db > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U research_agent -d research_agent_db < backup.sql
```

## Support

For detailed information, see:
- Full deployment guide: `docs/deployment/docker-production.md`
- Implementation summary: `docs/deployment/DOCKER_SETUP_SUMMARY.md`
- Main README: `README.md`
