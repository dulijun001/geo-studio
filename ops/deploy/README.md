# GEO Studio — 部署 runbook

ECS 国内单机部署。架构、决策见 [`docs/05-deployment.md`](../../docs/05-deployment.md) 与 ADR 003。

## 当前目标 ECS

| 项 | 值 |
|---|---|
| 实例 | `iZbp1142ll59xz5l8zrpcyZ` |
| 公网 IP | `120.26.103.14`(⚠️ 停机重开会漂移,以阿里云控制台为准) |
| 配置 | 4C16G,Ubuntu 22.04,40GB ESSD,杭州 |
| Docker | 已装(扩展程序) |
| 试用期到 | **2026-07-28**(到期未续费 → 释放,数据全没,务必转包年包月) |

## 文件清单

| 文件 | 作用 |
|---|---|
| `Caddyfile` | Caddy 反代配置,IP 阶段 + 域名阶段两套(域名块注释) |
| `ecosystem.config.cjs` | PM2 进程定义(geo-web、geo-worker) |
| `start-web.sh` / `start-worker.sh` | PM2 启动 wrapper,负责 source `.env.production` |
| `.env.production.example` | 生产环境变量模板,部署时 cp 到 `/opt/geo-studio/.env.production` |
| `install.sh` | ECS 首次装机(Node、pnpm、Caddy、Playwright deps、PM2、首次 build) |
| `deploy.sh` | 后续每次更新代码(git pull + 增量 install + 增量 migrate + reload) |

## 部署流程

### 第一次(首次装机)

1. 本地 push 最新代码到 GitHub
2. SSH 进 ECS:
   ```
   ssh -i ~/.ssh/id_ecs root@<ECS当前IP>
   ```
3. 拉 install 脚本(假设你已经把仓库 git url 告诉我):
   ```
   curl -fsSL https://raw.githubusercontent.com/<u>/geo-studio/main/ops/deploy/install.sh | bash
   ```
   或者先 `git clone` 再 `bash ops/deploy/install.sh`。
4. 第一次跑会停在「填 `.env.production`」处。`nano /opt/geo-studio/.env.production` 把所有 `<...>` 占位填上,保存,**再跑一次** install.sh。
5. 看到 `[install] DONE` + 健康检查 OK,浏览器开 `https://geo.dulijun.icu`(自签证书提示点继续)。

### 后续更新

```
ssh -i ~/.ssh/id_ecs root@<ECS当前IP> 'bash /opt/geo-studio/ops/deploy/deploy.sh'
```

会自动:`git pull` → 必要时 `pnpm install` → 必要时 `pnpm db:migrate` → `pnpm build` → PM2 reload → 健康检查。

### 备案下来后切域名

1. 阿里云 DNS 控制台:`dulijun.icu` 加 A 记录 → `120.26.103.14`(⚠️ 停机重开会漂移,以阿里云控制台为准),等 5-10 分钟生效
2. SSH 进 ECS,编辑 `/etc/caddy/Caddyfile`:
   - 注释/删除 `:9443` 块
   - 取消注释 `dulijun.icu` 块
3. `sudo systemctl reload caddy`(Caddy 会自动签 Let's Encrypt 证书,首次 30s)
4. 把 `/opt/geo-studio/.env.production` 的 `NEXT_PUBLIC_APP_URL` 改成 `https://dulijun.icu`
5. `pm2 reload all --update-env`

## 常见操作

```sh
# 状态
pm2 status
sudo systemctl status caddy

# 日志
pm2 logs geo-web --lines 100
pm2 logs geo-worker --lines 100
sudo journalctl -u caddy -f
sudo tail -f /var/log/caddy/access.log

# 重启单进程(不影响另一个)
pm2 restart geo-web
pm2 restart geo-worker

# 健康
curl -k https://127.0.0.1:9443/api/health
curl http://127.0.0.1:3000/api/health
```

## 安全 baseline

- Postgres / Auth / Storage **只监听 127.0.0.1**(Supabase Docker 默认),走 Caddy 反代到外部
- ECS 安全组只开 `22(SSH)`、`9443(IP 阶段)` 或 `80+443(域名阶段)`,关闭其余端口
- `.env.production` 文件权限 `600`,只 owner 可读
- `pm2` 注册成 systemd unit(`pm2 startup` 输出的命令),开机自启
- 数据库每日 dump 到对象存储,保留 7 天(后续脚本,见 `ops/deploy/backup.sh` TODO)
