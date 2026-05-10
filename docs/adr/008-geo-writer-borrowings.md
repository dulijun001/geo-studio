# ADR 008 — geo-writer skill 借鉴范围

**Status**: Proposed
**Date**: 2026-05-05
**Deciders**: 待用户 review
**Related**: ADR 007（写作要求 × 平台风格）; D2（配置化）; D5/D12（合规四道门）; geo-writer skill v0.3（`~/.claude/skills/geo-writer/`）

## 背景

2026-05-04 在 Claude Code 会话里基于「抓词GEO」桌面 PDF 蒸馏出 geo-writer skill v0.3。skill 是个人级 markdown 资产合集（39 文件 / 180K），与 geo-studio 同源同思想（都借鉴抓词GEO 的"创作向导 + 写作要求库 + 关键词管理"）。两者**不是平替**，是不同 use case：

| 维度 | geo-writer (skill) | geo-studio (this) |
|------|-------------------|-------------------|
| 形态 | markdown + bash | TypeScript + Postgres + Next.js |
| 持久化 | 文件系统 | DB + 多租户 RLS |
| 评分/合规/追踪 | grep + 文档化指引 | scorer.ts + scanner.ts + Playwright |
| use case | 个人 5 秒出试稿 | SaaS 内容生产线 |

geo-writer 在迭代过程中沉淀了若干**资产 + 设计哲学**，本 ADR 评估哪些值得借鉴回 geo-studio。

## 调研结果（2026-05-05 现状对照）

### 1. writing_templates 已有 13 个 system 模板

`packages/db/src/seed/writing-templates-seed.ts` 当前 13 个：
`tutorial / product-comparison / pain-resolution / ultimate-guide / case-study / pas / xhs-grass / zhihu-hardcore / wechat-emotional / pr-news / third-party-review / short-video-script / geo-ranking-objective`

geo-writer 17 个 prompt 中，**重叠 12 个**（case-study geo-writer 无），**多出 5 个**：

| geo-writer slug | 中文名 | 医疗 ROI 评估 |
|---|---|---|
| `founder-story` | 创始人自述 | ⭐⭐⭐⭐⭐ 贾真真院长第一视角 / 医生 IP 内容 |
| `simple-popsci` | 简易科普 | ⭐⭐⭐⭐⭐ 医疗大白话讲专业，松鼠核心场景 |
| `private-community` | 私域社群话术 | ⭐⭐⭐⭐ 朋友圈 / 群消息 / 海报 / 1v1 模板（受众"种植人群子女决策推动者"高度契合）|
| `seo-deep` | SEO 深度聚合 | ⭐⭐⭐ 自有官网博客长尾关键词，未来用 |
| `overseas-english` | 出海英文 | ⭐⭐ SaaS 国际化预留 |

### 2. compliance 分级已有

`riskLevelEnum (low/medium/high)` + `reviewStageEnum (keyword/llm/manual)` 已覆盖 geo-writer 的"合规分级标签"概念。**无需借鉴**。

### 3. structure_hint + prompt_skeleton 已支持

geo-studio 现有 schema 已有 `prompt_skeleton text` + `structure_hint jsonb`，与 geo-writer 内容字段一一对应。**直接 seed 即可**，不需要改 schema。

### 4. brands schema 无"决策推动者"字段

`audiences` 表 / `brands.target_audience` 字段不存在。geo-writer 写松鼠口腔文章时强用"子女陪父母"洞察是手动塞进去的。这部分**待单独 ADR**（涉及 brand schema 扩展），不在本 ADR 范围。

### 5. forbidden_patterns 字段评估

geo-writer 每个 prompt 末尾有"## 不可踩的雷"段（5-10 条负向约束）。但 **geo-studio 现有 prompt_skeleton 已内嵌负向约束**（如 product-comparison 已写"不许编造销量""不许说排名第一"）。

**结论：不加新字段**。负向约束写进 `prompt_skeleton` 段落与现有 13 个模板风格一致；将来如要做"UI 展示雷区清单"再加专门字段。

## 决策

### Wave 1（本 ADR 范围，纯增量，零风险）

**1.1 新增 3 个 system 模板**（强医疗 ROI）

| slug | name | 适配点 |
|---|---|---|
| `founder-story` | 创始人自述 | 第一人称、承认不完美、真实数字、自然引流；医疗版禁用"用了我的方法治愈了 X 人" |
| `simple-popsci` | 简易科普 | 类比日常事物、专业词配大白话、不假设前置知识；医疗版严守"不承诺疗效" |
| `private-community` | 私域社群话术 | 4 种场景模板（朋友圈/群消息/海报/1v1）；医疗版严控"个人案例承诺" |

**1.2 暂缓 2 个**

- `seo-deep`：与 `geo-ranking-objective` 高度重叠，差异在 SEO（搜索引擎）vs GEO（AI 引擎）。geo-studio 当前聚焦 GEO，**defer 到有官网 SEO 需求时再加**
- `overseas-english`：医疗服务跨境合规复杂，且不是 V1 优先级，**defer 到 SaaS 国际化阶段**

**1.3 README 顶部加"何时用 geo-studio web UI vs geo-writer skill"段**（30 分钟）

避免你/团队/未来用户混淆两个工具。

### Wave 2（不在本 ADR 范围，待后续 ADR）

- ADR 009：brand schema 加 audience / decision_maker 字段
- ADR 010：brand-fact-check Tier-C4（NER + DB 实体一致性）
- ADR 011：平台后处理矩阵（PLATFORM_POST_PROCESS）

### 不做（明确放弃）

- ❌ forbidden_patterns 字段（理由见上）
- ❌ KB → DB 同步管道（geo-studio 已有 knowledge.ts schema 处理 KB；同步管道是另一个独立工程项目，不属"借鉴"范畴）
- ❌ geo-writer 第 10 步默认 opt-in 改造（这是 geo-writer skill 内部改动，不影响 geo-studio）

## 数据模型 diff

**零 schema 变化**。仅在 `packages/db/src/seed/writing-templates-seed.ts` 末尾追加 3 个 entry。

```ts
// 现有 13 个 + 新增 3 个 = 16 个 system 模板
WRITING_TEMPLATE_SEEDS = [
  ...existing 13,
  { slug: 'founder-story', name: '创始人自述', ... },
  { slug: 'simple-popsci', name: '简易科普', ... },
  { slug: 'private-community', name: '私域社群话术', ... },
]
```

## 落地步骤（Wave 1 执行清单）

1. **写 3 个新模板的 prompt_skeleton + structure_hint**（基于 geo-writer 对应 prompt 改写为医疗合规版）
2. **追加进 `writing-templates-seed.ts`**
3. **跑 `pnpm db:seed`**（重 seed，幂等：on conflict slug do update prompt_skeleton/structure_hint/name/description）
4. **跑 `pnpm db:test-content`**（确认 13 + 3 = 16 个 system 模板可读）
5. **更新 README.md** 加"两个工具定位"段
6. **不 commit / 不 push**（按用户协作准则，等用户确认后手动 commit）

## 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|:---:|:---:|------|
| 3 个新模板违反医疗合规红线（D5/D12）| 中 | 高 | 改写时严守红线词库 + 复用现有 13 个模板的合规惯例（如 third-party-review 的"不许编造数据"句法）|
| seed 脚本破坏现有 13 个模板 | 低 | 高 | seed 用 upsert（slug 唯一索引），不删现有；先在 dev 环境跑 |
| README 改动影响 git history | 低 | 低 | 只加段落，不动现有内容 |
| 新模板用户不会用 | 低 | 低 | 创作向导 UI 已支持模板下拉，新增自动出现 |

## 兼容性

- ✅ 向后兼容：现有 14 commit 历史的 13 个模板**不动一个字**
- ✅ 不改 schema：不需要 migration
- ✅ 不改 prompt-builder.ts：composer 已支持任意 system 模板
- ✅ 不改 RLS / 权限：system 模板（tenant_id NULL）权限不变

## 验收标准

- `SELECT slug FROM writing_templates WHERE is_system = true` 返回 16 行
- 创作向导 UI 模板下拉看到新增 3 个
- 用 founder-story 模板对松鼠租户 dry-run 一次 prompt 生成，输出包含"第一人称""承认不完美"等关键词
- README 段落明确两个工具的边界

## 决策日志

- 2026-05-05 09:30 起草（Claude）
- [ ] 待用户 sign-off
- [ ] 实施完成
