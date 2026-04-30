# GEO Studio

Multi-tenant Generative Engine Optimization platform for high-ticket local service brands.

> 详细产品定位、架构、路线图见 [`CLAUDE.md`](./CLAUDE.md) 与 [`docs/`](./docs/)。

## Stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth + Storage + RLS) · Drizzle ORM · pgvector · pg-boss · Playwright · Doubao (Volcengine Ark) LLM · Tailwind + shadcn/ui · Biome · pnpm workspace monorepo.

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10
- A Supabase project (free tier fine for dev)
- A Volcengine Ark account with Doubao access

## Quick start

```bash
# 1. Install deps
pnpm install

# 2. Configure env
cp .env.example .env
# edit .env with your Supabase + Ark credentials

# 3. Generate & run migrations
pnpm db:generate
pnpm db:migrate

# 4. Seed (compliance keywords, demo tenant)
pnpm db:seed

# 5. Run
pnpm dev              # Next.js app @ http://localhost:3000
pnpm dev:worker       # in another terminal
```

## Project layout

```
geo-studio/
├── CLAUDE.md          # Decisions log, standards, conventions
├── docs/              # Product, architecture, data model, compliance, roadmap
├── apps/
│   ├── web/           # Next.js (dashboard + staff mobile web + API)
│   └── worker/        # Playwright GEO tracker, cron, heavy jobs
├── packages/
│   ├── db/            # Drizzle schema + migrations (@geo/db)
│   ├── shared/        # Cross-app types/enums/constants (@geo/shared)
│   └── geo-core/      # Tracker engine adapters (@geo/geo-core)
└── supabase/          # RLS policies, seed scripts
```

## Status

**V1.6 wrap-up / V2 ramp-up** (2026-04-30).

- V1 W1-W7 主体 + V1.5 KB 内容工厂 + V1.6 合规四道门、Doubao playbook、内容反向工作流、admin HMAC、SOV 8 周热力图、低分变体 rescue 页 — 已上线
- V2:多引擎 dispatcher 骨架已搭(豆包 + 元宝 scaffold),账号池 / 代理 / 指纹隔离 / 4 个额外引擎 / 500 题轮询 — 待开工
- 详见 [`CLAUDE.md`](./CLAUDE.md) 第九节、[`docs/04-roadmap.md`](./docs/04-roadmap.md)
