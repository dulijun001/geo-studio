# GEO Studio

> 多租户的生成式引擎优化(GEO)全链路运营平台。
> 帮本地高客单价服务品牌(口腔 / 医美 / 律所 / 教育 / 月子中心)在豆包、元宝、夸克、DeepSeek 等 AI 搜索里**系统性地**获得被引用、被推荐、被转化的能力。

首个客户:某口腔医院(40 人员工号矩阵)。后期 SaaS 化开放给其他品类。

---

## 为什么这个项目存在

搜索正在从"蓝色链接列表"切换到"AI 直接生成的答案"。豆包、元宝、Perplexity 等 AI 助手已经成为越来越多用户的第一查询入口。

```
传统 SEO:让你出现在搜索结果第 1 页
GEO     :让你出现在 AI 答复的句子里
```

市面上的 GEO 工具大多只做"监测出报表"。**GEO Studio 做完整闭环**:可发现 → 生产 → 验证 → 优化 → 转化归因。

## 核心差异化

| 模块 | 我们做了什么 | 多数竞品 |
|---|---|---|
| **可发现层(A)** | Schema.org JSON-LD 7 类 + llms.txt + AI Content Feed + AI Sitemap + Audit | 顶多发个 robots.txt |
| **生产层(B)** | AI 起草 + GEO 9 法评分 + 自动改写 + KB 上下文 + 引用幻觉守卫 + 内容独特性检测 | 单点工具,无质量闭环 |
| **派单层** | 40 人员工矩阵 + 派单算法(平台 / 人设 / 节奏 / 新颖度)+ 暗号闭环 | "自动发布" → 实名号集体封号 |
| **追踪层(C)** | Playwright 多引擎模拟真人(豆包 / 元宝 / DeepSeek)+ 8 周 SOV 热力图 | 调 LLM API → 拿不到带 RAG 的真实答复 |
| **归因** | 多钩子(医生名 / 6 位暗号 / 电话尾号 / 企微 utm)+ 三模型客户旅程对比 | 前台问话 → 执行率不到 50% |
| **合规** | 四道门(关键词 + LLM 语义 + 历史案例匹配 + 人工)+ DB trigger 兜底 | 没做 → 医疗广告法翻车十万起罚 |

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript(全栈唯一,含 Worker) |
| 前端 | Next.js 14 App Router + React Server Components + Tailwind + shadcn/ui |
| 后端 | Server Actions + API Routes |
| 数据库 | Postgres(自托管 Supabase,阿里云杭州)+ pgvector + Row-Level Security |
| ORM | Drizzle |
| 任务队列 | pg-boss(纯 Postgres,不开 Redis) |
| 爬虫 | Playwright(独立 Worker 进程) |
| LLM | 豆包 Pro(主)+ OpenAI(兜底) |
| 包管理 | pnpm workspace monorepo |
| 部署 | ECS + Caddy + PM2 + Next standalone |

## 快速开始

需要 Node.js ≥ 22 + pnpm ≥ 10 + Supabase 实例 + 火山方舟豆包 access。

```bash
# 1. 装依赖
pnpm install

# 2. 配 .env
cp .env.example .env
# 编辑 .env 填 Supabase + 火山方舟 key

# 3. 跑 migration(顺序 0000-0021)
psql "$DATABASE_URL" -f supabase/migrations/0000_initial.sql
# ... 等等。或参考 docs/05-deployment.md

# 4. 跑 seed(合规词 + demo 租户)
pnpm db:seed

# 5. 跑 web + worker
pnpm dev              # http://localhost:3000
pnpm dev:worker       # 另开终端

# 6. 跑测试(纯函数,不依赖 prod DB)
pnpm db:test-discoverability   # GeoProfile 抽象
pnpm db:test-schema            # Schema.org JSON-LD 生成器
pnpm db:test-artifacts         # llms.txt / feed / sitemap 生成器
pnpm db:test-uniqueness        # 内容独特性 + EEAT 映射
pnpm db:test-rls               # Row-Level Security 隔离
pnpm db:test-tenant            # 租户 + 成员 RPC
```

部署到 ECS 见 [`ops/deploy/README.md`](ops/deploy/README.md)。

## 目录结构

```
geo-studio/
├── apps/
│   ├── web/                    # Next.js 14 — 后台 + 员工 PWA + 公开路由
│   └── worker/                 # Node.js worker — Playwright 爬虫 + 定时任务
├── packages/
│   ├── db/                     # Drizzle schema + migrations + 测试脚本
│   ├── shared/                 # 跨 app 共享的常量 / 类型
│   └── geo-core/               # GEO 核心逻辑(可独立发包)
│       ├── compliance/         #   - 四道门
│       ├── generation/         #   - 9 法评分 + 内容独特性 + EEAT 映射
│       ├── tracking/           #   - 多引擎 dispatcher
│       ├── attribution/        #   - 三模型归因
│       └── discoverability/    #   - V1.7 Schema/llms.txt/feed/sitemap/audit
├── supabase/migrations/        # 21 条 SQL migration
├── docs/                       # 设计文档 + ADR
└── ops/deploy/                 # ECS 部署脚本(rsync + Caddy + PM2)
```

## 设计文档(看哪一份)

| 文档 | 何时看 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 进项目第一份,所有协作约定 + 决策表 D1-D19 |
| [`docs/00-product-definition.md`](docs/00-product-definition.md) | 产品定位 / 用户画像 / 价值主张 |
| [`docs/01-architecture.md`](docs/01-architecture.md) | 系统架构 / 技术栈 / 部署拓扑 |
| [`docs/02-data-model.md`](docs/02-data-model.md) | 多租户数据模型 / RLS 策略 |
| [`docs/03-compliance.md`](docs/03-compliance.md) | 医疗合规四道门 / 关键词库 / 历史案例 |
| [`docs/04-roadmap.md`](docs/04-roadmap.md) | V1-V3 阶段交付 |
| [`docs/05-deployment.md`](docs/05-deployment.md) | ECS 自托管部署 runbook |
| [`docs/06-discoverability.md`](docs/06-discoverability.md) | V1.7 可发现层完整设计 |
| [`docs/adr/`](docs/adr/) | 决策记录 ADR-001 → ADR-006 |

## 当前状态(2026-05-01)

- ✅ V1 主体(W1-W7):多租户 + 内容中台 + 派单 + 追踪 + 归因 + 合规四道门
- ✅ V1.5 知识库驱动 AI 内容工厂
- ✅ V1.6 增量补强:GEO 9 法评分、低分自动改写、SOV 8 周热力图、引用守卫
- ✅ **V1.7 可发现层(刚完成,2026-05-01)**:Schema.org / llms.txt / feed / sitemap / audit + 内容独特性 + E-E-A-T
- ⏳ V2 反爬基础设施(代理池 / 账号池 / 指纹隔离 — ADR-004)
- ⏳ V1 W8 真实数据验收(40 人打卡 / 5 起到店转化追溯 — 业务侧推进)

详见 [`CLAUDE.md`](CLAUDE.md) 第九节。

## 隐私 / 合规说明

医疗个人身份信息(PII)**严禁**存入数据库 — 客户见证只允许化名 + 城市 + 年龄段。所有租户数据存自托管 Supabase 阿里云杭州节点(D13 + ADR-003),不出境。审计日志保留 ≥ 3 年(医疗广告法诉讼时效)。

## 许可

私有项目,版权所有。

## 联系

`lnian7914@gmail.com`
