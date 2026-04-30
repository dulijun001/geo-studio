/**
 * PM2 ecosystem — production process supervision for ECS.
 *
 * Usage on ECS:
 *   pm2 start /opt/geo-studio/ops/deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup        # one-time, registers PM2 as a systemd unit
 *   pm2 reload all     # zero-downtime reload after deploy.sh
 *
 * Why PM2 over plain systemd: graceful reload, in-place log rotation,
 * cluster mode support if we ever need to scale Next.js to >1 worker
 * (single-CPU bound at low traffic — not enabled now).
 *
 * Why not Docker: the ECS already runs Supabase under Docker; piling
 * web + worker into more containers buys nothing here, and PM2 reload
 * is faster than `docker compose up -d` for a node app.
 */
const ROOT = '/opt/geo-studio';

module.exports = {
  apps: [
    {
      // ── Next.js web ─────────────────────────────────────────────────────
      name: 'geo-web',
      script: `${ROOT}/ops/deploy/start-web.sh`,
      cwd: ROOT,
      interpreter: 'bash',
      // 启动前 source .env.production — wrapper 脚本里 set -a 自动 export
      max_memory_restart: '1024M',
      kill_timeout: 8000,
      listen_timeout: 12000,
      wait_ready: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      // 日志:JSON line + 自动 rotate
      out_file: '/var/log/geo-studio/web-out.log',
      error_file: '/var/log/geo-studio/web-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    },
    {
      // ── Worker (pg-boss + Playwright) ───────────────────────────────────
      name: 'geo-worker',
      script: `${ROOT}/ops/deploy/start-worker.sh`,
      cwd: ROOT,
      interpreter: 'bash',
      // Worker 跑 Playwright headless Chrome,峰值内存 1-1.5GB(单 query 占 300-500MB)
      max_memory_restart: '2048M',
      kill_timeout: 30000,        // 给正在跑的 pg-boss job 30s 优雅退出
      autorestart: true,
      max_restarts: 5,
      min_uptime: '60s',
      out_file: '/var/log/geo-studio/worker-out.log',
      error_file: '/var/log/geo-studio/worker-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    },
  ],
};
