# ADR 003 — Supabase 自托管到阿里云

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: 用户(医疗合规要求驱动) + 独立决策(实施细节)
**Related**: CLAUDE.md D7、D9; docs/05-deployment.md §1

## 背景

V1 W1-W7 期间 Supabase 用的是商业版 us-east-1 节点,中国大陆访问单次 round-trip ~1.6 秒,页面级延迟累积到 1-3 秒。但比性能更关键的是**合规**:

1. 首客是医院,患者信息属个人敏感信息+医疗信息双重监管
2. 数据存美国节点 → 跨境传输违反《个人信息保护法》第 38-39 条 + 《数据出境安全评估办法》
3. 即便升 Supabase 商业版 ap-northeast-1(Tokyo),数据仍出境
4. 长期客户都是国内品牌,数据出境风险持续放大

## 决策

**改用 Supabase 自托管,部署到阿里云 ECS 国内节点。**

Supabase 的全部能力(Postgres + Auth + Storage + RLS + Realtime + Studio)都开源。docker-compose 一键起,商业版 vs 自托管在功能上没差异,只是运维责任在我们。

不动搁置的方案:
- ❌ 国产栈拼凑(阿里云 RDS + OSS + NextAuth):3 套服务自己缝合,1-2 周开发,长期运维负担更大
- ❌ Supabase 商业 Tokyo:延迟解决但合规没解决,医院过不了法务

## 实施记录(2026-04-25 实做)

### 1. ECS 准备

- 实例:阿里云杭州 ECS, 2C 4G, Ubuntu 22.04, 40GB 系统盘
- 公网带宽:5 Mbps
- 月费:~¥120-150,首客阶段够用,V2 多客户升 4C8G
- **必做**:加 2GB swap(4G 物理内存跑全套 supabase + worker 容易 OOM)
- 安全组放行:22(SSH 限本机 IP)、8000(Supabase API,公网)、5432(Postgres,限本机 IP)

### 2. Docker 安装的坑

阿里云 Ubuntu 镜像预装了 `docker-compose-v2`(系统包),与 Docker CE 官方的 `docker-compose-plugin` 包文件冲突,直接安装会 dpkg fail。**必须先 `apt purge docker-compose-v2` 再装** Docker CE 全套。

Docker 镜像加速器走 docker.1panel.live + daocloud + 网易,GitHub 直连国内不稳,supabase 仓库走 `gh-proxy.com` 镜像 clone。

### 3. Supabase keys 和 URL 配置

- `utils/generate-keys.sh --update-env` 一键生成所有密钥(JWT_SECRET、ANON_KEY、SERVICE_ROLE_KEY 等)
- `SITE_URL` 必须设成本地 dev 的 URL(`http://localhost:3001`),不是公网 IP——否则 magic link redirect 跳到 Studio dashboard 而不是 web app
- `ADDITIONAL_REDIRECT_URLS` 加 `http://localhost:3001/**` 让 dev callback 通过白名单
- 改完 .env 必须 `docker compose up -d --force-recreate auth`,**`docker compose restart` 不重读环境变量**——这是 docker compose 行为(restart 重启进程不重建容器)

### 4. Postgres 连接的坑

Supabase 自托管把主机 5432 端口映射到 **Supavisor pooler**(不是直连 Postgres)。Supavisor 要求用户名带 tenant 后缀:

```
postgresql://postgres.<POOLER_TENANT_ID>:<password>@<host>:5432/postgres
```

默认 `POOLER_TENANT_ID=your-tenant-id`,所以 user 是 `postgres.your-tenant-id`。第一次连接有 ~2s 冷启动开销(SCRAM-SHA-256 + 池分配),后续 query <50ms。

### 5. 数据迁移

V1 没迁移老数据(demo 数据是测试性质)。新流程:
1. scp 6 个 migration sql 到服务器
2. `docker exec -i supabase-db psql ... < migration.sql` 逐个 apply
3. 本地通过新 SUPABASE_URL 跑 seed(`pnpm db:seed`、`dev-seed-w5`、`dev-seed-w6`、`dev-seed-content-for-ui`)
4. service-role 创建 admin user + tenant_membership(因为 dev-mint-link 只建 user 不绑 tenant)

### 6. 应用层副作用

切到新 Supabase 后,所有 ID(user_id、tenant_id、staff_id 等)全部重置。本地浏览器残留的 `geo_staff_session` cookie(基于旧 staff_id 签发)在新数据库找不到匹配,触发 `requireStaff()` 走错误路径——而它原代码会调 `clearStaffSession()` 删 cookie,**但 Next.js 14 不允许 server component 写 cookie**,直接抛 unhandled error。

修复:`requireStaff` 不再 clear,只 redirect。坏 cookie 留着无害(每次都 reject),登录成功后被 issueStaffSession 覆盖。

## 结果

| 指标 | 改造前 | 改造后 |
|---|---|---|
| Supabase API RTT | ~1600ms | ~220ms |
| Postgres 直连 RTT(后续) | n/a | <50ms |
| 数据出境合规 | ❌ 美国节点 | ✅ 杭州节点境内 |
| 月成本 | $25 (Supabase Pro) | ~¥150 (ECS) |
| 运维责任 | Supabase | 我们(备份、升级、监控自己负责) |

## 待办(W8 收尾前补)

1. **自动备份**:加 cron `pg_dump | gzip` 到 OSS,每日,保留 7 天
2. **监控**:Supabase 默认 Studio 看活动,但缺告警(磁盘/CPU/错误率)。装 netdata 或接 Sentry
3. **HTTPS**:V1 demo 直接 IP+8000 HTTP。客户上线前要走 nginx/caddy + 证书。建议买域名 → Let's Encrypt
4. **5432 暴露范围**:目前只对开发本机开。Vercel 部署 web 时,Vercel serverless IP 池极广,可能要改成 0.0.0.0 + 强密码 + 监控,或者改用 Supabase Pooler transaction mode + IP 限制
5. **ECS 续费**:实例当前包月,2026-05-04 到期,demo 通了改成包年(便宜 30%)

## 不在本 ADR 范围

- 多客户场景下"每客户一个 Supabase 实例" vs "共享实例多 tenant"——是 V3 SaaS 的事
- Supabase Studio 公开访问的鉴权——目前 dashboard 用户密码足够 demo
- Edge Functions / Realtime 的进阶用法

## 参考

- 实际 .env 配置:`secrets.local.md`(不入库)
- 备份的旧 Supabase URL:`.env.us-supabase.bak`
- Supabase 自托管文档:https://supabase.com/docs/guides/self-hosting/docker
