#!/bin/bash

# Production Deployment Script
# Run this script on your DigitalOcean droplet to deploy updates
# This is also called by GitHub Actions

set -e

APP_DIR="/var/www/sports-platform-api"
BRANCH="${1:-main}"  # Default to main branch, or specify: ./deploy.sh developer

echo "🚀 Starting deployment..."
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

# Pull latest changes
echo "📥 Pulling latest changes from $BRANCH..."
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# Show commit info
echo "📝 Latest commit:"
git log -1 --oneline

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Build application
echo "🔨 Building application..."
npm run build

# Verify build
if [ ! -f "dist/main.js" ]; then
  echo "❌ Error: Build failed - dist/main.js not found!"
  exit 1
fi

echo "✅ Build successful"

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js --env production

# Wait for app to start
sleep 3

# Check status
echo "📊 Application status:"
pm2 status

# Health check
echo "🏥 Running health check..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/v1/health || echo "000")

if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✅ Health check passed (HTTP $HEALTH_CHECK)"
  echo ""
  echo "✅ Deployment complete!"
  echo "🌐 Application is running at https://api.scorenews.net/api/v1"
  echo "📊 Health: https://api.scorenews.net/api/v1/health"
else
  echo "⚠️  Health check returned HTTP $HEALTH_CHECK"
  echo "📋 Recent PM2 logs:"
  pm2 logs sports-platform-api --lines 20 --nostream || true
  exit 1
fi
