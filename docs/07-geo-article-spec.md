# GEO Studio 标准 GEO 文章规范 v1

> **Status**: Accepted as alignment baseline (2026-05-13)
> **Related**: CLAUDE.md D14-D20 + D21; ADR 005 / 007 / 009
> **Owner**: 杜立军 + Claude

本文档定义 GEO Studio 产出的"标准 GEO 文章"的产品规范、数据模型、生成顺序与 DoD。
所有后续生成 / 评分 / 审核 / 追踪相关的代码,以本文档为对齐基准。

---

## 一、定义

**标准 GEO 文章 ≠ 写得不错的文章**。它必须同时满足四件事:

1. 明确回答一个 AI 高频问题
2. 正文内部存在多个可独立引用的答案块
3. 能稳定映射到结构化实体与 Schema
4. 上线后可被追踪、比较、验证、迭代

换句话说,标准 GEO 文章是 **「问题资产 + 引用资产 + 结构化资产 + 可验证资产」**。

---

## 二、与现有架构的关系(读完一定要懂)

| 层 | 角色 | 现状 | 本规范的位置 |
|---|---|---|---|
| 0. `query_intent`(本规范新增) | 这条内容回答的"问题类型" | ❌ 尚未实现 | 生成第一层,前置约束 |
| 1. `content_contract`(本规范新增) | 这条内容的"写作合同" | ❌ 尚未实现 | 生成第二层,定义产物 |
| 2. `writing_template`(ADR 007 已 ship) | 写作要求(意图骨架) | ✅ V1.8 已 ship,13 个系统模板 | 生成第三层,**降为执行模板** |
| 3. `platform_style`(ADR 007 已 ship) | 平台风格(格式 / 口吻) | ✅ V1.8 已 ship | 生成第四层,平台分化 |

**关键决策**:本规范不替换 D20 双层叠加,而是在它**之前**叠加 query_intent 和 content_contract 两层,让生成顺序变成:

```
query_intent → content_contract → writing_template × platform_style
```

详见 ADR 009。

---

## 三、文章对象模型(content_contract)

每篇 GEO 文章在生成前,必须先声明一份 `content_contract`。无 contract,不允许进入 `createAiDraft`。

### 3.1 必填字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `article_type` | enum | 7 种之一(见下) |
| `primary_query` | text | 文章直接回答的主问题。例:`洗牙会不会让牙缝变大` |
| `query_cluster` | text[] | 衍生问法 ≥ 3 条 |
| `primary_entity` | enum | `brand` / `service` / `physician` / `condition` |
| `supporting_entities` | text[] | 辅助实体。例:`昆明松鼠口腔`、`洁牙`、`牙结石` |
| `target_audience` | text | 目标人群。例:`准备洁牙的成年人` |
| `decision_stage` | enum | `awareness` / `consideration` / `decision` |
| `location_scope` | enum | `national` / `local_city` / `local_district` |
| `reviewer_required` | bool | 医疗行业固定 `true` |
| `risk_boundary_required` | bool | 医疗行业固定 `true` |
| `faq_required_count` | int | 医疗行业 ≥ `5` |
| `citation_mode` | enum | `verified_only` / `qualitative_only` / `mixed` |
| `schema_targets` | text[] | 至少含 `Article`,按类型附加 |

### 3.2 可选字段

- `comparison_objects`(`comparison` 类型必填)
- `related_services`
- `contraindications`
- `local_trust_signals`
- `cta_mode`:`soft` / `appointment` / `education_only`

### 3.3 article_type 7 种枚举

| 枚举值 | 中文 | 典型 query |
|---|---|---|
| `definition` | 定义型 | "什么是牙周炎" |
| `myth_busting` | 误区澄清 | "洗牙会不会让牙缝变大" |
| `comparison` | 对比型 | "种植牙和烤瓷桥怎么选" |
| `symptom_check` | 症状自查 | "牙龈出血是不是牙周炎" |
| `process_expectation` | 流程预期 | "种植牙流程要多久" |
| `risk_boundary` | 风险边界 | "种植牙有哪些风险" |
| `local_choice` | 本地决策 | "昆明种植牙怎么选医院" |

---

## 四、Query Intent 模型(生成第一层)

现有 `writing_template` 是"写法模板",**缺"问题意图模板"**。本规范新增 `query_intent` 枚举:

| 枚举值 | 含义 |
|---|---|
| `what_is` | 什么是 X |
| `is_it_true` | X 是不是真的 |
| `which_is_better` | X 和 Y 哪个好 |
| `why_happens` | 为什么会 X |
| `what_to_do` | 出现 X 怎么办 |
| `how_long` | X 要多久 |
| `when_to_seek_care` | X 时该不该看医生 |
| `how_to_choose_local` | 本地怎么选 X |

**口腔行业映射示例**:
- `洗牙会不会让牙缝变大` → `is_it_true`
- `种植牙和烤瓷桥怎么选` → `which_is_better`
- `牙龈出血是不是牙周炎` → `what_to_do` + `when_to_seek_care`
- `昆明种植牙怎么选医院` → `how_to_choose_local`

**生成顺序约束**(强制):

```
query_intent → content_contract → writing_template → platform_style
```

**禁止**:
```
source_material → writing_template → platform_style    // 现 V1.8 路径,过渡期保留
```

V2 全量转换之前,V1.8 路径不删除,但**新功能必须走新顺序**。

---

## 五、标准正文结构(10 个必备块)

所有医疗 GEO 文章必须遵守 **「单主问题 + 可切片结构」**:

1. 标题
2. 一句话结论(direct_answer)
3. 误区 / 问题解释
4. 原理或机制说明
5. 适用人群 / 不适用人群
6. 风险边界 / 何时线下就诊
7. FAQ(≥ 5 条)
8. 审核信息(reviewer)
9. 更新时间(updated_at)
10. 机构 / 服务绑定信息

### 5.1 不同 article_type 的额外要求

**`myth_busting`** 必须包含:常见误解 / 误解成因 / 正确理解 / 例外情况

**`comparison`** 必须包含:对比对象定义 / 评判维度 / 适合谁 / 不适合谁 / 决策建议

**`symptom_check`** 必须包含:可能原因 / 可先观察情况 / 必须尽快检查情况 / 常见误区

**`local_choice`** 必须包含:本地决策维度 / 常见坑 / 如何判断专业度 / 如何判断适不适合自己 / 本地信任信号

---

## 六、引用块(Citation Block)要求

每篇文章必须能拆出若干个 AI 可直接引用的块,每篇 **≥ 5 个**:

- `1` 个 direct_answer(一句话结论块)
- `1` 个 definition(定义块)
- `1` 个 myth_busting(误区澄清块)
- `1` 个 risk_boundary(风险边界块)
- `1` 个 applicability(适用人群判断块)
- `5` 个 faq_short(FAQ 短答块)

### 6.1 合格引用块标准

- 单独截出来也成立
- 不依赖前文过强上下文
- **不使用模糊指代**(这个 / 那种 / 前者 / 后者)
- 不混合两个以上结论
- **句长建议 35-90 字**(LLM 不擅长精控字数,需后处理校验 + 重写)

### 6.2 示例

✅ `洗牙不会让牙缝变大,更多是牙结石清除后,牙齿原本的间隙暴露出来。`
✅ `如果洗牙后长期疼痛、牙龈肿胀或牙齿明显松动,不建议只在网上继续查,应该尽快线下检查。`

❌ `这种情况其实很常见,我们之前提到的那个原理就能解释` ← 模糊指代 + 依赖前文

---

## 七、实体清晰度要求

### 7.1 必须显式表达的实体

- 品牌 / 机构
- 城市 / 地域
- 服务项目
- 症状 / 问题对象
- 审核医生 / 医疗团队
- 适用人群
- 风险边界

### 7.2 医疗行业字段最小集

- `brand_name`
- `city`
- `service_name`
- `reviewed_by`
- `updated_at`
- `medical_specialty`

---

## 八、Trust Block(新增强制独立模块)

医疗行业不能只靠"不违规"来建立可信度。每篇文章新增 `trust_block`,**作为独立结构块输出**,而非散落文中:

- 本文适用对象
- 本文不替代面诊
- 哪些情况要尽快就诊
- 审核医生 / 医疗团队
- 更新时间
- 机构信息
- 地域适用范围

trust_block 是**合规四道门外的第五道门**(完整性闸门),缺则 DoD 不通过。

---

## 九、Discoverability 联动(生成期绑定)

不是正文写完再补 Schema,而是**生成前**就要绑定 discoverability 目标。

### 9.1 article_type → Schema 映射约束

| article_type | 必须可映射 Schema |
|---|---|
| `comparison` | `Article + FAQPage` |
| `symptom_check` | `Article + FAQPage + MedicalCondition-like profile` |
| `service_explainer` | `Article + MedicalProcedure` |
| `local_choice` | `Article + MedicalBusiness + FAQPage` |

### 9.2 不允许的状态

- 正文没有 reviewer,却要输出 `Physician` 相关 Schema
- 正文没有 FAQ,却强上 `FAQPage`
- 正文没有地点信息,却做本地推荐类 query

---

## 十、Scorer v3 升级(L1 + L2 + L3 三层)

现有 V1.6 9 法启发式评分保留为 L1,新增 L2 + L3:

### 10.1 三层架构

| 层 | 名称 | 实现 | 成本 |
|---|---|---|---|
| L1 | cheap heuristic | 现有 9 法 / scorer.ts | 0 token,毫秒级 |
| L2 | structure-aware rule engine | 数 FAQ / 检查 trust_block / 校验 entity 完整性 | 0 token,毫秒级 |
| L3 | LLM judge / pairwise eval | 跟当前 query top cited 答案对比 | 1-2 次 LLM 调用 |

### 10.2 L2 新增 5 个维度

| 维度 | 检查 |
|---|---|
| **Query Coverage** | 主问题是否直接回答 / 开头 120 字是否给出答案 / 覆盖 3-5 个 query cluster / 处理 1 个典型误解 |
| **Citation-worthiness** | 可引用结论句数量 / 可独立成立句比例 / 块级歧义率 / FAQ 可抽取度 |
| **Entity Explicitness** | 品牌 / 服务 / 地点 / 审核者是否齐全 / 是否存在模糊主体 / 是否适合 Schema 映射 |
| **Trust Block Completeness** | 适用对象 / 风险边界 / 不替代面诊 / 审核信息 / 更新时间 |
| **Sliceability** | 能否拆出 summary / direct_answer / FAQ / risk / compare blocks / 切片后是否仍自洽 |

---

## 十一、Slice-first 存储

标准 GEO 内容在存储层不应只有 `title + body`,必须拆为 typed slices:

| Slice 字段 | 类型 | 用途 |
|---|---|---|
| `direct_answer` | text | 一句话结论,llms.txt 首屏 |
| `summary_1` | text | 1 句话摘要 |
| `summary_3` | text | 3 句话摘要 |
| `myth_busting_block` | text | 误区澄清(myth_busting 类型必填) |
| `when_to_seek_care` | text | 何时就诊(symptom_check 必填) |
| `faq_pairs` | jsonb[] | FAQ Q/A 对 |
| `comparison_points` | jsonb[] | 对比维度(comparison 必填) |
| `entity_snapshot` | jsonb | 实体快照(brand / service / city / reviewer) |
| `trust_block` | jsonb | trust block 7 字段 |

### 11.1 这些字段反向服务于

- AI Feed(ai-content-feed.json)
- llms-full.txt
- FAQ Schema(JSON-LD)
- 多平台分发(slice 排列组合,不是重新生成 variant)
- 追踪 query matcher(精确 join `query_cluster` 而非 embedding 模糊匹配)
- 单内容 ROI 归因(精确到 slice,不是整篇)

---

## 十二、竞品差异化(Competitive Gap)

标准 GEO 文章不能只"写对",还要"**比现有答案更值得引用**"。

### 12.1 新增 `competitive_gap` 过程

1. 抓当前 query top cited answers(依赖 GEO 追踪先有 ≥ 8 周稳定数据)
2. 抽共同覆盖点
3. 找缺失点 / 模糊点 / 错误点
4. 让新文章**优先补这些空缺**

### 12.2 输出字段

- `competitor_common_points`
- `competitor_gaps`
- `our_differentiation_angle`

---

## 十三、Definition of Done(DoD)

一篇文章只有满足**全部**以下条件,才算"标准 GEO 文章"。

### 13.1 基础 DoD(14 条)

- [ ] 单一主问题明确
- [ ] `query_cluster` ≥ 3
- [ ] 正文结论前置(120 字内)
- [ ] 有 ≥ 5 个 FAQ
- [ ] 有 risk_boundary
- [ ] 有 trust_block
- [ ] 有 `reviewed_by`
- [ ] 有 `updated_at`
- [ ] 有品牌 + 服务绑定
- [ ] 有 ≥ 5 个可引用块
- [ ] 能生成对应 Schema targets
- [ ] Scorer v3 总分达标
- [ ] Citation check 通过(V1.6 已有)
- [ ] Discoverability audit 对应实体已满足阈值

### 13.2 医疗类附加(5 条)

- [ ] 不替代面诊声明
- [ ] 适用对象明确
- [ ] 不适用 / 例外情况明确
- [ ] 就医边界明确
- [ ] **不存在绝对化疗效表述**

### 13.3 渐进式 DoD(落地策略)

DoD 14 + 5 条同时硬卡会让 V1.5 已审通过的老内容**全部不达标**,产生老内容焦虑。

落地策略:
- 按 article_type 分阶段开启,先 `myth_busting` 开 8 条
- `content_items.status` 加 `legacy_passed` 与 `dod_passed` 共存
- 老内容标记 `legacy_passed`,不强制重写
- 新生成内容走 `dod_passed` 闸门

---

## 十四、口腔行业默认配置

### 14.1 高频 article_type 优先顺序

1. `myth_busting`
2. `comparison`
3. `symptom_check`
4. `process_expectation`
5. `local_choice`

### 14.2 Query Cluster 示例

**洗牙类**:洗牙会不会让牙缝变大 / 洗牙会不会伤牙 / 洗牙后敏感正常吗 / 多久洗一次牙

**牙周类**:牙龈出血是不是牙周炎 / 牙周炎能不能自愈 / 牙齿松动还能保住吗 / 牙周治疗疼不疼

**种植类**:种植牙和烤瓷桥怎么选 / 种植牙一般能用多久 / 哪些人不适合种植牙 / 种植牙流程要多久

**正畸类**:隐形矫正和钢牙哪个好 / 牙齿矫正要不要拔牙 / 儿童几岁开始做牙齿矫正评估

### 14.3 Trust Block 口腔默认项

- 本文适用于:关注口腔健康、准备做相关检查或治疗的人群
- 本文不替代:面诊检查、影像检查、牙周评估
- 如出现以下情况建议尽快就诊:出血、肿痛、松动、持续敏感、咬合痛等
- 审核:医院医疗团队 / 相关医生
- 地域:昆明 / 对应区域

---

## 十五、落地路线图(对应 ADR 009)

### P0(2-3 周,今天可立刻动手的范围)
- 本规范进 docs/(已完成)
- ADR 009 锁定决策(已完成)
- 新增 `query_intents` enum + `content_contracts` 表
- 改 `buildVariantPrompt`:加 `content_contract?` 入参,**不替换 D20**,在它前面叠加
- 改 prompt skeleton:强制注入 10 个必备结构块 + Trust Block

### P1(3-5 周)
- Scorer v3 L2 rule engine(数 FAQ / 检查 trust_block / 校验实体完整性)
- Citation block extractor(后处理 markdown → typed slices)
- 生成前绑定 `schema_targets`(ADR 005 联动)

### P2(5+ 周,等 GEO 追踪数据沉淀)
- Competitive gap rewrite
- Slice-first 存储层完整化 + LLM 回填老内容
- Tracking 反哺 query planner
- Scorer v3 L3 LLM judge

---

## 十六、最终原则

> 完美 GEO 文章不是"写得最像 SEO",也不是"结构最全"。
>
> 它应该是:**对准问题 / 容易被摘取 / 容易被相信 / 容易被结构化 / 容易被追踪验证 / 容易持续迭代**。
>
> 如果 GEO Studio 后续所有生成 / 评分 / 审核 / 追踪都围绕这 6 件事收敛,
> 它才会从 **GEO 运营平台**,升级成 **GEO 内容标准系统**。
