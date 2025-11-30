# Deployment Documentation

This directory contains comprehensive documentation for deploying the Research Agent application.

## Quick Navigation

### For Quick Start
- **[Docker Quick Start](../../DOCKER_QUICK_START.md)**: Get running in 5 minutes
- **Environment Template**: `/.env.production.template` - Configuration reference

### For Production Deployment
- **[Docker Production Guide](./docker-production.md)**: Complete deployment guide (600+ lines)
- **[Implementation Summary](./DOCKER_SETUP_SUMMARY.md)**: Technical architecture details
- **[Features Documentation](./DOCKER_FEATURES.md)**: Complete feature list and capabilities

## Documentation Overview

### DOCKER_QUICK_START.md (Root Directory)
**Purpose**: Minimal quick start guide  
**Audience**: Developers who want to get running quickly  
**Content**:
- Prerequisites (5 items)
- Quick start (4 steps)
- Common commands (15+)
- Basic troubleshooting

### docker-production.md
**Purpose**: Comprehensive production deployment guide  
**Audience**: DevOps engineers, system administrators  
**Content** (610 lines):
- Table of contents
- Prerequisites and requirements
- Environment configuration
- Building and deployment
- Health checks and monitoring
- Database migrations
- Troubleshooting guide
- Scaling considerations
- Security best practices
- Backup and recovery
- Production checklist

### DOCKER_SETUP_SUMMARY.md
**Purpose**: Implementation details and architecture  
**Audience**: Technical leads, architects  
**Content** (425 lines):
- Implementation overview
- Files created/modified
- Docker architecture
- Multi-stage build process
- Service configuration
- Security features
- Health checks
- Volume management
- Testing and validation
- Production readiness checklist

### DOCKER_FEATURES.md
**Purpose**: Complete feature list and capabilities  
**Audience**: All stakeholders  
**Content** (500+ lines):
- Multi-stage build architecture
- Container security features
- Service architecture
- Health check system
- Volume management
- Network configuration
- Environment configuration
- Development features
- Production features
- NPM script integration
- Build optimizations
- Migration management
- Monitoring & observability
- Backup & recovery
- Future enhancements

## File Structure

```
research_agent/
├── Dockerfile                           # Multi-stage production build
├── docker-compose.yml                   # Production configuration
├── docker-compose.dev.yml              # Development overrides
├── .dockerignore                        # Build context optimization
├── .env.production.template            # Environment configuration template
├── DOCKER_QUICK_START.md               # Quick start guide
├── package.json                         # Docker npm scripts (15+)
└── docs/
    └── deployment/
        ├── README.md                    # This file
        ├── docker-production.md         # Comprehensive guide
        ├── DOCKER_SETUP_SUMMARY.md     # Implementation details
        └── DOCKER_FEATURES.md          # Feature documentation
```

## Getting Started

### First Time Setup

1. **Choose your guide**:
   - Quick start? → [DOCKER_QUICK_START.md](../../DOCKER_QUICK_START.md)
   - Production? → [docker-production.md](./docker-production.md)
   - Understanding architecture? → [DOCKER_SETUP_SUMMARY.md](./DOCKER_SETUP_SUMMARY.md)

2. **Configure environment**:
   ```bash
   cp .env.production.template .env.production
   # Edit .env.production with your settings
   ```

3. **Build and deploy**:
   ```bash
   npm run docker:build
   npm run docker:up
   npm run docker:migrate
   ```

4. **Verify**:
   ```bash
   curl http://localhost:3000/api/health
   ```

### Development Setup

For development with hot reload:
```bash
npm run docker:dev:up
npm run docker:dev:logs
```

## Key Features

### Security
- Non-root user execution
- Alpine Linux base (minimal attack surface)
- Security updates automated
- Network isolation
- Secrets management ready

### Production Ready
- Multi-stage optimized builds
- Health monitoring
- Automatic restart on failure
- Graceful shutdown
- Data persistence
- Backup procedures documented

### Developer Friendly
- 15+ npm scripts
- Hot reload in development
- Debug port exposed
- Comprehensive documentation
- Clear error messages

## NPM Scripts

All Docker operations available via npm:

```bash
# Production
npm run docker:build       # Build image
npm run docker:up          # Start services
npm run docker:down        # Stop services
npm run docker:logs        # View logs
npm run docker:migrate     # Run migrations

# Development
npm run docker:dev:up      # Start dev mode
npm run docker:dev:down    # Stop dev mode
npm run docker:dev:logs    # View dev logs

# Utilities
npm run docker:ps          # Service status
npm run docker:shell       # App shell
npm run docker:db:shell    # Database shell
```

See [docker-production.md](./docker-production.md) for complete command reference.

## Documentation Standards

### Writing Style
- **Clear and concise**: Use simple language
- **Step-by-step**: Numbered instructions where applicable
- **Code examples**: Provide copy-paste ready commands
- **Troubleshooting**: Common issues with solutions

### Document Updates
When updating documentation:
1. Update relevant guide(s)
2. Update this README if adding new docs
3. Keep code examples in sync with actual code
4. Test all commands before documenting

## Support

### Troubleshooting Priority
1. Check [DOCKER_QUICK_START.md](../../DOCKER_QUICK_START.md) troubleshooting
2. Review [docker-production.md](./docker-production.md) troubleshooting section
3. Check logs: `npm run docker:logs:all`
4. Verify configuration: `docker-compose config`
5. Check service health: `npm run docker:ps`

### Getting Help
- Check documentation first
- Review logs for error messages
- Verify environment configuration
- Ensure prerequisites are met
- Check Docker and Docker Compose versions

## Maintenance

### Regular Updates
- **Monthly**: Check for security updates
- **Quarterly**: Review and update dependencies
- **As needed**: Update documentation for changes

### Version Information
- Docker: 20.10+ required
- Docker Compose: 2.0+ required
- Node.js: 20-alpine
- PostgreSQL: 16-alpine

## Additional Resources

### External Documentation
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [NestJS Documentation](https://docs.nestjs.com/)

### Project Documentation
- [Main README](../../README.md): Project overview
- [Client README](../../client/README.md): Frontend documentation

## Contributing

When adding deployment documentation:
1. Follow existing documentation style
2. Include code examples that work
3. Add troubleshooting for common issues
4. Update this README with new documents
5. Keep documentation DRY (Don't Repeat Yourself)

## License

Same as main project license.
