# ADR 009 — GEO 标准内容资产(content_contract + slice-first + DoD)

**Status**: Proposed
**Date**: 2026-05-13
**Deciders**: 用户(产品定位决策) + Claude(实施细节)
**Related**: CLAUDE.md D20 / D21; ADR 005(可发现层)/ ADR 007(写作 × 平台叠加)/ ADR 008(geo-writer 借鉴); docs/07-geo-article-spec.md

## 背景

2026-05-13 用户提供了一份完整的"标准 GEO 文章规范"文档(`geo_studio_标准GEO文章规范_v1_*.md`,后整理进 `docs/07-geo-article-spec.md`)。

这份规范**修正了 V1.8 的核心定位假设**:

V1.8(ADR 007)以"writing_template × platform_style 双层叠加"作为内容生成抽象的顶层,即:

```
意图(写作要求) × 格式(平台风格) → 多平台变体
```

但规范指出,这两层都在**"怎么写"**的范畴里,**"写什么 / 为谁写 / 写给谁看 / 必须出哪些可引用块"**这一层完全空着。结果:

- 内容质量上限被"自由 prompt"卡住,LLM 偏好写"通顺但平庸"的整段散文
- 没有 FAQ / Trust Block / 引用块的硬约束 → 输出对 AI 引擎不友好
- 没有 Schema 联动 → ADR 005 可发现层有结构但内容侧没结构,两端对不齐
- 没有 DoD → 每篇内容质量靠人工抽检,数量起来后必然失控

规范要求把生成顺序前置两层,并把存储从 `markdown blob` 改为 `typed slices`。

## 决策

### 决策 1:生成顺序前置两层

```
原 V1.8:                                writing_template × platform_style
新 V2:    query_intent → content_contract → writing_template × platform_style
```

`query_intent`(8 种枚举,问题意图)与 `content_contract`(15+ 字段,文章合同)成为生成的**强制前置约束**。

**writing_template 不被废弃**,但**从顶层抽象降为"执行模板"**——被 contract 消费,而不是直接被用户挑选。12 个系统 writing_template 全部保留,UI 入口位置在 V2 中后移。

### 决策 2:Slice-first 存储

`content_items` 从单 markdown blob 扩为 **typed slices**:

```sql
ALTER TABLE content_items ADD COLUMN direct_answer text;
ALTER TABLE content_items ADD COLUMN summary_1 text;
ALTER TABLE content_items ADD COLUMN summary_3 text;
ALTER TABLE content_items ADD COLUMN myth_busting_block text;
ALTER TABLE content_items ADD COLUMN when_to_seek_care text;
ALTER TABLE content_items ADD COLUMN faq_pairs jsonb NOT NULL DEFAULT '[]';
ALTER TABLE content_items ADD COLUMN comparison_points jsonb NOT NULL DEFAULT '[]';
ALTER TABLE content_items ADD COLUMN entity_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE content_items ADD COLUMN trust_block jsonb NOT NULL DEFAULT '{}';
```

(实际 migration 形式可能改用单一 `slices jsonb` 字段做版本灵活;细节定在 P1 工单。)

**slices 反向服务于**:
- AI Feed / llms-full.txt(直接读 slice,不再 markdown 摘要)
- FAQ Schema JSON-LD(直接读 `faq_pairs`)
- 多平台分发(slice 排列组合,不再"重新生成 variant")
- 追踪 query matcher(精确 join `query_cluster`,不再 embedding 模糊匹配)
- 单内容 ROI 归因(可定位到 slice 级别)

### 决策 3:Definition of Done(DoD)闸门

`content_items.status` 扩展:
- `draft` → `contract_filed` → `writing` → `dod_check` → `dod_passed` / `dod_failed`
- `dod_passed` 才允许进派单

DoD 14 + 5 条 checklist,详见 `docs/07-geo-article-spec.md` 第十三节。

**渐进式开启**(防止存量内容焦虑):
- 老内容(V1.5 已审通过)新增 status `legacy_passed`,免 DoD
- 新生成内容按 article_type 分阶段开启 DoD,先 `myth_busting` 开 8 条
- 老内容可手动选择"重写为标准 GEO 文章"触发 DoD

### 决策 4:Scorer v3 三层架构

| 层 | 名称 | 实现 | 何时跑 |
|---|---|---|---|
| L1 | cheap heuristic | 现有 V1.6 9 法,保留 | 每次生成后立刻跑 |
| L2 | structure-aware rule engine | 数 FAQ / 检查 trust_block / 校验实体完整性 | 每次生成后立刻跑 |
| L3 | LLM judge / pairwise | 跟当前 query top cited 答案对比 | 进 DoD 闸门时跑 |

L2 新增 5 维度:Query Coverage / Citation-worthiness / Entity Explicitness / Trust Block Completeness / Sliceability。

详见 `docs/07-geo-article-spec.md` 第十节。

## 数据模型 diff(P0 + P1)

### P0 新表:`content_contracts`

```sql
CREATE TABLE content_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  -- 必填核心
  article_type text NOT NULL CHECK (article_type IN (
    'definition','myth_busting','comparison','symptom_check',
    'process_expectation','risk_boundary','local_choice'
  )),
  query_intent text NOT NULL CHECK (query_intent IN (
    'what_is','is_it_true','which_is_better','why_happens',
    'what_to_do','how_long','when_to_seek_care','how_to_choose_local'
  )),
  primary_query text NOT NULL,
  query_cluster text[] NOT NULL DEFAULT '{}',  -- 强约束 cardinality >= 3

  -- 实体绑定
  primary_entity text NOT NULL CHECK (primary_entity IN (
    'brand','service','physician','condition'
  )),
  supporting_entities text[] NOT NULL DEFAULT '{}',

  -- 受众与决策阶段
  target_audience text NOT NULL,
  decision_stage text NOT NULL CHECK (decision_stage IN (
    'awareness','consideration','decision'
  )),
  location_scope text NOT NULL CHECK (location_scope IN (
    'national','local_city','local_district'
  )),

  -- 医疗合规开关
  reviewer_required boolean NOT NULL DEFAULT true,
  risk_boundary_required boolean NOT NULL DEFAULT true,
  faq_required_count int NOT NULL DEFAULT 5,
  citation_mode text NOT NULL CHECK (citation_mode IN (
    'verified_only','qualitative_only','mixed'
  )),

  -- Schema 联动
  schema_targets text[] NOT NULL DEFAULT '{Article}',

  -- 可选字段(jsonb 装,避免 schema 频繁改)
  optional_fields jsonb NOT NULL DEFAULT '{}',
  -- 内含:comparison_objects / related_services / contraindications /
  --       local_trust_signals / cta_mode

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT query_cluster_min_3 CHECK (cardinality(query_cluster) >= 3),
  CONSTRAINT faq_min_5 CHECK (faq_required_count >= 5)
);

ALTER TABLE content_items
  ADD COLUMN content_contract_id uuid REFERENCES content_contracts(id);
```

### P1 扩列:`content_items` slices

(SQL 细节见决策 2,实际 migration 在 P1 工单写)

## 边界:哪些 NOT 在本 ADR 范围

- ❌ 删除 `writing_templates` 表(保留,降为执行模板)
- ❌ 删除 D20 双层叠加(保留,作为生成第 3-4 层)
- ❌ 替换 `createAiDraft` 整体流程(扩展入参,不重写)
- ❌ 改 V1.5 已审通过老内容(标 `legacy_passed`,免追溯)
- ❌ 改前端 admin UI(P0 不做,P1 起逐步迁移)
- ❌ Worker pg-boss 修复(独立 ADR / 工单)

## 实施分阶段

### P0(2-3 周)
1. ✅ `docs/07-geo-article-spec.md`(已完成 2026-05-13)
2. ✅ 本 ADR(已完成 2026-05-13)
3. CLAUDE.md 加 D21(本次会话内)
4. migration 0030:新增 `content_contracts` 表 + `content_items.content_contract_id`
5. `buildVariantPrompt` 扩 `content_contract?` 入参
6. SYSTEM_PROMPT 加 10 个必备结构块 + Trust Block 注入
7. **Quick wins(prompt + scorer 调优,不动数据模型)** —— 见 task #16 列表

### P1(3-5 周)
1. migration 0031:`content_items` slices 字段
2. Scorer v3 L2 rule engine
3. Citation block extractor(markdown → typed slices)
4. 生成前绑定 schema_targets,接 ADR 005 Schema 生成器
5. DoD 闸门 + 渐进开启策略
6. 新 admin 页 `/t/<slug>/contracts`(content_contract 编辑器)

### P2(5+ 周,等 GEO 追踪数据沉淀 ≥ 8 周)
1. Competitive gap 流程
2. Slice-first 存储层完整化 + LLM 回填老内容
3. Tracking 反哺 query planner
4. Scorer v3 L3 LLM judge

## 风险

| 风险 | 缓解 |
|---|---|
| LLM 不擅长精控 35-90 字句长 | 后处理:正则切句 → 统计字数 → 不符合的塞回 LLM 重写循环 |
| DoD 14 条全开会让大量内容卡在 dod_failed | 渐进式 DoD(决策 3),按 article_type 分阶段开启 |
| Slice-first 数据迁移有 LLM 解析错风险 | 回填后人工抽样 + 回滚机制 + 保留原 markdown 字段 |
| Competitive gap 需要追踪数据沉淀 | 延迟到 P2,不阻塞 P0/P1 |
| writing_template 用户已习惯,UI 降权可能引起困惑 | UI 改造放在 P1 末,文档先行,运营先理解 |

## 后续

- P0 开工后,本 ADR Status 改 Accepted
- P1 阶段如果数据模型与本 ADR 偏离,补 ADR 010
