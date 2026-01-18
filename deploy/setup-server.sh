#!/bin/bash

# DigitalOcean Server Setup Script
# This script prepares a fresh Ubuntu server for deployment

set -e

echo "🚀 Starting server setup for Sports Platform Backend..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
echo "✅ Node.js $node_version installed"
echo "✅ npm $npm_version installed"

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install Redis (if not using external Redis)
echo "📦 Installing Redis..."
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install MongoDB (if using local MongoDB, otherwise skip this)
# echo "📦 Installing MongoDB..."
# wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
# sudo apt update
# sudo apt install -y mongodb-org
# sudo systemctl enable mongod
# sudo systemctl start mongod

# Install Git
echo "📦 Installing Git..."
sudo apt install -y git

# Install build essentials
echo "📦 Installing build essentials..."
sudo apt install -y build-essential

# Install UFW firewall
echo "🔒 Configuring firewall..."
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Create app directory
echo "📁 Creating application directory..."
APP_DIR="/var/www/sports-platform-api"
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# Create log directory
echo "📁 Creating log directory..."
sudo mkdir -p $APP_DIR/logs
sudo chown -R $USER:$USER $APP_DIR/logs

# Setup PM2 startup script
echo "🔄 Setting up PM2 startup script..."
pm2 startup systemd -u $USER --hp /home/$USER
echo "⚠️  Note: Run the command shown above as sudo if needed"

echo ""
echo "✅ Server setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Clone your repository:"
echo "      cd $APP_DIR"
echo "      git clone <your-repo-url> ."
echo ""
echo "   2. Install dependencies:"
echo "      npm install --production"
echo ""
echo "   3. Create .env file:"
echo "      cp .env.example .env"
echo "      nano .env  # Add your production values"
echo ""
echo "   4. Build the application:"
echo "      npm run build"
echo ""
echo "   5. Start with PM2:"
echo "      pm2 start ecosystem.config.js --env production"
echo "      pm2 save"
echo ""

