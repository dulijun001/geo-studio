# V1 收尾路线图

> 立项 2026-05-21,本会话起草。归档"V1.11+ 之后到 V1 真正可放下"之间的 ~10-15 个 todo,按客户价值闭环 + 风险防御 + 长期可持续三轴排成 4 阶段。每阶段 ship 完留观察窗,反馈优先级 > 文档优先级。

## 一、当前 V1 闭环度盘点(2026-05-21)

| 主线环节 | 状态 | 客户感知 |
|---|---|---|
| 1. 凌晨自动起内容 | ✅ V1.10/V1.11.1 | 早上看到任务 |
| 2. 自动 DoD + 合规放行 | ✅ V1.10.1 | 不用人工初审 |
| 3. **自动派单到员工号** | ❌ advisor 模式,要点 confirm | 还要每天进系统 |
| 4. 员工发布(7 平台跳转) | ✅ V1.9.3 | 任务卡能用 |
| 5. GEO 追踪(普通题) | ✅ V1.11.2 CloakBrowser | 普通问答有数据 |
| 6. **GEO 追踪(local 题)** | ⚠️ selector 卡 RAG 模式 | SOV 数据残缺 |
| 7. SOV 战况图 | ⚠️ 等 6 | 看不到全貌 |
| 8. **转化归因数据** | ❌ 入站 0 | W8 验收 5 起转化造不出 |

**真正缺口**:#3、#6、#8。其他 LIVE。

---

## 二、4 阶段路线

### 阶段 1 — 闭环主线(本周内,3-4 工时)

| 任务 | 工时 | 客户感知改进 |
|---|---|---|
| **D2 自动派单**:`auto-dispatch-timeout` 标 dispatchable 后真写 `publish_tasks` + 新增 `daily_ops_settings.auto_dispatch_enabled` 闸(default true for songshu,其他 tenant default false,迁移现有 13 个 tenant) | 0.5d | 真零接触,凌晨醒来任务已经派到员工号 |
| **I1 Sentry / Axiom 真接通**:装 `@sentry/node` + 把 26 处 stub `reportError` console.log 真转 Sentry SDK 调用 | 1h | prod 出 bug 你立刻 push notification |
| **回归冒烟 + 部署 + 真生产观察 24h** | 0.5h | — |

**Ship 完后等 2-3 天看真凌晨 cron 全自动跑通**,不动其他事。

**完成定义(Definition of Done)**:
- 凌晨 02:00 cron 跑完,无须任何人工操作,publish_tasks 已经在员工 `/staff` 任务列表
- 任意 prod error 30 秒内 Sentry 收到 + 至少 1 个 dimension(scope/tenant/error_class)
- 客户两天没主动进 admin 页 → 也能正常用产品

---

### 阶段 2 — 数据反馈闭环(下周,2-3 天)

| 任务 | 工时 |
|---|---|
| **D4 转化归因入站方案**:`/c/[slug]/checkin` 二维码生成 + admin "今日活动码 + 物料打印"页 + 前台微信小程序入口(可选 phase 2) | 1d UI |
| **D1 KB → questions 自动派生**:LLM 从 KB md 文档抽出"客户真问的问题",按 priority 入 questions 待审,人工 approve 后激活 | 1.5d |
| **GEO selector 加固**:noVNC into ECS 调试豆包 RAG 模式 DOM,加 fallback selectors;补 yuanbao/deepseek validation;让 local 题(如 "昆明全口种植牙哪家好")也能成功 | 1d |

**Ship 完客户就有完整闭环可观测**:起草 → 派单 → 发 → 追踪 → SOV → 转化 → 回流。

**完成定义**:
- 今日活动码物料能 1 个 click 生成并 print
- KB 每周自动给出 5-10 道新题目候选,经审通过后入 questions
- "昆明XX哪家好" 类 local 题 GEO snapshot 真返回 citations,SOV 战况图能看到松鼠口腔的引用次数对比同行

---

### 阶段 3 — 生产化收尾(月内,2-3 天)

| 任务 | 工时 |
|---|---|
| **I3 替代 TEMPORARY `/login/quick`**:Supabase Auth multi-user 或 phone+passcode 完整版(deadline 2026-06-30 还 41 天) | 0.5d |
| **测试自洁修复**:`content-flow` / `compliance-llm` / `variant-flow` 跑完 cascade delete tenant,kb-sync 不再 skip | 1d |
| **3 个 smoke test 修**:test-content `:db_termination`(connection pool 调优)、test-compliance-llm hang(timeout)、test-auth fallback(本地 URL) | 1d |
| **deploy.sh 顶部注释 ssh user 修 + ECS .env DATABASE_URL 文档化** | 5min |

**完成定义**:
- TEMPORARY 登录链路下线,真用户账号系统接管
- `pnpm db:test-*` 每个全过,可加入 CI gate
- 新人来项目能跟 deploy.sh 跑顺到底,不踩注释 vs 现实的坑

---

### 阶段 4 — V2 战略期(下月+,2-4 周)

| 任务 | 工时 |
|---|---|
| **多引擎 GEO**:yuanbao/deepseek selector validation + quark/kimi/wenxin/qwen 适配器实现 | 1 周 |
| **ADR 004 反爬基础设施**:多账号池(5-10 个豆包号)+ HTTP 代理池 + 指纹隔离 | 1 周 |
| **L1 横向反馈回路 5 处全闭合**(`docs/08-feedback-loops.md`)| 6.5d |
| **xiangyu-cli 借鉴 P0/P1 11 项**(ADR 010)| 7.5d |

**完成定义**:
- 不只 doubao,4 个国产 AI 搜索引擎都能稳定追踪
- 单账号被识别为 bot 时自动切下一个,客户 SOV 数据不断流
- 5 处反馈回路把"主轴起草"和"运营回流"双向连起来

**触发条件**:阶段 3 收尾 + 第二个付费客户在排队再启动,避免做了没人验证的 SaaS 化。

---

## 三、开发节奏纪律(这次会话定下的最佳实践)

1. **不要一气干完所有 4 阶段**。每阶段 ship 后留 2-7 天客户真实使用,反馈优先级 > 我的猜测
2. **阶段 1 + 2 跑 1-2 周后再决策阶段 3**。客户用中暴露的真实痛点可能替换我们这里某些低优先级 todo
3. **阶段 4 V2 应该等阶段 3 收尾 + 客户付费验证后再启动**
4. **每阶段定义 DoD**:不只是"代码改完",而是"客户能感知到 / 数据可观测到"
5. **关键决策必入 CLAUDE.md 决策表 或 docs/adr/**(协作准则 #7)

---

## 四、风险 + Dependency

| 风险 | 影响 | 缓解 |
|---|---|---|
| 阶段 2 的 GEO selector 加固需要 noVNC ECS,工时可能 1d 远超 | 阻塞 SOV 战况图完整化 | 可拆出"先让 doubao local 题通"小目标,yuanbao/deepseek 留 V2 |
| 阶段 1 D2 自动派单一旦开错可能误派大批 publish_tasks | 客户员工号收到不该收的任务 | 加 `auto_dispatch_enabled` 默认 false,songshu 显式 opt-in;dry-run 先跑 1 次看派单结果 |
| 阶段 2 D4 转化入站涉及客户前台流程改造 | 单方面改产品不够,需要客户业务侧配合 | 同步给客户运营 KP 做"打印物料 + 培训"step-by-step,不要单方面 ship 完就放手 |
| CloakBrowser 是社区 GPL 项目,生产 worker 依赖它 | 它出 bug 拖累 GEO 追踪 | 仓库已 clone 在 `/Users/dulijuner/projects/CloakBrowser`,必要时自己 patch + fork |
| TEMPORARY 登录 deadline 2026-06-30 | 41 天后过期,客户实际进不来产品 | 阶段 3 必须做完,不能拖到 V2 |

---

## 五、决策归档(填回 CLAUDE.md 决策表)

会话中已经写入的:**D22 / D23 / D24 / D25 / D26**(V1.11 系列)。

本路线图本身不新增决策,**它的存在就是阶段化交付的纪律性约束**。后续每阶段开始前对照本图 + 客户最新反馈再确认 scope,然后才动手。

---

**修订记录**:

- 2026-05-21:本会话起草。下次启动新阶段前回看,根据客户使用情况调整。
