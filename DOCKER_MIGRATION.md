# Docker Migration Guide

## ✅ Migration Complete

Your NestJS backend has been successfully migrated from PM2 to Docker.

## What Changed

### Files Created
1. **`Dockerfile`** - Multi-stage build for production-optimized containers
2. **`.dockerignore`** - Excludes unnecessary files from Docker build
3. **`docker-compose.yml`** - Orchestration configuration for production
4. **`deploy/docker-deploy.sh`** - Deployment script for Docker-based deployments

### Files Updated
1. **`.github/workflows/deploy.yml`** - CI/CD now uses Docker instead of PM2
2. **`.dockerignore`** - Configured to include necessary files

## Docker Setup

### Dockerfile Features
- **Multi-stage build**: Smaller production image
- **Non-root user**: Security best practice
- **Health checks**: Built-in container health monitoring
- **Signal handling**: Proper graceful shutdown with `dumb-init`
- **Production optimizations**: Only production dependencies in final image

### Docker Compose
- Manages backend container lifecycle
- Volume mounts for logs and uploads
- Health check configuration
- Network isolation

## Deployment Process

### Automatic (CI/CD)
When you push to `main` branch:
1. GitHub Actions validates the build
2. SSH to DigitalOcean droplet
3. Pull latest code
4. Build Docker image
5. Stop old container
6. Start new container
7. Health check verification

### Manual Deployment
```bash
# SSH to server
ssh root@your-droplet-ip

# Navigate to app directory
cd /var/www/sports-platform-api

# Run deployment script
chmod +x deploy/docker-deploy.sh
./deploy/docker-deploy.sh main
```

## Docker Commands

### View Logs
```bash
docker-compose logs -f
docker-compose logs --tail=100
```

### Check Status
```bash
docker-compose ps
docker ps
```

### Restart Container
```bash
docker-compose restart
```

### Stop Container
```bash
docker-compose down
```

### Start Container
```bash
docker-compose up -d
```

### Rebuild Container
```bash
docker-compose build --no-cache
docker-compose up -d
```

### View Container Resources
```bash
docker stats
```

### Execute Commands in Container
```bash
docker-compose exec backend sh
```

## Migration from PM2

### PM2 Status
- PM2 has been stopped on the server
- Old PM2 process has been deleted
- All new deployments use Docker

### Benefits of Docker
1. **Isolation**: Container isolates application dependencies
2. **Consistency**: Same environment across dev/staging/prod
3. **Portability**: Easy to move between servers
4. **Rollbacks**: Quick container image versioning
5. **Scaling**: Easy horizontal scaling
6. **Resource Limits**: Built-in resource management

## Health Checks

The container includes automatic health checks:
- Checks `/api/v1/health` endpoint
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3 attempts
- Start period: 40 seconds

## Environment Variables

Environment variables are loaded from `.env` file via `env_file` in `docker-compose.yml`.

Make sure your `.env` file on the server contains all production values.

## Volumes

The following directories are mounted as volumes:
- `./logs` → Container logs persist on host
- `./uploads` → Uploaded files persist on host

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs

# Check if port is in use
netstat -tuln | grep 5000

# Check container status
docker-compose ps
```

### Build Fails
```bash
# Clear Docker cache and rebuild
docker-compose build --no-cache

# Check Dockerfile syntax
docker build -t test .
```

### Health Check Fails
```bash
# Check application logs
docker-compose logs backend

# Test health endpoint manually
curl http://localhost:5000/api/v1/health

# Check container status
docker inspect sports-platform-api | grep -A 10 Health
```

### Rollback to Previous Version
```bash
# Stop current container
docker-compose down

# Check available images
docker images | grep sports-platform-api

# Run previous image (replace TAG with actual tag)
docker run -d --name sports-platform-api \
  -p 5000:5000 \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/uploads:/app/uploads \
  sports-platform-api:TAG
```

## Monitoring

### Container Metrics
```bash
# Real-time stats
docker stats sports-platform-api

# Container inspection
docker inspect sports-platform-api
```

### Log Management
```bash
# Follow logs
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Logs since timestamp
docker-compose logs --since 10m backend
```

## Next Steps

1. ✅ Docker installed on server
2. ✅ Dockerfile created
3. ✅ docker-compose.yml configured
4. ✅ CI/CD workflow updated
5. ✅ Migration from PM2 complete
6. ✅ Deployment scripts created

## Support

If you encounter any issues:
1. Check container logs: `docker-compose logs`
2. Verify environment variables in `.env`
3. Check Docker daemon: `systemctl status docker`
4. Review health check endpoint: `curl http://localhost:5000/api/v1/health`

---

**Status**: ✅ Docker migration complete
**Previous**: PM2 process manager
**Current**: Docker containers


