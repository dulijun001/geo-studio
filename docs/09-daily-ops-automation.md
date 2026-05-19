# 09 — 日常运营自动化(Daily Ops Auto-Pipeline)

> **立项日期**:2026-05-19
> **状态**:V1.10 候选 — **优先级 P0**(客户当前最痛运营痛点)
> **触发条件**:已触发(客户 2026-05-19 主动反馈"每天都要盯,太麻烦")
>
> **一句话**:把客户"每天人肉跑选题→起草→审→派单"压缩成"每天 30 秒审 + 异常时介入",其余全自动。

---

## 一、问题陈述

### 客户现状(每天)

```
客户人肉 5 步:
1. 选题:翻问题库 / 凭感觉                          ~10 min
2. 触发 AI 起草:V1.9 batch UI 手点                  ~3 min
3. 等合规 → 审 4-15 篇 audit(rejected/auto_rewrite) ~15 min
4. 一条条点派单 → 选员工                              ~7 min
5. 监控员工打卡情况                                   ~5 min
────────────────────────────────────────────
                                      合计 ~40 min/day
```

客户原话:**"每天都要盯着发送给他们,太麻烦了"**。
真实表达:**"我希望只在异常时介入"**。

### 业务后果

- 客户每天**主动登录系统**40 分钟才能维持运转,中断 1 天即"停摆"
- 出差/生病/周末 = 当天 0 内容产出
- 系统的"反馈回路"(docs/08)做了也意义减半 — 客户根本没时间消化建议

---

## 二、方案 — Daily Ops Auto-Pipeline

### 2.1 流程图(ASCII)

```
┌────────────────────────────────────────────────────────────────┐
│  T-1 day 23:59  客户手填位锁定                                 │
│    客户白天什么时候填都行,23:59 之前的写法定型                  │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 02:00  cron #1 — nightly-draft                            │
│    创建 daily_ops_runs (status=picking_topics)                  │
│    混合选题: 5 抽(questions.priority×last_used) + 2 手填位      │
│    入 V1.9 batch_drafts (复用)                                   │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 02:00 - 03:30  起草批处理(~7 题 × ~5 平台 = ~35 变体)     │
│    每个 variant 跑完触发(全复用现有 V1.9.x):                    │
│    ├ extractSlices         (D21 §1 slice-first)                 │
│    ├ evaluateDod           (D21 DoD 闸门)                       │
│    ├ compliance.review job (D5/D12 四道门)                      │
│    └ auto-rewrite if rejected (D5/D12 §13.3,max 1×)            │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  ~03:30  自动放行规则(本 feature 新加):                       │
│                                                                │
│    绿色 (auto_approve_for_dispatch):                            │
│      dod_status='passed'                                       │
│      AND compliance_status='auto_approved'                     │
│      AND auto_rewrite_count = 0                                │
│      AND numeric_fact_check.status != 'warning'                │
│                                                                │
│    黄色 (needs_review_soft):                                    │
│      auto_rewrite_count >= 1 OR numeric_fact_check='warning'   │
│                                                                │
│    红色 (needs_review_rejected):                                │
│      compliance_status='rejected'                              │
│                                                                │
│    黑色 (needs_review_dod_failed):                              │
│      dod_status='failed'                                       │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 09:00  通知 + 待审窗口启动(本 feature 新加):              │
│    /t/[slug]/today 页:                                          │
│      ┌─────────────────────────────────────┐                   │
│      │ 今日待审 · 共 35 篇(28 绿 5 黄 1 红 1 黑)│                   │
│      │ 🟢 28 篇默认通过 ▾ [批量 confirm]    │                   │
│      │ 🟡 5 篇软异常 [逐条审]               │                   │
│      │ 🔴 1 篇合规拒 [改/丢]                │                   │
│      │ ⚫ 1 篇 DoD 不过 [改/丢]              │                   │
│      │                                       │                   │
│      │ ⏱ 6h 倒计时启动 → 超时绿色默认派      │                   │
│      └─────────────────────────────────────┘                   │
│    邮件给 tenant owner(V2 加企微/短信)                          │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 09:00 - 15:00  客户审核窗口(6h):                         │
│    客户可:                                                      │
│      - 批量 approve 绿色                                         │
│      - 逐条审黄/红/黑                                            │
│      - 手动改 → 回 V1.9 流程重审                                 │
│      - 不动 → 进入超时分支                                        │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 15:00  cron #2 — auto-dispatch-timeout(本 feature 新加): │
│    绿色 (auto_approve_for_dispatch):                            │
│      → ready_for_dispatch                                       │
│      → 派单 (复用 V1.5 dispatchToday 算法)                      │
│      → run.status = 'auto_dispatched_partial'                  │
│                                                                │
│    黄/红/黑:                                                    │
│      → stay (等客户回来)                                         │
│      → run.status = 'awaiting_manual'                          │
│      → 24h 后再发一封邮件提醒                                    │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Day 15:00 - 18:00  派单:                                      │
│    publish_tasks 给员工(N 个员工 × N 个变体)                    │
│    走 V1.5 派单算法(防撞车 / 人设匹配 / 节奏控制)                │
└────────────────────────────────────────────────────────────────┘
                            ↓
                员工收到打卡卡(V1.9.3 7 平台跳转)
```

### 2.2 数据模型变更

migration `0036_daily_ops.sql`:

```sql
-- 每日 run 的生命周期
CREATE TABLE public.daily_ops_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_date        date NOT NULL,
  status          text NOT NULL CHECK (status IN (
    'picking_topics',
    'drafting',
    'evaluating',
    'awaiting_review',
    'auto_dispatched_partial',
    'awaiting_manual',
    'completed',
    'failed'
  )),
  -- 选题快照
  picked_question_ids uuid[] NOT NULL DEFAULT '{}',
  manual_slots        jsonb  NOT NULL DEFAULT '[]'::jsonb,
    -- [{topic, audience, platforms[]}, ...]
  -- 关联
  batch_draft_id  uuid REFERENCES public.draft_batches(id),
  -- 计数
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {planned, drafted, green, yellow, red, black, dispatched, manual_pending}
  -- 时间线
  started_at      timestamptz NOT NULL DEFAULT now(),
  drafted_at      timestamptz,
  notified_at     timestamptz,
  reviewed_at     timestamptz,
  dispatched_at   timestamptz,
  completed_at    timestamptz,
  -- 异常
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX daily_ops_runs_tenant_date_uq
  ON daily_ops_runs (tenant_id, run_date) WHERE deleted_at IS NULL;

CREATE INDEX daily_ops_runs_status_idx
  ON daily_ops_runs (tenant_id, status) WHERE deleted_at IS NULL;

ALTER TABLE public.daily_ops_runs ENABLE ROW LEVEL SECURITY;
-- (policies 略,复用 tenant_isolation 模板)

-- 租户级配置
CREATE TABLE public.daily_ops_settings (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  run_cron         text    NOT NULL DEFAULT '0 2 * * *',  -- 默认每天 02:00
  topic_count_auto integer NOT NULL DEFAULT 5  CHECK (topic_count_auto BETWEEN 0 AND 15),
  manual_slot_max  integer NOT NULL DEFAULT 2  CHECK (manual_slot_max BETWEEN 0 AND 5),
  timeout_hours    integer NOT NULL DEFAULT 6  CHECK (timeout_hours IN (2,4,6,8,12,24)),
  weekend_skip     boolean NOT NULL DEFAULT false,
  max_variants_day integer NOT NULL DEFAULT 50, -- 防员工矩阵被淹没
  notify_channels  text[]  NOT NULL DEFAULT ARRAY['in_app','email'],
    -- V2 加 'wecom','sms'
  notify_email     text,
  -- 选题源(V2 切到反馈回路时只改这里)
  topic_source     text NOT NULL DEFAULT 'questions_priority'
    CHECK (topic_source IN ('questions_priority', 'feedback_loop', 'hybrid')),
  -- 平台覆盖
  platforms        text[] NOT NULL DEFAULT ARRAY['xiaohongshu','douyin_script','wechat_mp','zhihu','toutiao_article'],
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_ops_settings ENABLE ROW LEVEL SECURITY;
-- (policies 略)

-- variants 关联反查
ALTER TABLE public.content_variants
  ADD COLUMN IF NOT EXISTS daily_run_id uuid REFERENCES public.daily_ops_runs(id);

CREATE INDEX content_variants_daily_run_idx
  ON public.content_variants (daily_run_id) WHERE deleted_at IS NULL;
```

### 2.3 自动放行规则(SQL 草稿)

```sql
-- 跑在 cron #2 (auto-dispatch-timeout) 里,把符合条件的 variant 标 ready
UPDATE public.content_variants cv
   SET status = 'ready_for_dispatch',
       updated_at = now()
  FROM public.daily_ops_runs run
 WHERE cv.daily_run_id = run.id
   AND run.tenant_id = $1
   AND run.run_date = current_date
   AND cv.tenant_id = run.tenant_id
   AND cv.deleted_at IS NULL
   AND cv.status = 'draft'
   AND cv.dod_status = 'passed'
   AND cv.compliance_status = 'auto_approved'
   AND cv.auto_rewrite_count = 0
   AND (cv.dod_evidence->>'numeric_fact_check_status' IS NULL
        OR cv.dod_evidence->>'numeric_fact_check_status' != 'warning')
RETURNING cv.id;
```

---

## 三、工时分解(5.5 天)

| # | 子任务 | 工时 | 文件 |
|---|---|---|---|
| 1 | migration 0036 + RLS policies | 0.5d | `supabase/migrations/0036_daily_ops.sql` |
| 2 | 选题选择器(混合 5+2 算法) | 0.5d | `apps/worker/src/jobs/lib/topic-picker.ts` |
| 3 | cron job #1: `nightly-draft` | 0.5d | `apps/worker/src/jobs/nightly-draft.ts` + pg-boss schedule |
| 4 | 客户手填位 UI(`/today/manual-slots`) | 0.5d | `apps/web/app/t/[slug]/today/manual-slots/page.tsx` |
| 5 | 自动放行 + 状态分类规则 | 0.5d | `apps/worker/src/jobs/auto-classify.ts` |
| 6 | `/t/[slug]/today` 待审页(4 类筛选 + 批量 approve) | 1d | `apps/web/app/t/[slug]/today/page.tsx` |
| 7 | 通知:站内 banner + 邮件模板 | 0.5d | `packages/shared/src/notify/email.ts` + nodemailer |
| 8 | cron job #2: `auto-dispatch-timeout` | 0.5d | `apps/worker/src/jobs/auto-dispatch-timeout.ts` |
| 9 | 设置页(`/settings/daily-ops`) | 0.25d | `apps/web/app/t/[slug]/settings/daily-ops/page.tsx` |
| 10 | reportError 全链路埋点 + 失败兜底 | 0.25d | (跨 worker jobs) |
| 11 | 集成测试 + UAT | 0.5d | `packages/db/src/_test/daily-ops-flow.ts` |

**合计 5.5 天**

---

## 四、关键设计决策

| # | 决策 | 理由 |
|---|---|---|
| D-Ops-1 | cron 走 pg-boss(D7 已有栈)| 不引新调度组件,跟 V1.9 batch / compliance-auto-rewrite 一致 |
| D-Ops-2 | 默认每天跑,客户可关周末 | 客户痛点是"每天都要盯",每天默认最匹配语义 |
| D-Ops-3 | 6h 超时默认,可配 2/4/6/8/12/24h | 6h = 上午 9 点到下午 3 点,合理审核窗口 |
| D-Ops-4 | 通知 V1 站内 + 邮件;V2 企微/短信 | 邮件零成本,企微要走企业号 OAuth(成本 5×) |
| D-Ops-5 | 黄/红/黑异常**永不**自动派 | 合规红线,4 道门一道不通就不发(D5/D12) |
| D-Ops-6 | 手填位前一日 23:59 锁定 | 给客户白天填的时间,凌晨跑就用前一日的填法,防 race condition |
| D-Ops-7 | 客户白天改手填位 = 影响**明天** run | 简单粗暴,不允许"今天改影响今天" |
| D-Ops-8 | 节流:每日变体总数 ≤ 50(可配) | 防员工矩阵被淹没,超出 spill 到次日 |
| D-Ops-9 | 选题源可切换(`topic_source` enum)| **预留 docs/08 反馈回路接入口** — V2 把 `questions_priority` 切 `feedback_loop` 一行配置完成 |
| D-Ops-10 | `daily_ops_runs` 单 tenant_id+run_date UNIQUE | 防止 cron 重复触发产生 2 个 run |

---

## 五、不做什么(明确排除)

| 项 | 为什么不做 |
|---|---|
| 自动派单**直接发到平台 App** | **D3 红线**,绝不碰 — 员工实名号,自动化=封号集体事件 |
| 客户什么都不审 100% 自动 | 合规风险 + 客户失去掌控感,丢失"老板心安"溢价 |
| 选题用 LLM 灵感生成 | 选题源就是 questions / 反馈回路 / 客户手填 — 不引外部 LLM 创意,**防 LLM 跑偏制造合规风险话题** |
| 内容跨平台同文复用 | 跟 V1.7 内容独特性检测冲突,且豆包 GEO 喜欢平台原生 |
| 自动 A/B 测试 | V3 再说,V1 不堆功能 |
| 节假日自动停 | 复杂度高(节假日表 / 多地区),V2 客户手填日历替代 |
| 出错自动重试整个 run | pg-boss 已有 per-job retry,run 级别重试要客户决策,不自动 |

---

## 六、与现有决策的关系

| 决策 | 关系 |
|---|---|
| **D3** 发布不自动化到 App | ✅ 不破 — 派的是 publish_tasks 到员工手机,员工手发 |
| **D5/D12** 合规四道门 | ✅ 完全保留 — 异常永不自动放行 |
| **D7** TS 单语言 | ✅ 不破 — pg-boss / nodemailer 都是 npm 包 |
| **D10** schema migration | ✅ 遵守 — migration 0036 手写 |
| **D17** build-on-write 缓存 | ✅ 类似思想 — daily run 物化所有数据,/today 页单查询读 |
| **D21** contract → slice → DoD | ✅ 复用 — 自动放行核心就是 DoD 通过 |
| **docs/08** 反馈回路 | 🔗 **并行,不依赖** — V1.10 上完后切到反馈回路只改 `topic_source` 字段 |

---

## 七、与 docs/08 优先级对比

| 维度 | docs/09 (本) | docs/08 §8 断点 1 | docs/08 §9 文献引用源 |
|---|---|---|---|
| 客户痛点直击 | ⭐⭐⭐⭐⭐ 每天都被卡 | ⭐⭐⭐⭐ 选题智能化 | ⭐⭐⭐ 权威性提升 |
| 工时 | 5.5d | 2d | 3.5d |
| 价值密度(⭐/d)| 0.91 | 2.00 | 0.86 |
| 解放客户时间 | **~40 min/day** | ~10 min/week | ~5 min/case |
| 触发条件 | **✅ 已触发** | V1.9 稳定 7d | 客户主动 |

**建议执行顺序**:
```
V1.10  docs/09 (本) ──── 让客户先省事
V1.11  docs/08 §8  ──── 再让选题智能化
V2     docs/08 §9  ──── 再让权威性升级
```

---

## 八、何时升级为 Sprint(触发条件)

✅ **已触发**(2026-05-19 客户反馈)。

进入条件已满足:
- 客户主动提"每天盯着烦"(✅ 2026-05-19)
- V1.9.x 主线稳定 7 天无 P0(预计 2026-05-21 满足)

**建议开工时机**:2026-05-21 之后,7 天内交付 V1.10 dev demo。

---

## 九、验收 checklist(给未来开工时用)

- [ ] migration 0036 在生产应用,RLS 跨租户隔离测试通过(`db:test-rls` 模式)
- [ ] cron #1 凌晨 02:00 触发,daily_ops_runs 产生新行
- [ ] 选题 5 抽 + 2 手填位算法测试覆盖(空手填 / 部分手填 / 全手填)
- [ ] batch_draft 跑完 35 变体后,自动放行规则**只**让符合 4 条件的进 ready
- [ ] /today 页 4 类筛选 + 批量 approve(绿色)正常工作
- [ ] 邮件能发到客户邮箱(本地 `mailhog` 验证 / 生产 SES/阿里云邮件)
- [ ] cron #2 15:00 触发,超时自动派只派绿色,黄红黑 stay
- [ ] 派单后员工 7 平台跳转(V1.9.3 已 ship)正常
- [ ] 失败兜底:LLM 全失败 → run.status=failed + 邮件告警
- [ ] 节流 max_variants_day:超出 spill 到次日的逻辑测试
- [ ] 周末跳过 weekend_skip toggle 测试
- [ ] 用户首次开启 enabled 时,有 onboarding 引导填 manual_slots

---

## 十、与 docs 体系的关系

- `docs/04-roadmap.md` V1.10 新模块(待加)
- `docs/08-feedback-loops.md` cross-reference(待加)
- `CLAUDE.md` §9 已知技术债 → 「已立项」类目添加(待加)

→ 相关:`docs/08-feedback-loops.md`(C→B 反馈,sibling 主题)、V1.9 `draft_batches` (commit 4bba685)、V1.5 派单算法、V1.9.3 staff 7 平台跳转(commit d6f90b7)
