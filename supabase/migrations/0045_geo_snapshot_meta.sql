-- 0045: geo_snapshots.meta — 追踪诊断维度落库(V1.13)
--
-- 动机:D29 的 adapter 诊断维度(sources_expander / 差集数量 / submitted_via)
-- 此前只进 console/Sentry,前端无法区分「引用源=0」的三种语义:
--   a) 无引用面板(纯模型回答,真实 0)
--   b) 有面板且已采集(真实 N)
--   c) 采集失败(测量故障,需检修)
-- 2026-07-11 实测教训:知识题真实 0 与采集器故障在 UI 上不可区分,
-- 与 V1.12.1 前 123 个快照引用全空数月未被发现是同一盲区。
BEGIN;

ALTER TABLE public.geo_snapshots
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.geo_snapshots.meta IS
  'Adapter diagnostic dims (D29): sources_expander, sources_error, submitted_via, elapsed_ms 等。前端据此区分引用 0 的语义。';

COMMIT;
