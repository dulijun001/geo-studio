-- 0032_dod_gate: D21 / ADR 009 P2-4 — Definition of Done gate.
--
-- 每篇 content_item 和每条 content_variant 生成后立刻跑一次 L2 评分,把
-- 总分 + 缺项快照成 dod_* 字段。派单环节 (dispatchToday) 过滤掉 dod_failed.
--
-- 状态机:
--   unknown       — 默认(extractor / scorer 未跑)
--   passed        — L2 总分 ≥ threshold AND 关键 slice 齐
--   failed        — L2 总分 < threshold OR 关键 slice 缺失
--   legacy_passed — V1.5 / V1.6 已审通过老内容(不强制重写)
--   manual_pass   — 管理员手动覆盖 failed → 放行(审计追溯)
--
-- 渐进式开启策略:
--   - 老内容(此 migration 跑时已存在)默认标 legacy_passed
--   - 新生成内容默认 unknown,生成后立刻评估
--   - dispatchToday filter:`dod_status NOT IN ('failed')` — 即 failed 之外全放
--   - 后续如要严格,把 filter 改 `dod_status IN ('passed','manual_pass')`

-- ── content_items.dod_* ─────────────────────────────────────────────────

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS dod_status text NOT NULL DEFAULT 'unknown'
    CHECK (dod_status IN ('unknown','passed','failed','legacy_passed','manual_pass')),
  ADD COLUMN IF NOT EXISTS dod_score int CHECK (dod_score IS NULL OR (dod_score >= 0 AND dod_score <= 100)),
  ADD COLUMN IF NOT EXISTS dod_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dod_evaluated_at timestamptz;

COMMENT ON COLUMN public.content_items.dod_status IS
  'D21 / ADR 009: Definition of Done gate state. failed → not dispatchable. legacy_passed → V1.5/V1.6 grandfather (this migration set it for pre-existing rows). manual_pass → admin override + audit trail (see dod_evidence.override_by).';

COMMENT ON COLUMN public.content_items.dod_evidence IS
  'Snapshot when dod was evaluated: { l2_total, l2_breakdown, missing_slices: [...], reasons: [...], override_by, override_at, override_reason }';

-- ── content_variants.dod_* ──────────────────────────────────────────────
-- Variants get their own dod because body differs per platform — a content_item
-- may pass overall but its 抖音 variant may fail (FAQ ≥5 doesn't apply to scripts).

ALTER TABLE public.content_variants
  ADD COLUMN IF NOT EXISTS dod_status text NOT NULL DEFAULT 'unknown'
    CHECK (dod_status IN ('unknown','passed','failed','legacy_passed','manual_pass')),
  ADD COLUMN IF NOT EXISTS dod_score int CHECK (dod_score IS NULL OR (dod_score >= 0 AND dod_score <= 100)),
  ADD COLUMN IF NOT EXISTS dod_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dod_evaluated_at timestamptz;

COMMENT ON COLUMN public.content_variants.dod_status IS
  'D21 / ADR 009: Per-platform Definition of Done. dispatchToday excludes failed. See content_items.dod_status for state machine.';

-- ── Indexes for dispatch filter ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS content_variants_dispatchable_idx
  ON public.content_variants (tenant_id, compliance_status)
  WHERE deleted_at IS NULL AND dod_status <> 'failed';

CREATE INDEX IF NOT EXISTS content_items_dod_idx
  ON public.content_items (tenant_id, dod_status)
  WHERE deleted_at IS NULL;

-- ── Grandfather pre-existing rows ──────────────────────────────────────
-- All rows that existed before this migration are marked legacy_passed —
-- they passed V1.5/V1.6 review (if approved) and we don't retroactively
-- block them. New rows default to 'unknown' and get evaluated by scorer.

UPDATE public.content_items
   SET dod_status = 'legacy_passed'
 WHERE dod_status = 'unknown'
   AND deleted_at IS NULL;

UPDATE public.content_variants
   SET dod_status = 'legacy_passed'
 WHERE dod_status = 'unknown'
   AND deleted_at IS NULL;
