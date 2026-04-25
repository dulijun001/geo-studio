# 05 - V1 部署 Checklist

> 一次性走完这份单子,首客就能上生产。每个步骤都有"为什么"和"踩雷点"。

## 一、目标拓扑

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Vercel (web)   │    │ Supabase (DB +   │    │  Railway (worker)│
│  Next.js 14     ├───▶│  Auth + Storage) │◀───┤  Node + Playwright│
│  apps/web       │    │  Postgres + RLS  │    │  apps/worker     │
└─────────────────┘    │  pg-boss queue   │    └──────────────────┘
        │              └──────────────────┘            │
        │                       ▲                      │
        ▼                       │                      ▼
   www.客户域.com         火山方舟(豆包)              系统 Chrome
   (CNAME → Vercel)         + 阿里云 SMS              (headful, /usr/bin/...)
```

三方分工:
- **Vercel**:Next.js 应用,管理员后台 + 员工 PWA + 公开 checkin
- **Supabase**:Postgres、Auth(邮箱魔链)、Storage(Word/PDF/图片)、pg-boss 跑在 `pgboss` schema
- **Railway**:常驻 Node worker,跑 pg-boss 消费(变体生成、合规审查、GEO 追踪、钩子配置)

## 二、首次部署顺序(强烈建议照走)

### 1. Supabase

1. https://supabase.com/dashboard → 新建项目,选 `Northeast Asia (Tokyo)` 区域(对中国大陆延迟最低且稳定)
2. 项目设置 → API,记下:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`(**绝不**暴露给浏览器,只给 worker + server actions 用)
3. 项目设置 → Database → Connection string,记下 `DATABASE_URL`(用 "Session mode" 格式)
4. SQL Editor 跑 migration,**严格按编号顺序**:
   ```
   supabase/migrations/0000_initial.sql
   supabase/migrations/0001_rls_policies.sql
   supabase/migrations/0002_tenant_bootstrap.sql
   supabase/migrations/0003_content_storage.sql
   supabase/migrations/0004_w5_dispatch.sql
   supabase/migrations/0005_w6_tracking.sql
   ```
   或在本地用 `pnpm exec tsx packages/db/src/dev-apply-migration.ts <文件>` 逐个 apply。
5. 跑 seed:`pnpm --filter @geo/db seed`(创建 compliance_keywords 黑名单 40+11 条)
6. Auth → Email Templates → 改"Magic Link"模板(默认英文,改成"点击此链接登录 GEO Studio")
7. Storage → 新建 bucket `content-uploads`,设为 private
8. 启用 RLS:每张业务表都应在 0001 migration 里 `ENABLE ROW LEVEL SECURITY`,SQL Editor 跑:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
   ```
   验证所有业务表 `rowsecurity=true`。漏一张是潜在数据泄露。

**踩雷点**:
- 别选美国节点。中国大陆访问 RTT 200-400ms,首屏拖到 3 秒+,客户体验崩
- 跑 migration 之前,**确认**这是新空项目,不是误连客户已有项目。0000 会建表,撞上现有表名会一半成功一半失败

### 2. Volcengine Ark(豆包 LLM)

1. https://console.volcengine.com/ark → 实名认证 → 开通"模型服务"
2. 创建 API Key,记下 `ARK_API_KEY`
3. 模型选型:V1 用 `doubao-seed-1-6-pro-250815`(写入 `ARK_MODEL_PRO`)。这是生成质量最高的稳定版本
4. 在火山控制台开"在线推理"配额。默认 RPM 较低(60-120),W3.2 并行 6 个平台时可能撞限流。生产建议申请提升到 600 RPM
5. 计费:豆包 Pro 输入 ¥0.0008/1K token,输出 ¥0.002/1K token。一条变体 ~3K tokens → ~¥0.005/条。100 员工 × 2 条/天 × 30 天 = 6000 条/月 ≈ ¥30 token 成本

**踩雷点**:
- 火山方舟 API key 限单 IP 调用,worker 部署后第一次跑会因为新 IP 被风控,需要登 console 在"安全设置"加白名单
- 模型 ID 会过期淘汰(每 6-12 月一代),`ARK_MODEL_PRO` 需要每个季度 review 一次

### 3. Railway(worker)

1. https://railway.app → 新建项目,从 GitHub 仓库导入,Root Directory 填 `apps/worker`
2. 环境变量(从 `.env.example` 复制全部)— **特别注意**:
   - `DATABASE_URL`:用 Supabase Session mode connection string,**不是** pooler mode(pg-boss 需要长连接)
   - `PLAYWRIGHT_HEADLESS=true` ← V1 部署时设 true,**前提是**容器装好 Xvfb;否则保持 default(headful 在 Linux 容器需要 X 服务器)
   - `STAFF_SESSION_SECRET`:用 `openssl rand -hex 32` 生成,**和 Vercel 上设的同值**(否则员工 session cookie 跨服务对不上)
3. 在 `apps/worker/Dockerfile`(若不存在则建)装系统 Chrome — **关键**:
   ```dockerfile
   FROM node:22-bookworm-slim

   # System Chrome (Doubao Web blocks bundled Playwright chromium — see ADR-002)
   RUN apt-get update && apt-get install -y wget gnupg ca-certificates xvfb \
     && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
     && echo "deb [signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
     && apt-get update && apt-get install -y google-chrome-stable \
     && rm -rf /var/lib/apt/lists/*

   WORKDIR /app
   COPY . .
   RUN corepack enable && pnpm install --frozen-lockfile
   RUN pnpm --filter @geo/worker build

   # Headful Chrome via Xvfb wrapper for tracking jobs
   CMD ["xvfb-run", "--auto-servernum", "node", "apps/worker/dist/index.js"]
   ```
4. Railway → Settings → Health Check Path 留空(worker 没 HTTP),用进程存活监控就够
5. 部署日志看 `[worker] pg-boss started` + `[worker] jobs registered`,代表起来了

**踩雷点**:
- 不装 google-chrome-stable 直接用 Playwright bundled chromium,豆包追踪 100% 会被 ERR_CONNECTION_CLOSED(W6.0 已实证)。这是这一周 deploy 失败最常见的原因
- Railway 默认重启策略是"每次 deploy 滚动",但 worker 中断会丢正在跑的 LLM 调用(已扣 token 但结果丢了)。生产部署后,DB 留了 audit_logs 但变体可能没插入。建议每次 deploy 前用 `boss.stop({ graceful: true })`(代码已 wired),并在低峰期 deploy
- W6 GEO 追踪同 IP 高频会被豆包静默限流(ADR-002)。Railway 单容器单 IP,V1 接受这个限制(roadmap 半自动定位)。V2 加代理池

### 4. Vercel(web)

1. https://vercel.com → Import git repo → Root Directory 填 `apps/web`
2. Framework preset 自动识别 Next.js 14
3. 环境变量从 `.env.example` 复制;**注意**:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 这俩**必须**有 `NEXT_PUBLIC_` 前缀(否则浏览器拿不到)
   - `SUPABASE_SERVICE_ROLE_KEY` 不要带 `NEXT_PUBLIC_` 前缀(否则全网泄露!!)
   - `DATABASE_URL` 用 **pooler mode**(transaction pooling),不是 worker 那个 session mode。Vercel serverless 函数生命周期短,session mode 会撑爆连接池
   - `STAFF_SESSION_SECRET` 同 Railway 上的值
   - `NEXT_PUBLIC_APP_URL` = 你的 Vercel 部署域名(初期用 `xxx.vercel.app`,绑定客户域名后改这里)
4. 部署完成后,先打 `https://xxx.vercel.app/login`,确认能加载,然后用 dev-link 工具 mint 一个魔链测真实登录:
   ```bash
   pnpm --filter @geo/db dev-link <admin@客户域.com>
   ```
5. 自定义域名:Settings → Domains → Add → 在客户 DNS 加一条 CNAME 到 `cname.vercel-dns.com`。SSL 证书 Vercel 自动签发

**踩雷点**:
- Vercel 默认 region 是美国 East。改 `vercel.json` 的 `regions: ["sin1"]`(新加坡),给中国大陆用户最低延迟
- Server Actions 默认 10s 超时。变体生成 LLM 单次串行最多 4 分钟(W3.2 改成并行后 ~120s),会卡住 — 这就是为什么 W3.2 把生成挪到 worker 了。**别**把任何 LLM 调用直接写在 server action 里
- 邮箱魔链跳转:Supabase Auth → URL Configuration → Site URL 必须**精确**等于你的 `NEXT_PUBLIC_APP_URL`,否则魔链点了跳到 localhost

### 5. 阿里云 SMS(可选,V1 最终切换 OTP 时再做)

D11 决策:V1 W5 用 admin-generated passcode,W8 切换前补这步。届时配置:`ALIYUN_SMS_ACCESS_KEY/SECRET/SIGN_NAME/TEMPLATE_LOGIN`。代码已 wire 在 `lib/staff-passcode.ts`,把生成路径换成 SMS 发送即可,DB schema 不变。

## 三、上线前 smoke 验收(20 分钟)

按以下顺序点一遍,任何一步失败就回退。

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 用魔链登录管理员 | 进入 /app,看到 onboarding 选项 |
| 2 | 创建租户(slug = 客户拼音) | 进入 /t/<slug>,看到概览 |
| 3 | 在设置 → 员工管理添加 1 个 staff(real_name + phone + brand) | 列表有这条 |
| 4 | 上传一份 Word 内容 | 内容详情页能看到解析后的 markdown |
| 5 | 选 1 个平台 → 生成变体 | 60-120s 后,详情页底部出现新变体行 |
| 6 | 合规审核页 | 新变体是 auto_approved 或 pending(取决于关键词命中) |
| 7 | 派单 → 派单今日 | 提示"分配 1 条" |
| 8 | 给员工生成 passcode | 6 位数字显示 |
| 9 | /staff/login 用员工手机号 + passcode | 看到任务卡片 + 暗号(activity_code) |
| 10 | 用 dev-seed-w6 + 跑 1 个 GEO 追踪 query | 60-90s 后,tracking 页有 mention 计数 |
| 11 | /c/<slug>/checkin 用上面的 activity_code 提交 stage=arrived | 看到"登记成功" |
| 12 | /t/<slug>/attribution | 钩子被回报 ≥ 1,单内容回流表有数据 |

任意一步失败 → 看 worker 日志 + Vercel function logs + Sentry。常见原因:env 没复制全 / migration 漏了 / Chrome 没装。

## 四、监控

### Sentry(应用错误)

`SENTRY_DSN` 已 wire,Vercel 部署即生效。重点关注:
- `worker` 项目:LLM 失败 / Playwright 异常
- `web` 项目:server action 抛错 / RLS deny

### Axiom(结构化日志)

`AXIOM_TOKEN` + `AXIOM_DATASET` 已 wire。日志写到 `geo-studio` dataset。关键查询:
```
['geo-studio'] | where action_kind == "compliance.review.rejected" | summarize count() by bin_auto(_time)
```
监控合规拒绝率,如果突增,可能是关键词库需要调或 LLM 漂移。

### Supabase Realtime(指标)

不用做。Supabase 自带的 dashboard → Database → Reports 已经能看 query 耗时、表大小。

## 五、备份

Supabase Pro plan(¥175/月)自动每日备份保留 7 天。V1 首客必须升 Pro。

每月手动跑一次 `supabase db dump`(或本地用 `pg_dump`)存一份到客户私有 OSS,作为冷备。这一份至少留 3 年(医疗合规要求,见 D5 / docs/03-compliance.md)。

## 六、当客户业务规模增长后

预警信号 → 升级路径:

| 信号 | 升级 |
|---|---|
| Supabase Free 500MB 满 | Pro plan(8GB) |
| Vercel function logs 显示 region "sin1" 频繁冷启动 | 升级到 Pro,启用 Edge Functions |
| Railway worker 长期 OOM | 升 1 GB 容器,或拆 Chrome 容器与逻辑容器 |
| 豆包 API 月费 > ¥500 | 申请火山方舟年单(打 7 折) |
| 多租户后单 worker 不够用 | 给每个租户起独立 worker(`pgboss.work` 加 tenant 维度过滤) |

## 七、本文档不覆盖

- onboarding 引导向导(V3 多租户 SaaS 才需要)
- 自定义域名邮件发件人(V3 白标)
- 计费 / 订阅(V3)
- 多引擎追踪(V2:腾讯元宝、夸克、DeepSeek、Kimi)
- 代理 IP 池(V2,解决 ADR-002 限流)

这些到了再看 `04-roadmap.md` 对应版本即可。
