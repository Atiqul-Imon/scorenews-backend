#!/bin/bash

# Remote Deployment Script - Run this on your DigitalOcean droplet
# This script can be executed remotely via SSH

set -e

# Configuration - UPDATE THESE VALUES
GITHUB_REPO_URL="${GITHUB_REPO_URL:-}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
BRANCH="${BRANCH:-main}"

APP_DIR="/var/www/sports-platform-api"

echo "🚀 Starting Enterprise Deployment..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root or with sudo"
    exit 1
fi

# Step 1: Clone Repository
if [ ! -d "$APP_DIR" ] || [ -z "$(ls -A $APP_DIR)" ]; then
    if [ -z "$GITHUB_REPO_URL" ]; then
        echo "⚠️  GITHUB_REPO_URL not set. Please provide your repository URL:"
        read -p "GitHub Repository URL: " GITHUB_REPO_URL
    fi
    
    echo "📥 Cloning repository..."
    mkdir -p $APP_DIR
    git clone $GITHUB_REPO_URL $APP_DIR
    echo "✅ Repository cloned"
else
    echo "✅ Repository already exists"
    cd $APP_DIR
    git pull origin $BRANCH
fi

cd $APP_DIR/backend-nestjs

# Step 2: Run automated deployment
echo "🔧 Running automated deployment..."
chmod +x deploy/automated-deploy.sh

if [ ! -z "$DOMAIN" ] && [ ! -z "$EMAIL" ]; then
    ./deploy/automated-deploy.sh $BRANCH $DOMAIN $EMAIL
else
    ./deploy/automated-deploy.sh $BRANCH
fi

echo ""
echo "✅ Deployment script completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure .env file with your production values"
echo "   2. Restart the application: pm2 restart sports-platform-api"
echo "   3. Verify deployment: curl http://localhost:5000/api/health"


