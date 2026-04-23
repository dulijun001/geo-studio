# 01 - 系统架构

## 架构图(文字版)

```
                  ┌───────────────────────────────┐
                  │  User-facing (3 types)        │
                  │  ── 内容运营(PC)              │
                  │  ── 员工(Mobile Web)          │
                  │  ── 管理员(PC)                │
                  └──────────────┬────────────────┘
                                 │ HTTPS
                                 ▼
          ┌──────────────────────────────────────────────┐
          │  Next.js 14 App (apps/web) @ Vercel          │
          │  ─────────────────────────────────────       │
          │  • App Router + React Server Components      │
          │  • Server Actions (mutations)                │
          │  • API Routes (webhooks, worker callbacks)   │
          │  • Middleware: auth + tenant resolution      │
          └────────┬──────────────────────────┬──────────┘
                   │                          │
         ┌─────────▼──────────┐   ┌───────────▼──────────┐
         │   Supabase (PaaS)  │   │  Worker(Railway)     │
         │   ──────────────── │   │  ──────────────────  │
         │   • Postgres + RLS │   │  apps/worker/        │
         │   • pgvector       │   │  ──────────────────  │
         │   • pg-boss(队列)  │   │  • Playwright 池     │
         │   • Auth (JWT)     │   │  • 定时 GEO 追踪     │
         │   • Storage(文件)  │   │  • 内容解析(PDF/DOCX)│
         │   • Realtime       │   │  • LLM 合规审查      │
         └────────┬───────────┘   │  • 钩子生成          │
                  │               └──────────┬───────────┘
                  │ SQL/RPC                  │
                  └──────────┬───────────────┘
                             ▼
         ┌──────────────────────────────────────┐
         │  External Services                   │
         │  • 火山方舟(豆包 API,LLM 能力)     │
         │  • 豆包 Web / 元宝 Web(Playwright) │
         │  • 腾讯企微 API(钩子 utm)          │
         │  • 阿里云短信(登录验证)            │
         │  • Sentry / Axiom / Plausible       │
         └──────────────────────────────────────┘
```

## 技术栈选型与理由

### 语言:TypeScript(全栈唯一)
**选型**:前端、后端(Server Actions)、Worker 全部 TS。
**理由**:一种语言,一套类型,一套工具链。你和 Claude Code 的维护心智成本最低。Python 做 Playwright 也行,但会多出一层语言边界,得不偿失。

### 框架:Next.js 14 App Router
**选型**:Next.js 14+,使用 App Router + RSC + Server Actions。
**理由**:
- 前后端一体,Server Action 天然省掉 API Route 样板
- RSC 让数据直接在服务端取,不用管前端 fetch 加载态
- Vercel 部署 0 配置
- shadcn/ui 对 App Router 支持最好

**明确不用**:Pages Router(已过时)、纯 SPA(SEO/性能都差)。

### UI:Tailwind + shadcn/ui
**理由**:shadcn 不是依赖库,是"组件源码拷贝进项目"的模式。对设计师友好——你能改任何细节,不会被封装死。Tailwind 让 LLM 写样式的正确率显著高于 CSS/CSS-in-JS。

### 数据库:Postgres(Supabase)+ pgvector
**选型理由**:
- **Supabase = Postgres + Auth + Storage + Realtime + RLS**,一个 PaaS 搞定五件事
- **RLS(行级权限)**是多租户的底层保障——不是在代码里写 `WHERE tenant_id = ?`,是在数据库层强制(即使代码有 bug,也不会跨租户泄露)
- **pgvector**:内容向量化、问题库去重聚类、"相似问题的引用模式"分析,都用它
- **pg-boss**:基于 Postgres 的任务队列,不用开 Redis(能省一个依赖就省一个)

**不选 MongoDB/Firebase 的理由**:多租户 + 关系查询 + 事务,Postgres 一家独大。

### ORM:Drizzle
**选型**:Drizzle 而不是 Prisma。
**理由**:
- Drizzle 的类型推导比 Prisma 更接近手写 SQL,复杂查询不退化为 `any`
- Drizzle schema 就是 TypeScript,不需要额外 DSL
- migration 生成 SQL 可读,Prisma 的 migration 文件是黑盒
- Edge Runtime 兼容(Vercel Edge Function 上 Prisma 至今问题多)

### 任务队列:pg-boss
**选型**:pg-boss(Postgres 原生)vs BullMQ(Redis)vs Inngest(SaaS)。
**选 pg-boss**:
- 不用加 Redis 依赖
- 任务数据和业务数据同库,可以在同一事务里 enqueue
- 对量级要求不高(< 100 任务/秒),pg-boss 完全够用
- 后期量大了,再切 BullMQ 或 Inngest

### 爬虫:Playwright(Node)
**选型**:Playwright 而不是 Puppeteer / Selenium。
**理由**:
- Playwright 默认支持 Chromium / WebKit / Firefox,兼容性最好
- Auto-wait 机制,写爬虫脚本的代码量少一半
- 对代理池、上下文隔离的支持比 Puppeteer 成熟
- TypeScript 原生 API

**独立 Worker 进程,不跑在 Next.js 里的理由**:
- Vercel Serverless 无法持久运行 headless browser
- Worker 挂了不影响前台
- 可以独立横向扩展(加 Worker 节点数)

### LLM:豆包 Pro(主)+ OpenAI(兜底)
**选型理由**:
- **豆包 Pro**:做品牌识别、合规语义审查、内容改写。输入 0.0008 元/千 token,极便宜。且中文医疗术语理解本地化
- **OpenAI GPT-4o**:兜底。某些罕见场景(英文内容、豆包 API 挂了)切换

**明确不做**:自部署开源模型(Ollama/vLLM)——运维成本 > 节省的 API 费用,至少 V1-V3 阶段。

### 部署拓扑

| 组件 | 位置 | 月成本(预估,首个客户阶段) |
|---|---|---|
| Next.js App | Vercel Pro | ¥160 |
| Postgres + Auth + Storage | Supabase Pro | ¥180 |
| Worker(Playwright) | Railway Starter | ¥35 |
| 住宅代理 IP 池 | BrightData / LunaProxy | ¥500 |
| 火山方舟(豆包)| 按量 | ¥50-200 |
| Sentry / Axiom / Plausible | 免费额度够 | ¥0 |
| 域名 + HTTPS | Cloudflare | ¥70/年 ≈ ¥6/月 |
| **合计** | - | **约 ¥1000/月** |

**V3 多客户阶段**:Worker 迁到自建 Hetzner 或腾讯云 CVM,代理池按客户量线性涨,整体可控在客户 ARPU 的 15% 以内。

## 核心数据流

### 流 1:内容从上传到发布
```
运营上传 Word/PDF
    → Supabase Storage
    → Worker 解析(docx/pdf → markdown)
    → DB: content_items(status=draft)
    → LLM 改写成 N 个平台版本
    → DB: content_variants(status=pending_review)
    → 三道合规门
    → DB: content_variants(status=approved)
    → 派单算法
    → DB: publish_tasks(one per staff × variant)
    → 推送到员工移动 Web
    → 员工手动发布 + 打卡
    → DB: publish_tasks(status=published, url=xxx)
```

### 流 2:GEO 追踪
```
cron(每 4 小时)
    → 从问题库挑选本轮问题(500 条里轮询)
    → 为每条问题分发到 Playwright Worker
    → Worker 登录追踪账号(不用员工号)→ 问豆包
    → 抓回答全文 + 引用卡片 URL
    → LLM 解析:这段引用是否涉及本品牌
    → 反向查找:引用 URL 能否匹配到 publish_tasks.url
    → DB: citations(snapshot_id, question_id, matched_task_id)
    → 实时更新租户看板
```

### 流 3:转化归因
```
每条 publish_tasks 生成时
    → 分配钩子(医生名/暗号/电话尾号/utm)
    → DB: hooks(task_id, hook_type, hook_value)

到店前台小程序录入
    → 看到暗号/尾号 → 自动匹配 hooks
    → DB: conversion_events(hook_id, stage=arrived)

后续
    → 咨询阶段更新(stage=consulted)
    → 成交阶段更新(stage=converted, revenue=xxx)

看板聚合
    → 每条内容带来多少到店、咨询、成交
    → 每个员工的 ROI 排名
```

## 性能目标(V1)

| 场景 | 目标 |
|---|---|
| 运营后台页面首屏 | < 2s |
| 员工移动端首屏 | < 1.5s(4G) |
| 合规审查(关键词)| < 50ms |
| 合规审查(LLM 语义)| < 3s |
| GEO 追踪单问题耗时 | < 30s |
| 单日追踪问题吞吐 | ≥ 500 条 |
| 数据库连接数 | < 50(Supabase Pro 上限 60)|

## 安全与可用性

### 核心安全策略
1. **Postgres RLS 是最后一道防线**:所有业务表必须有 `tenant_id` + RLS policy
2. **Server Action 必须先验 session + tenant membership**,不能信前端传的 tenant_id
3. **Storage 按 tenant 分桶**:`storage/{tenant_id}/content/xxx.docx`
4. **敏感环境变量分层**:
   - Vercel(web 用,无写权限)
   - Railway(worker 用,有写权限)
   - 绝不把 Service Role Key 放 web app
5. **员工登录后默认只能看到自己的任务**(RLS by `staff_id`)
6. **审计日志**:所有合规审查、手动审批、删除操作全量入 `audit_log`,3 年不删

### 可用性目标
- V1 阶段:99% uptime(每月允许 7 小时不可用,满足内部试点)
- V3 阶段:99.9%,Worker 多节点 + 数据库读副本

## 关键约束

1. **Vercel 免费 Serverless 超时 10s,Pro 60s**——重任务必须走 Worker
2. **Playwright 单浏览器实例内存 ≈ 500MB**——Railway 1GB 方案只能跑 1 个,需精细控制
3. **Supabase 免费版连接数 60**——高并发场景必须用 connection pooler(Supavisor)

## 后续演进路径

| 什么时候 | 做什么 |
|---|---|
| 客户 > 5 家 | Worker 迁到自建 VPS(Hetzner 或腾讯云 CVM) |
| 问题库 > 10 万条 | 引入向量召回(pgvector HNSW 索引)+ 语义聚类 |
| 追踪量 > 5000/天 | 代理池分层:便宜代理初筛 + 住宅代理精查 |
| 多区域客户 | Supabase Read Replica + Vercel Edge |
| 接入豆包 Agent(服务层 GEO)| 单独开 `packages/agent-geo` 模块 |
