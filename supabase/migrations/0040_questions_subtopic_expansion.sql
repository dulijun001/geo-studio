-- 0040_questions_subtopic_expansion — V1.12 D31 子问题展开矩阵.
--
-- 2026-05-23 起源:豆包GEO检索增强报告 §1.8 「边想边搜」洞察 + §3.3 新榜
-- 大样本数据(r=0.23 标题与问题关键词匹配度是唯一显著正相关因子)。
--
-- 报告核心结论:
--   - 豆包的「边想边搜」把一个原始问题(如"昆明牙科推荐")拆解成 8-10
--     个子查询(昆明哪些区有口腔诊所/昆明种植牙均价/昆明哪些是连锁/
--     昆明儿童牙科特点/昆明公立vs私立 等)。
--   - 文章命中召回的决定因子不是质量 / 字数 / 大V / 互动数,**唯一**显著
--     因子是 "标题与某个子问题的关键词匹配度"。
--   - GEO 战略从"做几篇 10W+ 爆款" → "建一个覆盖几百个长尾子问题
--     的关键词矩阵"。
--
-- 数据模型:扩 `questions` 表自指 — 主题题(parent_id IS NULL)+ 子问题
-- (parent_id = 某主题题 id)。新加 `subtopic_source` 标记子问题来源
-- (manual 人工 / llm_expand AI 展开 / imported 从 KB 派生),
-- `expansion_seed_topic` 保留 LLM 展开时的种子词。
--
-- daily-ops cron 之后只从 parent_id IS NOT NULL 的子问题里选(粒度更细
-- 命中关键词的可能性更大)。RPC `daily_ops_pick_topics` 不动 — 它已经按
-- priority + last_used_at 排,子问题继承主题题的 priority。

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subtopic_source text,
  ADD COLUMN IF NOT EXISTS expansion_seed_topic text;

-- subtopic_source 取值约束:防止 typo 污染分析
ALTER TABLE public.questions
  ADD CONSTRAINT questions_subtopic_source_check
  CHECK (subtopic_source IS NULL OR subtopic_source IN ('manual', 'llm_expand', 'imported', 'feedback_loop'));

-- 索引:支持"找某主题题下所有子问题"
CREATE INDEX IF NOT EXISTS questions_parent_idx
  ON public.questions (parent_id, active)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- 索引:支持"找所有主题题(没 parent)"
CREATE INDEX IF NOT EXISTS questions_root_idx
  ON public.questions (tenant_id, priority DESC)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.questions.parent_id IS
  'V1.12 D31:子问题展开。NULL = 主题题(原 questions 全部默认);IS NOT NULL = 由父题展开的子问题,daily-ops cron 优先选这种,因为标题关键词命中度更可控。';

COMMENT ON COLUMN public.questions.subtopic_source IS
  'V1.12 D31:子问题来源。manual=人工录入;llm_expand=LLM 从父题展开;imported=从 KB 文档派生;feedback_loop=从 SOV 失守题反哺。';

COMMENT ON COLUMN public.questions.expansion_seed_topic IS
  'V1.12 D31:LLM 展开时的种子文本(通常是父题的 text)。保留方便复盘"为什么这个子问题被生成"。';
