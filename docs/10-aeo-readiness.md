# 10 — AEO Readiness + Agent Service Feed + AI Answer Pollution Monitoring

> **Status**: Design draft(配套 ADR 011,P0 文档化阶段)
> **Owner**: 杜立军 + Claude
> **Date**: 2026-05-27
> **Related**: ADR 011(Agentic Web 演进路线)/ ADR 005(可发现层 D14-D18)/ ADR 009(D21 标准 GEO 内容资产)/ `docs/06-discoverability.md` / `docs/07-geo-article-spec.md` / `docs/08-feedback-loops.md`

---

## 零、本文档定位

本文档是 ADR 011 的**配套产品规范**,定义三件事:

1. **AEO Readiness Score**:用 8 个维度评估一个品牌"在 Agentic Web 时代被 agent 发现 / 信任 / 选择 / 引导用户的就绪度",0-32 分
2. **Agent Service Feed**:一个机器可读 JSON 结构草案,**未来**对外公开的 agent-readable 服务索引(P2 才落地)
3. **AI 答案污染监测**:**白帽**模块,只做防御和监测,不做攻击实施

**本文档只是设计,不写代码、不改 DB、不新增 migration**(P0 阶段约束,见 ADR 011 §9)。

---

## 一、为什么需要 AEO Readiness Score(而不是直接用 Audit)

`docs/06-discoverability.md` 的 Discoverability Audit 已经做了 4 维度评分:**完整度 / 数据规模 / 可信度 / 时效性**。**为什么还要 AEO Readiness**?

| 视角对比 | Discoverability Audit(V1.7 已 ship)| AEO Readiness Score(本文新增设计)|
|---|---|---|
| 评分主体 | 你给 AI 引擎喂的数据是否完整 | agent 在做决策时是否会选你 |
| 评分回答 | "我有没有让 AI 看懂?" | "agent 凭这些信号会不会信任我 + 把用户引导给我?" |
| 数据来源 | brand / staff_accounts / services 等字段是否填齐 | + Trust Block / Risk Boundary / 人工确认节点 / 反污染韧性 |
| 时间窗 | 静态快照 | 动态(含追踪反馈 + 合规历史 + 污染检出)|
| 客户语言 | "你的资料完整度 80%" | "agent 把患者引导给你的就绪度 24/32 — 可被 AI 引用,但还不适合 agent 引导动作" |

**两套并存,SQL 共用底层数据,UI 分 tab**(ADR 011 §8 备选方案 D 已论证)。

---

## 二、AEO Readiness Score 评分维度(8 维,各 0-4 分,共 32 分)

### 2.1 维度定义

按论文《Agentic Web》§3.3 三维框架(Intelligence / Interaction / Economic)的精神组织,但**对齐 GEO Studio 现有数据**:

| 维度组 | 维度 # | 维度名称 | 论文映射 | 评分对象 |
|---|---|---|---|---|
| **Discoverability**(让 agent 发现) | 1 | Agent Discoverability | Interaction §3.3.2 | 内容覆盖 / 关键词矩阵 / Schema 暴露 |
|  | 2 | Entity Clarity | Intelligence §3.3.1(Contextual Understanding)| 实体清晰度(机构 / 医生 / 服务 / 地点 / 资质)|
| **Actionability**(让 agent 引导用户)| 3 | Service Actionability | Economic §3.3.3 | 服务下一步动作清晰度(咨询入口 / 预约渠道 / 必需输入)|
|  | 4 | Trust Evidence | Intelligence §3.3.1(Adaptive Learning + Cognitive Processes)| 资质 / 审核 / 更新时间 / 引用来源 |
| **Risk Containment**(医疗红线)| 5 | Risk Boundary | Safety §7 | 不替代面诊 / 风险声明 / 禁忌人群 |
|  | 6 | Human Confirmation | Safety §7.3.1(Inference-time Guardrails)| 是否有人工确认节点(医生 / 前台 / 客服)|
| **Structural Integrity**(结构完整)| 7 | Structured Feed Completeness | Interaction §3.3.2 | Schema / AI Feed / llms.txt 完整度 |
| **Defense Posture**(抗投毒)| 8 | Anti-Poisoning Resilience | Safety §7.1.1(C2 KBP)| 合规四道门 + verified citations + 数值校验 |

### 2.2 评分规则(各维度 0-4 分)

#### 维度 1 — Agent Discoverability

| 分 | 标准 |
|---|---|
| 0 | 没有 llms.txt / 没有 AI Content Feed / 没有 Schema |
| 1 | 任一存在,但内容不到 30% |
| 2 | llms.txt + Feed + 至少 1 类 Schema(MedicalBusiness)存在,内容 30-60% |
| 3 | 全部存在,内容 60-90%,且子问题矩阵(D31)覆盖主题题 ≥ 50% |
| 4 | 全部存在,内容 ≥ 90%,且子问题矩阵覆盖 ≥ 80%,且追踪近 30d ≥ 50% 题被覆盖 |

**数据来源**:`discoverability_artifacts` 表 + `questions`(主题题 + 子问题)+ `geo_snapshots`

#### 维度 2 — Entity Clarity

| 分 | 标准 |
|---|---|
| 0 | brand.name 之外都缺(无 location / specialties / hours / credentials) |
| 1 | 有 location 但其他缺 |
| 2 | location + specialties + business_hours 齐全,但 staff_accounts.credentials 空 |
| 3 | 上述 + 至少 1 个医生有 credentials(license_number / education / experience_years)|
| 4 | 上述 + services 表 ≥ 5 条 + 每个 service 有 description / category / medical_procedure_code |

**数据来源**:`brands` / `staff_accounts.credentials` / `services`

#### 维度 3 — Service Actionability

| 分 | 标准 |
|---|---|
| 0 | 服务页只有名称,无任何"下一步" |
| 1 | 有联系电话或微信但无明确流程 |
| 2 | 有"联系咨询"入口 + 至少 1 项"必需用户输入"(年龄 / 症状描述 / 就诊史等)|
| 3 | 上述 + 明确列出"允许的下一步动作"(`allowed_next_actions` 字段,见 §四 Feed 草案)|
| 4 | 上述 + 明确列出"禁止的下一步动作"(`forbidden_actions`)+ 明确人工确认节点 |

**数据来源**:`services`(需要扩展 jsonb 字段 `agent_metadata` — P1 阶段考虑)

#### 维度 4 — Trust Evidence

| 分 | 标准 |
|---|---|
| 0 | 无 reviewed_by / 无 updated_at / 无 verified_credentials |
| 1 | 有 updated_at 但 reviewed_by 空 |
| 2 | 有 reviewed_by + updated_at,但 verified_credentials 空 |
| 3 | 上述 + brands.verified_credentials 有 license / accreditation |
| 4 | 上述 + 内容引用走 D21 citation_mode='verified_only'(过 D34 ground-truth 校验)|

**数据来源**:`brands.verified_credentials` / `content_items.slices->>'reviewed_by'` / `content_contracts.citation_mode`

#### 维度 5 — Risk Boundary

| 分 | 标准 |
|---|---|
| 0 | 无 risk_boundary slice / 无"不替代面诊"声明 |
| 1 | 部分内容有,但 < 50% |
| 2 | 50-80% 内容有 risk_boundary slice |
| 3 | ≥ 80% 内容有 + 至少 1 个高风险服务(种植 / 矫正 / 全口)有禁忌人群说明 |
| 4 | 上述 + Agent Service Feed 在 `not_suitable_for` 字段显式声明 + Trust Block 完整 7 字段 |

**数据来源**:`content_items.slices->>'risk_boundary'` / `content_items.slices->>'trust_block'`(D21)

#### 维度 6 — Human Confirmation

| 分 | 标准 |
|---|---|
| 0 | 任何路径都没有"必须人工"节点声明 |
| 1 | 隐式存在(前台电话 / 微信)但未结构化 |
| 2 | 结构化声明"咨询需联系前台" |
| 3 | 上述 + 明确列出哪些场景必须医生面诊 |
| 4 | 上述 + Agent Service Feed `human_confirmation_required: true` + 在 `compliance_notes` 列明 "AI 不可代为决策的边界" |

**数据来源**:`services.agent_metadata.human_confirmation`(P1 扩展)/ content_items.slices

#### 维度 7 — Structured Feed Completeness

| 分 | 标准 |
|---|---|
| 0 | 4 个 artifact(llms.txt / llms_full / feed_json / sitemap_xml)0 个生成 |
| 1 | 1-2 个生成 |
| 2 | 全部生成,但 Schema 只有 1-2 类 |
| 3 | 全部生成 + Schema 5+ 类(MedicalBusiness / Physician / MedicalProcedure / FAQPage / Organization)|
| 4 | 上述 + Schema 7 类全 + Agent Service Feed v1 存在(P2 触发后) |

**数据来源**:`discoverability_artifacts` + `tenants.settings.discoverability`

#### 维度 8 — Anti-Poisoning Resilience

| 分 | 标准 |
|---|---|
| 0 | 无合规审查 / 引用任意来源 |
| 1 | 关键词黑名单生效(D5)|
| 2 | 关键词 + LLM 二审(D5/D12 三道门)|
| 3 | 四道门(D12 历史案例匹配)+ verified_citations 白名单(D34) |
| 4 | 五道门(D33-D36 软性违规 + ground-truth 校验 + auto-rewrite cascade + 兜底降级)+ 数值类事实校验(numeric_fact_check) |

**数据来源**:`compliance_reviews` / `compliance_cases` / `verified_citations` / `auto_rewrite_count`

### 2.3 总分解释(4 档)

| 总分区间 | 等级 | 含义 | 客户语言 |
|---|---|---|---|
| **0-11** | 🔴 **Not Agent-Ready** | 不适合 agent 使用 | "AI 引擎可能完全跳过你" |
| **12-19** | 🟡 **Basic Readability** | 基础可读,但不适合调用 | "AI 可以读到你,但不会主动选你" |
| **20-27** | 🟢 **Suitable for AI Citation** | 适合 AI 引用 | "AI 会在回答里提到你" |
| **28-32** | 🚀 **Agent Action-Ready** | 适合 agent 发现和引导动作 | "Agent 会在引导用户时把你列入候选 + 标注人工确认节点" |

### 2.4 警告:首版分数**不**强卡生产流程

- V1 实测期(预计 4 周)分数只展示不阻塞
- V2 阶段如客户反馈"分数有指导意义",再考虑用作 banner 提示(对齐 docs/08 断点 5)
- **永不**用 AEO Readiness 分数阻止内容发布(那是 D5/D12 合规四道门的职责)

---

## 三、与现有系统的关系

### 3.1 与 Discoverability Audit(V1.7 已 ship)的关系

| 角度 | Audit | AEO Readiness |
|---|---|---|
| 评分维度数 | 4 维 | 8 维 |
| 用途 | "我有没有把数据喂全?" | "agent 凭这些数据会不会信任我?" |
| 数据来源 | 完全重叠(都读 brands / staff / services / discoverability_artifacts) | + content_items.slices + compliance_* + content_contracts |
| UI 落点 | `/t/[slug]/discoverability` hub 主页 | `/t/[slug]/discoverability/aeo`(P1 阶段新建 tab)|
| SQL view | 已有 | P1 新加(只读 view,不改表)|

**复用策略**:Audit 评分函数不动;AEO Readiness 是"延伸",共用底层数据,**SQL view 层做加法**。

### 3.2 与 D21 content_contract 的关系

`content_contracts` 表(ADR 009)的字段直接喂 AEO Readiness 多个维度:

| AEO 维度 | 从 content_contracts 读什么 |
|---|---|
| 维度 2 Entity Clarity | `primary_entity` + `supporting_entities` |
| 维度 4 Trust Evidence | `reviewer_required` + `citation_mode` |
| 维度 5 Risk Boundary | `risk_boundary_required` |
| 维度 7 Structured Feed | `schema_targets` |

`content_items.slices`(D21 slice-first 存储)直接喂:

| AEO 维度 | 从 slices 读什么 |
|---|---|
| 维度 4 Trust Evidence | `entity_snapshot.reviewed_by` + `entity_snapshot.updated_at` |
| 维度 5 Risk Boundary | `trust_block` 7 字段 + `when_to_seek_care` |
| 维度 6 Human Confirmation | `trust_block.human_confirmation_node`(P1 扩展约定字段)|

**关键不变量**:**D21 已经把 AEO Readiness 维度 4/5/6 的数据基础全部建好** — AEO Readiness 是 D21 在客户面前的"agent 视角呈现",不是新数据需求。

### 3.3 与 docs/08 反馈回路的关系

| docs/08 断点 | AEO Readiness 触点 |
|---|---|
| 断点 1(追踪 → 选题) | 维度 1 Agent Discoverability 反映追踪覆盖率,**联动** |
| 断点 2(引用 → 关键词热度) | 维度 1 + 维度 7,**联动** |
| 断点 3(归因 → 内容业务价值) | AEO 不依赖 — 归因独立路径 |
| 断点 4(员工反馈 → 难发布标签) | AEO 不依赖 — 派单独立路径 |
| 断点 5(Audit → 内容生产 banner) | **直接共用 banner UI**;AEO 是 banner 的"agent 视角"版本 |

### 3.4 未来 UI 落点(P1 阶段实现)

```
/t/[slug]/discoverability                ← 现有 hub(V1.7)
├── (默认 tab)Audit 4 维度评分          ← 现有
├── llms.txt 预览                        ← 现有
├── feed.json 预览                       ← 现有
└── Schema 预览                          ← 现有

/t/[slug]/discoverability/aeo            ← P1 新建 tab
├── 总分卡片(0-32 + 4 档等级)
├── 8 维度雷达图(类似 SOV 热力图风格)
├── 各维度评分明细 + "如何提升到下一档"建议
└── Agent Service Feed 预览(管理员可见,未对外)

/t/[slug]/aeo/pollution-monitor          ← P1 新建独立页
├── 近 7 天疑似污染告警 list
├── 7 类污染类型 tab(详 §五)
├── 一键生成纠偏工单(进 wizard)
└── 历史纠偏案例归档(成功 / 失败)
```

**对客户的呈现节奏**:
- V2 初期:管理员后台可见,不在客户主页推广
- V2 后期:tenant 主页 hero 加 "AEO Readiness X/32" 小标
- V3 阶段:作为 SaaS 定价分层的核心指标(高分客户付费更多)

---

## 四、Agent Service Feed JSON 草案

### 4.1 设计原则

1. **机器可读**:JSON Schema 严格,字段类型固定
2. **包含"禁区"**:`forbidden_actions` + `human_confirmation_required` 字段强制存在,让 agent 明确知道"哪些不能自动做"
3. **复用现有数据**:绝大多数字段直接读 `brands` / `staff_accounts` / `services` / `content_items.slices` — 不增加新表
4. **延续 D15-D17 安全模型**:opt-in / 内容过滤双闸 / build-on-write 缓存 / RLS
5. **不暴露**:conversion 数据 / 员工真实姓名 / 内部审核状态 / 任何 PII

### 4.2 完整 JSON 示例(songshu 口腔)

```json
{
  "feed_version": "1.0",
  "generated_at": "2026-05-27T10:30:00+08:00",

  "tenant_slug": "songshu",

  "brand": {
    "name": "昆明松鼠口腔",
    "type": "MedicalBusiness",
    "specialties": ["种植牙", "牙齿矫正", "儿童口腔", "牙周治疗"],
    "service_areas": ["昆明市西山区", "昆明市五华区"],
    "location": {
      "city": "昆明",
      "district": "西山区",
      "address": "(可选,根据 D16 公开闸门)",
      "lat": null,
      "lng": null
    },
    "business_hours": {
      "mon-fri": "09:00-18:30",
      "sat-sun": "09:00-17:00"
    },
    "contact_methods": [
      { "type": "phone", "value": "0871-68152121" },
      { "type": "wecom_qr", "value": "(QR url, opt-in)" }
    ],
    "verified_credentials": [
      { "type": "license", "issuer": "云南省卫生健康委员会", "year": 2018 }
    ],
    "updated_at": "2026-05-26T14:00:00+08:00"
  },

  "services": [
    {
      "service_id": "implant-single",
      "name": "单颗种植牙",
      "category": "种植修复",
      "description": "针对单颗缺失牙的种植修复方案,使用骨结合钛种植体...",
      "price_range": { "min": 6800, "max": 18000, "currency": "CNY" },
      "duration_estimate_minutes": 90,
      "medical_procedure_code": "implant-single",
      "suitable_for": [
        "成年人单颗牙缺失",
        "牙槽骨条件良好",
        "无严重全身性疾病"
      ],
      "not_suitable_for": [
        "未成年人(颌骨发育未完成)",
        "未控制的糖尿病患者",
        "正在接受双膦酸盐治疗的患者",
        "严重牙周炎未治疗者"
      ],
      "required_user_inputs_before_consultation": [
        "年龄",
        "缺牙时长",
        "全身病史(糖尿病 / 心血管 / 骨质疏松)",
        "近期影像资料(可选)"
      ],
      "allowed_next_actions": [
        "提供联系方式以由前台回拨",
        "推荐用户线下面诊评估",
        "提供 FAQ 中已发布的科普内容链接"
      ],
      "forbidden_actions": [
        "自动预约面诊时段",
        "自动报价(必须经医生面诊后)",
        "自动判断用户是否适合种植(必须医生评估)",
        "代为收取定金 / 任何形式付款",
        "替代医生给出诊疗建议"
      ],
      "human_confirmation_required": true,
      "compliance_notes": [
        "本服务必须经持证医师面诊评估后方可执行",
        "AI 不可代为判断手术适应症 / 禁忌症",
        "价格区间为参考,最终以医生评估方案为准"
      ]
    }
  ],

  "physicians": [
    {
      "physician_id": "p-001",
      "display_name": "贾医生",
      "title": "主治医师",
      "specialties": ["种植牙", "全口修复"],
      "experience_years": 15,
      "credentials_summary": "口腔医学硕士 / 中华口腔医学会会员",
      "geo_profile_visible": true,
      "human_confirmation_only": true
    }
  ],

  "faqs": [
    {
      "faq_id": "faq-001",
      "question": "种植牙能用多久?",
      "answer_summary": "(从 content_items.slices.faq_pairs 直接读)",
      "linked_content_url": "https://geo.dulijun.icu/c/songshu/article/implant-lifespan",
      "reviewed_by": "贾医生",
      "updated_at": "2026-05-20T10:00:00+08:00"
    }
  ],

  "global_compliance_notes": [
    "本 Feed 中所有医疗内容均经持证医师审核",
    "AI Agent 不可基于本 Feed 内容自动做出医疗决策",
    "任何治疗都必须经线下面诊后,由医生综合评估",
    "本机构遵守《广告法》和《医疗广告管理办法》"
  ],

  "agent_interaction_policy": {
    "human_confirmation_required": true,
    "allowed_action_types": ["recommend_for_consultation", "provide_education_link"],
    "forbidden_action_types": ["auto_appointment", "auto_payment", "auto_diagnosis", "self_medication_advice"],
    "rate_limit_per_agent_per_hour": 60
  }
}
```

### 4.3 字段必须包含的清单(对应任务要求)

| 字段 | 来源 | 必填 | 说明 |
|---|---|---|---|
| `tenant_slug` | tenants.slug | ✅ | 唯一标识 |
| `brand` | brands 表 | ✅ | 机构基础信息 |
| `services` | services 表(D14 新表) | ✅ | 服务目录 |
| `physicians` | staff_accounts(geo_profile_visible=true) | 可选 | 医生信息 |
| `faqs` | content_items.slices.faq_pairs / faqs 表 | 可选 | 已审 FAQ |
| `suitable_for` | services.agent_metadata(P1 扩展)| ✅(每个 service)| 适用人群 |
| `not_suitable_for` | 同上 | ✅(每个 service)| 禁忌人群 — 医疗必须 |
| `required_user_inputs` | 同上 | ✅(每个 service)| 必需用户输入 |
| `allowed_next_actions` | 同上 | ✅(每个 service)| 允许的下一步 |
| `forbidden_actions` | 同上 | ✅(每个 service)| **禁止的下一步**(自动预约/支付/诊断)|
| `human_confirmation_required` | 同上 | ✅ | 全局开关 + 服务级开关 |
| `compliance_notes` | services + global | ✅ | 合规声明 |
| `updated_at` | 各实体 updated_at | ✅ | 时效性 |

### 4.4 字段语义边界(防止 agent 误用)

- `allowed_next_actions` 表示"agent 可以建议用户做的事",**不**表示"agent 可以代为执行的事"
- `forbidden_actions` 是**显式 deny list**(白名单优先于黑名单,但 deny list 强制覆盖)
- `human_confirmation_required: true` 表示该服务路径上**任何节点都需要人工确认**,agent 不能跳过
- `compliance_notes` 是**法律声明**,agent 在响应里必须**完整透传**(不能摘要 / 改写 / 省略)

### 4.5 路由设计(P2 才落地,占位 spec)

| 路径 | 内容 | 安全 |
|---|---|---|
| `/api/agent-feed/[slug].json` | Agent Service Feed v1 | opt-in 闸门 + RLS + rate-limit 60/min |
| 缓存 | build-on-write,artifacts 表存物化结果 | 同 D17 |
| 审计 | 每次访问异步写 audit_log | 同 D16 |

延续 D15-D18 既有公开层安全模型,不另起炉灶。

---

## 五、AI 答案污染监测(白帽方案)

### 5.1 术语统一(用论文专业叫法)

口语里"豆包投毒"在学术 / 工程语境必须用专业术语:

| 通俗叫法 | 学术 / 工程术语 | 论文章节 |
|---|---|---|
| "投毒豆包" | **RAG Poisoning** / **Retrieval Corpus Poisoning** | §7.1.1 + Table 5 C2 |
| "假来源混进 AI 答案" | **Citation Poisoning** | C2 的子类型 |
| "虚假机构 / 假医生混入 AI 实体" | **Entity Poisoning** | C2 的子类型 |
| "假服务条目混入 service registry" | **Service Registry Poisoning** | §7.1.1 + Table 6 P2 |
| "诱导 agent 错误归属" | **Persuasion-Based Goal Drift** | §7.1.1 + Table 5 C1 |

**约束**:GEO Studio 提到这类话题统一用上述英文术语 + 中文白话解释;不用"投毒"作为产品文案(避免被误读为攻击工具)。

### 5.2 模块定位 — 监测 + 纠偏 + 主动激进 GEO(2026-05-27 用户对齐)

**本模块覆盖两条职责**(此前一刀切"只防御"是过度防御):

#### 职责 A:防御侧 — 监测与纠偏(白帽)

| 做 ✅ | 不做 ❌ |
|---|---|
| 监测 AI 答案是否引用了关于我们品牌的错误信息 | A 类:主动注入虚假内容到任何 corpus |
| 监测竞品贬低本品牌(被反向操控)| A 类 / D 类:主动贬低 / 攻击任何竞品 |
| 监测虚假补贴 / 假医生资质等冒名信息 | A 类:主动伪造资质 / 补贴 |
| 监测错误价格 / 过度疗效承诺被关联到本品牌 | A 类:主动生成过度承诺内容(D5/D12 已禁)|
| 监测 AI 引用了不可信来源(标题对但 issuer / year / 页码错)| A 类:主动伪造可信引用 |
| 生成纠偏内容工单(澄清型 FAQ / 补 Schema / 加 Trust Block)| 自动发布纠偏内容(必须经人审)|
| 给客户看监测看板 + 历史纠偏案例 | D 类:把监测能力当攻击工具卖给第三方 |

#### 职责 B:进攻侧 — 主动激进 GEO(B+C 类显式允许)

对应 ADR 011 §5.4 B+C 类战术,本模块可以**主动**做以下事:

| 做 ✅ | 关联战术 | 合规约束 |
|---|---|---|
| 监测发现"豆包对昆明哪家口腔好"问题没引用我们 → enqueue 子问题展开 + 多角度发布 | B1 + B2 | 内容真实,经四道门 |
| 监测发现某品类词阵地被竞品占满 → 主动建工单抢占该 query 集群 | C1 借品类词阵地 | 不带品牌名的通用 query,完全合法 |
| 监测发现 AI 偏好的源(头条 / 知乎)我们覆盖不足 → 派单算法加权该源 | B3 占满 AI 偏好源 | D3 红线保留(员工手动发,不自动)|
| 监测发现内容时效信号弱 → enqueue 高频刷 updated_at | B4 时效信号 | 真实审核才能写 updated_at |
| 监测发现内容里无 AI 友好结构信号 → 建工单补 reviewed_by + citation 字段 | C3 AI 友好结构 | 三个值必须真(经 D34 校验)|
| 监测发现某主题豆包引用 PDF 文档 → 我们也产真数据可视化报告抢占 | C2 真数据可视化 | 数据必须真实可考 |

#### 代码层硬约束(任何 B/C 类自动化不能越过的红线)

- 模块代码**不允许** outbound 写入第三方平台(豆包 / 元宝 / 头条 / 抖音)— 守住 D3
- 模块代码**不允许**生成"针对竞品的负面提示词"— 守住 A 类 + D 类
- 任何"纠偏建议 / 抢占建议 / 抢占自动化"必须经客户管理员人审才能 enqueue 进内容工单
- 任何写入 `reviewed_by` / `citation` / `updated_at` 字段的工单必须有真值依据(经 D34 ground-truth 校验)— 否则降级走 A 类禁止

### 5.3 7 类监测对象

| # | 监测对象 | 数据来源 | 检测方法 |
|---|---|---|---|
| **1** | 错误机构信息(地址 / 电话 / 营业时间错误归属到我们)| `geo_snapshots.raw_response` + `brands` 真实值 | LLM 抽取 mentions → 与 brands 真值对比 |
| **2** | 虚假补贴(被关联到本品牌的"假免费 / 假代金券")| 同上 + 已知补贴白名单 | 关键词 + LLM 二审 |
| **3** | 竞品贬低(AI 答案里出现"X 不如 Y"且 Y=本品牌)| `citations.term_type='competitor'` + raw_response NLP | 关系抽取(竞品 vs 本品牌的对比性贬义)|
| **4** | 假医生资质(冒名医生 / 错误职称归属)| raw_response + `staff_accounts.credentials` 真值 | 实体抽取 → 与 staff 真值对比 |
| **5** | 错误价格(AI 说我们种植牙 "999 元" 等不实价格) | raw_response + `services.price_range` 真值 | 数值抽取 → 偏离真值 > 50% 告警 |
| **6** | 过度疗效承诺(AI 说我们能"100% 成功率"等)| raw_response + D33-D36 关键词库 | 复用合规四道门关键词扫描 |
| **7** | AI 引用了不可信来源(标题对但 issuer/year/页码错)| raw_response + `verified_citations` 白名单 | D34 ground-truth 校验逻辑反向应用 |

### 5.4 6 类纠偏动作(都走人审)

| # | 纠偏动作 | 触发后流程 |
|---|---|---|
| **A** | 生成澄清型 FAQ | LLM 草稿 → wizard step 1 预填 `query_intent='is_it_true'` + `article_type='myth_busting'` → 走 D21 contract pipeline → 客户人审 → 入库 |
| **B** | 补齐 Schema / AI Feed | 监测到 Schema 字段缺导致 AI 误判 → 生成"待补字段"工单 → admin UI banner 提醒 → 客户去 `/discoverability/brand` 补 |
| **C** | 增加 Trust Block | 监测到错误归属 → 在相关 content_items 上追加 trust_block.disclaimer → 走 D21 rewrite pipeline |
| **D** | 增加风险边界 | 监测到过度承诺被关联 → 自动建议在 content_items 加 risk_boundary slice → 走 D35 auto-rewrite cascade |
| **E** | 加入追踪问题库 | 监测到某 question 反复出现污染 → 自动 promote priority + 列入"高污染问题"watchlist |
| **F** | 进入内容生产工单 | 任何监测告警都可一键生成 content_items 工单 → 走 wizard → 走 D21 contract → 走合规四道门 |

### 5.5 工单流程(每条告警的处理路径)

```
监测 cron 检出 → audit_log 写入 + Sentry 告警
            ↓
   admin /aeo/pollution-monitor 看板显示
            ↓
  客户 / 管理员人工 review
            ↓
  ┌─────────┴─────────┐
  │                   │
关闭(误报 / 已知) 进入纠偏工单
                      │
              wizard 预填(纠偏类型 A-F)
                      │
              客户编辑 → D21 contract
                      │
              合规四道门 + DoD
                      │
              派单 → 发布
                      │
        追踪验证(N 天后看是否仍出现污染)
                      │
              ┌───────┴───────┐
              成功(关闭工单)  失败(升级到 V2)
```

### 5.6 V1 实测优先级

| 优先级 | 监测对象 | 理由 |
|---|---|---|
| P0 | 错误价格(#5)+ 过度疗效承诺(#6)| 医疗合规直接红线 |
| P1 | 假医生资质(#4)+ 错误机构信息(#1) | 冒名风险高 |
| P2 | 竞品贬低(#3)+ 虚假补贴(#2) | 商业损害 |
| P3 | AI 不可信引用(#7) | 长期信誉建设 |

V1 实测先做 P0 两类 + 数据看板,P1-P3 逐步加。

### 5.7 误报处理 + 告警阈值

- **误报关闭**:客户可手动标记"误报",该 (question, mention_pattern) 进 ignore_list,15 天内不再告警
- **告警阈值**:同一 (question, error_type) 在 24h 内重复出现 ≥ 3 次才告警(防止豆包随机性误判)
- **回溯窗口**:7 天回溯历史 raw_response 找污染模式,不只看新增

### 5.8 与 V2 反馈回路的关系

污染监测是 docs/08 反馈回路 5 断点**之外的第 7 条候选**(C 验证层 → B 生产层的新通道):

```
GEO 追踪(citations 表)
    ↓ 监测 cron
污染告警(audit_log + Sentry)
    ↓ 人审
纠偏工单(content_items.draft)
    ↓ D21 + 合规四道门
新内容发布
    ↓ 派单 + 发布
追踪验证(下轮追踪看污染是否消失)
    ↓
关闭工单 OR 升级
```

这条回路价值最高的部分:**让"被攻击"变成"内容生产 + 追踪验证"的闭环**,把防御做成增长引擎。

---

## 六、不做范围(明确边界)

| 不做的事 | 原因 |
|---|---|
| 主动投毒任何 AI 引擎的 corpus | ADR 011 §5.4 红线 |
| 自动生成针对竞品的负面内容 | D32 + 广告法 |
| 自动注册 / 自动登录员工平台 | D3 + D9 |
| 自动支付 / 自动预约 / 自动下单 | ADR 011 §5.2 红线 |
| 自动医疗诊断 / 治疗建议 | ADR 011 §5.3 红线 |
| Agent Service Feed 暴露未审 / 草稿内容 | D16 双闸 |
| 把监测能力作为攻击工具卖给第三方 | ADR 011 §5.4 红线 |
| AEO Readiness 分数强卡内容发布 | 本文 §2.4 警告 — 那是合规四道门的职责 |
| 在客户主页推广"AEO" buzzword | ADR 011 §10 风险缓解 |

---

## 七、未来 UI 落点汇总

| 时间 | 路径 | 内容 |
|---|---|---|
| P1(V2 后期)| `/t/[slug]/discoverability/aeo` | AEO Readiness 8 维度评分 tab |
| P1 | `/t/[slug]/aeo/pollution-monitor` | 污染监测看板(独立页)|
| P1 | `/t/[slug]/discoverability/feed-preview` | Agent Service Feed JSON 预览(管理员可见)|
| P2(V3 触发后)| `/api/agent-feed/[slug].json` | Agent Service Feed v1 公开路由 |
| P2 | `/t/[slug]/aeo/cases` | 历史纠偏案例归档 |
| P2 | tenant home hero | "AEO Readiness X/32" 小标 |
| P3(V3 商业化)| SaaS pricing page | AEO 分数作为分层定价指标 |

---

## 八、Open Questions(P0 不锁定)

1. **8 维度权重**:V1 等权(各 0-4 → 32 分),P1 实测 ≥ 4 周后按客户反馈调权
2. **总分 vs Audit 总分**:并列展示还是加权合并?P1 实测后定
3. **AI 答案污染监测告警通道**:Sentry / 站内 banner / 邮件 / 企微?P1 定
4. **跨行业字段差异**(口腔 → 医美 → 律所 → 教育):V3 多租户阶段处理
5. **Agent Service Feed 字段规范是否提交给行业组织(MedSchema 等)**:V3 触发后评估

---

→ 相关:
- ADR 011(Agentic Web 演进路线 + 7 个决策 + 边界)
- `docs/06-discoverability.md`(Layer A 完整设计)
- `docs/07-geo-article-spec.md`(D21 标准 GEO 文章规范)
- `docs/08-feedback-loops.md`(5 处反馈回路 + 本文档新增的第 7 条污染监测回路)
- `CLAUDE.md` D37(本文档锁住的最终决策)
