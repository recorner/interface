#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────────
# Uniswap Interface - Full Deployment Script
# Deploys the web frontend + API backend from a fresh server or updates existing
# ────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
REPO_DIR="/root/interface"
WEB_DIR="${REPO_DIR}/apps/web"
API_DIR="${WEB_DIR}/api-proxy"
BUILD_DIR="${WEB_DIR}/build/client"
DATA_DIR="${API_DIR}/data"

# Domains (edit these for a new deployment)
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-uniswap.services}"
API_DOMAIN="${API_DOMAIN:-api.uniswap.services}"
FRONTEND_DOMAIN_ALT="${FRONTEND_DOMAIN_ALT:-olesereni.site}"
API_DOMAIN_ALT="${API_DOMAIN_ALT:-api.olesereni.site}"

API_PORT=3001
LOG_FILE="/tmp/api-server.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }
info() { echo -e "${BLUE}[i]${NC} $*"; }

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 [COMMAND]

Commands:
  full        Full setup from scratch (install deps, build, configure nginx, start)
  build       Build the web frontend only
  deploy      Build frontend + restart API server (typical redeploy)
  api         Restart the API server only
  nginx       Regenerate and reload nginx configs
  ssl         Set up SSL certificates with Let's Encrypt
  status      Show status of all services
  logs        Tail the API server logs
  stop        Stop the API server
  backup      Backup the database
  restore     Restore database from backup

Environment variables:
  FRONTEND_DOMAIN       Primary frontend domain (default: uniswap.services)
  API_DOMAIN            Primary API domain (default: api.uniswap.services)
  FRONTEND_DOMAIN_ALT   Secondary frontend domain (default: olesereni.site)
  API_DOMAIN_ALT        Secondary API domain (default: api.olesereni.site)
  SKIP_BUILD            Set to 1 to skip frontend build
  SKIP_INSTALL          Set to 1 to skip bun install

EOF
  exit 0
}

# ── Prerequisite checks ──────────────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root"
    exit 1
  fi
}

# ── Install system dependencies ──────────────────────────────────────────────
install_system_deps() {
  log "Installing system dependencies..."

  apt-get update -qq
  apt-get install -y -qq \
    curl git unzip nginx certbot python3-certbot-nginx \
    build-essential python3-setuptools \
    sqlite3 jq lsof > /dev/null 2>&1

  log "System dependencies installed"
}

# ── Install Bun ──────────────────────────────────────────────────────────────
install_bun() {
  if command -v bun &>/dev/null; then
    info "Bun already installed: $(bun --version)"
    return
  fi
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  log "Bun installed: $(bun --version)"
}

# ── Install Node.js (via nvm) ────────────────────────────────────────────────
install_node() {
  if command -v node &>/dev/null; then
    info "Node.js already installed: $(node --version)"
    return
  fi
  log "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs > /dev/null 2>&1
  log "Node.js installed: $(node --version)"
}

# ── Clone or update repo ────────────────────────────────────────────────────
setup_repo() {
  if [[ -d "${REPO_DIR}/.git" ]]; then
    info "Repository exists at ${REPO_DIR}"
    return
  fi
  warn "Repository not found at ${REPO_DIR}"
  warn "Please clone the repository first:"
  warn "  git clone <your-repo-url> ${REPO_DIR}"
  exit 1
}

# ── Install project dependencies ────────────────────────────────────────────
install_deps() {
  if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
    info "Skipping dependency install (SKIP_INSTALL=1)"
    return
  fi
  log "Installing project dependencies..."
  cd "${REPO_DIR}"
  bun install --frozen-lockfile 2>/dev/null || bun install
  log "Dependencies installed"
}

# ── Build frontend ──────────────────────────────────────────────────────────
build_frontend() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    info "Skipping frontend build (SKIP_BUILD=1)"
    return
  fi
  log "Building web frontend..."
  cd "${WEB_DIR}"

  CLOUDFLARE_ENV=production ROLLDOWN_OPTIONS_VALIDATION=loose npx vite build

  if [[ ! -d "${BUILD_DIR}" ]]; then
    err "Build failed - output directory not found at ${BUILD_DIR}"
    exit 1
  fi

  log "Frontend built successfully ($(du -sh "${BUILD_DIR}" | cut -f1))"
}

# ── Ensure database directory exists ─────────────────────────────────────────
setup_database() {
  log "Setting up database directory..."
  mkdir -p "${DATA_DIR}"
  chmod 700 "${DATA_DIR}"

  if [[ -f "${DATA_DIR}/uniswap-admin.db" ]]; then
    info "Database already exists"
  else
    info "Database will be created on first API start"
  fi
}

# ── API server management ───────────────────────────────────────────────────
stop_api() {
  log "Stopping API server..."
  pkill -f 'bun.*server\.ts' 2>/dev/null || true
  sleep 1
  # Force kill if still running
  if lsof -i ":${API_PORT}" &>/dev/null; then
    fuser -k "${API_PORT}/tcp" 2>/dev/null || true
    sleep 1
  fi
  log "API server stopped"
}

start_api() {
  log "Starting API server on port ${API_PORT}..."
  cd "${API_DIR}"

  # Install API-specific deps if needed
  if [[ ! -d "${API_DIR}/node_modules" ]]; then
    bun install
  fi

  nohup bun run server.ts > "${LOG_FILE}" 2>&1 &
  local pid=$!
  sleep 2

  if kill -0 "$pid" 2>/dev/null; then
    log "API server running (PID: ${pid}, Port: ${API_PORT})"
  else
    err "API server failed to start. Check logs: tail -f ${LOG_FILE}"
    tail -20 "${LOG_FILE}"
    exit 1
  fi
}

restart_api() {
  stop_api
  start_api
}

# ── Nginx configuration ─────────────────────────────────────────────────────
generate_nginx_frontend() {
  local domain=$1
  local ssl_cert=$2
  local ssl_key=$3
  local extra_ssl=${4:-""}

  cat <<NGINX
# ${domain} - Uniswap Web Interface

server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain} www.${domain};

    ssl_certificate ${ssl_cert};
    ssl_certificate_key ${ssl_key};
${extra_ssl}

    root ${BUILD_DIR};
    index index.html;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location /fonts/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location ~* \.(ico|png|jpg|jpeg|gif|svg|webp|pdf)$ {
        expires 30d;
        add_header Cache-Control "public";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINX
}

generate_nginx_api() {
  local domain=$1
  local ssl_cert=$2
  local ssl_key=$3
  local extra_ssl=${4:-""}

  cat <<'NGINX_HEAD'
# API_DOMAIN_PLACEHOLDER - API proxy
NGINX_HEAD

  cat <<NGINX

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate ${ssl_cert};
    ssl_certificate_key ${ssl_key};
${extra_ssl}

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    set \$cors_origin "";
    if (\$http_origin = "https://${FRONTEND_DOMAIN}") {
        set \$cors_origin "https://${FRONTEND_DOMAIN}";
    }
    if (\$http_origin = "https://www.${FRONTEND_DOMAIN}") {
        set \$cors_origin "https://www.${FRONTEND_DOMAIN}";
    }
    if (\$http_origin = "https://${FRONTEND_DOMAIN_ALT}") {
        set \$cors_origin "https://${FRONTEND_DOMAIN_ALT}";
    }
    if (\$http_origin = "https://www.${FRONTEND_DOMAIN_ALT}") {
        set \$cors_origin "https://www.${FRONTEND_DOMAIN_ALT}";
    }

    # SSE endpoints - no buffering
    location ~ ^/api/watanabe/license/stream/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding off;

        add_header Access-Control-Allow-Origin \$cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
    }

    location / {
        if (\$request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin \$cors_origin always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Request-Source, x-admin-password" always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Access-Control-Max-Age 0;
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header CF-Connecting-IP \$http_cf_connecting_ip;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 60s;

        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;
        proxy_hide_header Access-Control-Allow-Credentials;
        proxy_hide_header Vary;

        add_header Access-Control-Allow-Origin \$cors_origin always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Request-Source, x-admin-password" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Vary "Origin" always;
    }

    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINX
}

setup_nginx() {
  log "Configuring nginx..."

  # Primary domain (Cloudflare origin certs)
  local primary_ssl_cert="/etc/ssl/${FRONTEND_DOMAIN}/fullchain.pem"
  local primary_ssl_key="/etc/ssl/${FRONTEND_DOMAIN}/privkey.pem"

  # Alt domain (Let's Encrypt)
  local alt_ssl_cert="/etc/letsencrypt/live/${FRONTEND_DOMAIN_ALT}/fullchain.pem"
  local alt_ssl_key="/etc/letsencrypt/live/${FRONTEND_DOMAIN_ALT}/privkey.pem"
  local alt_extra_ssl="    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

  # Check SSL certs exist
  if [[ -f "$primary_ssl_cert" ]]; then
    generate_nginx_frontend "$FRONTEND_DOMAIN" "$primary_ssl_cert" "$primary_ssl_key" \
      > "/etc/nginx/sites-available/${FRONTEND_DOMAIN}"
    generate_nginx_api "$API_DOMAIN" "$primary_ssl_cert" "$primary_ssl_key" \
      > "/etc/nginx/sites-available/${API_DOMAIN}"
    ln -sf "/etc/nginx/sites-available/${FRONTEND_DOMAIN}" "/etc/nginx/sites-enabled/"
    ln -sf "/etc/nginx/sites-available/${API_DOMAIN}" "/etc/nginx/sites-enabled/"
    log "Primary domain nginx configs written"
  else
    warn "No SSL cert found for ${FRONTEND_DOMAIN} at ${primary_ssl_cert}"
    warn "Run '$0 ssl' to set up certificates, or place Cloudflare origin certs there"
  fi

  if [[ -f "$alt_ssl_cert" ]]; then
    generate_nginx_frontend "$FRONTEND_DOMAIN_ALT" "$alt_ssl_cert" "$alt_ssl_key" "$alt_extra_ssl" \
      > "/etc/nginx/sites-available/${FRONTEND_DOMAIN_ALT}"
    generate_nginx_api "$API_DOMAIN_ALT" "$alt_ssl_cert" "$alt_ssl_key" "$alt_extra_ssl" \
      > "/etc/nginx/sites-available/${API_DOMAIN_ALT}"
    ln -sf "/etc/nginx/sites-available/${FRONTEND_DOMAIN_ALT}" "/etc/nginx/sites-enabled/"
    ln -sf "/etc/nginx/sites-available/${API_DOMAIN_ALT}" "/etc/nginx/sites-enabled/"
    log "Alt domain nginx configs written"
  else
    warn "No SSL cert found for ${FRONTEND_DOMAIN_ALT}"
    warn "Run: certbot --nginx -d ${FRONTEND_DOMAIN_ALT} -d www.${FRONTEND_DOMAIN_ALT} -d ${API_DOMAIN_ALT}"
  fi

  # Remove default site
  rm -f /etc/nginx/sites-enabled/default

  # Test and reload
  nginx -t
  systemctl reload nginx
  log "Nginx configured and reloaded"
}

# ── SSL setup ────────────────────────────────────────────────────────────────
setup_ssl() {
  log "Setting up SSL certificates..."

  # Let's Encrypt for alt domain
  if [[ ! -f "/etc/letsencrypt/live/${FRONTEND_DOMAIN_ALT}/fullchain.pem" ]]; then
    log "Requesting Let's Encrypt certificate for ${FRONTEND_DOMAIN_ALT}..."
    certbot certonly --nginx \
      -d "${FRONTEND_DOMAIN_ALT}" \
      -d "www.${FRONTEND_DOMAIN_ALT}" \
      -d "${API_DOMAIN_ALT}" \
      --non-interactive --agree-tos --email "admin@${FRONTEND_DOMAIN_ALT}" || {
        warn "Certbot failed. You may need to set up DNS records first."
      }
  else
    info "Let's Encrypt cert already exists for ${FRONTEND_DOMAIN_ALT}"
  fi

  # Instructions for Cloudflare origin cert
  if [[ ! -f "/etc/ssl/${FRONTEND_DOMAIN}/fullchain.pem" ]]; then
    warn "No Cloudflare origin cert found for ${FRONTEND_DOMAIN}"
    echo ""
    info "To set up Cloudflare origin certificate:"
    info "  1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server"
    info "  2. Create Certificate (RSA, 15 years)"
    info "  3. Save the cert and key:"
    info "     mkdir -p /etc/ssl/${FRONTEND_DOMAIN}"
    info "     # Paste certificate into /etc/ssl/${FRONTEND_DOMAIN}/fullchain.pem"
    info "     # Paste private key into /etc/ssl/${FRONTEND_DOMAIN}/privkey.pem"
    info "  4. Re-run: $0 nginx"
    echo ""
  fi
}

# ── Database backup ──────────────────────────────────────────────────────────
backup_db() {
  local backup_dir="${REPO_DIR}/backups"
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="${backup_dir}/uniswap-admin_${timestamp}.db"

  mkdir -p "${backup_dir}"

  if [[ -f "${DATA_DIR}/uniswap-admin.db" ]]; then
    log "Backing up database..."
    sqlite3 "${DATA_DIR}/uniswap-admin.db" ".backup '${backup_file}'"
    log "Database backed up to ${backup_file} ($(du -sh "${backup_file}" | cut -f1))"

    # Keep only last 10 backups
    cd "${backup_dir}"
    ls -t uniswap-admin_*.db 2>/dev/null | tail -n +11 | xargs -r rm --
    info "Kept last 10 backups"
  else
    warn "No database found to backup"
  fi
}

restore_db() {
  local backup_dir="${REPO_DIR}/backups"

  if [[ ! -d "${backup_dir}" ]] || [[ -z "$(ls "${backup_dir}"/uniswap-admin_*.db 2>/dev/null)" ]]; then
    err "No backups found in ${backup_dir}"
    exit 1
  fi

  echo "Available backups:"
  ls -lht "${backup_dir}"/uniswap-admin_*.db
  echo ""

  local latest
  latest=$(ls -t "${backup_dir}"/uniswap-admin_*.db | head -1)
  read -rp "Restore from ${latest}? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    info "Restore cancelled"
    return
  fi

  stop_api
  cp "${latest}" "${DATA_DIR}/uniswap-admin.db"
  log "Database restored from ${latest}"
  start_api
}

# ── Status check ─────────────────────────────────────────────────────────────
show_status() {
  echo ""
  info "=== Service Status ==="
  echo ""

  # Nginx
  if systemctl is-active --quiet nginx; then
    log "Nginx: running"
  else
    err "Nginx: stopped"
  fi

  # API Server
  if lsof -i ":${API_PORT}" &>/dev/null; then
    local pid
    pid=$(lsof -ti ":${API_PORT}" | head -1)
    log "API Server: running (PID: ${pid}, Port: ${API_PORT})"
  else
    err "API Server: stopped"
  fi

  # Database
  if [[ -f "${DATA_DIR}/uniswap-admin.db" ]]; then
    log "Database: exists ($(du -sh "${DATA_DIR}/uniswap-admin.db" | cut -f1))"
  else
    warn "Database: not found"
  fi

  # Build
  if [[ -d "${BUILD_DIR}" ]]; then
    log "Frontend build: exists ($(du -sh "${BUILD_DIR}" | cut -f1))"
  else
    warn "Frontend build: not found"
  fi

  # SSL certs
  echo ""
  info "=== SSL Certificates ==="
  for cert_path in "/etc/ssl/${FRONTEND_DOMAIN}/fullchain.pem" "/etc/letsencrypt/live/${FRONTEND_DOMAIN_ALT}/fullchain.pem"; do
    if [[ -f "$cert_path" ]]; then
      local expiry
      expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
      log "$(basename "$(dirname "$cert_path")"): valid until ${expiry}"
    fi
  done

  # Domains
  echo ""
  info "=== Configured Domains ==="
  info "Frontend: https://${FRONTEND_DOMAIN} | https://${FRONTEND_DOMAIN_ALT}"
  info "API:      https://${API_DOMAIN} | https://${API_DOMAIN_ALT}"
  echo ""
}

# ── Full setup from scratch ──────────────────────────────────────────────────
full_setup() {
  check_root
  log "Starting full deployment..."
  echo ""

  install_system_deps
  install_bun
  install_node
  setup_repo
  install_deps
  setup_database
  build_frontend
  restart_api
  setup_nginx

  echo ""
  log "Deployment complete"
  show_status
}

# ── Standard deploy (build + restart) ───────────────────────────────────────
deploy() {
  check_root
  log "Starting deployment..."

  backup_db
  install_deps
  build_frontend
  restart_api
  systemctl reload nginx

  log "Deployment complete"
  show_status
}

# ── Main ─────────────────────────────────────────────────────────────────────
case "${1:-}" in
  full)     full_setup ;;
  build)    build_frontend ;;
  deploy)   deploy ;;
  api)      restart_api ;;
  nginx)    check_root; setup_nginx ;;
  ssl)      check_root; setup_ssl ;;
  status)   show_status ;;
  logs)     tail -f "${LOG_FILE}" ;;
  stop)     stop_api ;;
  backup)   backup_db ;;
  restore)  restore_db ;;
  help|-h|--help) usage ;;
  "")       usage ;;
  *)        err "Unknown command: $1"; usage ;;
esac
