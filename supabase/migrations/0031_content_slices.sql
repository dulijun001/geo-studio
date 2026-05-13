-- 0031_content_slices: D21 / ADR 009 P1 — slice-first storage layer.
--
-- 单一 jsonb 字段 `slices` 装所有 typed slices,而不是 9 个独立列:
--   - 后续加字段不需 ALTER TABLE (P2 可能引入新 slice 类型如
--     comparison_table / decision_flowchart 等)
--   - 公开路由 / Schema JSON-LD 用 JSON path 提取,语义自然
--   - 老内容 slices = {} 表示 legacy,extractor 跑过的 NOT empty
--
-- Slice 结构(由 packages/geo-core/src/generation/slice-extractor.ts 填充):
--   {
--     "version": 1,
--     "extracted_at": "2026-05-13T...",
--     "direct_answer": "...",
--     "summary_1": "...",
--     "summary_3": "...",
--     "myth_busting_block": "...",
--     "when_to_seek_care": "...",
--     "faq_pairs": [{"q":"...","a":"..."}, ...],
--     "comparison_points": [{"label":"...","detail":"..."}, ...],
--     "entity_snapshot": {"brand_name":"...","city":"...","reviewed_by":"..."},
--     "trust_block": {"applicable_to":"...","not_replace":"...","seek_care_if":"...","reviewed_by":"...","updated_at":"...","institution":"...","region":"..."}
--   }
--
-- 不是所有字段都要在 slices 里 — 启发式抽取识别不到的 slice 不写入。
-- 后续 P2 上 LLM judge 时把缺失的 slice 用 LLM 抽取补全。

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS slices jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.content_items.slices IS
  'D21 / ADR 009 P1: slice-first 存储。typed slices 装在单一 jsonb 字段(version-tagged)。空 = legacy / extractor 未跑;非空 = 由 slice-extractor 填充。Schema 生成器(ADR 005)、llms.txt、AI Feed、追踪 query matcher 都按 slice path 读,不再 markdown 摘要。';

-- GIN index for path queries (faq_pairs 长 / trust_block 包含等).
CREATE INDEX IF NOT EXISTS content_items_slices_gin
  ON public.content_items USING gin (slices);

-- Partial functional index for "has direct_answer" — 高频公开路由用。
CREATE INDEX IF NOT EXISTS content_items_has_direct_answer_idx
  ON public.content_items (tenant_id)
  WHERE deleted_at IS NULL AND slices ? 'direct_answer';
