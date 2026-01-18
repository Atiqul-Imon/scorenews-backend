#!/bin/bash

# Enterprise-Grade Automated Deployment Script for DigitalOcean
# This script handles the complete deployment process
# Run this script on your DigitalOcean droplet

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/sports-platform-api"
APP_USER="${SUDO_USER:-$USER}"
BRANCH="${1:-main}"
DOMAIN="${2:-}"
EMAIL="${3:-}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Enterprise Deployment - Sports Platform API${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root or with sudo${NC}"
    exit 1
fi

# Step 1: Update System
echo -e "${GREEN}[1/10]${NC} Updating system packages..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20.x
echo -e "${GREEN}[2/10]${NC} Installing Node.js 20.x..."
if ! command -v node &> /dev/null || [ "$(node --version | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo -e "${GREEN}✅${NC} Node.js $(node --version) installed"
echo -e "${GREEN}✅${NC} npm $(npm --version) installed"

# Step 3: Install PM2
echo -e "${GREEN}[3/10]${NC} Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi
echo -e "${GREEN}✅${NC} PM2 installed"

# Step 4: Install Nginx
echo -e "${GREEN}[4/10]${NC} Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi
systemctl enable nginx
systemctl start nginx
echo -e "${GREEN}✅${NC} Nginx installed and started"

# Step 5: Install Redis
echo -e "${GREEN}[5/10]${NC} Installing Redis..."
if ! command -v redis-server &> /dev/null; then
    apt install -y redis-server
fi
systemctl enable redis-server
systemctl start redis-server
echo -e "${GREEN}✅${NC} Redis installed and started"

# Step 6: Configure Firewall
echo -e "${GREEN}[6/10]${NC} Configuring firewall..."
apt install -y ufw
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo -e "${GREEN}✅${NC} Firewall configured"

# Step 7: Setup Application Directory
echo -e "${GREEN}[7/10]${NC} Setting up application directory..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/uploads

# Check if directory is empty
if [ -z "$(ls -A $APP_DIR)" ]; then
    echo -e "${YELLOW}⚠️  Application directory is empty${NC}"
    echo -e "${YELLOW}Please clone your repository first:${NC}"
    echo -e "  cd $APP_DIR"
    echo -e "  git clone <your-repo-url> ."
    echo ""
    read -p "Have you cloned the repository? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Please clone the repository first and run this script again${NC}"
        exit 1
    fi
fi

cd $APP_DIR/backend-nestjs || {
    echo -e "${RED}❌ Error: backend-nestjs directory not found!${NC}"
    exit 1
}

# Step 8: Install Dependencies and Build
echo -e "${GREEN}[8/10]${NC} Installing dependencies and building application..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Created .env from .env.example${NC}"
        echo -e "${YELLOW}⚠️  Please update .env with your production values!${NC}"
        read -p "Press Enter after updating .env file..."
    else
        echo -e "${RED}❌ No .env or .env.example file found!${NC}"
        exit 1
    fi
fi

npm ci --production
npm run build

# Step 9: Configure PM2
echo -e "${GREEN}[9/10]${NC} Configuring PM2..."
if [ -f "ecosystem.config.js" ]; then
    pm2 delete sports-platform-api 2>/dev/null || true
    pm2 start ecosystem.config.js --env production
    pm2 save
    pm2 startup systemd -u $APP_USER --hp /home/$APP_USER
    echo -e "${GREEN}✅${NC} PM2 configured and started"
else
    echo -e "${RED}❌ ecosystem.config.js not found!${NC}"
    exit 1
fi

# Step 10: Configure Nginx
echo -e "${GREEN}[10/10]${NC} Configuring Nginx..."
if [ -f "nginx/sports-platform-api.conf" ]; then
    # Update domain in nginx config if provided
    if [ ! -z "$DOMAIN" ]; then
        sed -i "s/api.yourdomain.com/$DOMAIN/g" nginx/sports-platform-api.conf
    fi
    
    cp nginx/sports-platform-api.conf /etc/nginx/sites-available/sports-platform-api
    ln -sf /etc/nginx/sites-available/sports-platform-api /etc/nginx/sites-enabled/
    
    # Remove default nginx site
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    nginx -t
    
    # Reload nginx
    systemctl reload nginx
    echo -e "${GREEN}✅${NC} Nginx configured and reloaded"
else
    echo -e "${YELLOW}⚠️  Nginx config not found, skipping...${NC}"
fi

# Step 11: Setup SSL (if domain provided)
if [ ! -z "$DOMAIN" ] && [ ! -z "$EMAIL" ]; then
    echo -e "${GREEN}[11/11]${NC} Setting up SSL certificate..."
    apt install -y certbot python3-certbot-nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL
    echo -e "${GREEN}✅${NC} SSL certificate installed"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}📊 Application Status:${NC}"
pm2 status
echo ""
echo -e "${BLUE}🌐 Application URLs:${NC}"
if [ ! -z "$DOMAIN" ]; then
    echo -e "  Production: https://$DOMAIN"
    echo -e "  Health Check: https://$DOMAIN/api/health"
else
    echo -e "  Local: http://localhost:5000"
    echo -e "  Health Check: http://localhost:5000/api/health"
fi
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo -e "  View logs: ${YELLOW}pm2 logs sports-platform-api${NC}"
echo -e "  Restart: ${YELLOW}pm2 restart sports-platform-api${NC}"
echo -e "  Monitor: ${YELLOW}pm2 monit${NC}"
echo ""
echo -e "${GREEN}✅ Backend is now running on your DigitalOcean droplet!${NC}"

