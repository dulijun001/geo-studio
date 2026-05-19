# 08 — 反馈回路(Feedback Loops)

> **问题陈述**:V1.5 → V1.9 增量交付下,**垂直主轴(内容生产线)D21 已串通**,但**横向闭环(发出去 → 看效果 → 反哺选题)有 5 处断点**。结果是 admin 14 个 tab 各自自洽,**全靠老板人脑串联**。本文盘点 5 个回路,给 SQL 草稿和落地优先级。
>
> 立项日期:2026-05-14
> 状态:**backlog(未排期,V2 候选主题)**

---

## 一、与 V1.7 三层模型(`docs/06`)的关系

`docs/06-discoverability.md` 已经画了 A/B/C 三层:**A 可发现层 → B 生产层 → C 验证层**,箭头是 "↑ 喂数据"(自下而上)和 "↑ 反馈"(自上而下)。

V1.7 把 A → B → C 的"喂"做完了:Schema 自动生成、AI Feed/Sitemap 公开、Discoverability Audit 跑分。

**本文档专门补 C → B / C → A / B → A 的"反馈"线** — 这是 docs/06 留的口子,但 V1.7 没动。

```
┌─ A 可发现层 ────────────────────────┐
│   Schema / llms.txt / Audit         │ ← 断点 5(audit → 生产端选题)
└──────────────▲──────────────────────┘
               │ 喂(已做 V1.7)
┌─ B 生产层 ───┴──────────────────────┐
│   AI 起草 / D21 contract / DoD      │ ← 断点 3(归因 → 内容业务价值)
│                                     │ ← 断点 4(员工反馈 → 难发布标签)
└──────────────▲──────────────────────┘
               │ 喂(已做 W6+V1.6)
┌─ C 验证层 ───┴──────────────────────┐
│   GEO 追踪 / SOV / 归因 / Citations │ ← 断点 1(追踪 → 选题工单)
│                                     │ ← 断点 2(引用 → 关键词热度)
└─────────────────────────────────────┘
```

---

## 二、5 个断点详述

### 断点 1 — 追踪 → 内容选题(P0 价值最高)

**该联但没联**:`geo_snapshots` + `citations` 知道哪些 question 我们一次没被引用过,但 `content_items` 端不知情,客户每周肉眼看 SOV 表自己决定写啥。

**业务后果**:GEO 平台最大的卖点之一是"告诉我该写什么",我们现在让客户自己想。

**SQL 草稿**(过去 14 天 ≥3 次追踪 + 0 次品牌引用的 question):

```sql
SELECT q.id, q.text, q.intent, q.city,
       COUNT(DISTINCT s.id) AS tracked_n
  FROM questions q
  JOIN geo_snapshots s ON s.question_id = q.id AND s.status = 'parsed'
  LEFT JOIN citations c ON c.snapshot_id = s.id AND c.brand_mentioned = true
 WHERE q.tenant_id = $1
   AND s.created_at >= now() - interval '14 days'
 GROUP BY q.id, q.text, q.intent, q.city
HAVING COUNT(DISTINCT s.id) >= 3
   AND COUNT(c.id) FILTER (WHERE c.brand_mentioned) = 0
 ORDER BY tracked_n DESC
 LIMIT 10;
```

**UI 落点**:tenant home `今日运营` briefing hero 旁加一张卡 "🔥 高追踪零引用 query",每条带「一键建工单」→ 进 `/t/[slug]/content/wizard?question_id=...&primary_query=...`(wizard step 1 已支持 query_intent + primary_query,只需多接 query param)。

**数据模型变更**:无(全用现有表)。

---

### 断点 2 — 引用 → 关键词热度

**该联但没联**:被 AI 引用的 `content_items` 用了 `keyword_ids` 数组,但这些命中信息**没回流到 `keywords.meta`**。词库永远是"上次想到啥",不是"AI 真喜欢啥"。

**业务后果**:`keywords` 词库 V1.8 D20 引入后没有"学习",客户每次都从零选词。

**SQL 草稿**(过去 30 天每个 keyword 在被引用 content 中的出现频次):

```sql
WITH cited_items AS (
  SELECT ci.id, ci.keyword_ids, COUNT(c.id) AS cite_n
    FROM citations c
    JOIN publish_tasks pt   ON pt.id = c.matched_task_id
    JOIN content_variants cv ON cv.id = pt.variant_id
    JOIN content_items ci   ON ci.id = cv.content_item_id
   WHERE c.tenant_id = $1
     AND c.brand_mentioned
     AND c.created_at >= now() - interval '30 days'
   GROUP BY ci.id
)
SELECT k.id, k.text,
       SUM(ci.cite_n) AS total_cites,
       COUNT(ci.id)   AS used_in_items
  FROM cited_items ci
  JOIN LATERAL unnest(ci.keyword_ids) AS kid ON true
  JOIN keywords k ON k.id = kid::uuid
 WHERE k.tenant_id = $1
 GROUP BY k.id, k.text
 ORDER BY total_cites DESC
 LIMIT 20;
```

**写回**:每日 worker job(`feedback.refresh_keyword_heat`),把结果写进 `keywords.meta`:
```json
{ "ai_cite_count_30d": 12, "ai_cite_last_at": "2026-05-14T...", "used_in_cited_items": 3 }
```

**UI 落点**:`/t/[slug]/keywords` 列表增加「AI 热度」列(按 `meta.ai_cite_count_30d` 排序),内容向导 step 2 选词时高亮热度。

**数据模型变更**:无(`keywords.meta` 是 jsonb 已存在,P0 已为后期 enrich 留了口)。

---

### 断点 3 — 归因 → 内容业务价值(P1 客户老板最爱)

**该联但没联**:`conversion_events` + `journey_touchpoints` 知道每个 identity 看了哪些内容、最终成交多少,但**没汇总到 `content_items` 维度**。`/t/[slug]/content` 列表按 GEO 分排,**不按"赚钱了没"排**。

**业务后果**:客户老板进系统看不到 ROI 信号,只看到一堆 90 分的合规通过内容。

**SQL 草稿**(linear 归因,90 天累计成交额):

```sql
WITH attributed AS (
  SELECT pt.variant_id,
         (ce.value::numeric / NULLIF(touch_count.n, 0)) AS attributed_value
    FROM conversion_events ce
    JOIN journey_touchpoints jt ON jt.identity_id = ce.identity_id
    JOIN publish_tasks pt       ON pt.id = jt.publish_task_id
    JOIN LATERAL (
      SELECT COUNT(*) AS n
        FROM journey_touchpoints jt2
       WHERE jt2.identity_id = ce.identity_id
    ) AS touch_count ON true
   WHERE ce.tenant_id = $1
     AND ce.created_at >= now() - interval '90 days'
     AND ce.internal_outcome IN ('arrived','paid')
)
SELECT ci.id, ci.title,
       SUM(a.attributed_value)::int     AS revenue_attributed,
       COUNT(DISTINCT a.variant_id)     AS variants_contributed,
       COUNT(*)                          AS touchpoint_n
  FROM attributed a
  JOIN content_variants cv ON cv.id = a.variant_id
  JOIN content_items   ci ON ci.id = cv.content_item_id
 GROUP BY ci.id, ci.title
 ORDER BY revenue_attributed DESC NULLS LAST
 LIMIT 10;
```

**UI 落点**:
1. tenant home 卡 "💰 最赚钱内容 Top 10",每条带「一键复制 5 变体」
2. 内容列表新增「90d 归因成交」列(默认排序之一)

**数据模型变更**:无(全用 V1.6 已建的 customer_journey 三表)。

**坑**:`value` 字段 NULL 的 conversion_event 不计入 — 客户经常忘填成交额,得在 UI 提示"X% 事件没填金额,本榜单覆盖 Y%"。

---

### 断点 4 — 员工反馈 → 内容"难发布"标签

**该联但没联**:`publish_tasks.feedback` 和 `skip_reason` 已写入,但**没聚合到 content_item 维度**。同一篇内容连续 3 个员工都说"小红书审核被卡",**内容打分系统看不见**。

**业务后果**:同样的雷反复踩,内容生产端缺少"现实通过率"信号。

**SQL 草稿**(过去 30 天每条 content 的派单→实际发布完成率):

```sql
SELECT ci.id, ci.title,
       COUNT(pt.id)                                                   AS dispatched_n,
       COUNT(pt.id) FILTER (WHERE pt.status = 'published')            AS published_n,
       array_agg(DISTINCT pt.skip_reason)
         FILTER (WHERE pt.skip_reason IS NOT NULL)                    AS skip_reasons,
       array_agg(DISTINCT pt.feedback) FILTER (WHERE pt.feedback ~ '.{5,}') AS feedback_samples
  FROM content_items ci
  JOIN content_variants cv ON cv.content_item_id = ci.id
  JOIN publish_tasks pt    ON pt.variant_id = cv.id
 WHERE ci.tenant_id = $1
   AND pt.created_at >= now() - interval '30 days'
 GROUP BY ci.id, ci.title
HAVING COUNT(pt.id) >= 3
 ORDER BY (
   COUNT(pt.id) FILTER (WHERE pt.status = 'published')::float
   / NULLIF(COUNT(pt.id), 0)
 ) ASC
 LIMIT 10;
```

**UI 落点**:内容详情 detail 页 + 列表新增「现实通过率」标签(`published_n / dispatched_n`),< 60% 标红「难发布」。

**数据模型变更**:可选 — 给 `content_items` 加 `realworld_publish_rate float` 派生字段(物化加速),不加则每次跑 SQL。

---

### 断点 5 — 可发现层 audit → 内容生产

**该联但没联**:`discoverability_artifacts.audit_score` + `audit_evidence` 知道你 brand 资料 80% 不全(reviewed_by / institution / region 缺失),但**内容向导第 1 步对此一无所知**。生产端继续写新内容,Schema 继续缺字段,audit 永远是红色。

**业务后果**:V1.7 audit 跑出来的红条永远没人理 — 跟内容生产脱节,客户感觉"评分页有什么用?"

**SQL 草稿**(最近 audit 状态):

```sql
SELECT artifact_type,
       audit_score,
       audit_evidence
  FROM discoverability_artifacts
 WHERE tenant_id = $1
 ORDER BY updated_at DESC
 LIMIT 5;
```

**UI 落点**:内容向导 step 1 / step 4 顶部条幅 — "⚠️ 你的 brand 资料缺少 reviewed_by(医生署名)字段,生成后 Schema 会缺失,建议先去 [discoverability/brand] 补全"。

**数据模型变更**:无(全用现有 audit_evidence jsonb)。

---

## 三、Dashboard 主回路页 mock(把 5 断点 visualize 到一页)

```
┌─ /t/[slug] 主页(扩展现有「今日运营」hero) ──────────────────────┐
│                                                                  │
│ 今日运营 │ 本周回路                                              │
│ ─────── │ ──────────────────────────────                        │
│ 32 条上 │ 🔥 高追踪零引用 query(断点 1)                       │
│ 12 引用 │   - "种植牙价格"     12 次追踪 / 0 引用 [建工单]      │
│ ¥18K   │   - "牙周炎能根治吗" 8 次追踪 / 0 引用 [建工单]        │
│         │                                                        │
│ ─────── │ 💰 最赚钱内容 Top 5(断点 3)                          │
│ DoD 通过│   - 「矫正多少钱」       ¥6,800  [复制 5 变体]         │
│ 78%    │   - 「牙周护理」         ¥4,200  [复制 5 变体]         │
│         │                                                        │
│ ─────── │ 📉 高分低发布率内容(断点 4)                          │
│ 待发 6 │   - 「儿牙麻醉」 DoD 92 / 实际发布 40% [看反馈]        │
│         │                                                        │
│ ─────── │ ⚠️ Brand 资料 audit 红条(断点 5)                     │
│ 合规通过│   - 缺 reviewed_by × 12 条内容 [去补全]               │
│ 91%    │   - 缺 institution × 8 条服务   [去补全]               │
└────────────────────────────────────────────────────────────────┘

🔥 AI 热门关键词 Top 10(断点 2,放 /t/[slug]/keywords 头部)
   - 「即刻种植」  18 次引用 / 4 篇内容 [新建]
   - 「隐形矫正」  15 次引用 / 6 篇内容
```

整张页**没有新表、没有新 worker job**(除了断点 2 需要每日刷一次 keywords.meta),纯靠 SQL JOIN + 现有数据展示。

---

## 四、落地优先级建议

| # | 断点 | 客户感知价值 | 工时估计 | 依赖 |
|---|---|---|---|---|
| 1 | 追踪 → 选题工单 | ⭐⭐⭐⭐⭐ | 2d(SQL + UI 卡 + wizard query_param 接入) | 无 |
| 3 | 归因 → 内容业务价值 | ⭐⭐⭐⭐⭐ | 1.5d(SQL + 列表排序 + ¥提示) | conversion_events 有完整 value 数据 |
| 2 | 引用 → 关键词热度 | ⭐⭐⭐ | 1.5d(每日 worker job + UI 列) | 无 |
| 5 | Audit → 生产端 banner | ⭐⭐⭐ | 0.5d(SQL + banner) | 无 |
| 4 | 员工反馈 → 难发布标签 | ⭐⭐ | 1d(SQL + 标签 + 详情页) | 派单数据规模(每条至少 3 次派发) |

**总计**:6.5d 工时,但**真正闭合一台 GEO 平台的"反馈回路"**。

建议执行顺序:1 → 3 → 5 → 2 → 4(高价值低成本优先)。

---

## 五、不做什么(明确排除)

| 项 | 为什么不做 |
|---|---|
| 自动建工单后**自动跑 wizard 生成草稿** | 选题决策必须留给客户 — 自动批量生成会污染内容库,违反 D2 "配置化"精神 |
| 把 5 个断点写成 5 个独立子页 | 反馈回路的价值是"一页看全",拆 5 个子页就回到"14 个 tab 各自孤岛" |
| 给 keywords.meta 加专门的 schema 字段 | 现在 jsonb 一字段够用,加列等真用到再说(D10/D19 纪律) |
| 把 audit 评分硬卡内容生成(不补 brand 就不让写) | 这是体验劫持,客户会反弹。banner 提示 + 一键跳转即可 |

---

## 六、与现有决策的关系

- **D2 配置化**:5 个断点全用通用字段(meta jsonb / keyword_ids / target_questions),不写 `if (industry === 'dental')`
- **D17 build-on-write**:断点 2 的 keywords.meta 刷新走 worker job(`feedback.refresh_keyword_heat`),延续 build-on-write 思想,不在公开路由触发
- **D21 contract → slice → DoD**:断点 1 建工单时,把 question.intent 当 query_intent 透传进 wizard,跟 D21 contract 链路接上
- **`docs/06-discoverability.md` 三层模型**:本文是该图"↑ 反馈"箭头的补全方案

---

## 七、立项决策(给未来的自己)

- 这不是一份 ADR(还没到决策级)
- 这不是一份 Sprint 计划(还没排期)
- 这是一份 **backlog 立项 + SQL 可行性论证 + UI mock**,目的是**当客户问起「这平台到底闭环了没」时,你能在 30 秒内回答得清楚**
- 何时升级为 Sprint:V1.9.x 维稳后(预计 2026-05 月底)+ 客户提出"我每天来这要看啥"反馈后,任一触发即可开 Sprint

---

→ 相关:`docs/06-discoverability.md`(三层模型源头)、`docs/04-roadmap.md` V2 反馈回路条目、`CLAUDE.md` §9 已知技术债

---

## 八、附录:断点 1 执行工单(2026-05-14 切分,zero-overhead 开工)

> 当 V1.9.x 稳定 + 客户提出"该写啥"需求任一触发 → 直接照本附录开工,不需要重新决策。

### 8 个 ±0.25d 子任务

| # | 子任务 | 工时 | 改动定位 |
|---|---|---|---|
| 1 | SQL 设计与本地验证 | 0.25d | `psql` 直连生产只读副本,跑通 + < 50ms |
| 2 | Lib 文件:`apps/web/lib/feedback/zero-citation-queries.ts` | 0.25d | 新文件,见 §8.2 代码草稿 |
| 3 | Tenant home 卡片 Server Component | 0.5d | `apps/web/app/t/[slug]/page.tsx` ~L196 之后(briefing hero 后),见 §8.3 |
| 4 | Wizard 入参接入 | 0.25d | `wizard/page.tsx` searchParams + `wizard-client.tsx` 初值,见 §8.4 |
| 5 | 空态 + 错误态 + 埋点 | 0.25d | `reportError` 包裹 + 显示「最近 14 天无追踪」「无零引用 query」 |
| 6 | 「建工单」按钮跳转 | 0.25d | `<Link href={`/t/${slug}/content/wizard?question_id=${q.id}&primary_query=${encodeURIComponent(q.text)}`} />` |
| 7 | 手测本地 + 生产数据 | 0.25d | 本地 stub 数据 + 生产只读跑一次,确认 wizard 预填正确 |
| 8 | typecheck + 准备 commit | 0.25d | `pnpm --filter @geo/web typecheck`,出 commit 消息 |

**合计 2 天**。

---

### §8.1 SQL 草稿(子任务 1)

走 server-side inline,**不**新建 view(理由:单租户单表 JOIN,RLS 已经把 tenant 隔好;view 多一层 migration 风险,跟 D19 手写纪律冲突无必要)。

```sql
-- 在 zero-citation-queries.ts 里执行
-- 参数:tenant_id (UUID), days (默认 14), min_tracked (默认 3), limit_n (默认 10)

SELECT
  q.id,
  q.text,
  q.intent,
  q.city,
  q.priority,
  COUNT(DISTINCT s.id) AS tracked_n,
  MAX(s.asked_at)      AS last_tracked_at
FROM questions q
JOIN geo_snapshots s
  ON s.question_id = q.id
 AND s.tenant_id   = q.tenant_id
 AND s.status      = 'parsed'
 AND s.deleted_at  IS NULL
LEFT JOIN citations c
  ON c.snapshot_id      = s.id
 AND c.tenant_id        = s.tenant_id
 AND c.brand_mentioned  = true
 AND c.deleted_at       IS NULL
WHERE q.tenant_id  = $1
  AND q.deleted_at IS NULL
  AND s.created_at >= now() - ($2 || ' days')::interval
GROUP BY q.id, q.text, q.intent, q.city, q.priority
HAVING COUNT(DISTINCT s.id) >= $3
   AND COUNT(c.id)          = 0
ORDER BY tracked_n DESC, q.priority DESC
LIMIT $4;
```

**性能预算**:< 50ms(已有索引 `geo_snapshots(tenant_id, created_at)`、`citations(snapshot_id)`)。
**RLS**:经 Server Component 走 `supabase` 用户 cookie,自动应用 questions / geo_snapshots / citations 的 `tenant_isolation` policy。

---

### §8.2 Lib 文件草稿(子任务 2)

```ts
// apps/web/lib/feedback/zero-citation-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportError } from '@geo/shared';

export type ZeroCitationQuery = {
  id: string;
  text: string;
  intent: string | null;
  city: string | null;
  priority: number;
  tracked_n: number;
  last_tracked_at: string | null;
};

/**
 * 反馈回路断点 1 (docs/08 §2.断点 1): 过去 N 天追踪 ≥ min_tracked
 * 次但 0 次品牌引用的 question — 推给客户作为「该补内容」建议.
 *
 * Server-only (uses authenticated supabase client; RLS isolates tenant).
 */
export async function getZeroCitationQueries(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { days?: number; minTracked?: number; limit?: number } = {},
): Promise<ZeroCitationQuery[]> {
  const days       = opts.days ?? 14;
  const minTracked = opts.minTracked ?? 3;
  const limit      = opts.limit ?? 10;

  // .rpc() 包裹一个 SQL function,or use .from with manual joins.
  // 简化:走单个 RPC `feedback_zero_citation_queries(tenant_id, days, min_tracked, limit)`
  // 该 RPC 是 SECURITY INVOKER (走调用方 RLS),不是 SECURITY DEFINER (避免越权).
  const { data, error } = await supabase.rpc('feedback_zero_citation_queries', {
    p_tenant_id:   tenantId,
    p_days:        days,
    p_min_tracked: minTracked,
    p_limit:       limit,
  });

  if (error) {
    reportError(error, {
      scope: 'feedback.zero_citation_queries',
      tenant_id: tenantId,
      extra: { days, minTracked, limit },
    });
    return [];
  }
  return (data ?? []) as ZeroCitationQuery[];
}
```

**额外**:需要 migration `0036_feedback_zero_citation_queries_rpc.sql` 注册 RPC function(SECURITY INVOKER + RLS-aware)。RPC 体就是 §8.1 SQL,wrap 成 `CREATE OR REPLACE FUNCTION ... LANGUAGE sql STABLE`。这是唯一的 schema 改动,严格遵守 D10/D19。

---

### §8.3 Tenant home 卡片 SC(子任务 3)

在 `apps/web/app/t/[slug]/page.tsx` ~L196(nextActions 计算前)加:

```tsx
// ─────────────────────────────────────────────────────────────────
// 反馈回路断点 1 — 高追踪零引用 query (docs/08 §2.断点 1)
// ─────────────────────────────────────────────────────────────────
const zeroCitationQueries = await getZeroCitationQueries(supabase, tenant.id);
```

JSX 块(放在 "今日运营" briefing hero 之后,nextActions 之前):

```tsx
{zeroCitationQueries.length > 0 && (
  <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
    <header className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-base">🔥</span>
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
          高追踪零引用 query <span className="text-zinc-500">· 过去 14 天</span>
        </h2>
      </div>
      <span className="text-[11px] text-zinc-500">反馈回路 · 该补内容</span>
    </header>
    <ul className="divide-y divide-white/5">
      {zeroCitationQueries.map((q) => (
        <li key={q.id} className="flex items-center justify-between py-2.5">
          <div className="min-w-0 flex-1 pr-3">
            <p className="truncate text-sm text-zinc-100">{q.text}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {q.tracked_n} 次追踪 · 0 次品牌引用
              {q.city ? ` · ${q.city}` : ''}
              {q.intent ? ` · ${q.intent}` : ''}
            </p>
          </div>
          <Link
            href={`/t/${tenant.slug}/content/wizard?question_id=${q.id}&primary_query=${encodeURIComponent(q.text)}`}
            className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-400/20"
          >
            建工单
          </Link>
        </li>
      ))}
    </ul>
  </section>
)}
```

**样式风格**:与 V1.9.x cinematic redesign(emerald-400 信号色 + zinc-900 卡底)一致,复用 `/t/[slug]/page.tsx` 现有 token。

---

### §8.4 Wizard 入参接入(子任务 4)

#### `wizard/page.tsx`(Server Component)

读 searchParams,透传给 client:

```tsx
type SearchParams = {
  question_id?:  string;
  primary_query?: string;
};

export default async function WizardPage(props: {
  params:       { slug: string };
  searchParams: SearchParams;
}) {
  // ... existing tenant / kb loading ...
  return (
    <WizardClient
      // ... existing props ...
      initialQuestionId={props.searchParams.question_id ?? null}
      initialPrimaryQuery={props.searchParams.primary_query ?? null}
    />
  );
}
```

#### `wizard-client.tsx`(Client Component)

在 useState 初值用 prop:

```tsx
// 现有 ~L33 附近 state 改为
const [primaryQuery, setPrimaryQuery] = useState(initialPrimaryQuery ?? '');
const [queryIntent, setQueryIntent] = useState<QueryIntent | ''>('');
// 注: queryIntent 还需要从 question_id 反查 questions.intent → 映射到
// content_contract.query_intent 8 枚举。映射表见 docs/07-geo-article-spec.md。
// 简化方案: V1 先只预填 primaryQuery,intent 让用户自己选(已有下拉).
// 完整方案 (V2): 加 useEffect 用 question_id fetch question.intent
//                 + 映射到 query_intent enum.
```

**注**:`questions.intent` 是另一套枚举(`question_intent` type),跟 `content_contracts.query_intent`(D21 8 枚举)不直接 1:1 映射。需要小映射表。V1 落地可以先只预填 `primary_query`,intent 让用户自己选(成本最小)。

---

### §8.5 验收 checklist

- [ ] **SQL**:本地 psql 跑通,样本数据 ≥ 1 条命中,< 50ms
- [ ] **RPC migration 0036**:`feedback_zero_citation_queries` 是 SECURITY INVOKER 不是 DEFINER(RLS 必须保留)
- [ ] **跨租户隔离测试**:另一租户登录看不到任何泄露(沿用 `db:test-rls` 模式)
- [ ] **空态**:全新租户(无追踪数据)显示「最近 14 天无追踪数据」灰条,**不闪 empty array**
- [ ] **错误态**:RPC 报错时 tenant home 不白屏,反馈卡内显示"加载失败",`reportError` 上报
- [ ] **建工单跳转**:点按钮 → wizard step 1,`primary_query` 字段已预填,URL 带 `question_id`
- [ ] **typecheck 通过**:`pnpm --filter @geo/web typecheck`
- [ ] **生产数据 sanity check**:用真实租户登录看见至少 1 条建议(如果没有 → 改 14 天 / 30 天阈值)
- [ ] **NOT a feature flag**:这是反馈回路第一步,不藏在 flag 下,直接对所有租户开

---

### §8.6 commit 拆分建议

```
commit 1: feat(db): migration 0036 — feedback_zero_citation_queries RPC
commit 2: feat(feedback): zero-citation-queries lib + tenant home card
commit 3: feat(wizard): accept question_id + primary_query from URL
```

3 个 atomic commit,出问题独立 revert 不会带塌前面两个。

---

### §8.7 何时开工 — 触发条件

满足**任一**即可开:
- V1.9.x 主线维稳 7 天无 P0(预计 2026-05-21 之后)
- 客户老板或运营主动提出"我每天来这要看什么内容该补"
- 数据准备充分:`geo_snapshots` 累计 ≥ 500 条 parsed status + `citations` 解析准确率 > 80%(否则零引用 query 太多噪音)

**触发后**:直接照 §8.1-§8.6 顺序开工,无需新决策。

---

## 九、附录:相邻 V2 工单 — 权威文献引用源(Verified Literature Source)

> 立项探路:2026-05-15
> 状态:**backlog 候选,未进 V2 主路线图**(进入条件见 §9.5)
> 起源:用户审视 K-Dense AI scientific-agent-skills(135 skills)后定位的"对 GEO 有用的 3 个数据库" — 完整评估见本节

### §9.1 问题陈述

现有 `verified_citations` 表是**人工白名单**:客户医生填"《2023 种植体周围炎临床诊疗指南》"等指南名,LLM 引用强约束 + sanitizer 兜底。两个真痛点未解:

1. **填表慢**:每条指南医生手填 4-5 个元数据(标题/别名/issuer/year/url),且容易填错
2. **「医学权威」叙事弱**:LLM 写"骨结合率 93%(5 年随访)"时,**没有真实 DOI / 期刊** 做后援,客户老板感觉"内容看起来不够专业"

### §9.2 方案 — 接 2 个公开 API(非 Python)

**重大事实更正(2026-05-15)**:之前判定"接 PubMed 要起 Python worker,违反 D7" → 实测错。**ClinicalTrials.gov v2 API + NCBI Entrez E-utilities(PubMed)都是公开 REST,TS 直接 fetch 即可**。Python 只是包装层,不是必需。

| API | Auth | 复杂度 | 客户场景 |
|---|---|---|---|
| ClinicalTrials.gov v2 (`/studies?query.cond=...`) | 无 key | 低 — JSON / 标准 REST / cursor 分页 | 临床进展、设备/材料试验数据 |
| NCBI E-utilities (PubMed `esearch` + `efetch`) | 无 key(限 3 req/s,有 key 可到 10) | 中 — XML 响应需要 parse,但已有 `xml-js` / `fast-xml-parser` 可用 | 论文标题/DOI/作者/期刊/年份 |

**实现路径**(workspace 切分):
```
packages/geo-core/src/literature/
├── clinicaltrials.ts      # ClinicalTrials.gov v2 thin wrapper
├── pubmed-entrez.ts       # NCBI E-utilities (esearch + esummary)
└── index.ts               # 统一 LiteratureLookup 接口

apps/worker/src/jobs/
└── verify-literature.ts   # 异步 enrich verified_citations.auto_metadata

apps/web/app/t/[slug]/compliance/.../verified-citations/
└── auto-suggest-button.tsx # 医生填指南名时一键反查
```

**数据模型变更**:`verified_citations` 加 `auto_metadata jsonb`(已有 jsonb 习惯,P0/D10 友好)。Migration 0037 单张表加列,< 10 行 SQL。

**用户路径**:
1. 医生在 `/t/[slug]/settings/audit/verified-citations/new` 填指南名
2. 失焦自动 enqueue 反查 job
3. 后台跑 ClinicalTrials.gov + PubMed 各拉 top 5
4. UI 显示"找到 3 篇可能匹配,请挑一个 confirm" + 自动填 DOI/year/issuer
5. 拒绝/无匹配 → 保持人工填(向后兼容)

### §9.3 工时下调(因 TS-only 实现)

| 子项 | 工时(原估)| 工时(实测后) |
|---|---|---|
| Migration 0037 加 auto_metadata 列 | 0.25d | 0.25d |
| `clinicaltrials.ts` thin wrapper + 5 单测 | 0.5d | 0.5d |
| `pubmed-entrez.ts` + XML parse + 5 单测 | 1d | 0.75d |
| worker job `verify-literature` | 0.5d | 0.5d |
| UI auto-suggest button + match picker | 0.75d | 0.75d |
| LLM prompt 注入"权威文献池"(可选)| 0.5d | 0.5d |
| 集成 + 手测 + typecheck | 0.25d | 0.25d |
| **合计** | **4-5d**(原:含 Python worker 通信) | **3.5d** |

**省下的 1-1.5 天**全部来自"不必引 Python" — Worker 还是 Node.js,API 是 REST,DX 跟现有 `geo-snapshot.ts` / `compliance-auto-rewrite.ts` 完全一致。

### §9.4 不做什么(明确排除)

| 项 | 为什么不做 |
|---|---|
| 引入 K-Dense `scientific-agent-skills` 仓库整体 | 135 skills 里 90% 跟医疗营销无关,污染心智模型 |
| 接入 K-Dense 其他 75 个数据库(基因/蛋白/材料……)| 不沾边,引入即技术债 |
| 自建 CNKI / 万方 中文文献库爬虫 | 反爬 + 付费墙,V2 不碰,等 V3 联系正式 API 授权 |
| 把"自动查到的文献"直接当 `verified` 入白名单 | 必须经医生 confirm,自动入会引入未审权威 |
| 用 PubMed 内容**直接**翻译进 LLM prompt | 版权 + 内容质量风险,只用元数据(标题/DOI/期刊),不用全文摘要 |

### §9.5 何时升级为 Sprint(触发条件)

满足**任一**即可开工:

- 客户医生主动反馈"verified_citations 填表麻烦"或"内容引用看起来不专业"
- 客户老板想做"医生科普 PR 文章 / 出海英文版"(此时 PubMed/ClinicalTrials.gov 真用得上)
- V2 反馈回路(§2 5 断点)做完后还有余量,且接 2 个真正英文医学受众的客户

**不建议触发**:V1.9.x 维稳期 / 客户没主动提需求 / 律所/教育/月子中心客户(他们不需要科学文献背书)

### §9.6 K-Dense 资源的"正确用法"

**不引入仓库**,但**摘抄 `database-lookup/references/*.md` 当 API onboarding 资料**(MIT 许可允许)。具体只摘:
- `clinicaltrials.md`(已读,API v2 速查)
- NCBI Entrez 相关(在 `biopython` skill 的 references 里,待 Sprint 启动时拉)
- 可选:`fda.md`(只对出海客户有用)

**`/Users/dulijuner/.claude/skills/` 私人收藏**:可以装一份 K-Dense database-lookup,自己平时跨项目查数据库,**但不进 GEO Studio 项目代码**。

### §9.7 与现有决策的关系

- **D7 单语言**:不破(TS 直接 fetch REST,无 Python)
- **D10 schema migration**:延续(新增 0037 单列)
- **D5/D12 合规四道门**:加固(verified_citations 自动反查 → 减少医生填错伪造文献概率)
- **D18 Schema 生成纪律**:互补(reviewed_by / institution / region 这些字段可以从 ClinicalTrials.gov 的 lead_sponsor / location_module 拉)
- **`docs/06` 三层模型**:这是 **B → A 反馈**的一种 — 内容引用回流 Schema.org JSON-LD 的 `citation` 字段(目前空)

---

→ 相关:K-Dense AI scientific-agent-skills (https://github.com/K-Dense-AI/scientific-agent-skills) — 不引入,资料可摘抄

---

## 十、与 `docs/09` 日常运营自动化的关系

`docs/09-daily-ops-automation.md`(立项 2026-05-19)是 **sibling 主题**,**先于本文档执行**:

| | docs/09 | docs/08 |
|---|---|---|
| 主题 | **B 层自动化**(把内容生产线 cron 起来) | **C→B 反馈**(把追踪/引用数据反哺 B 层) |
| 触发 | 客户"每天盯着烦"(已触发 2026-05-19) | 客户对"AI 选题智能化"提需求 |
| 工时 | 5.5d | 6.5d(本文 5 断点全做完)|
| 优先级 | V1.10 P0 | V2 候选 |

**执行序**:V1.10 docs/09 → V1.11 docs/08 §8 断点 1 → V2 docs/08 其余 + §9。

**两者接口**:docs/09 的 `daily_ops_settings.topic_source` 字段 enum 默认 `questions_priority`,V2 切到 `feedback_loop` 一行配置完成升级 — **不动 cron / 不动 UI / 不动派单**。这是 D-Ops-9 的本意:把选题源做成可插拔。

