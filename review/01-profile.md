# 01-profile.md - 项目画像

> 验收执行时间: 2026-10-11
> 审计模式: 只读本地验收

---

## 1. 语言与技术栈

- **核心语言**: TypeScript (v5.6.3), Node.js (>=22.0.0, 当前运行环境 Node v24.16.0)
- **Monorepo 管理**: pnpm (v10.33.0) + pnpm-workspace
- **前端应用 (`apps/web`)**: Next.js 14.2.18 (App Router), React 18.3.1, TailwindCSS 3.4.14, `@base-ui/react`, `@supabase/ssr`, `lucide-react`, `zod`
- **后台服务 (`apps/worker`)**: Node.js + tsx (v4.19.2), Playwright (1.48.2), Cloakbrowser (0.4.10), pg-boss (10.1.6), Mammoth, pdf-parse, nodemailer
- **数据库 ORM (`packages/db`)**: Drizzle ORM (0.36.4), Drizzle Kit (0.28.1), Postgres.js (3.4.5), pg-boss (10.1.6)
- **核心领域与抓取包 (`packages/geo-core`)**: TypeScript, Playwright (1.48.2), `@geo/shared`
- **通用共享包 (`packages/shared`)**: TypeScript, Zod (3.23.8), `@sentry/node` (8.0.0)
- **代码规范与格式化**: Biome (^1.9.4)

---

## 2. 目录架构与应用划分

```
geo-studio/
├── apps/
│   ├── web/                    # Next.js 14 运营后台 + 员工打卡端 + 审核端 + C 端落地页
│   └── worker/                 # 后台常驻服务: AI 抓取(豆包/元宝/DeepSeek)、每日定时生成、合规审核、邮件/企微推送
├── packages/
│   ├── db/                     # Drizzle 数据库 schema、迁移脚本、种子数据与测试套件
│   ├── geo-core/               # 核心能力: 抓取适配器、合规检查、LLM 提示词与文章生成、选题逻辑
│   └── shared/                 # 共享枚举、类型、Zod Schema、常量、Sentry 工具
├── supabase/                   # Supabase 配置及 49+ 个纯 SQL 迁移脚本
├── ops/                        # ECS 部署脚本、PM2 ecosystem、Caddy 反代、备份与同步机制
├── docs/                       # 系统架构、ADR 决策、合规四道门、路线图与七大板块审计记录 (D76)
└── review/                     # 自动化与人工验收交付报告
```

---

## 3. 入口与关键入口文件

- **Web 前端**: `apps/web/app/layout.tsx`, `apps/web/middleware.ts` (基于 Supabase Auth 的路由保护)
- **Worker 调度**: `apps/worker/src/index.ts` (初始化 pg-boss 队列、启动定时 cron 及抓取调度)
- **数据库定义**: `packages/db/src/schema/index.ts` (多租户、内容流、合规词库、追踪快照等表)
- **核心算法/业务**: `packages/geo-core/src/index.ts`

---

## 4. 依赖现状

- **工作区依赖**: Monorepo 内部通过 `workspace:*` 互相引用，依赖拓扑清晰。
- **外部关键包**:
  - Web: `next@14.2.18`, `@supabase/ssr@^0.5.2`, `zod@^3.23.8`
  - Worker: `playwright@^1.48.2`, `cloakbrowser@^0.4.10`, `pg-boss@^10.1.6`
  - DB: `drizzle-orm@^0.36.4`, `postgres@^3.4.5`

---

## 5. 如何构建与运行

- **安装依赖**: `pnpm install`
- **本地数据库与迁移**:
  - 本地 Supabase: `supabase start`
  - 数据库迁移与生成: `pnpm db:generate`, `pnpm db:migrate`
  - 种子数据: `pnpm db:seed`
- **运行开发环境**:
  - Web: `pnpm dev` (端口 3001)
  - Worker: `pnpm dev:worker` (tsx 实时监听)
- **全量构建与类型检查**:
  - 类型检查: `pnpm -r typecheck`
  - 构建产物: `pnpm -r build`
  - 代码校验: `pnpm lint` (`biome check .`)

---

## 6. 数据库与外部依赖

- **数据库**: PostgreSQL 15+ (经由 Supabase 托管并启用 Row-Level Security)
- **队列服务**: pg-boss (基于 Postgres 的原生事务级持久化队列)
- **第三方外部服务 / LLM API**:
  - 火山引擎 ARK / 豆包大模型 API
  - 备用通道 / 本地代理 (Claudeproxy / Claude 3.5 Sonnet / DeepSeek)
  - 搜索引擎与抓取平台 (豆包 AI、腾讯元宝、DeepSeek)
  - 告警: 企业微信群机器人 Webhook (WeCom Bot)
  - 错误追踪: Sentry (`@sentry/node`)

---

## 7. 部署方式

- **目标平台**: 阿里云 ECS (`/opt/geo-studio`)
- **进程守候**: PM2 (`ops/deploy/ecosystem.config.cjs`) 守护两个应用: `geo-web` (单实例 Next.js) 与 `geo-worker` (Playwright + pg-boss)
- **网关反代**: Caddy (`ops/deploy/Caddyfile`)，自动 TLS 证书申请与静态资源反代
- **部署流**: 专用脚本 `ops/deploy/deploy.sh`，基于 `rsync` 增量同步 + ECS 远程 pnpm build + `pm2 reload all` 零停机平滑更新

---

## 8. Git 活跃度与贡献者分布

- **Git 历史总提交数**: 320 commits
- **首个提交时间**: 2026-04-23
- **最近提交时间**: 2026-09-20 (`4c76479 docs: audit blueprint and D76`)
- **提交者分布**: 100% 由 `dulijun001 <lnian7914@gmail.com>` 提交，属于单主力工程师 + AI 结对开发项目。
- **分支状态**: 当前位于 `main` 分支，领先远程 `origin/main` 41 个提交，工作区干净无脏代码。
