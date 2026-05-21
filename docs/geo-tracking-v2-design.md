# GEO 追踪 V2 设计文档

> 立项 2026-05-21,会话中起草。**先 design 再 code,protect 后续 5 件事不返工**。
>
> 本文档是 GEO 追踪能力从 V1 30% 完成度提升到"可商用"的工程契约。所有 A2-A5 任务必须读完本文档第 5、6、7 节再开始 code。

---

## 0. 目标(为什么做这件事)

**当前**:GEO 追踪只 30% 完成度,客户最在意的"昆明XX哪家好"local 推荐类题不通,SOV 战况图无数据,多引擎只 doubao 半通,无定时批量追踪。

**结束态(V2)**:
1. 每周一凌晨 09:00 北京自动对 30-50 道核心题 × 3 引擎 (doubao + yuanbao + deepseek) 跑追踪
2. SOV 战况图 8 周热力图填上数据,客户每周一上班看到上周表现
3. doubao 覆盖所有题型(普通问答 + local 推荐 RAG 模式 + 价格 + 对比 + 风险)
4. 单引擎或单题目失败 ≤ 10%,稳定数据 ≥ 90%
5. 至少有"竞品对比"维度的 SOV 输出,不只"被提及次数"

**护城河价值**:走真豆包 App + 反爬 + 多引擎 + 中文 vocab 反查 — 国内 GEO 工具 95% 都没这能力。这是产品最强 wedge。

---

## 1. 现状盘点(2026-05-21 11:50)

### 已有能力 ✓

| 能力 | 位置 | 状态 |
|---|---|---|
| Adapter 抽象 | `packages/geo-core/src/adapter.ts` | 接口干净,9 engines 注册 |
| Snapshot 数据模型 | `packages/db/src/schema/tracking.ts` | 表 + 索引齐 |
| Brand mention 反查 | `packages/geo-core/src/scanBrandMentions` | 跨 vocab_type 已实现 |
| Citation 落库 | `apps/worker/src/jobs/geo-snapshot.ts:122` | 自动跑 |
| **doubao 反爬基础**(CloakBrowser + xvfb + Mac cookie 复用) | V1.11.2 commit | 2026-05-21 上线 |
| 每周 baseline cron | `apps/worker/src/jobs/geo-weekly-baseline.ts` | 已注册周一 01:00 UTC |
| SOV 战况图 8 周热力图 | `apps/web/app/t/[slug]/sov/page.tsx` | UI 完整,等数据 |

### 缺口 ❌

| 缺口 | 影响 |
|---|---|
| **doubao RAG/search 模式 DOM 路径未覆盖** | local 推荐题 elementHandle.click 30s 超时 (核心客户场景) |
| **每周 baseline 只 enqueue doubao 一个引擎** | yuanbao/deepseek 不参与每周追踪 |
| **无 per-engine rate limit + 错峰随机延迟** | 30 题连续高频访问 = 反爬识别 + 账号封禁风险 |
| **`tracking_accounts` 表未使用** | snapshot.session_account_id 永远 NULL,V2 多账号池没接入 |
| **yuanbao/deepseek selectors 未验证** | adapter 写好但实际 DOM 路径 / wait 条件不对,大概率运行报错 |
| **quark / wenxin / kimi / qwen / chatgpt / perplexity 6 stub** | 客户问"我在夸克/文心一言被引用吗"答不出 |
| **SOV 聚合 SQL 没写** | 战况图 UI 直接查 citations + geo_snapshots,数据量大后 SQL 复杂度爆 |
| **GEO 追踪自检流程缺失** | 哪些 question 长期失败、哪个 engine 死了,没 dashboard |

---

## 2. 设计原则(必须遵守)

### 2.1 不破坏现有契约
- `TrackerAdapter`、`TrackerQuery`、`TrackerResult`、`TrackerContext` 类型不动 — 不返工已 ship 的 adapter
- `geo_snapshots` schema 不动(`status_idx` + `tenant_engine_idx` 已满足新查询路径)
- `citations` 跨 vocab_type 反查不动

### 2.2 fail-soft 默认
- 单 adapter 失败 → 整个 weekly baseline 不挂,继续其他 engine
- 单 question 失败 → 不影响其他 question 的同引擎追踪
- 任何超时(adapter / DB / Sentry)抛 → 上一个 retry,不让 worker 进程死

### 2.3 显式 opt-in / 默认安全
- 新加 engine 默认不进 weekly baseline 池 — 必须通过 `tenants.settings.tracking.engines` 显式启用
- 多账号池 V2 不强制 — 没账号时 fallback 单账号
- 切错引擎 / 切错账号都不污染客户数据

### 2.4 错峰反爬
- 同一 engine 内不要 0 间隔连续触发 — 每题之间 30-90s 随机延迟
- 不同 engine 错开半小时启动 — doubao 09:00 / yuanbao 09:30 / deepseek 10:00
- weekly_baseline 总 wall-clock 控制在 3 小时内(30 题 × 3 引擎 × 1.5min/次 = 135min)

### 2.5 可观测性 first
- 每条 snapshot 都要记 `meta`(adapter timing / UI mode / 选中的 selector path / 任何异常)
- 失败要分类:`rate_limited` / `login_required` / `selector_missed` / `network_error` / `unknown`,不要全塞 `failed`
- weekly_baseline 完成后 emit `reportEvent('geo.weekly_baseline.completed', { tenant, engine, queued, succeeded, rate })`

---

## 3. 架构

### 3.1 数据流总览

```
                weekly baseline cron (Mon 01:00 UTC)
                              │
                              ▼
            ┌─────────────────────────────────┐
            │ orchestrator (geo-weekly-baseline.ts) │
            │   - list active tenants            │
            │   - for each tenant: 读取 enabled  │
            │     engines + priority>=N questions│
            │   - 错峰 enqueue with start_after  │
            └─────────────────────────────────┘
                              │ enqueueViaSharedBoss('geo.snapshot', {...})
                              ▼
            ┌─────────────────────────────────┐
            │ geo-snapshot.ts worker           │
            │   1. SELECT account from pool    │
            │   2. dispatch to adapter[engine] │
            │   3. adapter returns TrackerResult│
            │   4. scanBrandMentions 反查      │
            │   5. INSERT citations            │
            │   6. UPDATE snapshot status=done │
            └─────────────────────────────────┘
                              │
                              ▼
                  citations + geo_snapshots 表
                              │
                              ▼
            ┌─────────────────────────────────┐
            │ SOV 战况图(/t/[slug]/sov)     │
            │   - 直接查 citations + snapshots │
            │   - 8 周窗口 + 5 状态分类         │
            │   - V2 可缓存到 materialized view │
            └─────────────────────────────────┘
```

### 3.2 Adapter 契约(细化)

```ts
interface TrackerAdapter {
  readonly engine: Engine;
  query(q: TrackerQuery, ctx: TrackerContext): Promise<TrackerResult>;
}
```

每个 adapter 内部必须实现:

| 阶段 | 责任 |
|---|---|
| 1. **launch context** | CloakBrowser persistent + userDataDir(账号池给出的 path) |
| 2. **navigate** | goto + waitUntil DOM ready |
| 3. **mode detect**(NEW V2)| 检测 chat 模式 vs search/RAG 模式,选不同的 selector strategy |
| 4. **submit query** | 找输入框 + 提交;捕获 login required / captcha 提前 fail |
| 5. **wait for stream complete** | 等回答稳定(idle pattern,3 次连续 length 不变)|
| 6. **extract** | 抓 raw_response text + 抓 citation chip URLs |
| 7. **detect mode in meta** | 写 `meta.ui_mode = 'chat' / 'search'` 让上层 observability 知道 |
| 8. **cleanup** | 关 context,保留 userDataDir |

**V2 新增 mode detect 是 doubao local 题失败的根因** — adapter 现在假设单一 chat DOM,实际豆包 local 题进 RAG/search 模式 DOM 完全不一样。

### 3.3 账号池(tracking_accounts)接入

V1 schema 已留位置,V2 真用。

```ts
// before each adapter call:
async function pickAccount(engine: Engine): Promise<TrackingAccount> {
  // SELECT account WHERE engine = ? AND status='active'
  //   AND (last_used_at IS NULL OR last_used_at < now() - cool_down_minutes)
  //   ORDER BY last_used_at ASC NULLS FIRST
  //   LIMIT 1
  // — 自动轮询 + 冷却,不让单号高频访问
}
```

- `tracking_accounts.credential_ref` = `~/.cache/geo-tracker/{engine}/account-{id}/` 路径(不存 cookie 本身,存 userDataDir 引用)
- `daily_quota` 满了 → 切下一个号
- 单号 `status=banned` → 永久跳过
- V1 阶段 1 默认:每个 engine 只有 1 个 account(沿用现有 doubao 单号),保留扩展位

### 3.4 SOV 聚合

战况图 UI 直接 SQL 跑没问题(目前 questions × 8 周 = 最多 480 cells)。但**新增** materialized view 缓存周报:

```sql
CREATE MATERIALIZED VIEW sov_weekly AS
SELECT
  s.tenant_id,
  s.engine,
  date_trunc('week', s.asked_at) AS week_start,
  s.question_id,
  COUNT(*) FILTER (WHERE c.term_type = 'brand') AS brand_mentions,
  COUNT(*) FILTER (WHERE c.term_type = 'competitor') AS competitor_mentions,
  COUNT(*) FILTER (WHERE c.term_type = 'doctor') AS doctor_mentions,
  COUNT(*) FILTER (WHERE s.status = 'done') AS done_snapshots,
  COUNT(*) FILTER (WHERE s.status = 'failed') AS failed_snapshots
FROM geo_snapshots s
LEFT JOIN citations c ON c.snapshot_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY 1, 2, 3, 4;

CREATE INDEX sov_weekly_lookup ON sov_weekly (tenant_id, engine, week_start, question_id);
```

每周 baseline 跑完后 `REFRESH MATERIALIZED VIEW CONCURRENTLY sov_weekly`。

战况图改读这个 view,8 周 × 50 题 × 3 引擎 = 1200 行的 SELECT,毫秒级。

### 3.5 多引擎合并 / 跨引擎对比

每条 question 在每周窗口里,跨 3 引擎都跑 1 次,出 3 个 snapshot。

UI 战况图 cell 显示:
- 老版本:单引擎 brand/competitor 计数
- 新版本(V2):cell 内显示 3 引擎合并(豆=2,元=0,深=1 这种紧凑表示)+ 单元格颜色按"任一引擎守住 = 绿,全引擎失守 = 红"

但这步**先放阶段 4**,V2 阶段 2-3 先单引擎(doubao)出真数据,UI 不动。

---

## 4. 每引擎 DoD(production ready 定义)

| Engine | DoD |
|---|---|
| **doubao** | (a) chat 模式题 ≥ 95% 通(已达);(b) **RAG/search 模式 local 题 ≥ 90% 通**(A2 加固后);(c) 反爬 cookie 60d 内不失效;(d) `meta.ui_mode` 准确写;(e) brand mention 反查 false-positive < 5% |
| **yuanbao** | (a) chat + 搜索模式都通;(b) selectors validated against 2026-05 真实 DOM;(c) 跟 doubao 同等错误分类 |
| **deepseek** | 同 yuanbao |
| **quark** | V2 / 阶段 4,留 stub 占位不实现 |
| **wenxin / kimi / qwen** | V2 / 阶段 4 |
| **chatgpt / perplexity** | V2,需要 GFW 外节点(独立 ADR) |

---

## 5. 实施顺序(A2-A5)

### A2 — doubao RAG 模式 selector 加固(1d,P0)

**核心问题**:豆包对 "昆明XX哪家好" 这种 local + recommendation 题会触发 AI 搜索模式,UI 跟普通 chat 模式不同 —— 我们 V1 adapter 只覆盖 chat 模式,所以 click submit 30s 超时(那个 element 在 RAG 模式下不存在或异步出现晚)。

**调试步骤**:
1. ECS 装 x11vnc + websockify(因为 noVNC manager 已经 CloakBrowser 提供);本地 SSH tunnel `ssh -L 6080:localhost:6080 root@47.98.131.138`
2. 在 worker 进程 xvfb display 上 attach x11vnc → 本地浏览器看到 ECS 的豆包页面
3. 手工跑一次 "昆明全口种植牙哪家好",观察 RAG 模式真实 DOM:
   - 输入框 selector 是否一样?
   - 提交后是否出现 "AI 搜索结果" 卡片(不是普通 chat bubble)?
   - 引用 chip 在 RAG 模式下的 DOM 路径
   - 是否有 popup / 切换器要点
4. adapter 加 mode detect 函数:`if (await page.locator('[data-rag-mode]').count() > 0) return 'search' else 'chat'`(具体 selector 调试时定)
5. 每个模式独立 selector path,分别 wait + extract
6. 测试 5 种代表性题型:普通(种植牙副作用)/ local(昆明XX哪家好)/ 价格(种植牙价格)/ 对比(隐形 vs 钢牙)/ 风险(糖尿病能种牙吗)

**完成定义**:5 种题型 ≥ 4 种返回 status=done + raw_response 非空;失败的明确分类 + Sentry 上看到错误归类。

### A3 — 每周批量追踪 cron 增强(0.5d,P0)

**改 `geo-weekly-baseline.ts`**:
1. 从 `tenants.settings.tracking.engines` 读启用引擎(default `['doubao']`)
2. 每 question × 每 engine 各发一条 `geo.snapshot` job
3. **错峰**:`start_after` 给每 job 加随机延迟(60-300s 之间均匀分布,跨 engine 启动时刻错开 30 分钟)
4. emit `reportEvent('geo.weekly_baseline.queued', { tenant, total })`
5. 失败统计不在这跑(跑完后由 SOV refresh job 触发或独立监控页查 `geo_snapshots WHERE created_at > 上周 AND status != 'done'`)

**手动 trigger 入口**:`/t/[slug]/sov` 加 "立即刷新本周数据" 按钮,enqueue `geo.weekly_baseline` job for this tenant only(便于客户改了 questions 后立刻验)

**完成定义**:周一 09:00 北京自动跑 + 30-50 道题 × 启用 engines 都生成 snapshot 行,3 小时内全部 done 或明确分类失败。

### A4 — SOV 聚合 + 8 周热力图填数据(0.5d,P0)

1. migration 0040:`CREATE MATERIALIZED VIEW sov_weekly` + index
2. weekly_baseline 完成后 emit `geo.refresh_sov` job → `REFRESH MATERIALIZED VIEW CONCURRENTLY sov_weekly`
3. `sov/page.tsx` 改读 view(简化 SQL,加速渲染)
4. 加 "导出 CSV" 按钮 — 客户月报用得上

**完成定义**:打开 `/t/songshu/sov` 看到至少 1 周真实数据(由 A3 跑出),5 种 cell 状态分布合理(不是清一色 no_data 或 vacuum)。

### A5 — yuanbao + deepseek 真验证(1d,P1)

**前置**:A2 完成,我们对 noVNC ECS 调试有 muscle memory + tooling 就位。

**步骤**:
1. yuanbao 跑一道普通题验 → 调 selector → 调 stream wait → 跑通
2. deepseek 同流程
3. 把 `registry.ts` 的 `IMPLEMENTED = ['doubao']` 扩到 `['doubao', 'yuanbao', 'deepseek']` 当且仅当 5 种题型 ≥ 3 种通

**完成定义**:每 engine 至少 5 道真题验过、写入 snapshot done、scanBrandMentions 提取到 ≥ 0 mention(0 个也算 done,因为 mention 数依赖 vocab 配置)。

### V2 后续(阶段 4)
- A6:多账号池(`tracking_accounts` 真用)
- A7:quark / wenxin 适配器
- A8:多引擎 SOV cell 合并 UI

---

## 6. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| **单元** | tsx + assertEq | scanBrandMentions / SOV 聚合算法纯函数 |
| **adapter 单元** | smoke.ts manual run | 每个 adapter 跑 5 种题型,通过 ≥ 3 种 |
| **集成** | dispatch.ts style | snapshot job 从 enqueue 到 citations 落库的端到端 |
| **生产观察** | weekly baseline log + Sentry | 每周一汇报上周 success rate |

不写 mock adapter — adapter 是 Playwright + 真豆包,mock 等于不测。改用真账号跑 dev smoke。

---

## 7. 风险 + Mitigation

| 风险 | 概率 | 影响 | Mitigation |
|---|---|---|---|
| **noVNC into ECS 调 DOM 工时超 1d** | 中 | A2 延期 | 准备 fallback:先把 ROUTE_DETECTION 写到 V2,V1 阶段只让 RAG 模式 fail 时返回明确 reason='rag_mode_unsupported',不阻塞其他题型 |
| **豆包 cookie 被踢**(因为 RAG 模式高频访问触发风控) | 中 | 整个追踪停 | 每 engine 每天 ≤ 50 次 + 跨账号轮换(V2 阶段 4) |
| **CloakBrowser GPL 许可问题** | 低 | 客户合规审计被指 | 自己 fork,改成 MIT/自有 LICENSE,挂自己仓库 |
| **SOV view refresh 锁表过久** | 低 | 战况图查询卡 | `REFRESH MATERIALIZED VIEW CONCURRENTLY`(已带 `CONCURRENTLY`)|
| **多引擎并发让 ECS CPU 飙** | 中 | worker 卡 | 错峰 + 单进程 + 阶段 1 不并发(serial enqueue) |

---

## 8. 跟 V1 旧契约的兼容性

- `TrackerAdapter` 接口不变 → V1 adapter 不返工
- `geo_snapshots` schema 不变 → 旧数据可查
- `citations` schema 不变 → SOV 反查照旧
- `sov/page.tsx` UI 不变 → V2 阶段 1 仍能渲染(从 view 或 raw 切换是后端透明的)

**唯一新增**:
- `tenants.settings.tracking.engines` JSONB 字段(opt-in,不写 = doubao only,兼容 V1)
- `sov_weekly` materialized view(纯加速,不破坏 V1 路径)
- `tracking_accounts` 真用(V1 schema 已留,V2 第一次填行)

---

## 9. 状态归档

完成本设计文档后:
- CLAUDE.md 决策表加 **D27 / D28 / D29**(adapter mode detect、SOV view、tracking_accounts pool)
- 每完成 A2-A5 一项,本文档"实施顺序"对应小节加 `✅ ship at <commit>` 标注
- V2 阶段 4 启动时回看本文档,更新或新建 v3 design

---

**修订记录**:

- 2026-05-21:本会话起草。A2 待开工。
