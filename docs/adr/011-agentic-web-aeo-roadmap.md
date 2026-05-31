# ADR 011 — Agentic Web 演进:从 GEO 到 AEO 的产品路线

**Status**: Proposed
**Date**: 2026-05-27
**Deciders**: 用户(产品定位决策)+ Claude(实施细节)
**Related**:
- D1-D36 全部既有决策(本 ADR **不推翻**任一条)
- ADR 005(可发现层 / D14-D18)
- ADR 007(写作 × 平台叠加 / D20)
- ADR 009(GEO 标准内容资产 / D21)
- `docs/06-discoverability.md` § 一(GEO 三层模型)
- `docs/07-geo-article-spec.md`(标准 GEO 文章规范)
- `docs/08-feedback-loops.md`(5 处反馈回路)
- `docs/10-aeo-readiness.md`(AEO Readiness 评分 / Agent Service Feed / 污染监测)
- 论文《Agentic Web: Weaving the Next Web with AI Agents》(arxiv 2507.21206v1, 2025-07,Yingxuan Yang et al., SJTU + HKUST + UC Berkeley + UCL)

---

## 一、背景

2026-05-27 用户提供论文《Agentic Web: Weaving the Next Web with AI Agents》。论文用 76 页 + 8 章系统论证:

1. **Web 范式三段论**(论文 §2 + Table 1):PC Web(search paradigm)→ Mobile Web(recommendation paradigm)→ **Agentic Web(action paradigm)**。每个阶段都伴随 commercial model + 用户角色的根本转变。
2. **角色转移**(论文 §1 + Figure 1):在 Agentic Web 里,**end user 仍是人,但 mid user(实际浏览/比较/决策的角色)变成 AI agent**。
3. **三维框架**(论文 §3.3 + Figure 6):Agentic Web 的本质能力可拆解为 Intelligence Dimension / Interaction Dimension / Economic Dimension 三层。
4. **Agent Attention Economy**(论文 §2.3.2 + §2.4):第三方服务在 Agentic Web 时代竞争的不再是 human click,而是 **agent invocation**。论文原文:"agents may adopt mechanisms such as advertising, ranking optimization, or even agent-oriented recommendation and scoring systems within the service registries."
5. **威胁分类**(论文 §7.1 + Tables 4-7):明确将"SEO-optimized fake research sites"列为 Intelligence Layer 的 **C2 Knowledge Base Poisoning** 威胁。

### 1.1 当前 GEO Studio 的定位与论文的对应

| GEO Studio 当前 | 论文里对应的阶段 |
|---|---|
| 让品牌在豆包/元宝/Perplexity 等 AI 回答里被引用 | Agent-as-Interface(论文 §6.2.1)— Agentic Web 早期形态 |
| Layer A 可发现层(Schema / llms.txt / AI Feed / Audit) | Interaction Dimension 的基础设施(论文 §3.3.2) |
| 内容生产线(D21 contract → slice → DoD) | Agent-readable artifact 标准化(论文 §3.2.2) |
| GEO 追踪 + 合规四道门 + 转化归因 | Trust Calibration 思想的早期实现(论文 §3.3.2) |

GEO Studio 当前**事实上**就在做 Agent-as-Interface 阶段的 GEO 工作,只是没有用论文的术语命名。

### 1.2 不做这个 ADR 的代价

如果不预先布局,3 年内会出现 3 个真实问题:

1. **客户教育成本上升**:客户老板看到豆包/ChatGPT Agent 接入服务的演示后,会问"你们怎么应对 Agent 时代"—— 没有文档化决策时只能现场编。
2. **产品定位被压扁**:被竞品定位为"上一代 GEO 工具"。
3. **错过窗口**:论文 §2.3.1 提到 Microsoft Build 2025 已发布 NLWeb(把网页暴露成 agent-readable 端点)。国内豆包 / 元宝 / 夸克跟进的时间窗预计 12-18 个月内打开,提前布局 docs 化的 AEO 路线可以在窗口出现时 4-6 周追上,vs. 从 0 起家。

---

## 二、GEO / GEO+Discoverability / AEO 的区别

| 维度 | **GEO**(V1.6 之前) | **GEO + Discoverability**(V1.7+,当前) | **AEO**(本 ADR 起的演进方向) |
|---|---|---|---|
| 优化目标 | "被 AI 提及" | "被 AI 结构化理解 + 引用" | "被 agent 发现 + 信任 + 选择 + 引导下一步动作" |
| 优化对象 | 内容字面 | 内容 + Schema + llms.txt + AI Feed + Audit | 内容 + 实体清晰度 + 服务可调用性 + 风险边界 + 信任证据 + 反污染韧性 |
| 验证维度 | SOV / 引用率 | + Discoverability Audit 4 维度评分 | + **AEO Readiness Score 8 维度**(详 `docs/10-aeo-readiness.md`)|
| 商业回路 | 引用 → 浏览 → 转化 | + Schema 完整度 → 引用质量提升 | + Agent 推荐 → **用户确认 → 人工介入 → 转化**(医疗场景永不跳过人工)|
| 论文映射 | Mobile Web 推荐范式的残余 | Agentic Web 的"内容侧抓手" | Agent-as-Interface 完整形态(论文 §6.2.1)|
| 客户对外语言 | "让 AI 提到你" | "让 AI 看懂你" | "让 AI 信任你 + 引导用户走向你的人工确认入口" |

**关键差异**:
- GEO 侧重"被命中" — **被动**
- GEO+Discoverability 侧重"被理解" — **半被动**
- AEO 侧重"被信任 + 被引导" — **主动**(agent 主动选择推荐谁)

---

## 三、论文里能采用 vs 不采用的概念

### 3.1 能采用(立刻或近期吸收)

| 论文概念 | 章节 | 在 GEO Studio 的用法 | 预计落地阶段 |
|---|---|---|---|
| **Web 三段论叙事** | §2 + Table 1 | 客户 / 投资人 deck 的学术背书。GEO 是 Mobile→Agentic 过渡;AEO 是 Agentic 完整态 | P0(本 ADR 起立刻用) |
| **Agent Attention Economy** | §2.3.2 + §2.4 | 销售话术升级:从"被 AI 提及"→"在 agent 注意力市场卡位" | P0 |
| **Three Conceptual Dimensions(Intelligence/Interaction/Economic)** | §3.3 + Figure 6 | AEO Readiness Score 8 维度的组织框架(Intelligence 2 维 / Interaction 4 维 / Trust 2 维) | P1(V2 后期) |
| **Agent-as-Interface 阶段定义** | §6.2.1 + Table 2 | 客户对外定位:"V1-V2 处在 Agent-as-Interface 阶段" | P0 |
| **C2 Knowledge Base Poisoning** | §7.1.1 + Table 5 | AI 答案污染监测模块的概念边界 + 防御叙事 | P1 |
| **P2 Service Registry Poisoning** | §7.1.1 + Table 6 | 监测模块扩展场景(假资质 / 虚假服务条目)| P1 |
| **Trust Calibration 思想** | §3.3.2 | Trust Block(D21)+ 风险边界(docs/07)的延伸 | 已部分落地;P1 系统化 |
| **AEO Readiness Score** | 本 ADR 引入,非论文原创 | 详 `docs/10-aeo-readiness.md` | P1 |
| **Agent Service Feed** | 本 ADR 引入,非论文原创 | 公开 JSON 路由,扩展 D14 AI Content Feed | P1-P2 |

### 3.2 不采用(明确边界 + 重评估窗口)

| 论文概念 | 章节 | 不采用的原因 | 重评估窗口 |
|---|---|---|---|
| **MCP Server 落地** | §5.3.2 + Figure 12 | 国内豆包/元宝/夸克/Kimi 尚未消费 MCP 协议;现在做客户用不上 | V3 启动后,或国内任一主流 AI 平台公布对外 MCP 端点 |
| **A2A 协议** | §5.3.3 | 同上;且无业务场景("我们的 agent 调别人 agent") | V3 商业化后 |
| **Agent-as-User 完整态**(ChatGPT Agent / Project Mariner / Computer Use)| §6.2.2 + Table 3 | 国内未落地;且是"被颠覆方"视角,我们是内容供给方,做不了直接干预 | 跟踪不动手 |
| **Agent Browser 颠覆** | §5.4.1 | 同上 | 跟踪不动手 |
| **Cross-Agent Billing Ledger (CABL)** | §5.2.1 + Figure 10 | 跟自动支付 / 跨服务结算挂钩,**用户明确禁止**(本 ADR §5.1 边界)| 永久 N/A |
| **Demand-Skill Vector Mapper (DSVM)** | §5.2.1 + Figure 10 | 我们派的是 staff 不是 agent;dispatcher 已有 D22-D23 评分 | V3 多租户阶段 dispatcher 升级时回看 |
| **Service Requirement Zone (SRZ) 8 维度** | §5.1 + Figure 9 | 同 DSVM,适用 agent 派单,我们派 staff | V3 |
| **Inference-time Guardrails(ThinkGuard/GuardReasoner/AGrail)** | §7.3.1 | 这是 agent 端的事,我们是内容侧;且已有合规四道门兜底 | V3 多客户阶段或独立产品线 |
| **Reasoning / Agentic Guardrails 部署** | §7.3 | 同上 | V3 |
| **Agent-with-Physics(RT-1 / RT-2 / Tesla Optimus)** | §6.2.3 | 完全无关 | 永久 N/A |

---

## 四、V1 / V2 / V3 分阶段演进路线

> **核心原则**:不打乱现有 V1/V2 主线。AEO 演进的 P0 全部是文档化(本 ADR + `docs/10`),P1 在 V2 完成后才动代码,P2 由触发条件决定是否启动。

### 4.1 V1.x(当前 → 2026-06)— 零 AEO 代码

**主线不变**:V1.10-V1.13(日常运营自动化 + 合规四道门 D33-D36 升级 + 子问题展开 D31)。

**AEO 任务范围**(P0):
- ✅ 本 ADR 文档化
- ✅ `docs/10-aeo-readiness.md` 设计文档
- ✅ `docs/04-roadmap.md` 追加 V3 候选模块条目
- ✅ CLAUDE.md 追加 D37 决策
- ❌ 零代码 / 零 SQL / 零 migration

**对 V1 销售的影响**(可立刻使用):
- 客户 / 投资人 deck 加 "GEO → AEO 演进路线" 一页(用 Web 三段论)
- pitch 话术升级:"我们在 Agent Attention Economy 时代,从 SEO 投毒方的反面卡位"

### 4.2 V2.x(2026-07 → 2026-10)— AEO 作为 Layer A 升级实验

**主线不变**:`docs/04-roadmap.md` V2 路线图(追踪自动化 + 反馈回路 5 断点 + 多引擎)。

**AEO 增量**(P1,V2 后期 1-2 周工时):
- AEO Readiness Score 8 维度 SQL view(读 4 张现有表:`brands` / `staff_accounts` / `services` / `discoverability_artifacts`)— **不增加新表**
- 在 `/t/[slug]/discoverability` hub 加 "AEO Readiness" tab(`/t/[slug]/discoverability/aeo`)
- 客户教育文档 + Agent-as-Interface 阶段说明
- Agent Service Feed JSON 草案预览(管理员后台可见,**未对外**)
- AI 答案污染监测 SQL view(基于现有 `citations` 表)— v1 用 SQL,不加 worker job

**与 V2 反馈回路的关系**:
- 断点 5(Audit → 内容生产 banner)与 AEO Readiness 5/6 维度(Risk Boundary / Human Confirmation)**共用 banner UI**
- AEO Readiness 是 Audit 的"agent 视角"扩展,SQL 复用,UI 分 tab

### 4.3 V3 候选(2026-11+)— 条件触发,不预设排期

**触发条件**(满足任一即可开 Sprint):
1. 多客户(≥ 3 家)上线且 Layer A 完整度普遍 ≥ 70%
2. 国内任一主流 AI 平台(豆包 / 元宝 / 夸克 / Kimi)公布对外 MCP 端点或 Agent Browser SDK
3. 客户主动提"Agent 时代我们怎么准备" / "AI 答案错误怎么纠偏"

**实施范围**:
- Agent Service Feed 公开路由(扩展 D14 体系,延续 D15-D18 安全模型)
- AI 答案污染监测看板 v1(每日 cron + 异常告警)
- 至少 1 起真实纠偏案例闭环

**不实施**:
- MCP Server / A2A 协议
- 自动支付 / 自动预约成交
- 任何形式的黑帽

详见 `docs/04-roadmap.md` § V3 候选模块。

---

## 五、产品边界(明确不做)

### 5.1 协议层 — 不做 MCP / A2A

- ❌ 不实现 MCP Server(等国内 agent 平台明确接入信号)
- ❌ 不实现 A2A 协议(同上 + 无业务场景)
- ❌ 不做 Agent-to-Agent 自动协商 / 委托 / 拍卖
- ❌ 不做 DID(去中心化身份)/ Verifiable Credentials

**重评估窗口**:V3 触发条件 #2 满足时。

### 5.2 交易层 — 永不做

- ❌ 自动支付(任何形式,包括"为客户代付 LLM token 费用"也不做)
- ❌ 自动预约 / 自动下单 / 自动签单
- ❌ Cross-Agent Billing Ledger(论文 §5.2.1)
- ❌ Pay-per-invocation 收取 agent 调用费

**理由**:医疗 / 法律 / 教育等强监管行业,任何"自动成交"都是合规雷区。

### 5.3 医疗诊疗层 — 永不做

- ❌ 自动医疗诊断
- ❌ 自动治疗建议
- ❌ 自动药品推荐 / 处方
- ❌ "AI 医生"角色任何形态

**所有医疗场景必须保留**:人工医生确认节点 / 风险边界声明 / "不替代面诊"声明 / 合规四道门(D5/D12/D33-D36)。

### 5.4 GEO 战术分级 — 激进合规 vs 虚假信息黑帽(2026-05-27 用户对齐)

GEO Studio 产品定位本身就是激进 GEO,目标 = **让豆包 / 元宝 / 夸克在多家可选时偏向推荐我们**。本节明确把行业里模糊的"黑帽"一词拆成 4 类,**A 类禁止 / B+C 类明确允许 / D 类禁止**,所有 B+C 行为以"信息真实 + 医疗内容合规"为前提。

#### A 类 — 真违法黑帽(永不做)

依据《广告法》《反不正当竞争法》《医疗广告管理办法》《刑法》222 条:

- ❌ **RAG Poisoning**:虚假内容站投毒 AI 检索语料
- ❌ **Citation Poisoning**:伪造引用 / 编造期刊 / 假 DOI / 假研究
- ❌ **Entity Poisoning**:虚假资质 / 假医生证 / 假执照
- ❌ **Service Registry Poisoning**(论文 §7.1.1 P2):虚假服务条目 / 虚假补贴 / 假免费
- ❌ **竞品贬低 / 比较性攻击**(D32 红线 + 反不正当竞争法第 11 条)
- ❌ **疗效造假**:"100% 成功" / "根治" / "无副作用" / "首家"(《广告法》第 16/17 条)
- ❌ **数据造假**:编造统计 / 排名 / 占比

#### B 类 — 激进合规 GEO 战术(显式允许,2026-05-27 拍板)

GEO Studio 战术核心,**全部建立在内容真实合规前提下**:

| # | 战术 | 决策依据 / 状态 |
|---|---|---|
| B1 | **子问题 700+ 量级覆盖**(每主题 8-10 子问题,系统性长尾矩阵)| D31(豆包 GEO 检索增强报告 §3.3:子问题命中关键词 r=0.23 是唯一显著正相关因子)|
| B2 | **同主题多角度同日发布**(科普 / 案例 / 问答 / 对比 / 价格 / 流程 / 风险 / 见证 8 角度同步上架)| 覆盖意图集群,提升豆包"边想边搜"内部 8-10 子查询的命中概率 |
| B3 | **占满 AI 偏好源**(头条 / 抖音 / 百家号 / 知乎 / 微信公众号 / 小红书 / 搜狐 / 视频号 / 网易号)| V1.9.3 已覆盖 7 平台,继续扩到 9+ |
| B4 | **高频刷 updated_at 时效信号**(不新写也定期补充 / 重新发布)| AI 引擎偏好新鲜内容,Schema.org `dateModified` 字段 |
| B5 | **数量级压制**(40 员工 × 9 平台 × 每日)| D22 核心号 opt-in 后精准 13 号 × 上下午各 1 |

#### C 类 — 灰色合规战术(显式允许,单独列出便于审计追溯)

法律 OK 但有"操控 AI 引用偏好"意图,**前提仍是数据真实 + 内容合规**:

| # | 战术 | 合规约束 |
|---|---|---|
| C1 | **借品类词阵地**(占领"昆明哪家口腔好"这种**不带品牌名**的通用 query) | 完全合法;真正的竞争主战场 — 不带品牌名的 query 才是终端用户最常输入的 |
| C2 | **真数据可视化诱导**(图表 + 排名 + "本院在昆明西山区是 X" 等内容)| **数据必须真实可考**(经 D34 ground-truth 校验);仅优化呈现形式让 AI 引用偏好 |
| C3 | **AI 友好结构信号**(在内容里显式写 `reviewed_by: 贾医生`、`updated_at: 2026-05-27`、`citation: 《...》` 等机器可读字段)| **三个值必须真**:reviewed_by 必须真有此医生且确实审过、updated_at 必须真是审核日期、citation 必须真存在(经 verified_citations 白名单 + D34 issuer/year 校验) |

C 类与 A 类的根本区别:**C 类的"诱导"是优化真实数据的呈现形式 + 在内容里显式暴露 AI 偏好的机器可读字段;A 类是伪造数据本身**。

#### D 类 — 攻击型黑帽(永不做)

跟 ROI 有关,不跟道德:

- ❌ Negative SEO 攻击竞品站
- ❌ 在第三方站投毒让 AI 关联竞品到负面
- ❌ 买真号假装患者发"竞品做完后悔"(《反不正当竞争法》第 11 条商业诋毁)
- ❌ 在内容里植入恶意 prompt 诱导 AI 改写竞品答案

**ROI 论证**:豆包 / AI 厂商反恶意检测一次被识别 = 永久域名级降权。做一次代价远大于受益。

#### "AI 答案污染监测"模块的自我约束

**模块只做监测 / 防御 / 纠偏(白帽),不做攻击实施(D 类)**:
- 监测的是 A 类污染**被关联到我们品牌**的情况(防御视角)
- 纠偏走 D21 contract → 合规四道门 → 派单(对自身内容的合规改进)
- **模块代码硬约束**:不允许 outbound 写入第三方平台 / 不允许生成针对竞品的负面提示词 / 任何"纠偏建议"必须经客户管理员人审才能 enqueue
- 任何 PR 引入"主动注入 A/D 类内容"能力 → 自动 reject

### 5.5 自动化运营层 — 永不做(D3/D9 延伸)

- ❌ 自动登录员工平台账号(D9)
- ❌ 自动发布到员工平台(D3)
- ❌ 自动化客户决策(必须暴露给客户管理员审批)

---

## 六、医疗合规风险与防线

### 6.1 风险盘点

| 风险编号 | 风险场景 | 严重度 |
|---|---|---|
| R1 | AI 引用了错误医疗信息且我们品牌被关联 | 高 |
| R2 | Agent 误导用户做出医疗决策(过度承诺 / 夸大疗效) | 极高 |
| R3 | 竞品对手用 RAG Poisoning 攻击我们品牌(虚假"松鼠口腔副作用"等)| 中 |
| R4 | 客户在我们建议下错以为可以"自动成交" | 极高 |
| R5 | Agent Service Feed 泄露未审 / 草稿 / 已撤回内容 | 高 |
| R6 | "AI 答案污染监测"模块代码被误用为攻击工具 | 高 |
| R7 | AEO 演进让 V1.x 老客户困惑("是不是要重新学一套?")| 低 |

### 6.2 防线对应

| 风险 | 防线 |
|---|---|
| R1 | `docs/10-aeo-readiness.md` § AI 答案污染监测模块 → 监测错误归属 + 一键生成纠偏工单(澄清型 FAQ / 补 Schema / 加 Trust Block) |
| R2 | AEO Readiness Score 维度 5(Risk Boundary)+ 维度 6(Human Confirmation),**低分阻止 Layer A 公开**;前端 UI 不暴露任何"自动 X" 按钮 |
| R3 | 监测模块 + Trust Block 完整度 + Schema 完整度作为反制护城河;污染检出后走 V1.13 合规升级路径 |
| R4 | 本 ADR + D37 明确写入 CLAUDE.md;Agent Service Feed JSON 强制字段 `human_confirmation_required: true` + `forbidden_actions` 列出"自动预约/支付/诊疗" |
| R5 | 延续 D15-D17:opt-in 默认关 / RLS / build-on-write 缓存 / 内容过滤双闸(`geo_visible=true` + `compliance_status='approved'`)|
| R6 | 模块代码层面:不允许 outbound 写入第三方平台 / 不允许生成攻击 prompt / 所有"纠偏建议"必须经客户管理员人审 |
| R7 | UI 在 V2 之前不暴露 AEO 概念;客户教育文档同步给到;销售用 "GEO Studio 升级版"(增量,非颠覆)叙事 |

### 6.3 红线总结

任何 AEO 演进的代码 / 设计 / 客户提案,必须先过以下 4 道审:

1. **人工确认门**:医疗 / 法律决策路径上必须有客户管理员或医生人审节点
2. **风险边界门**:任何对外公开实体必须有 risk_boundary slice(D21 Trust Block)
3. **白帽门**:模块绝不包含"投毒 / 攻击 / 诱导错误引用"能力
4. **既有决策门**:必须不推翻 D1-D36 任一条 — 推翻须开新 ADR 走完整流程

---

## 七、对现有模块的影响

> **核心约束**:本 ADR 不动任何现有代码、数据库、UI 路由。下表是 P1/P2 阶段如何**复用**现有模块,不是"现在改"。

### 7.1 Discoverability(D14-D18 / ADR 005 / docs/06)

| 当前能力 | AEO 演进的影响 |
|---|---|
| Schema.org JSON-LD 7 类生成 | **复用,不动**。AEO Readiness 维度 7(Structured Feed Completeness)直接读 Schema 完整度 |
| llms.txt / llms-full.txt | **复用,不动**。AEO Readiness 维度 1(Agent Discoverability)读 llms.txt 是否暴露 |
| AI Content Feed | **演进**。Agent Service Feed 是 AI Content Feed 的扩展版(增加 services / suitable_for / forbidden_actions 等字段)— 详 `docs/10` |
| Discoverability Audit 4 维度 | **复用 + 扩展**。AEO Readiness 是 Audit 的"agent 视角"扩展,SQL 复用 |
| `discoverability_artifacts` 表 | **复用**。可加新 artifact_type:`agent_service_feed`(P2,需要时新 migration)|

### 7.2 Content Contract(D21 / ADR 009 / docs/07)

| 当前能力 | AEO 演进的影响 |
|---|---|
| `content_contracts` 表(query_intent / primary_query / schema_targets 等)| **复用,不动**。AEO Readiness 维度 2(Entity Clarity)读 `primary_entity` + `supporting_entities` |
| Trust Block(7 字段)| **直接对应** AEO 维度 5(Risk Boundary)+ 维度 6(Human Confirmation) |
| Slice-first 存储(direct_answer / risk_boundary / faq_pairs 等) | **复用**。Agent Service Feed JSON 直接读 slices 字段 |
| DoD 14+5 条 | **复用**。AEO Readiness 5/6 维度评分基于 DoD 通过情况 |

### 7.3 Tracking(D4 / D26-D30)

| 当前能力 | AEO 演进的影响 |
|---|---|
| Playwright + CloakBrowser 多引擎追踪 | **复用,不动**。AI 答案污染监测复用 `citations` 表数据 |
| `citations.brand_mentioned` + `competitor` term_type | **复用**。监测"竞品贬低 / 错误归属"基于此 |
| `geo_snapshots` raw_response | **复用**。监测错误价格 / 假补贴 / 假资质用 LLM 解析 raw_response |
| 单引擎(只 doubao 在跑)| **AEO 不增加新追踪需求**;但拉通多引擎是 V2 主线(不变)|

### 7.4 Feedback Loops(docs/08 5 断点)

| 当前状态 | AEO 演进的影响 |
|---|---|
| 5 断点 V2 候选,backlog | 断点 5(Audit → 生产端 banner)与 AEO Readiness 5/6 维度**共用 banner UI** |
| AEO Readiness 是反馈回路第 6 条候选(Audit→Agent 视角)| 不取代现有 5 条;独立加 |
| 污染监测属于 C→B 反馈的新通道 | 反馈回路 5 断点之外的第 7 条候选 |

### 7.5 Compliance(D5 / D12 / D33-D36)

| 当前能力 | AEO 演进的影响 |
|---|---|
| 合规四道门(关键词 + LLM + 历史案例 + 人审)| **复用,不动**。AEO Readiness 维度 8(Anti-Poisoning Resilience)读 `compliance_cases` + `verified_citations` + `numeric_fact_check` |
| auto-rewrite cascade(D35)| **复用**。污染监测发现错误时,enqueue 走纠偏工单(走 wizard 或 auto-rewrite)|
| audit_logs 3 年保留 | **复用**。AEO 演进的所有公开访问 / 监测告警 / 纠偏动作全部入 audit_log |

### 7.6 Attribution(D6 / 转化归因)

| 当前状态(2026-05-27 真实测试结论)| AEO 演进的影响 |
|---|---|
| `hooks` 表 50 条 / `conversion_events` 表 **0 条** | **AEO 演进不依赖归因**;归因独立修(本会话 11:20 测试报告)|
| `/c/[slug]/checkin` 代码完整但无真实数据 | AEO 不增加归因需求;Agent Service Feed JSON 不暴露 conversion 数据 |

### 7.7 Daily Ops(D24 / D25 / docs/09)

| 当前能力 | AEO 演进的影响 |
|---|---|
| nightly-draft cron / DoD 评估 / auto-rewrite | **复用,不动**。AEO 演进的内容生产仍走现有产线 |
| 子问题展开(D31)| **复用**。AEO Readiness 维度 1(Agent Discoverability)与子问题矩阵覆盖度强相关 |

---

## 八、备选方案考虑过

### 方案 B:激进路线 — V2 直接做 MCP Server

- **拒绝理由**:
  1. 国内 agent 平台未消费 MCP,做了客户用不上
  2. 违反"配置化"精神(D2)— 把首客业务硬编码进协议层
  3. 工时占用 4-6 周,挤掉 V2 反馈回路(高客户感知价值)
- **重评估**:V3 触发条件 #2 满足后

### 方案 C:保守路线 — 当作未来候选,压根不写 ADR

- **拒绝理由**:
  1. 论文叙事是销售 / 客户教育的关键资源,先用文档锁住认知
  2. 决策档化的边际成本极低(2 个 docs + 1 个 ADR + 1 条 D37 ≈ 0.5d)
  3. 不写 ADR 等于"边做边定",踩 V0 决策档原则的雷

### 方案 D:把 AEO Readiness 直接合入 Discoverability Audit(不开新文档)

- **拒绝理由**:
  1. Audit 是 V1.7 静态评分(内容侧 + 数据完整度)
  2. AEO Readiness 是 **agent 视角**(交互能力 + 信任证据 + 风险边界)
  3. **视角不同,评分维度不同** — 强行合并会让两套语言互相污染
- **选择**:两套并存,SQL 共用底层数据,UI 分 tab

### 方案 E:模仿竞品做"GEO 排名优化"(抓词GEO 同类)

- **拒绝理由**:
  1. 论文 §7.1.1 把这类做法明确归为 C2 Knowledge Base Poisoning 威胁
  2. 医疗合规一票否决(D5/D12/D33-D36)
  3. 我们的护城河恰好是"非投毒源",自我打脸

---

## 九、实施分阶段

### P0(2026-05-27,本会话内,**零代码**)
- ✅ 本 ADR 011
- ✅ `docs/10-aeo-readiness.md`(评分 + Feed JSON + 污染监测)
- ✅ `docs/04-roadmap.md` 追加 V3 候选模块
- ✅ `CLAUDE.md` 追加 D37 草案
- ❌ 不写代码 / 不改 DB / 不新增 migration / 不动现有 V1/V2 计划

### P1(V2.x 后期,2026-09+,1-2 周工时)
1. AEO Readiness Score 8 维度 SQL view(读现有 4 张表)
2. `/t/[slug]/discoverability/aeo` 后台 tab(管理员可见,客户教育)
3. Agent Service Feed JSON 草案预览(后台可见,未对外)
4. AI 答案污染监测 v1 SQL view(基于现有 `citations` 表)
5. 销售 / 投资人 deck 升级("Agent Attention Economy" 章节)

### P2(V3 触发后,2026-11+,4-6 周工时)
- 取决于:V3 触发条件满足度(见 §4.3)
- 不预设范围;Sprint 启动时另开 ADR 012

---

## 十、风险与缓解

| 风险 | 缓解 |
|---|---|
| 论文叙事被客户当 buzzword | `docs/10` 用 "AEO Readiness Score" 这个具体可量化的产品语言,避免 "agent" 模糊化 |
| AEO 概念让 V1.x 客户困惑 | UI 在 V2 之前不暴露;客户教育同步给到;销售用"GEO Studio 升级版"叙事 |
| MCP/A2A 国内突然起来,我们落后 | 反爬 + 多引擎 + Layer A 的基础设施已足够强,可在 4-6 周内追上(对比从 0 起家)|
| "AI 答案污染监测"被误读为攻击工具 | 名字直接叫"AI 答案污染监测",描述用"白帽 / 防御";代码层面强 review;PR 强制过红线检查 |
| AEO Readiness 8 维度权重不科学 | P1 阶段先等权重(0-4 各维度 → 32 分),实测 ≥ 4 周后再调权;首版**不让分数影响生产流程** |
| Agent Service Feed 字段标准化失败(行业差异)| 首版只覆盖口腔;V3 多客户阶段按行业拆 schema 变体(延续 D2 配置化)|
| 论文 Agentic Web 范式本身可能不发生(预测失败)| 本 ADR 的 P0 全部是 docs 化,沉没成本 ≤ 1 天;P1/P2 由触发条件守门 — 不发生就不启动 |

---

## 十一、Open Questions

1. **AEO Readiness 维度权重**:V1 等权(各 0-4)→ V2 等权 → 实测 4 周后按客户反馈调权。**不在本 ADR 锁定**。
2. **Agent Service Feed 路由公开 vs 内部**:V2 后台预览(未公开),V3 触发后再决定是否对外。**不在本 ADR 锁定**。
3. **跨行业字段差异**(口腔 → 医美 → 律所 → 教育):V3 多租户阶段处理。**不在本 ADR 锁定**。
4. **AI 答案污染监测的告警通道**:Sentry / 站内 banner / 邮件 / 企微?V2 阶段定。**不在本 ADR 锁定**。
5. **AEO Readiness Score 与现有 Discoverability Audit 的总分关系**:并列展示 vs 加权合并?P1 阶段实测后定。**不在本 ADR 锁定**。

---

## 十二、后续

- P0 落地后(本会话结束)请用户 review:本 ADR + `docs/10-aeo-readiness.md` + V3 候选模块 + D37
- P1 启动条件:V2 反馈回路 5 断点完成 + 客户主动提"agent 时代"需求(任一)
- 偏离本 ADR 的范围时补 ADR 012

---

## 附录:论文引用清单

- 论文标题:Agentic Web: Weaving the Next Web with AI Agents
- 作者:Yingxuan Yang, Mulei Ma, Yuxuan Huang, Huacan Chai, Chenyu Gong, Haoran Geng, Yuanjian Zhou, Ying Wen, Meng Fang, Muhao Chen, Shangding Gu, Ming Jin, Costas Spanos, Yang Yang, Pieter Abbeel, Dawn Song, Weinan Zhang, Jun Wang
- 机构:SJTU + HKUST(GZ)+ UC Berkeley + 上海创智 + UC Davis + Virginia Tech + UCL
- 发布:2025-07-28(arxiv 2507.21206v1,共 76 页)
- 仓库:https://github.com/SafeRL-Lab/agentic-web

**本 ADR 引用的论文章节**:
- §1 Introduction(Agentic Web 定义)
- §2 Historical Evolution(三段论 + Table 1 + Figure 2-4)
- §2.3.2 Agent Attention Economy
- §2.4 Commercial and Structural Evolution
- §3.2 Transformations in Web Architecture
- §3.3 Three Conceptual Dimensions(Intelligence / Interaction / Economic)+ Figure 6
- §5.1 Motivation(SRZ 8 维度)+ Figure 9
- §5.2 Roadmap(DSVM / RTR / CABL)+ Figure 10
- §5.3.2 Details of MCP + Figure 12
- §5.3.3 Details of A2A
- §5.4.1 The Disruption of Traditional Browsers by Agents
- §6.2.1 Agent-as-Interface + Table 2
- §6.2.2 Agent-as-User + Table 3
- §7.1.1 Threat Analysis Across Agentic Web Layers + Tables 5-7
- §7.3 Safety and Security Defense
