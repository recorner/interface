# Uniswap Interface - Deployment & Management Guide

## Quick Start

### From a Fresh Server

```bash
# 1. Clone the repository
git clone https://github.com/recorner/interface.git /root/interface
cd /root/interface

# 2. Run full deployment
sudo ./deploy.sh full

# 3. Configure SSL certificates
sudo ./deploy.sh ssl
```

### Updating Existing Deployment

```bash
cd /root/interface
sudo ./deploy.sh deploy
```

---

## Service Architecture

### Frontend
- **Runtime**: Vite (SPA)
- **Domains**: uniswap.services, olesereni.site
- **Port**: 443 (nginx)
- **Build Output**: `apps/web/build/client/`

### API Backend
- **Runtime**: Bun + Fastify
- **Port**: 3001 (localhost only, proxied through nginx)
- **Database**: SQLite at `apps/web/api-proxy/data/uniswap-admin.db`

### Reverse Proxy
- **Software**: Nginx
- **Config**: `/etc/nginx/sites-available/`
- **Certs**: Cloudflare origin certs + Let's Encrypt

---

## Deployment Script Usage

### Available Commands

```bash
./deploy.sh full              # Complete setup from scratch
./deploy.sh build             # Build frontend only
./deploy.sh deploy            # Rebuild frontend + restart API (typical redeploy)
./deploy.sh api               # Restart API server
./deploy.sh nginx             # Regenerate and reload nginx configs
./deploy.sh ssl               # Setup SSL with Let's Encrypt
./deploy.sh status            # Show service status
./deploy.sh logs              # Tail API server logs
./deploy.sh stop              # Stop API server
./deploy.sh backup            # Backup database
./deploy.sh restore           # Restore database from backup
```

### Environment Variables

```bash
# Customize domains (default: uniswap.services, api.uniswap.services)
FRONTEND_DOMAIN=example.com API_DOMAIN=api.example.com ./deploy.sh deploy

# Skip installation or build
SKIP_INSTALL=1 SKIP_BUILD=1 ./deploy.sh deploy
```

---

## Vercel Integration for Frontend

### Option 1: Auto-Deploy with Git Push

1. **Create Vercel Account** & Project at https://vercel.com

2. **Connect GitHub**:
   ```bash
   # Via Vercel dashboard:
   # Settings > Git > Connect Git Repository > Select recorner/interface
   ```

3. **Configure Build Settings**:
   - **Framework**: Other (Vite)
   - **Build Command**: `cd apps/web && CLOUDFLARE_ENV=production ROLLDOWN_OPTIONS_VALIDATION=loose npx vite build`
   - **Output Directory**: `apps/web/build/client`
   - **Root Directory**: `.`

4. **Environment Variables** in Vercel:
   ```
   VITE_API_DOMAIN=api.uniswap.services
   VITE_TELEGRAM_BOT_TOKEN=<your_token>
   VITE_ADMIN_PASSWORD=<set_to_empty_for_vercel_preview>
   ```

5. **Deploy**:
   ```bash
   git push origin main
   # Vercel auto-deploys to preview + production
   ```

### Option 2: Manual Deployment via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from local build
cd /root/interface/apps/web/build/client
vercel --prod

# Or use the deploy script
./deploy.sh build
cd apps/web/build/client
vercel --prod
```

---

## Environment Variable Management

### Frontend (.env in `apps/web/`)

```env
VITE_API_BASE=https://api.uniswap.services
VITE_TELEGRAM_BOT_TOKEN=<your_bot_token>
VITE_ADMIN_PASSWORD=<password_for_maduro_panel>
```

### Backend (Environment Detection)

The backend auto-detects environment based on hostname:
- `uniswap.services` / `olesereni.site` → Production
- `localhost` / `127.0.0.1` → Development

Add domains to `apps/web/api-proxy/server.ts` ALLOWED_ORIGINS if deploying elsewhere.

---

## Database Management

### Backup

```bash
./deploy.sh backup
# Creates timestamped backup in ./backups/uniswap-admin_YYYYMMDD_HHMMSS.db
```

### Restore

```bash
./deploy.sh restore
# Lists available backups and lets you choose one to restore
```

### Direct Access

```bash
cd /root/interface/apps/web/api-proxy/data
sqlite3 uniswap-admin.db

# Common queries:
sqlite> SELECT COUNT(*) FROM watanabe_users;
sqlite> SELECT * FROM watanabe_licenses LIMIT 5;
sqlite> .schema watanabe_licenses
```

---

## Monitoring & Logging

### Status Check

```bash
./deploy.sh status
# Shows: nginx, API server, database, frontend build, SSL certs
```

### API Server Logs

```bash
./deploy.sh logs
# Or:
tail -f /tmp/api-server.log
```

### Nginx Logs

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Test API Endpoint

```bash
# Test auth endpoint
curl -X POST https://api.uniswap.services/api/watanabe/auth \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x1234567890123456789012345678901234567890"}'

# Check settings
curl https://api.uniswap.services/api/settings | jq .
```

---

## Troubleshooting

### Frontend not loading after deploy

```bash
# Verify build output exists
ls -la /root/interface/apps/web/build/client/index.html

# Check nginx config
nginx -t

# Reload nginx
systemctl reload nginx
```

### API server won't start

```bash
# Check logs
tail -50 /tmp/api-server.log

# Verify port 3001 is free
lsof -i :3001

# Restart manually
pkill -f 'bun.*server'
cd /root/interface/apps/web/api-proxy
bun run server.ts
```

### Database locked

```bash
# SQLite WAL mode can cause locks - check for stale processes
lsof /root/interface/apps/web/api-proxy/data/uniswap-admin.db*

# Force WAL cleanup
sqlite3 /root/interface/apps/web/api-proxy/data/uniswap-admin.db "PRAGMA journal_mode=DELETE;"
```

### SSL certificate expired

```bash
# Let's Encrypt (olesereni.site)
sudo certbot renew --nginx

# Cloudflare origin certs (uniswap.services)
# Download fresh cert from Cloudflare dashboard:
# https://dash.cloudflare.com > SSL/TLS > Origin Server
# Place at /etc/ssl/uniswap.services/fullchain.pem and privkey.pem
```

---

## Performance Tips

1. **Enable Gzip** - Already configured in nginx
2. **Use Cache Headers** - Assets are cached 1 year, HTML cache busted
3. **Monitor Bundle Size**:
   ```bash
   cd apps/web
   npm run build:report
   ```
4. **Database Indexes** - Check `apps/web/api-proxy/database.ts` for index creation on frequently queried columns

---

## Security Checklist

- [x] Environment detection (IP whitelist enforcement for secured pages)
- [x] CORS headers properly scoped to allowed domains
- [x] Admin password required for `/maduro` panel
- [x] API validates request source via X-Request-Source header
- [x] Telegram bot token secured in environment variables
- [x] SQLite database not world-readable
- [x] No raw SQL - all statements use parameterization

---

## Additional Services to Connect

### GitHub Actions (CI/CD)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: cd apps/web && npm run build
      - name: Deploy to Vercel
        run: |
          npm i -g vercel
          cd apps/web/build/client
          vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

### Monitoring (Uptime Robot)

https://uptimerobot.com
- Monitor: https://uniswap.services (GET /index.html)
- Alert on 5min downtime
- Check every 5 minutes

### Analytics

Already integrated:
- Amplitude (frontend events)
- Statsig (feature flags)

---

## Feature Flags & Settings

### Admin Panel

Access at: https://uniswap.services/maduro (requires password)

Configure:
- Watanabe mode (purchase/commission)
- License pricing and limits
- Asset balances
- Telegram bot token
- IP whitelist

---

## Deployment Workflow

### Making Changes

```bash
# 1. Make code changes locally
# 2. Test locally (npm run dev)
# 3. Commit and push
git add .
git commit -m "descriptive message (no emojis)"
git push origin main

# 4. Vercel auto-deploys frontend preview

# 5. Deploy to production
ssh root@server.com
cd /root/interface
sudo ./deploy.sh deploy
```

### Rollback

```bash
# Revert to previous commit
git revert <commit-hash>
git push origin main

# Or manual rollback
cd /root/interface
sudo ./deploy.sh restore  # Restore DB if needed
```

---

## Support & Documentation

- **API Docs**: See `apps/web/api-proxy/server.ts` for endpoint documentation
- **Database Schema**: See `apps/web/api-proxy/database.ts`
- **Frontend Changelog**: See git log for recent changes

For issues or questions, refer to the inline code documentation and commit messages.
