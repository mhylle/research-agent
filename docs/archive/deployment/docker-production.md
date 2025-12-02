# Docker Production Deployment Guide

Complete guide for deploying the Research Agent application using Docker in production environments.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Building the Image](#building-the-image)
5. [Deployment](#deployment)
6. [Health Checks](#health-checks)
7. [Database Migrations](#database-migrations)
8. [Troubleshooting](#troubleshooting)
9. [Scaling Considerations](#scaling-considerations)
10. [Security Best Practices](#security-best-practices)

## Quick Start

For the impatient, here's the fastest path to production:

```bash
# 1. Configure environment
cp .env.production.template .env.production
# Edit .env.production with your secrets

# 2. Build and start
docker-compose up -d

# 3. Run migrations
docker-compose exec app npm run migration:run

# 4. Verify health
curl http://localhost:3000/api/health
```

## Prerequisites

### Required Software

- **Docker**: 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose**: 2.0+ (included with Docker Desktop)

### Required Services

- **Ollama**: LLM service for AI operations
  - Can run on host: `http://host.docker.internal:11434`
  - Or in separate container: See [Ollama Docker docs](https://hub.docker.com/r/ollama/ollama)

- **Tavily API Key**: Required for web search functionality
  - Get your key at [tavily.com](https://tavily.com)

### System Requirements

**Minimum**:
- 2 CPU cores
- 4GB RAM
- 10GB disk space

**Recommended**:
- 4+ CPU cores
- 8GB RAM
- 20GB disk space (for database and logs)

## Configuration

### Environment Variables

Create `.env.production` from the template:

```bash
cp .env.production.template .env.production
```

**Required Variables** (must be set):

```env
DB_PASSWORD=your_secure_database_password
TAVILY_API_KEY=tvly-your-api-key-here
```

**Optional Variables** (have defaults):

```env
NODE_ENV=production              # Application environment
PORT=3000                         # Application port
DB_HOST=postgres                  # Database host (container name)
DB_PORT=5432                      # Database port
DB_USERNAME=research_agent        # Database user
DB_DATABASE=research_agent_db     # Database name
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5
WEB_FETCH_TIMEOUT=10000
WEB_FETCH_MAX_SIZE=1048576
LOG_LEVEL=info
LOG_DIR=./logs
```

### Database Password Security

⚠️ **Important**: Use a strong password for production!

```bash
# Generate a secure password (Linux/macOS)
openssl rand -base64 32

# Or use a password manager to generate one
```

### Ollama Configuration

**Option 1: Ollama on Host Machine** (Recommended for development)

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**Option 2: Ollama in Docker Network**

Add to `docker-compose.yml`:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: research-agent-ollama
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - research-net

volumes:
  ollama-data:
```

Then set:

```env
OLLAMA_BASE_URL=http://ollama:11434
```

**Option 3: Remote Ollama Service**

```env
OLLAMA_BASE_URL=https://your-ollama-server.com
```

## Building the Image

### Standard Build

```bash
docker-compose build
```

### Build with No Cache (Clean Build)

```bash
docker-compose build --no-cache
```

### Build Arguments

The Dockerfile accepts build-time arguments:

```bash
docker build \
  --build-arg NODE_ENV=production \
  -t research-agent:latest \
  .
```

### Multi-Stage Build Details

The Dockerfile uses a 3-stage build process:

1. **backend-builder**: Compiles TypeScript backend
2. **frontend-builder**: Builds Angular production bundle
3. **production**: Final runtime image (minimal size)

**Image Size Optimization**:
- Multi-stage builds reduce final image size by ~70%
- Only production dependencies included
- No build tools or dev dependencies
- Alpine Linux base for minimal footprint

## Deployment

### Start Services

```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f app

# View only errors
docker-compose logs -f app | grep ERROR
```

### Initial Database Setup

After first deployment, run migrations:

```bash
# Run all pending migrations
docker-compose exec app npm run migration:run

# Verify migration status
docker-compose exec app npm run typeorm migration:show
```

### Stop Services

```bash
# Stop containers (preserves data)
docker-compose stop

# Stop and remove containers (preserves volumes)
docker-compose down

# Remove containers AND volumes (⚠️ deletes all data)
docker-compose down -v
```

### Restart Application Only

```bash
# Restart just the app container
docker-compose restart app
```

## Health Checks

### Application Health Endpoint

The application exposes a health check endpoint:

```bash
curl http://localhost:3000/api/health
```

**Expected Response**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Docker Health Status

```bash
# Check health status of all services
docker-compose ps

# View detailed health check logs
docker inspect research-agent-app | jq '.[0].State.Health'
```

### Database Health

```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U research_agent

# Connect to database
docker-compose exec postgres psql -U research_agent -d research_agent_db
```

## Database Migrations

### Running Migrations

```bash
# Run all pending migrations
docker-compose exec app npm run migration:run
```

### Creating New Migrations

```bash
# Generate migration from entity changes
docker-compose exec app npm run migration:generate -- -n MigrationName

# Create blank migration
docker-compose exec app npm run typeorm migration:create -- -n MigrationName
```

### Rolling Back Migrations

```bash
# Revert last migration
docker-compose exec app npm run migration:revert
```

### Migration Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** in staging environment first
3. **Use transactions** for data migrations
4. **Keep migrations atomic** - one change per migration
5. **Never modify** existing migrations after deployment

## Troubleshooting

### Container Won't Start

**Check logs**:

```bash
docker-compose logs app
```

**Common issues**:

1. **Port already in use**:
   ```bash
   # Change port in .env.production
   PORT=3001
   ```

2. **Database not ready**:
   ```bash
   # Wait for postgres health check
   docker-compose ps postgres
   ```

3. **Missing environment variables**:
   ```bash
   # Verify required vars are set
   docker-compose config
   ```

### Database Connection Issues

**Test database connectivity**:

```bash
# From app container
docker-compose exec app sh
nc -zv postgres 5432
```

**Check database logs**:

```bash
docker-compose logs postgres
```

**Reset database** (⚠️ deletes all data):

```bash
docker-compose down -v
docker-compose up -d postgres
docker-compose exec app npm run migration:run
```

### Performance Issues

**Check resource usage**:

```bash
docker stats research-agent-app research-agent-postgres
```

**Increase container resources** (Docker Desktop):
- Settings → Resources → Advanced
- Increase CPU and Memory allocations

**Check application logs**:

```bash
docker-compose exec app tail -f logs/combined.log
```

### Ollama Connection Issues

**Test Ollama connectivity**:

```bash
# From app container
docker-compose exec app sh
wget -O- http://host.docker.internal:11434/api/version
```

**Verify Ollama is running**:

```bash
# On host machine
curl http://localhost:11434/api/version
```

### Migration Failures

**Check migration status**:

```bash
docker-compose exec app npm run typeorm migration:show
```

**Manual database access**:

```bash
docker-compose exec postgres psql -U research_agent -d research_agent_db
\dt    # List tables
\q     # Quit
```

## Scaling Considerations

### Horizontal Scaling

To run multiple application instances:

```yaml
services:
  app:
    # ... existing config
    deploy:
      replicas: 3
```

**Load Balancer Required**:
- Nginx, HAProxy, or cloud load balancer
- Session affinity may be needed for WebSocket connections

### Database Scaling

**Connection Pooling**:
- TypeORM built-in connection pool
- Configure in `src/data-source.ts`

**Read Replicas**:
- PostgreSQL streaming replication
- Separate read/write data sources

### Caching Strategy

Consider adding Redis for:
- Session management
- API response caching
- Rate limiting

### Monitoring

**Recommended Tools**:
- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **Loki**: Log aggregation
- **cAdvisor**: Container metrics

## Security Best Practices

### Container Security

1. **Non-root user**: Application runs as `nestjs` user (UID 1001)
2. **Read-only filesystem**: Where possible
3. **No privileged mode**: Never use `--privileged`
4. **Security scanning**: Use `docker scan research-agent:latest`

### Network Security

1. **Isolated network**: Services communicate on internal `research-net`
2. **Minimal port exposure**: Only expose port 3000
3. **TLS/SSL**: Use reverse proxy (Nginx/Traefik) for HTTPS

### Secrets Management

**Development**:
- Use `.env.production` file (never commit!)

**Production**:
- Docker secrets
- Kubernetes secrets
- HashiCorp Vault
- Cloud provider secret managers (AWS Secrets Manager, Azure Key Vault, etc.)

### Database Security

1. **Strong passwords**: Use generated passwords (32+ characters)
2. **Network isolation**: Database not exposed to internet
3. **Regular backups**: Automated backup strategy
4. **Encryption at rest**: PostgreSQL pgcrypto extension
5. **SSL connections**: Configure PostgreSQL SSL

### Regular Updates

```bash
# Update base images
docker-compose pull

# Rebuild with latest dependencies
docker-compose build --no-cache

# Scan for vulnerabilities
docker scan research-agent:latest
```

## Backup and Recovery

### Database Backup

**Automated backup script**:

```bash
#!/bin/bash
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)

docker-compose exec -T postgres pg_dump \
  -U research_agent \
  -d research_agent_db \
  -F c \
  -f /tmp/backup_$DATE.dump

docker cp research-agent-postgres:/tmp/backup_$DATE.dump \
  $BACKUP_DIR/backup_$DATE.dump
```

**Restore from backup**:

```bash
docker cp backup_20240101_120000.dump research-agent-postgres:/tmp/

docker-compose exec postgres pg_restore \
  -U research_agent \
  -d research_agent_db \
  -c \
  /tmp/backup_20240101_120000.dump
```

### Volume Backup

```bash
# Backup persistent volumes
docker run --rm \
  -v research_agent_postgres-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres-data-$(date +%Y%m%d).tar.gz /data
```

## Useful Commands Reference

```bash
# Build
docker-compose build [--no-cache]

# Start/Stop
docker-compose up -d
docker-compose down [-v]
docker-compose restart [service]

# Logs
docker-compose logs -f [service]
docker-compose logs --tail=100 app

# Health
docker-compose ps
curl http://localhost:3000/health

# Database
docker-compose exec app npm run migration:run
docker-compose exec postgres psql -U research_agent -d research_agent_db

# Shell Access
docker-compose exec app sh
docker-compose exec postgres sh

# Cleanup
docker-compose down -v
docker system prune -a --volumes
```

## Production Checklist

Before deploying to production:

- [ ] Strong database password configured
- [ ] Tavily API key obtained and set
- [ ] Ollama service accessible and configured
- [ ] Environment variables reviewed and set
- [ ] SSL/TLS configured (reverse proxy)
- [ ] Backup strategy implemented
- [ ] Monitoring and logging configured
- [ ] Health checks verified
- [ ] Database migrations tested
- [ ] Load testing performed
- [ ] Security scan completed
- [ ] Disaster recovery plan documented
- [ ] On-call rotation established

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review application logs: `docker-compose logs app`
3. Check [GitHub Issues](https://github.com/your-org/research-agent/issues)
4. Contact development team

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [PostgreSQL Docker](https://hub.docker.com/_/postgres)
- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Migrations](https://typeorm.io/migrations)
