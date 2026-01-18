# Quick Deployment Checklist

## 🚀 Pre-Deployment Checklist

- [ ] DigitalOcean droplet created (Ubuntu 22.04 LTS)
- [ ] Domain name configured (optional)
- [ ] SSH access to droplet
- [ ] GitHub repository ready with code pushed
- [ ] Environment variables prepared (MongoDB URI, JWT secrets, etc.)

## 📋 Deployment Steps

### 1. Initial Server Setup

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Clone repository and run setup
cd /var/www
git clone <your-repo-url> sports-platform-api
cd sports-platform-api/backend-nestjs
chmod +x deploy/setup-server.sh
./deploy/setup-server.sh
```

### 2. Configure Environment

```bash
cd /var/www/sports-platform-api/backend-nestjs
cp .env.example .env
nano .env  # Add your production values
```

### 3. Build and Start

```bash
# Install dependencies
npm ci --production

# Build application
npm run build

# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup
```

### 4. Configure Nginx

```bash
# Copy nginx config
sudo cp nginx/sports-platform-api.conf /etc/nginx/sites-available/

# Edit domain name
sudo nano /etc/nginx/sites-available/sports-platform-api.conf

# Enable site
sudo ln -s /etc/nginx/sites-available/sports-platform-api /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Setup SSL (Optional)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

## 🔄 Future Deployments

### Using Deploy Script

```bash
cd /var/www/sports-platform-api/backend-nestjs
./deploy/deploy.sh main
```

### Manual Deployment

```bash
git pull origin main
npm ci --production
npm run build
npm run pm2:restart
```

## 📊 Useful Commands

```bash
# PM2
npm run pm2:status    # View status
npm run pm2:logs      # View logs
npm run pm2:monit     # Monitor resources
npm run pm2:restart   # Restart app

# Health check
curl http://localhost:5000/api/health

# Check services
sudo systemctl status nginx
pm2 status
```

## 🔒 Security Checklist

- [ ] Firewall configured (UFW)
- [ ] SSH key-based auth enabled
- [ ] SSL certificate installed
- [ ] Strong JWT secrets
- [ ] `.env` file secured (not in git)
- [ ] Regular updates scheduled

## 📚 Full Documentation

See `DIGITALOCEAN_DEPLOYMENT.md` for complete guide.

---

**Status**: ✅ Ready to Deploy!

