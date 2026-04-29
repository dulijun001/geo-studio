-- 0011_customer_journey: 多触点归因基础 — 把每次到店/留咨/成交跟客户
--                         看过的所有内容串起来,用 3 种归因模型分别打分.
--
-- 现状(单触点):一个 conversion_event 只挂一个 hook(暗号),只能回答
-- "客户报了哪个暗号" → 隐含假设 = 单条内容功劳。
--
-- 现实(多触点):客户在豆包搜了 3 个 query,各看了 1-2 条松鼠的内容,
-- 累积到决定来店时报最后看的那条暗号。把"决定贡献"全归给最后那条
-- = 系统性高估 last-touch、低估上游。
--
-- 这次加 3 张表 / 1 个字段:
--   customer_identities  — 谁(用 fingerprint / phone / utm 反查)
--   journey_touchpoints  — 这位客户接触过哪些内容(发布记录 + 时间)
--   conversion_events.identity_id — 把成交事件挂到客户身份
--
-- 然后在应用层(packages/geo-core/src/attribution/)实现 3 种归因模型:
--   linear         所有触点平均分
--   time_decay     越近权重越高(λ=7d)
--   position_based 首末各 40%,中间均分 20%
--
-- UI 在新页面 /t/[slug]/attribution/journey/[id] 展示旅程 + 三模型对比.

CREATE TABLE customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 主键:patient_ref(松鼠内部标识,可以是手机号尾号 / 客户编号)
  patient_ref TEXT,
  -- 浏览器/设备 fingerprint(从 /c/[slug]/checkin 着陆页拿到 utm + ua hash)
  client_fingerprint TEXT,
  -- 第一次看到的渠道暗号(用于溯源)
  first_hook_value TEXT,
  -- 客户元数据(自由形)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX customer_identities_tenant_idx
  ON customer_identities (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX customer_identities_patient_ref_idx
  ON customer_identities (tenant_id, patient_ref) WHERE deleted_at IS NULL AND patient_ref IS NOT NULL;
CREATE INDEX customer_identities_fingerprint_idx
  ON customer_identities (tenant_id, client_fingerprint) WHERE deleted_at IS NULL AND client_fingerprint IS NOT NULL;

COMMENT ON TABLE customer_identities IS
  '客户身份去重:同一客户可能多次接触多条内容,归因要先把这些事件聚到一个客户上.';

-- ───────────────────────────────────────────────────────────────────────
-- 触点表:某客户在某时间看了某条 publish_task(对应一条具体发布的变体)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE journey_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES customer_identities(id) ON DELETE CASCADE,
  -- 触发触点的发布任务(必填):员工的哪条发布
  publish_task_id UUID,
  -- 触点类型:click / view / share / phone / wechat / arrived 等
  touchpoint_type TEXT NOT NULL DEFAULT 'view',
  -- 触发时间(从客户端着陆页 / 暗号上报得到)
  touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 上报时带的元数据(utm 参数 / 引荐 url / 客户输入的暗号)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX journey_touchpoints_identity_idx
  ON journey_touchpoints (identity_id, touched_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX journey_touchpoints_tenant_time_idx
  ON journey_touchpoints (tenant_id, touched_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE journey_touchpoints IS
  '客户旅程中的每一次接触.归因时按 identity_id 串起来打分.';

-- ───────────────────────────────────────────────────────────────────────
-- conversion_events 加 identity_id 关联回客户身份(向后兼容,可空)
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE conversion_events
  ADD COLUMN IF NOT EXISTS identity_id UUID REFERENCES customer_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversion_events_identity_idx
  ON conversion_events (identity_id) WHERE deleted_at IS NULL AND identity_id IS NOT NULL;

COMMENT ON COLUMN conversion_events.identity_id IS
  '关联到 customer_identities.归因时通过这个找到该客户的所有 touchpoints.';
