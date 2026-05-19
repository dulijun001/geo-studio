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
| D20 | **写作要求(意图骨架)× 平台风格(格式/口吻)** 双层叠加,不替换。新增 `writing_templates` 表 + `keywords` 词库,`buildVariantPrompt` 加 `writing_template?` 入参向后兼容 | 2026-05-04 | 抓词GEO 只有意图模板没有平台维度,我们叠加后"产品对比×小红书"和"产品对比×公众号"自动差异化输出,延续 D2 配置化思想;详见 ADR 007 |
| D21 | **GEO 标准内容资产** = 问题资产 + 引用资产 + 结构化资产 + 可验证资产。生成顺序前置两层:`query_intent → content_contract → writing_template × platform_style`(D20 双层叠加保留,降为生成第 3-4 层)。存储改 slice-first(direct_answer / faq_pairs / trust_block 等 typed slices)。DoD 闸门(14+5 条)代替自由审核 | 2026-05-13 | V1.8 内容只是"写得通顺",对 AI 引擎不够"可引用";要从"GEO 运营平台"升级为"GEO 内容标准系统"必须把内容侧也产品化。详见 `docs/07-geo-article-spec.md` + ADR 009 |

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
3. 历史违规案例匹配(Jaccard 相似度 on `compliance_cases.violation_patterns`,锚定真实罚单,跨租户共享)
4. 高/中风险 → 管理员人工审批

**审计日志保留 ≥ 3 年**(医疗广告法诉讼时效)。详细设计见 `docs/03-compliance.md`(2026-05-11 已对齐四道门版本)。

## 八、协作准则(和用户约定)

1. 关键决策先改 `CLAUDE.md` 或 `docs/` 再动手,不许"边做边定"
2. 新模块动手前先画数据模型 diff,贴在 PR 描述里
3. 改 `packages/db/schema.ts` 必须同步生成 migration,不在生产手改
4. 失败两次就停下来汇报(用户规则 #10)
5. 所有 commit 保留 `Co-Authored-By: Claude`,不隐藏 AI 参与
6. 涉及金钱/合规/隐私的变更,必须和用户确认后才推进

## 九、当前状态(2026-05-11 更新)

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
- **V1.8 创作向导(D20 / ADR 007)**(2026-05-04):由竞品「抓词GEO」分析驱动:
  - 数据模型 migration 0024:`writing_templates`(系统预设 + 租户自定义)+ `keyword_groups` + `keywords`(三种来源 manual/combine/ai_dig)+ `content_items` 扩 `writing_template_id` + `keyword_ids`
  - 12 个系统预设写作要求(操作教程 / 产品对比 / 痛点解决 / 终极指南 / 案例研究 / PAS / 小红书种草 / 知乎硬核 / 公众号情感 / 新闻公关稿 / 第三方测评 / 短视频脚本)
  - `buildVariantPrompt` 扩展 `writing_template?` + `keywords_to_plant?`,**红线优先于模板**(防 prompt injection),20 case 单测全过含恶意模板防御
  - `createAiDraft` 扩展同两参数,系统模板 prompt_skeleton 拼到 SYSTEM_PROMPT 之后
  - 三个新 admin 页:写作要求库 / 关键词词库(含 6 维组合 + AI 智能挖掘 + 合规第一道门入库前过滤)/ 创作向导(3 步:参考资料 → 关键词 → 写作要求)
  - 抓词GEO 的 "GEO 排名优化" 模板**未照抄**(软广堆砌,踩医疗合规),作为后续工单单独评估改造为 `geo-ranking-objective`
- **V1.8.x 增量补强**(2026-05-04 → 2026-05-10):
  - migration 0025 `numeric_fact_check` — 数值类事实检查,防止杜撰统计
  - migration 0026 `brand_service_areas` — 品牌服务区域多对多
  - migration 0027 `kb_multitenancy_and_observability` — KB 多租户隔离 + 观测字段
  - 反幻觉:上游断源 + 双层 sanitizer + 收紧引用检测(commits 3f3abce / 6fdb14e)
  - UI 暗色 cinematic redesign 跨 landing/tenant/staff(9ee7ddc + 两个 stragglers 修复)
  - 安全:暴破限速 + 用户枚举修复 + URL 域名白名单(ac2629e)、gitignore 真实员工 handle(fd57823)
  - 员工邀请链接 TTL 24h → 7d + 手机号绑定校验(56b0c1d,D11 衍生)
- **V1.9 batch AI drafting**(2026-05-10,migration 0028 `draft_batches`,commit 4bba685):
  N 题 × M 平台一键派发,把"逐题逐平台调 LLM"折叠成单次批处理 job
- **V1.9.1 工程纪律补强**(2026-05-11,本次会话):
  - kb-sync `URI too long` 修复(unchangedIds 分批 100 / batch,commit ed616b0)
  - 测试 hardening:`_test/_runner.ts` 全局 unhandled-rejection guard + 90s per-test timeout,3 个失败测试加入 guard(commit 3e7eaff)
  - 顺手清:next.config `trustHostHeader`(Next 15 only,14 no-op)、/staff themeColor 拆 viewport
  - test-auth marker 改为 OR 探测(V1.7 cinematic redesign 后 stale 的 marker 复活)
- **V1.9.2 生产上线**(2026-05-12):本地 main `c8d237d → fa6331b` 全套推上 ECS,Caddy 切 HTTPS,域名 `https://geo.dulijun.icu` Let's Encrypt 自动签证书。途中修了 PWA SW 缓存陷阱(`fix(staff): drop PWA`)、worker tsx 路径(`fix(deploy): worker tsx path`)、standalone static 漏 cp(`fix(deploy): rsync .next/static`)、暗色 cinematic 漏改的对比 bug、prose-slate→prose-invert
- **V1.9.2.x 滚动 deploy(2026-05-12 → 2026-05-13,补记)**:V1.9.2 上线 24h 内继续把 32 个 commit 滚动上 ECS,HEAD `fa6331b → 379ea0b`。这批含 **D21 GEO 标准内容资产 P0~P3 全套**(migration 0030~0033 / slice-first 存储 / DoD 闸门 / L2 scorer / wizard contract persistence / 公开层消费 D21 slices / tenant home briefing hero)、**合规自动改写**(第一次 reject 最多重写 1 次)、extractor 多种 FAQ 格式补、KB safety abort、Ark response_format fallback 等 P0 修。**当时 CLAUDE.md 未同步**,V1.9.3 顺手补
- **V1.9.3 员工端跳转按钮全覆盖**(2026-05-13,commit `d6f90b7`):员工任务卡之前只 3 个平台(头条/抖音/小红书)有"打开 App"按钮,公众号/知乎/百家号/搜狐号 4 个平台无任何跳转。本次扩**7 平台全覆盖**,按内容类型分流——视频/短图文(抖音脚本/小红书)→ App scheme 跳手机端;长图文(头条/公众号/知乎/百家号/搜狐号)→ PC 创作后台 URL 新标签。按钮文案动态化("打开公众号后台"等)。顺手运维:**ECS 配 GitHub deploy key**(以前 deploy.sh `git pull` 每次卡交互 auth,本次 ed25519 deploy key 配置永久解决);ECS ssh 凭证存 memory `reference-ecs-ssh.md`,实际是 `root@`,不是 deploy.sh 顶部注释的 `ubuntu@`

### 当前阶段
- **2026-05-13 决策**:D21 GEO 标准内容资产(ADR 009 + docs/07-geo-article-spec.md),写作环节从"自由 prompt"升级为"contract → slice → DoD"工程化产线
- **V2 反爬基础设施可启动**:多引擎 + 账号池 + 代理 + 指纹隔离(ADR 004)
- 生产环境:`https://geo.dulijun.icu`(Caddy 自动 HTTPS)+ `:9443`(IP fallback HTTP)+ `:8000`(自托管 Supabase,见 D13)

### 阻塞 / 待澄清 / 已知技术债
- ~~**D21 落地 P0 待开工**~~ **已 ship**(2026-05-12 → 2026-05-13,见 V1.9.2.x 条目):`content_contracts` migration 0030 + slice-first 存储 0031 + DoD 闸门 0032 + draft_batches_d21 0033 已上 prod,`buildVariantPrompt` 扩 contract 入参 / SYSTEM_PROMPT 10 结构块约束 / Trust Block 注入 / L2 structure-aware scorer / wizard contract persistence / 公开层消费 D21 slices 全部完成。**剩余 P2**:legacy_passed grandfather backfill 跑没跑全 ETL 没归档;DoD 五条 FAQ 严格 prompt 已经 ship 后还遇到过若干极端 case(8204731/16b6f46/379ea0b 反复改 prompt)
- **TEMPORARY 账号密码登录**:`/login/quick` (songshu/123456) 临时绕过邮箱魔链,deadline 2026-06-30 替换为 Supabase Auth 多用户或 phone+passcode
- ~~Worker pg-boss 连不上 DB(P0)~~ **已修复 2026-05-13**:DATABASE_URL 误写 `postgres.studio:`,Supavisor 实际注册 tenant 是 `your-tenant-id`(`/opt/supabase/docker/.env` `POOLER_TENANT_ID`)。sed 修正 + pm2 reload + 重启 worker = `[worker] pg-boss started`。`.env.production.example` 已加注释防再踩
- **`NEXT_PUBLIC_APP_URL` 未同步**:仍是 `http://47.98.131.138:9443`,影响 llms.txt / sitemap.xml / invite link 等"对外暴露 URL"。需 rebuild
- **W8 真实数据验收未归档**(40 人打卡率、5 起到店转化追溯、医院见证)。Stub 见本节末
- **可观测性已接通 P1**(2026-05-14):`.env` 有 `SENTRY_DSN` / `AXIOM_TOKEN` / `AXIOM_DATASET`,`packages/shared/src/observability.ts` 提供 `reportError` / `reportEvent` 抽象(当前实现 = 结构化 JSON console;`@sentry/node` 装包后无需改调用方代码)。**worker 端 10 处接通**(unhandled-rejection、main_fatal、compliance-auto-rewrite、batch-draft-item、geo-snapshot、discoverability-regenerate)。**web 端 8 处接通**(compliance: ai_rewrite_variant / ai_rewrite_geo_score / ai_rewrite_citations × 3 个 server action;ai-draft: llm_call + json_parse;api.internal: ai_draft + backfill_slices.row + rewrite_citations × 3 个内部 API)。**剩余 stub** = 装 `@sentry/node` 把 console JSON 转 Sentry SDK 调用(已写好的 TODO 注释 + `docs/observability-setup.md` 步骤),生产部署后做。详见 `docs/observability-setup.md`
- **自托管 Postgres `:shutdown, :db_termination`**:test-content 接近完成时被 server 主动断连。怀疑 connection pool 没释放 / max_connections 偏低 / idle timeout 过短。需要单独 infra 工单
- **测试自洁缺失**:`content-flow` / `compliance-llm` / `variant-flow` 创建的 tenant 没 cascade delete,每轮 kb-sync 都要 skip。需在测试 finally 里清理
- **3 个 smoke test 仍需深挖**:test-content 卡 `:db_termination`(infra)、test-compliance-llm 偶发卡住、test-auth 跑生产 URL 不跑本地(默认 fallback 链路待优化)
- **deploy.sh 文档过时**:`ops/deploy/deploy.sh` 顶部注释写 `ssh ubuntu@47.98.131.138`,但 ECS 实际登录用户是 **root**(`~/.ssh/id_ecs`)。2026-05-13 V1.9.3 部署时踩到。已写进 memory `reference-ecs-ssh.md`,deploy.sh 注释下次顺带修
- **5 处横向反馈回路未闭合**(立项 2026-05-14,详见 `docs/08-feedback-loops.md`):追踪→选题、引用→关键词热度、归因→内容业务价值、员工反馈→难发布标签、audit→生产端 banner。垂直主轴 D21 已通,横向回流 0。**总工时估算 6.5d**,排进 V2 第 13-14 周。客户感知:从"14 个 tab 各自孤岛"到"一页看全本周回路"
- **V1.10 日常运营自动化未交付**(立项 2026-05-19,P0,详见 `docs/09-daily-ops-automation.md`):客户反馈"每天都要盯发送给员工,太麻烦",方案=cron 定时起草 → DoD/合规自动放行 → 6h 超时机制 → 派单 → 异常时介入。混合选题(5 抽+2 手填)/ DoD+合规通过自动放行 / 6h 超时机制 三个核心策略已经用户拍板。**工时 5.5d**,V1.9.x 维稳 7 天后(预计 2026-05-21)立刻开。客户预期:每日交互 40min → 30s。**2026-05-19 V1.10 后端 + Hub UI + 入口接入 + demo run 验证全 ship,migration 0036 已 apply 生产**,待 commit + push + 真 cron 触发
- **xiangyu-search-seo-cli 借鉴清单未实施**(立项 2026-05-19,P0/P1/P2,详见 `docs/adr/010-xiangyu-cli-integration.md`):113 命令 Python CLI 评估完成,**11 项借鉴**分 3 个 sprint:V1.11(P0 ai-citation-track 4 海外引擎 + information-gain DoD 维度 6 + fanout 缺口分析,4.5d)/ V1.12(P1 audit-geo/snippet/judgment-density/readability/rich-results 维度补强,3d)/ V2(P2 kgr/entity-trust/discover 按需,2.5d)。**全部 TS port,xiangyu CLI 留私人顾问工具不入 repo**

### W8 验收追踪(stub,业务侧填写)

| 指标 | 目标 | 当前 | 责任人 | Deadline |
|---|---|---|---|---|
| 员工矩阵打卡率 | 40 人 ≥ 80% | _ | _ | _ |
| 到店转化追溯案例 | ≥ 5 起完整闭环 | _ | _ | _ |
| 医院公开见证(背书) | ≥ 1 篇 | _ | _ | _ |
| GEO 引用率(8 周热力图) | 基线 SOV ≥ 15% | _ | _ | _ |
| 合规审批 SLA | < 4h 中位数 | _ | _ | _ |

## 十、参考

- 项目研究报告:`/Users/dulijuner/Documents/GEO研究/生成式引擎优化与豆包GEO_横纵分析报告.md`
- GEO 论文原文:arxiv 2311.09735
- 国内开源 GEO 工具(参考,非依赖):github.com/CN-Sheep/SheepGeo
