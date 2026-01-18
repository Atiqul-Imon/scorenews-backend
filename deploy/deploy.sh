#!/bin/bash

# Production Deployment Script
# Run this script on your DigitalOcean droplet to deploy updates

set -e

APP_DIR="/var/www/sports-platform-api"
BRANCH="${1:-main}"  # Default to main branch, or specify: ./deploy.sh developer

echo "🚀 Starting deployment..."
echo "📋 Branch: $BRANCH"

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

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Build application
echo "🔨 Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart ecosystem.config.js --update-env

# Check status
echo "📊 Application status:"
pm2 status

echo ""
echo "✅ Deployment complete!"
echo "🌐 Application should be running at http://your-server-ip:5000"
echo "📚 API docs: http://your-server-ip:5000/api/docs (if not production)"
echo ""

