# GEO Studio — 项目规范与决策归档

> 每次进入这个项目,第一件事读这个文件。所有关键决策在这里,详细设计在 `docs/`。

## 一、产品一句话定义

**GEO Studio 是一个多租户的生成式引擎优化(GEO)全链路运营平台——帮本地高客单价服务品牌(口腔、医美、律所、教育、月子中心)在豆包、元宝、夸克、DeepSeek 等 AI 搜索里系统性获得被引用、被推荐、被转化的能力。**

首个客户:某口腔医院(40 人员工号矩阵)。后期 SaaS 化开放给其他品类。

## 二、核心差异化(护城河)

区别于市面上只做「监测出报表」的 GEO 工具,本产品做**完整闭环**:
1. **内容调度中台**:图文 + 抖音脚本双轨,基于 GEO 学术 9 法内置写作指南
2. **员工发布助手**:40 人矩阵派单 + 执行打卡,解决「自动化封号」问题
3. **GEO 追踪引擎**:Playwright 模拟真人在豆包/元宝 App/Web 追踪引用
4. **转化归因**:多钩子(医生名/活动暗号/电话尾号/企微 utm)→ 闭环到到店/成交

竞品做 1 或 3,极少有人做 2 和 4。2 和 4 是真正的壁垒。

## 三、关键决策(不可轻易推翻,推翻前先改这份文档)

| # | 决策 | 定于 | 理由 |
|---|---|---|---|
| D1 | 多租户架构,数据模型第一天带 `tenant_id` + Postgres RLS | 2026-04-23 | 后期要 SaaS 化,不能硬编码单客户逻辑 |
| D2 | 首个客户业务逻辑全部配置化,不写 `if (industry === 'dental')` | 2026-04-23 | 同 D1 |
| D3 | 发布环节**绝不**自动化提交到头条/抖音 App | 2026-04-23 | 员工实名号,自动化=封号集体事件+法律风险 |
| D4 | GEO 追踪**不走火山方舟 API**,走 Playwright 模拟真人在豆包 Web/App | 2026-04-23 | API 返回的是纯 LLM,不带 RAG 检索层,和真实用户看到的答案完全不一样 |
| D5 | 医疗合规采用**三道门**:关键词黑名单 + LLM 语义审查 + 高风险人工复核 | 2026-04-23 | 纯关键词会漏软性违规("效果好""首家"等),翻车即十万起罚 |
| D6 | 转化归因不依赖「前台强制问话」,用多钩子自动回流 | 2026-04-23 | 前台执行率低,会漏 50%+ 数据 |
| D7 | 技术栈锁定:Next.js 14 App Router + Supabase(Postgres+Auth+RLS)+ Playwright Worker + pgvector | 2026-04-23 | 一人+Claude Code 可维护,后期可扩 |
| D8 | 豆包 API(火山方舟)**只用作** LLM 能力调用(品牌识别、合规审查、内容生成),不用作 GEO 追踪 | 2026-04-23 | 见 D4 |
| D9 | 绝不存储员工的头条/抖音账号登录凭证 | 2026-04-23 | 合规、隐私、风控三重风险 |
| D10 | 每条 DB 变更都走 migration,绝不在生产手改 schema | 2026-04-23 | 多租户环境下手改=数据灾难 |
| D11 | 员工端(`/staff`)不走 Supabase Auth,用 phone + 一次性 passcode + HMAC cookie 自建 session | 2026-04-25 | 员工只有手机号没邮箱;Supabase Auth 强绑邮箱魔链不适合移动端高频场景;V1 W5 用管理员手发 dev-passcode 跑通,V1 收尾接阿里云 SMS OTP,`staff_invites` 表结构不变 |
| D12 | 医疗合规升级为**四道门**:在 D5 三道门基础上叠加(a) 历史案例匹配 + (b) 关键词按平台作用域 | 2026-04-29 | (a) 让违规判断有「过往真实罚单」做锚,而不是只靠抽象关键词或 LLM 主观;(b) 同一关键词在抖音和小红书风险等级不同(平台规则差异),全局判罚会过严或过松 |
| D13 | Supabase 改为自托管到阿里云国内节点(替换商业 us-east-1) | 2026-04-25 | 医疗个人信息出境违反《个人信息保护法》;延迟 + 合规两个问题一次解;详见 ADR 003 |
| D14 | V1.7 增加**可发现层(Layer A)**:Schema.org JSON-LD 7 类 + llms.txt + AI Content Feed + AI Sitemap + Discoverability Audit | 2026-05-01 | GEO 三层模型(可发现 / 生产 / 验证)分析下我们 A 层完全空白,而 A 是 B+C 的上游。详见 ADR 005、`docs/06-discoverability.md` |
| D15 | 公开路由按 tenant 显式 opt-in(`tenants.settings.discoverability.public_enabled`) | 2026-05-01 | V1 第一次有对外公开 API,默认关闭、显式开启,降低误暴露概率 |
| D16 | 公开路由内容过滤双闸:实体 `geo_visible=true` + testimonials 必须 `compliance_status='approved'` | 2026-05-01 | 防止未审客户见证 / 草稿状态服务流到公网,合规外溢 |
| D17 | 公开路由缓存策略:build-on-write,artifacts 表存物化结果,公开路由单行读 | 2026-05-01 | 把可能的 N×M 重构成本(N 实体 × M 路由)摊到一次写入,公开访问 < 50ms 单行 SELECT |
| D18 | Schema 生成纪律:**只填有值字段,不用 placeholder 凑数** | 2026-05-01 | placeholder schema 比缺字段更糟,gaming 招致 AI 引擎降权;审计页显式提示"还差什么字段" |
| D19 | 禁用 `pnpm db:generate`,migration 一律手写 | 2026-05-01 | Drizzle journal 自 0006 起冻结,手写为主流;运行 generate 会重新编号撞库导致冲突(2026-05-01 已撞过一次) |

## 四、目录结构(强制)

```
geo-studio/
├── CLAUDE.md              # 本文件(项目规范 + 决策归档)
├── README.md              # 对外简介(后期写)
├── docs/                  # 所有设计文档
│   ├── 00-product-definition.md   # 产品定位、用户画像、价值主张
│   ├── 01-architecture.md         # 系统架构、技术栈、部署拓扑
│   ├── 02-data-model.md           # 多租户数据模型、核心表、RLS 策略
│   ├── 03-compliance.md           # 医疗合规四道门、关键词库、LLM prompt、历史案例库
│   ├── 04-roadmap.md              # V1-V3 分阶段交付路线
│   └── adr/                       # Architecture Decision Records(后续追加)
├── apps/
│   ├── web/               # Next.js 主 App(前台 + 后台 + API Routes)
│   └── worker/            # Node.js 独立 Worker(Playwright 爬虫、定时任务)
├── packages/
│   ├── db/                # Drizzle ORM schema + migrations
│   ├── shared/            # 跨 app 共享的类型、工具、常量
│   └── geo-core/          # GEO 追踪核心逻辑(可独立发包,后期单独售卖)
├── supabase/              # Supabase 本地配置、seed、RLS policies
├── .env.example
├── .gitignore
├── package.json           # pnpm workspace 根配置
└── pnpm-workspace.yaml
```

**不允许**:
- 在 `apps/web/` 里写业务领域逻辑,必须抽到 `packages/`
- 新建 `src/utils/` 这种放杂物的目录,命名要明确意图
- 文件名用中文

## 五、技术栈(详细见 `docs/01-architecture.md`)

| 层 | 选型 |
|---|---|
| 语言 | TypeScript(全栈唯一语言,含 Worker) |
| 前端框架 | Next.js 14 App Router + React Server Components |
| UI | Tailwind CSS + shadcn/ui |
| 状态 | Zustand(客户端)+ Server Actions(服务端) |
| 后端 | Next.js API Routes + Server Actions |
| 数据库 | Postgres(Supabase)+ pgvector |
| ORM | Drizzle(比 Prisma 轻,类型更好) |
| 认证 | Supabase Auth(邮箱+手机号) |
| 权限 | Postgres RLS(行级权限,多租户核心) |
| 任务队列 | pg-boss(纯 Postgres,不开 Redis) |
| 对象存储 | Supabase Storage(Word/PDF/图片/视频) |
| 爬虫 | Playwright(独立 Worker 进程) |
| LLM | 火山方舟 SDK(豆包 Pro 做语义分析)+ OpenAI(兜底,英文场景) |
| 包管理 | pnpm(workspace monorepo) |
| 部署 | Vercel(web)+ Supabase(DB/Auth/Storage)+ Railway(worker) |
| 监控 | Sentry(错误)+ Axiom(日志)+ Supabase Realtime(指标) |

## 六、命名规范(强制)

### 代码 / 文件
- **文件名**:kebab-case(`content-item.ts`,不是 `ContentItem.ts` 或 `content_item.ts`)
- **React 组件**:PascalCase 文件(例外:`ContentCard.tsx`)
- **数据库表**:snake_case 复数(`content_items`)
- **字段**:snake_case(`tenant_id`,不是 `tenantId`)
- **TypeScript 类型**:PascalCase(`ContentItem`,DB 层用 Drizzle 自动推导)
- **常量**:SCREAMING_SNAKE_CASE

### 业务概念(中英对照,所有代码用英文)
| 中文 | 英文 | 缩写 |
|---|---|---|
| 租户 | Tenant | - |
| 品牌 | Brand | - |
| 员工账号(矩阵节点)| Staff Account | `staff` |
| 内容条目 | Content Item | `content` |
| 发布任务 | Publish Task | `task` |
| 问题库条目 | Question | `question` |
| GEO 快照(一次追踪)| GEO Snapshot | `snapshot` |
| 引用记录 | Citation | - |
| 转化事件 | Conversion Event | `conversion` |
| 合规审查 | Compliance Review | `review` |

### Git
- **分支**:`feat/xxx`、`fix/xxx`、`refactor/xxx`、`docs/xxx`
- **commit**:英文,conventional commits(`feat:`, `fix:`, `refactor:`)
- **绝不**自动 `git push`(用户协作规则)

## 七、合规红线(医疗语境强制,详细见 `docs/03-compliance.md`)

所有用户可见的内容发布前必走**四道门**(D5 + D12):
1. 关键词黑名单(同步,< 50ms,按平台作用域过滤)
2. 豆包 LLM 语义审查(异步,< 3s)
3. 历史违规案例匹配(向量检索 `compliance_cases`,锚定真实罚单)
4. 高/中风险 → 管理员人工审批

**审计日志保留 ≥ 3 年**(医疗广告法诉讼时效)。

> ⚠️ `docs/03-compliance.md` 文档段落仍是三道门时代写法,代码已落地四道门。文档展开见后续工单(B 阶段技术债)。

## 八、协作准则(和用户约定)

1. 关键决策先改 `CLAUDE.md` 或 `docs/` 再动手,不许"边做边定"
2. 新模块动手前先画数据模型 diff,贴在 PR 描述里
3. 改 `packages/db/schema.ts` 必须同步生成 migration,不在生产手改
4. 失败两次就停下来汇报(用户规则 #10)
5. 所有 commit 保留 `Co-Authored-By: Claude`,不隐藏 AI 参与
6. 涉及金钱/合规/隐私的变更,必须和用户确认后才推进

## 九、当前状态(2026-05-01 更新)

### 已完成
- **V0 骨架**(2026-04-23):docs/ 五份 + CLAUDE.md + monorepo 立起
- **V1 W1-W7 主体**(2026-04-23 → 2026-04-25):多租户 + 内容中台 + 合规三道门 + 派单 + 移动端 + GEO 半自动追踪 + 转化归因
- **V1.5 知识库驱动 AI 内容工厂**(2026-04-25 前后):KB 实时同步、AI 起草、平台风格从 KB 派生、引用守卫、周报邮件
- **V1.6 增量补强**:合规四道门(D12)、GEO 9 法评分、低分变体自动改写 + rescue 页、SOV 8 周热力图、引用幻觉检查、verified-citations 白名单、多引擎 dispatcher 起步
- **V1.7 可发现层**(2026-05-01,**Sprint 0-6 全部完成**):
  - **A 组(可发现层)**:Schema.org JSON-LD 7 类生成器、`/c/[slug]/llms.txt` + `llms-full.txt` + `ai-content-feed.json` + `ai-sitemap.xml` 4 条公开路由 + ETag/304 + 60/min rate-limit + opt-in 闸 + service-role 物化缓存(`discoverability_artifacts`)+ build-on-write worker job(`discoverability.regenerate`)+ 4 维度 audit 评分(完整度/数据规模/可信度/时效性)+ 完整 admin UI(hub + brand 编辑 + services/testimonials/faqs CRUD)
  - **B 组(生产层补强)**:内容独特性检测(Jaccard + 结构 + 关键信息,自动加 `uniqueness_warning` 到跨平台变体)+ E-E-A-T 4 维度命名映射(scorer 不动,纯命名 + UI 标签)
  - 数据模型扩 7 张 migration(0015-0021):brands 扩列、staff 加 geo_profile_visible、新增 services / testimonials / faqs / discoverability_artifacts、tenants.settings.discoverability 默认值
  - 109 项纯函数测试覆盖(profile builders 33 + schema generators 49 + artifact generators 23 + uniqueness/eeat 19 + RLS / behavioral 已在 S1 e2e 验证)
  - **关键安全 bug 抓+修**:`unstable_noStore()` 缺失会让 Next 14 Data Cache 把过期的 opt-in 状态喂给路由 → opt-out 失效 → 客户内容继续泄露。S3 实测时定位 + 修复

### 当前阶段
- **V1.7 完成,等待部署**(本地 main,5+ 条 commit 攒着)
- **V2 反爬基础设施可启动**:多引擎 + 账号池 + 代理 + 指纹隔离(ADR 004)

### 阻塞 / 待澄清
- V1 W8 真实数据验收(40 人打卡率、5 起到店转化追溯、医院见证)未归档,需业务侧推进
- `docs/03-compliance.md` 仍是三道门版本,需回填四道门细节(技术债)
- 自上次 demo 起未部署的 commit:V1.6 文档对齐 + tracking SUPPORTED_ENGINES 修复 + format.ts TZ 防御 + 中间件短路 + tenant_memberships FK migration + V1.7 全套

## 十、参考

- 项目研究报告:`/Users/dulijuner/Documents/GEO研究/生成式引擎优化与豆包GEO_横纵分析报告.md`
- GEO 论文原文:arxiv 2311.09735
- 国内开源 GEO 工具(参考,非依赖):github.com/CN-Sheep/SheepGeo
