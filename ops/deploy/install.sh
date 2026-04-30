#!/usr/bin/env bash
###############################################################################
# install.sh — ECS 首次装机脚本(Ubuntu 22.04)
#
# 在 ECS 上执行一次。后续更新走 deploy.sh,不重跑这个。
#
# 假设:
#   - ECS 已装 Docker(从控制台扩展程序看到了)
#   - Supabase 已在 docker compose 里跑(若没跑,见末尾 §B)
#   - 你以 ubuntu / root 用户身份登录
###############################################################################
set -euo pipefail

ROOT=/opt/geo-studio
LOG_DIR=/var/log/geo-studio

echo "[install] === GEO Studio 装机 ==="

# ── 1. 系统更新 + 基础工具 ────────────────────────────────────────────────
sudo apt-get update -y
sudo apt-get install -y curl git build-essential ca-certificates gnupg lsb-release

# ── 2. Node.js 22 LTS(NodeSource 官方源)─────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  echo "[install] installing Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

# ── 3. pnpm 10(corepack)──────────────────────────────────────────────────
sudo corepack enable
sudo corepack prepare pnpm@10.33.0 --activate
pnpm -v

# ── 4. PM2 全局 ───────────────────────────────────────────────────────────
sudo npm install -g pm2@latest
pm2 -v

# ── 5. Caddy 2(反代 + 自动 HTTPS)─────────────────────────────────────────
if ! command -v caddy >/dev/null 2>&1; then
  echo "[install] installing Caddy"
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi
caddy version

# ── 6. Playwright + Chrome 依赖 ─────────────────────────────────────────────
# Playwright 需要一堆系统库(libnss3、libxkbcommon 等)。pnpm install 后
# 我们再 pnpm exec playwright install --with-deps chrome,这里只装系统侧。
sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 fonts-noto-cjk

# ── 7. 项目目录 + 代码 ────────────────────────────────────────────────────
sudo mkdir -p ${LOG_DIR}
sudo chown -R "$(whoami)":"$(whoami)" ${LOG_DIR}

# 两种来源都支持:
#   (a) 本地 rsync 推上来 — ${ROOT} 已存在 + 有 package.json,直接用
#   (b) git clone(如果配了 GIT_REPO_URL 环境变量)
if [[ -d ${ROOT} && -f ${ROOT}/package.json ]]; then
  echo "[install] 检测到 ${ROOT} 已有代码(rsync 推上来的),跳过 clone"
elif [[ -n "${GIT_REPO_URL:-}" ]]; then
  echo "[install] git clone ${GIT_REPO_URL} -> ${ROOT}"
  sudo mkdir -p ${ROOT}
  sudo chown -R "$(whoami)":"$(whoami)" ${ROOT}
  git clone "${GIT_REPO_URL}" ${ROOT}
else
  echo "FATAL: ${ROOT} 没代码,且没设 GIT_REPO_URL。"
  echo "  路径 A:本地跑 ops/deploy/rsync-to-ecs.sh first 把代码推上来,再跑 install.sh"
  echo "  路径 B:export GIT_REPO_URL=<your-repo-url> 后再跑 install.sh"
  exit 1
fi

cd ${ROOT}
pnpm install --frozen-lockfile

# Playwright Chrome 浏览器 + 系统依赖
pnpm exec playwright install --with-deps chrome

# ── 8. .env.production ────────────────────────────────────────────────────
if [[ ! -f ${ROOT}/.env.production ]]; then
  cp ${ROOT}/ops/deploy/.env.production.example ${ROOT}/.env.production
  chmod 600 ${ROOT}/.env.production
  echo ""
  echo "▲▲▲ 必须手动填 ${ROOT}/.env.production 再继续 ▲▲▲"
  echo "    nano ${ROOT}/.env.production"
  echo ""
  exit 1
fi

# ── 9. Build Web ─────────────────────────────────────────────────────────
pnpm --filter @geo/web build

# ── 10. PM2 启动 ─────────────────────────────────────────────────────────
chmod +x ${ROOT}/ops/deploy/start-web.sh ${ROOT}/ops/deploy/start-worker.sh
pm2 start ${ROOT}/ops/deploy/ecosystem.config.cjs
pm2 save
# 注册成 systemd unit,开机自启
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$(whoami)" --hp "$HOME" || true

# ── 11. Caddy 配置 ───────────────────────────────────────────────────────
sudo cp ${ROOT}/ops/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy
sudo systemctl enable --now caddy
sudo systemctl reload caddy

# ── 12. 健康检查 ─────────────────────────────────────────────────────────
sleep 5
echo ""
echo "[install] === 健康检查 ==="
echo "  Next.js (内网 :3000):"
curl -fsS http://127.0.0.1:3000/api/health || echo "  ✗ Next 没起"
echo ""
echo "  Caddy (公网 :8443,自签 cert):"
curl -fsSk https://127.0.0.1:8443/api/health || echo "  ✗ Caddy 没起"
echo ""
echo "[install] DONE。"
echo "  外部访问:https://47.98.131.138:8443"
echo "  PM2 状态:pm2 status"
echo "  日志:pm2 logs / tail -f /var/log/geo-studio/*.log"

###############################################################################
# §B. 如果 ECS 上还没跑 Supabase docker stack(从你提供的截图看 Docker 装了
# 但不确定 Supabase 起没起):
#
#   git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase
#   cd /tmp/supabase/docker
#   cp .env.example .env
#   # 编辑 .env(POSTGRES_PASSWORD,JWT_SECRET 用 openssl rand -hex 32 生成)
#   docker compose up -d
#
# 然后 .env.production 里 SUPABASE_* 的值要从 supabase/docker/.env 抄过来
# (ANON_KEY、SERVICE_ROLE_KEY 自动生成,docker logs supabase-kong 里能看到)。
###############################################################################
