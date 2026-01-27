# Step-by-Step Deployment Guide

Follow these instructions to deploy your backend to DigitalOcean.

## Prerequisites

Before starting, make sure you have:
1. ✅ DigitalOcean droplet created (Ubuntu 22.04 LTS recommended)
2. ✅ SSH access to your droplet
3. ✅ Your GitHub repository URL
4. ✅ Your production environment variables ready (MongoDB URI, JWT secrets, etc.)

## Step 1: Connect to Your Droplet

```bash
ssh root@your-droplet-ip
# Or if using SSH key:
ssh -i ~/.ssh/your-key root@your-droplet-ip
```

## Step 2: Clone Your Repository

```bash
cd /var/www
git clone https://github.com/your-username/your-repo-name.git sports-platform-api
# Or use SSH:
git clone git@github.com:your-username/your-repo-name.git sports-platform-api
```

## Step 3: Run Automated Deployment Script

```bash
cd /var/www/sports-platform-api/backend-nestjs
chmod +x deploy/automated-deploy.sh

# Basic deployment (without SSL)
sudo ./deploy/automated-deploy.sh

# With domain and SSL (recommended)
sudo ./deploy/automated-deploy.sh main api.yourdomain.com your-email@example.com
```

The script will:
- ✅ Update system packages
- ✅ Install Node.js 20.x
- ✅ Install PM2 process manager
- ✅ Install and configure Nginx
- ✅ Install Redis
- ✅ Configure firewall
- ✅ Install dependencies
- ✅ Build the application
- ✅ Start with PM2
- ✅ Configure Nginx reverse proxy
- ✅ Setup SSL certificate (if domain provided)

## Step 4: Configure Environment Variables

After the script runs, you'll need to edit the `.env` file:

```bash
cd /var/www/sports-platform-api/backend-nestjs
nano .env
```

**Required Variables:**
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_REFRESH_SECRET=your-super-secret-refresh-key-minimum-32-characters

REDIS_HOST=localhost
REDIS_PORT=6379

CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Media Storage (choose one)
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

After saving, restart the application:

```bash
pm2 restart sports-platform-api
```

## Step 5: Verify Deployment

### Check Application Status

```bash
pm2 status
pm2 logs sports-platform-api
```

### Test Health Endpoint

```bash
curl http://localhost:5000/api/health
```

Or through Nginx:
```bash
curl http://api.yourdomain.com/api/health
```

### Check Services

```bash
# Check Nginx
sudo systemctl status nginx

# Check Redis
sudo systemctl status redis-server

# Check PM2
pm2 list
```

## Step 6: Domain Configuration (if not done automatically)

### Update DNS

Point your domain's A record to your droplet's IP address:
```
Type: A
Name: api
Value: your-droplet-ip
TTL: 3600
```

### Setup SSL Certificate Manually (if needed)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs sports-platform-api --lines 100

# Check if port is in use
sudo netstat -tlnp | grep 5000

# Check environment variables
pm2 env 0
```

### Nginx 502 Bad Gateway

```bash
# Check if backend is running
curl http://localhost:5000/api/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/sports-platform-api-error.log

# Restart services
pm2 restart sports-platform-api
sudo systemctl reload nginx
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

## Next Steps

After successful deployment:

1. ✅ Test all API endpoints
2. ✅ Setup monitoring (optional)
3. ✅ Configure backups
4. ✅ Setup log rotation
5. ✅ Configure automatic updates

## Useful Commands

```bash
# PM2 Management
pm2 status                    # View status
pm2 logs sports-platform-api  # View logs
pm2 restart sports-platform-api  # Restart
pm2 stop sports-platform-api     # Stop
pm2 delete sports-platform-api   # Delete
pm2 monit                     # Monitor resources
pm2 save                      # Save configuration

# Deployment
cd /var/www/sports-platform-api/backend-nestjs
./deploy/deploy.sh main       # Deploy from main branch

# Nginx
sudo nginx -t                 # Test configuration
sudo systemctl reload nginx   # Reload nginx
sudo systemctl restart nginx  # Restart nginx
sudo tail -f /var/log/nginx/sports-platform-api-access.log  # View access logs

# System
sudo apt update && sudo apt upgrade  # Update system
df -h                        # Check disk usage
free -h                      # Check memory
htop                         # Monitor resources
```

---

**Need Help?** Check `DIGITALOCEAN_DEPLOYMENT.md` for detailed documentation.


