# ADR 010 — xiangyu-search-seo-cli 借鉴清单 + 集成策略

**Status**: Proposed
**Date**: 2026-05-19
**Deciders**: 用户(产品方向) + Claude(实施细节)
**Related**: CLAUDE.md D4 / D7 / D17 / D21; ADR 005(可发现层)/ ADR 008(geo-writer 借鉴)/ ADR 009(D21 标准内容资产);docs/04-roadmap.md V1.11+

## 一、背景

2026-05-19 用户提供了一份独立项目 `~/projects/xiangyu-search-seo-cli`(Python 3.12 CLI, 113 个命令)做 SEO / GEO 生命周期管理。本 ADR 评估**借鉴清单 + 集成策略**。

xiangyu CLI 全貌(分 10 类):
- `[1-Research]` 12 命令 — 关键词研究
- `[2-Build]` 4 命令 — robots/sitemap/hreflang/schema
- `[3-Content]` 5 命令 — meta/heading/image/readability
- `[4-Publish]` 7 命令 — indexnow/百度/神马/搜狗/360 推送
- `[5-Index]` 14 命令 — GSC/Bing/GA4
- `[6-Audit]` 20 命令 — 抓取/索引/重定向/duplicates/security/link
- `[7-Perf]` 2 命令 — Core Web Vitals
- `[8-AI / 8-AI/GEO]` 9 命令 — AEO/GEO/Entity Trust/judgment-density/info-gain/llms-txt/snippet-extract/fanout/discover
- `[9-Monitor/GEO]` 1 命令 — **ai-citation-track**(ChatGPT/Perplexity/Gemini/Claude 4 引擎 API)
- `[10-Report]` 6 命令 — weekly / AI readiness
- `[DataForSEO]` 24 命令 — DataForSEO 集成

实现质量:每个命令 100-300 行 Python,纯函数化 + 正则/regex 抓取 + JSON 输出。算法严谨(GEO 9 法 / E-E-A-T / judgment-density 三层),实用。

## 二、4 类对照(对 GEO Studio 的价值)

### A 类 — 已有,可借鉴维度补强

| xiangyu 命令 | GEO Studio 已有 | 借鉴价值 |
|---|---|---|
| `audit-geo` | D21 scorer-l2 | ⭐⭐ 增"权威外链白名单"+"新鲜度 dateModified" |
| `geo-snippet-extract`(6 维:首段定义/H2/短段/数据/列表/FAQ)| D21 slice-extractor | ⭐⭐ 评分更细 |
| `judgment-density`(立场/实测/失败坦白 3 层正则)| D21 部分覆盖 | ⭐⭐ 中英双语正则可抄 |
| `llms-txt-build` | V1.7 已 ship | ⭐ 无 |
| `content-uniqueness` | V1.7 Jaccard | ⭐ 无 |
| `audit-schema` | V1.7 Schema 7 类 | ⭐ 无 |
| `internal-link-graph` / `build-sitemap-verify` / `build-robots-check` | V1.7 部分 | ⭐ 无 |

### B 类 — 没有,值得 port(高 ROI)

| xiangyu 命令 | 价值 | 整合点 |
|---|---|---|
| 🔥 **ai-citation-track** | 4 个海外 AI 引擎 API 互补 D4 豆包 Playwright | `packages/geo-core/tracking/adapters/{openai,perplexity,gemini,claude}.ts` |
| 🔥 **information-gain-check** | 我们 D21 DoD 14+5 条**没"独家信号"维度** | D21 DoD 加维度 6:`independent_signals` |
| 🔥 **geo-fanout-check** | PAA + Related + Suggestions 缺口分析 | 升级 docs/08 §8 断点 1 为双源驱动 |
| `audit-discover` | Google Discover 10 维(出海)| V2 candidate |
| `audit-entity-trust` | Org+Person+sameAs+NAP(Knowledge Graph)| V1.7 可补 sameAs |
| `audit-ai-render` | GPTBot/ClaudeBot/Perplexity bot 独立渲染测 | worker tool 独立,不入 SaaS |
| `kgr` | 关键词竞争比值法 | keywords 表 meta 加 kgr |
| `content-readability` | Flesch Reading Ease 中英自适应 | scorer 增维度 |
| `audit-rich-results` | 17 类富结果 + Schema.org W3C 校验 | V1.7 Schema 7→17 |

### C 类 — 不需要(SEO 不是 GEO 战场)

- 索引提交(baidu/shenma/sogou/360/gsc-*/ga4-*)— D3 不自动化,客户员工手发
- 链接审计 / backlink / internal-link-graph 高级 — 客户不关心外链
- 性能审计(CWV/PSI)— 客户不维护站点
- DataForSEO 全套 24 — 不接付费 SaaS
- 本地 SEO / `geo-grid` GPS 网格 — 跟我们 GEO 概念不同

### D 类 — 疑似类似但不同

- xiangyu `keyword-*` 走 DataForSEO 月搜索量/KD,我们 `keywords` 是**内容生产**词库,不同领域
- xiangyu `serp-analyze` 走 Google SERP API,我们走豆包 Playwright

## 三、集成方案 4 选

| 方案 | 描述 | 评估 |
|---|---|---|
| A | xiangyu 完全独立,客户跑 CLI 上传 JSON | ❌ UX 灾难,客户不会用 CLI |
| B | Python 子进程跑在 worker 里 | ❌ 破 D7 单语言;venv 部署烦 |
| C | 全部 port 到 TS | ❌ 113 命令 port 工时巨大 |
| **D** | **只 port 高 ROI 算法 + xiangyu 留私人顾问工具** | **✅ R&D 闭环,工时可控** |

## 四、决策

**走方案 D**,**11 个借鉴项目分 3 优先级**:

### P0 — V1.11 排期(核心 GEO 能力升级,4.5d)

| # | 借鉴项 | 实现位置 | 工时 | 与现有决策关系 |
|---|---|---|---|---|
| **1** | **ai-citation-track 4 引擎 adapter** | `packages/geo-core/tracking/adapters/{openai,perplexity,gemini,claude}.ts` + worker dispatcher 扩展 | **2d** | 补 D4(豆包 Playwright)→ 5 大 AI 引擎覆盖。出海客户立刻用。`tenants.settings.tracking.engines` enum 扩容 |
| **2** | **information-gain-check → D21 DoD 维度 6** | `packages/geo-core/generation/scorer-l2.ts` 加 `independent_signals` 维度 + DoD 闸门加 1 条 | **1.5d** | D21 14+5 → 15+5 条 DoD。生成时强约束"≥1 一手数据 OR 反共识 OR 独家案例"。需要 `serp_top5_snippets` 输入(走 SERP API)|
| **3** | **geo-fanout-check 合并 docs/08 §8** | `packages/geo-core/feedback/fanout-check.ts` + docs/08 §8 升级 | **1d** | 双源驱动选题:高追踪零引用 query + Google PAA/Related 缺口。需 Google Suggest API |

### P1 — V1.12 排期(D21 / scorer / Schema 维度补强,3d)

| # | 借鉴项 | 实现位置 | 工时 | 影响 |
|---|---|---|---|---|
| **4** | **audit-geo 维度增补** | scorer-l2 加 `authoritative_outlinks` + `freshness_signal`(dateModified ≤ 180d)| **0.5d** | scorer-l2 评分更全面 |
| **5** | **geo-snippet-extract 6 维评分** | `packages/geo-core/generation/slice-extractor.ts` 加 6 维细粒度评分 | **1d** | D21 slice 质量分级,/today 页可显示"切片质量 4/6" |
| **6** | **judgment-density 三层正则** | scorer-l2 加 `judgment_density` 维度(中英双语正则)| **0.5d** | 立场/实测/失败坦白 3 层评分,GEO 9 法落地 |
| **7** | **content-readability Flesch** | scorer-l2 加 `readability` 维度(中英自适应)| **0.5d** | 防 LLM 写得太晦涩 |
| **8** | **audit-rich-results 17 类 Schema** | `packages/geo-core/discoverability/schema-generators.ts` 扩 7→17 类 | **0.5d** | V1.7 可发现层升级 |

### P2 — V2 排期(出海 + 长尾,按客户需求拉)

| # | 借鉴项 | 实现位置 | 工时 | 触发条件 |
|---|---|---|---|---|
| **9** | **kgr 关键词竞争比值法** | `keywords.meta.kgr` 字段 + worker job 计算 | **0.5d** | 客户问"哪些词好抢"时拉 |
| **10** | **audit-entity-trust sameAs/NAP** | `brands` 表加 sameAs[] + audit page | **1d** | 客户做 Knowledge Graph 入门 |
| **11** | **audit-discover Google Discover 10 维** | 单独 audit 模块 | **1d** | 出海客户(英文版)需要 |

**总工时**:
- P0(V1.11)= 4.5d
- P1(V1.12)= 3d
- P2(V2 按需)= 2.5d
- **全部合计 10d**(分 3 个 sprint 摊)

## 五、实施模式(每个 port 都遵守)

```
1. 算法**纯函数**放 packages/geo-core/<domain>/
2. 单测放 packages/geo-core/src/_test/<name>.ts
3. 复用 reportError / reportEvent 埋点
4. Worker 端调用(cron / job)/ Web 端调用(server action)统一 import
5. 不在 SaaS UI 暴露"调用 xiangyu CLI"按钮 — 算法已 port,直接 import 用
```

**禁止**:
- ❌ 复制粘贴 Python → 用 LLM 翻译 TS,要**理解算法本质**重写
- ❌ 把 xiangyu manifest.json / commands/ 目录引进 GEO Studio repo
- ❌ 在 GEO Studio package.json 加 Python 依赖(pyodide / python-shell 等)

## 六、与现有决策兼容性

| 决策 | 关系 |
|---|---|
| D4 GEO 追踪走 Playwright 不走 API | ✅ 不破 — P0-1 是**新增**海外引擎 API,豆包仍 Playwright。两者并存 |
| D5/D12 合规四道门 | ✅ 不破 — port 算法是分析侧,合规仍是写入闸门 |
| D7 TS 单语言 | ✅ 不破 — port 算法到 TS,xiangyu Python CLI 不进 repo |
| D10 schema migration | ✅ 遵守 — P1-4 等加 meta 字段走 migration |
| D17 build-on-write | ✅ 类似思想 — audit 结果可物化 |
| D21 contract → slice → DoD | ✅ 扩展 — DoD 维度从 14+5 → 15+5 → 18+5 渐进 |
| docs/08 反馈回路 | ✅ 升级 — §8 断点 1 双源驱动 |
| ADR 008 geo-writer 借鉴 | ✅ 类比 — 都是"借鉴他人算法不引整个项目"模式 |

## 七、xiangyu CLI 在你个人工具链的位置

**不入 GEO Studio repo**,但**保留作为售前 / 顾问工具**:

- **使用场景 1**:接新客户时,跑 `xiangyu audit-full --url <client-site>` 出 SEO/GEO 诊断报告 → 报告作为"我的诊断能力"卖单,GEO Studio 是后续运营产品
- **使用场景 2**:你自己维护的网站(dulijun.icu / 其他)做个人 SEO 优化
- **位置**:`~/projects/xiangyu-search-seo-cli/` 独立目录,**不**链接到 GEO Studio
- **更新**:xiangyu 上游 release 你手动 git pull,GEO Studio 跟它**完全解耦**

## 八、不做什么(明确排除)

| 项 | 理由 |
|---|---|
| 引入整个 xiangyu CLI 作 GEO Studio worker 依赖 | 破 D7,90% 命令客户用不到 |
| port 113 命令 / 全套 24 DataForSEO 命令 | ROI 低,口腔/医美/律所客户不需要 SEO 顾问级深度 |
| 把 xiangyu 当 SaaS 商业化(直接卖客户)| 已有 GEO Studio,两个产品撕精力 |
| 在 docs/04 V1 路线图里塞 xiangyu | V1 还没收尾,V1.10 daily-ops 才刚 ship |
| port 后保留 "原 Python 命令名" 在 TS API | TS API 命名应跟随 GEO Studio 风格(camelCase + 业务语义),不抄 CLI 命名 |
| 把 P2-9 (kgr) 给医院客户用 | 医院客户没"竞争词库"概念,医美/律所/教育才有 |

## 九、何时触发升级

| Sprint | 启动条件 |
|---|---|
| **V1.11**(P0,4.5d)| V1.10 daily-ops 维稳 7d(预计 2026-05-26)+ 客户主动表示"想覆盖海外 AI 引擎" OR "想看内容是否有独家信号" |
| **V1.12**(P1,3d)| V1.11 完成后,客户实际跑 daily-ops 反馈"内容评分不够细" |
| **V2**(P2 按需)| 客户提出出海需求 OR 跨行业(医美/律所/教育)上线时 |

**强制 not 触发**:V1 主线未稳 / 客户未提需求 / V1.10 数据未跑足 30 天观察。

## 十、立项决策(给未来的自己)

- 这是一份**Roadmap-class ADR**(不是单 sprint 决策),覆盖 V1.11 / V1.12 / V2 共 3 个 sprint
- 不立即开工 — V1.10 还没 commit + 部署,先收尾
- 11 项借鉴**全部固化为决策**,避免下次会话重新评估
- xiangyu CLI 上游 update 不影响本 ADR(本 ADR 只记录"已评估的借鉴项",不跟 upstream 同步)

→ 相关:`~/projects/xiangyu-search-seo-cli/`(独立项目)/ `CLAUDE.md` §9 已知技术债 / `docs/08-feedback-loops.md` §8 / `docs/04-roadmap.md` V1.11+
