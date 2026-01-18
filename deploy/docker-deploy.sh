#!/bin/bash

# Docker Deployment Script
# Run this script on your DigitalOcean droplet to deploy updates using Docker

set -e

APP_DIR="/var/www/sports-platform-api"
BRANCH="${1:-main}"  # Default to main branch

echo "🐳 Starting Docker deployment..."
echo "📋 Branch: $BRANCH"
echo "📅 Time: $(date)"

# Navigate to app directory
cd $APP_DIR || {
  echo "❌ Error: $APP_DIR does not exist!"
  exit 1
}

# Check if git repo exists
if [ ! -d .git ]; then
  echo "❌ Error: Not a git repository!"
  exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Error: Docker is not installed!"
  echo "Install Docker first: apt install -y docker.io docker-compose"
  exit 1
fi

# Pull latest changes
echo "📥 Pulling latest changes from $BRANCH..."
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Show commit info
echo "📝 Latest commit:"
git log -1 --oneline

# Stop existing container
echo "🛑 Stopping existing container..."
docker-compose down || true

# Build new image
echo "🔨 Building Docker image..."
docker-compose build --no-cache

# Start container
echo "🚀 Starting container..."
docker-compose up -d

# Wait for container to start
echo "⏳ Waiting for container to be ready..."
sleep 10

# Check container status
echo "📊 Container Status:"
docker-compose ps

# Health check
echo "🏥 Running health check..."
MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/v1/health || echo "000")
  if [ "$HEALTH_CHECK" = "200" ]; then
    HEALTHY=true
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS: HTTP $HEALTH_CHECK (waiting...)"
  sleep 2
done

if [ "$HEALTHY" = true ]; then
  echo "✅ Health check passed (HTTP 200)"
  echo ""
  echo "✅ Docker deployment complete!"
  echo "🌐 Application is running at https://api.scorenews.net/api/v1"
  echo "📊 Health: https://api.scorenews.net/api/v1/health"
  echo ""
  echo "📋 Useful commands:"
  echo "  docker-compose logs -f          # View logs"
  echo "  docker-compose ps               # View status"
  echo "  docker-compose restart          # Restart container"
  echo "  docker-compose down             # Stop container"
else
  echo "❌ Health check failed after $MAX_ATTEMPTS attempts"
  echo "📋 Container logs:"
  docker-compose logs --tail=50
  echo "📋 Container status:"
  docker-compose ps
  exit 1
fi

