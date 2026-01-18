# DigitalOcean Deployment Guide

Complete guide for deploying the Sports Platform NestJS backend to a DigitalOcean droplet.

## 📋 Prerequisites

1. **DigitalOcean Account** with a droplet created
   - Recommended: Ubuntu 22.04 LTS
   - Minimum: 1GB RAM, 1 vCPU (2GB+ recommended for production)
   
2. **Domain name** (optional but recommended)
   - Point your domain's A record to your droplet's IP

3. **GitHub Repository** with your code pushed

4. **Environment Variables** ready
   - MongoDB connection string
   - JWT secrets
   - API keys
   - Email credentials
   - Media storage credentials

## 🚀 Initial Server Setup

### 1. Connect to Your Droplet

```bash
ssh root@your-droplet-ip
# Or if using SSH key:
ssh root@your-droplet-ip -i ~/.ssh/your-key
```

### 2. Run Initial Setup Script

```bash
# Download and run setup script
wget https://raw.githubusercontent.com/your-username/your-repo/main/backend-nestjs/deploy/setup-server.sh
chmod +x setup-server.sh
./setup-server.sh
```

Or manually follow the steps in `deploy/setup-server.sh`.

### 3. Create Non-Root User (Recommended)

```bash
# Create a new user
adduser deploy
usermod -aG sudo deploy

# Switch to new user
su - deploy
```

## 📦 Application Deployment

### Step 1: Clone Repository

```bash
# Create app directory
sudo mkdir -p /var/www/sports-platform-api
sudo chown -R $USER:$USER /var/www/sports-platform-api

# Clone repository
cd /var/www/sports-platform-api
git clone https://github.com/your-username/your-repo.git .
# Or if using SSH:
git clone git@github.com:your-username/your-repo.git .
```

### Step 2: Install Dependencies

```bash
cd /var/www/sports-platform-api/backend-nestjs
npm install --production
```

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your production values
nano .env
```

**Required Environment Variables:**

```env
# Server
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Media Storage (choose one)
# ImageKit
IMAGEKIT_PUBLIC_KEY=your-public-key
IMAGEKIT_PRIVATE_KEY=your-private-key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-id

# OR Cloudinary
# CLOUDINARY_CLOUD_NAME=your-cloud-name
# CLOUDINARY_API_KEY=your-api-key
# CLOUDINARY_API_SECRET=your-api-secret

# Sports API
SPORTMONKS_API_TOKEN=your-token-here
```

### Step 4: Build Application

```bash
npm run build
```

### Step 5: Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown
```

**PM2 Useful Commands:**

```bash
# View status
pm2 status

# View logs
pm2 logs sports-platform-api

# Restart
pm2 restart sports-platform-api

# Stop
pm2 stop sports-platform-api

# Monitor
pm2 monit
```

## 🌐 Nginx Configuration

### Step 1: Configure Nginx

```bash
# Copy nginx config
sudo cp /var/www/sports-platform-api/backend-nestjs/nginx/sports-platform-api.conf /etc/nginx/sites-available/sports-platform-api

# Edit configuration (replace yourdomain.com)
sudo nano /etc/nginx/sites-available/sports-platform-api

# Enable site
sudo ln -s /etc/nginx/sites-available/sports-platform-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 2: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d api.yourdomain.com

# Certbot will automatically configure Nginx
# Certificates auto-renew via cron
```

## 🔄 Deployment Process

### Method 1: Using Deployment Script

```bash
cd /var/www/sports-platform-api/backend-nestjs
chmod +x deploy/deploy.sh

# Deploy from main branch
./deploy/deploy.sh main

# Or deploy from developer branch
./deploy/deploy.sh developer
```

### Method 2: Manual Deployment

```bash
cd /var/www/sports-platform-api/backend-nestjs

# Pull latest changes
git pull origin main

# Install dependencies
npm ci --production

# Build
npm run build

# Restart PM2
pm2 restart ecosystem.config.js --update-env
```

## 📊 Monitoring

### Health Check

```bash
# Check API health
curl http://localhost:5000/api/health

# Through Nginx
curl http://api.yourdomain.com/api/health
```

### Logs

```bash
# Application logs (PM2)
pm2 logs sports-platform-api

# Nginx logs
sudo tail -f /var/log/nginx/sports-platform-api-access.log
sudo tail -f /var/log/nginx/sports-platform-api-error.log

# System logs
sudo journalctl -u nginx -f
```

### Monitoring Resources

```bash
# CPU and Memory
htop

# PM2 monitoring
pm2 monit

# Disk usage
df -h

# Check if services are running
sudo systemctl status nginx
sudo systemctl status redis-server
pm2 status
```

## 🔒 Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSH key-based authentication enabled
- [ ] Root login disabled (edit `/etc/ssh/sshd_config`)
- [ ] SSL certificate installed (HTTPS)
- [ ] Environment variables secured (`.env` not in git)
- [ ] Strong JWT secrets
- [ ] Rate limiting enabled in Nginx
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`
- [ ] PM2 running as non-root user
- [ ] File permissions set correctly

## 🛠️ Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs sports-platform-api --lines 100

# Check if port is in use
sudo netstat -tlnp | grep 5000

# Check environment variables
pm2 env 0  # Replace 0 with your app id from pm2 list
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
curl http://localhost:5000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/sports-platform-api-error.log

# Check PM2 status
pm2 status
```

### High Memory Usage

```bash
# Check memory usage
free -h
pm2 monit

# Restart if needed
pm2 restart sports-platform-api
```

### Database Connection Issues

```bash
# Test MongoDB connection
mongosh "your-mongodb-uri"

# Check environment variables
cat .env | grep MONGODB_URI

# Check network connectivity
ping your-mongodb-host
```

## 📈 Scaling

### Horizontal Scaling with PM2

Edit `ecosystem.config.js`:

```javascript
instances: 4,  // Use 4 instances instead of 'max'
```

Restart:
```bash
pm2 restart ecosystem.config.js --update-env
```

### Load Balancing with Nginx

Add multiple upstream servers in `nginx/sports-platform-api.conf`:

```nginx
upstream sports-platform-api {
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
    server 127.0.0.1:5003;
}
```

## 🔄 Backup Strategy

### Automated Backups

Create a backup script:

```bash
# Create backup directory
mkdir -p ~/backups

# Backup script
cat > ~/backups/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/backups"
APP_DIR="/var/www/sports-platform-api"

# Backup .env file
cp $APP_DIR/backend-nestjs/.env $BACKUP_DIR/.env.$DATE

# Backup logs (last 7 days)
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz $APP_DIR/backend-nestjs/logs/

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name ".env.*" -mtime +7 -delete
EOF

chmod +x ~/backups/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * $HOME/backups/backup.sh") | crontab -
```

## 📞 Support

If you encounter issues:

1. Check logs: `pm2 logs` and `sudo journalctl -u nginx`
2. Verify environment variables: `cat .env`
3. Test endpoints: `curl http://localhost:5000/api/health`
4. Check service status: `pm2 status` and `sudo systemctl status nginx`

---

**Deployment Status**: ✅ Ready for DigitalOcean

**Last Updated**: 2026-01-18

