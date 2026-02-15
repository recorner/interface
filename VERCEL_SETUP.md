# Vercel Setup Instructions

## Step-by-Step

### 1. Create Vercel Account
- Go to https://vercel.com/signup
- Sign up with GitHub (recommended)

### 2. Create New Project
- Visit https://vercel.com/new
- Select "Other" as framework
- Connect your GitHub repository: `recorner/interface`

### 3. Configure Build Settings

In Vercel Project Settings:

**General**
- Framework: Other
- Build Command: `cd apps/web && CLOUDFLARE_ENV=production ROLLDOWN_OPTIONS_VALIDATION=loose npx vite build`
- Output Directory: `apps/web/build/client`
- Node.js Version: 22 LTS

**Environment Variables**

Add these (can be different per environment):

```
VITE_API_BASE           = https://api.uniswap.services
VITE_TELEGRAM_BOT_TOKEN = (leave empty for preview deployments)
VITE_ADMIN_PASSWORD     = (leave empty for preview deployments)
```

### 4. Domain Configuration

In Vercel Project Settings > Domains:

**Add Domain**:
- Enter: `uniswap.services`
- Set DNS records per Vercel instructions
- Add alias: `www.uniswap.services`

**Or use CNAME for existing domain**:
```
uniswap.services    CNAME   cname.vercel.com
www.uniswap.services CNAME   cname.vercel.com
```

### 5. Enable Auto-Deployment

- Production: Auto-deploy from `main` branch
- Preview: Auto-deploy from pull requests

## Deployment Workflow

After setup, deployments are automatic:

```bash
git push origin main
# Vercel automatically:
# 1. Installs dependencies
# 2. Builds Vite output
# 3. Deploys to CDN
# 4. Updates DNS
# (All within 2-5 minutes)
```

## Monitoring

Visit Vercel Dashboard to:
- View deployment status
- Check build logs: `https://vercel.com/{project}/deployments`
- Monitor analytics: `https://vercel.com/{project}/analytics`
- Manage environment variables
- Configure integrations (GitHub, Slack, etc.)

## API Proxy

The `/api/*` routes are proxied by Vercel to your backend server.

Configure in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.uniswap.services/:path*"
    }
  ]
}
```

Or leave as-is if backend handles CORS properly (current setup).

## Environment-Specific Configuration

### Production (main branch)
- Deploy to uniswap.services
- Uses production API endpoint
- Telegram bot token configured

### Preview (PR/feature branches)
- Deploy to preview.vercel.app
- Can use staging API or mock endpoints
- Admin password disabled for public preview

## Rollback a Deployment

In Vercel Dashboard:
1. Go to Deployments
2. Find the deployment to revert to
3. Click "..." menu > "Promote to Production"

Or via git:
```bash
git revert <commit-hash>
git push origin main
# Vercel auto-redeploys
```

## Troubleshooting

**Build fails**:
- Check: `CLOUDFLARE_ENV=production ROLLDOWN_OPTIONS_VALIDATION=loose` in build command
- View build logs in Vercel Dashboard > Deployments > {deployment} > Logs

**Deploys stuck**:
- Cancel and redeploy from Vercel Dashboard
- Or push a new commit to trigger rebuild

**API calls fail**:
- Verify `VITE_API_BASE` is correct
- Ensure backend API server is running (check `/root/interface/apps/web/api-proxy`)
- Check CORS headers in nginx config

## Advanced: GitHub Actions

Optionally add CI checks before Vercel deployment:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run g:typecheck
      - run: bun run g:test
```

Vercel will wait for these checks before deploying.

## Cost & Limits

- **Free Tier**: 100 deployments/month, unlimited bandwidth, 50GB storage
- **Pro Tier**: $20/month, unlimited deployments
- **Enterprise**: Custom pricing

Current usage: ~5-10 deployments/month = plenty of free tier capacity
