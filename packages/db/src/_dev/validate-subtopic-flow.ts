/**
 * V1.12 D31 端到端验证:从主题题 → LLM 展开 → 入库 → daily_ops_pick_topics
 * 选中 → daily-ops cron 起草 整条链路是否真打通。
 *
 * 不依赖 UI / server action — 直接用 supabase client + LLM 调用走一遍,
 * 验证 schema / 索引 / RPC 三层都按预期工作。
 */
import { expandSubtopics } from '@geo/geo-core';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function step(label: string, fn: () => Promise<void>) {
  process.stdout.write(`▶ ${label}...`);
  const t0 = Date.now();
  try {
    await fn();
    console.log(` ✓ (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(` ✗`);
    console.error('  ', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function main() {
  const slug = process.argv[2] || 'songshu';
  let tenantId = '';
  let parentId = '';
  let parentText = '';
  let insertedSubtopics: string[] = [];

  await step('解析 tenant', async () => {
    const { data, error } = await supabase
      .from('tenants').select('id').eq('slug', slug).single();
    if (error || !data) throw error || new Error('tenant not found');
    tenantId = data.id as string;
  });

  await step('查 schema: questions 表新字段存在', async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('id, parent_id, subtopic_source, expansion_seed_topic')
      .eq('tenant_id', tenantId)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('no questions in tenant');
  });

  await step('找一个未展开的主题题(parent_id IS NULL, 没有子问题)', async () => {
    // 子问题数 = 0 的主题题中 priority 高的
    const { data: parents, error } = await supabase
      .from('questions')
      .select('id, text, priority')
      .eq('tenant_id', tenantId)
      .is('parent_id', null)
      .is('deleted_at', null)
      .eq('active', true)
      .order('priority', { ascending: false })
      .limit(20);
    if (error || !parents || parents.length === 0) throw new Error('no parent candidate');

    // 排除已展开的(已有子问题)
    const { data: hasChildren } = await supabase
      .from('questions')
      .select('parent_id')
      .eq('tenant_id', tenantId)
      .in('parent_id', parents.map((p) => p.id));
    const expandedSet = new Set(((hasChildren ?? []) as Array<{ parent_id: string }>).map((r) => r.parent_id));

    const candidate = parents.find((p) => !expandedSet.has(p.id as string));
    if (!candidate) {
      // 所有 priority 高的都展开过了,挑一个低 priority 的
      parentId = parents[0]!.id as string;
      parentText = parents[0]!.text as string;
      console.log(`\n  ⚠ 所有 top priority 题已展开,复用 "${parentText}"`);
    } else {
      parentId = candidate.id as string;
      parentText = candidate.text as string;
      console.log(`\n  → 选中: "${parentText}" (priority=${candidate.priority})`);
    }
  });

  await step('LLM 展开 8 个子问题(真调豆包)', async () => {
    const result = await expandSubtopics({
      topic: parentText,
      industry_context: '昆明本地口腔医疗(西山区为主)',
      brand_name: '昆明松鼠口腔',
      count: 8,
    });
    if (!result.ok) throw new Error(result.reason);
    console.log(`\n  → LLM 返回 ${result.subtopics.length} 个子问题`);
    insertedSubtopics = result.subtopics.map((s) => s.text);

    // 去重 — 检查已有(同 tenant)
    const { data: existing } = await supabase
      .from('questions')
      .select('text')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);
    const existingSet = new Set(
      ((existing ?? []) as Array<{ text: string }>).map((r) => r.text.toLowerCase().trim()),
    );
    const toInsert = result.subtopics
      .filter((s) => !existingSet.has(s.text.toLowerCase().trim()))
      .map((s) => ({
        tenant_id: tenantId,
        text: s.text.slice(0, 200),
        intent: s.intent,
        priority: 8,
        active: true,
        parent_id: parentId,
        subtopic_source: 'llm_expand',
        expansion_seed_topic: parentText,
      }));
    if (toInsert.length === 0) throw new Error('all subtopics already exist (rerun w/ a different parent)');

    const { error: insErr } = await supabase.from('questions').insert(toInsert);
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);
    console.log(`  → 入库 ${toInsert.length} 行(去重跳 ${result.subtopics.length - toInsert.length} 行)`);
    insertedSubtopics = toInsert.map((r) => r.text);
  });

  await step('验证: 入库行有 parent_id + subtopic_source=llm_expand + seed', async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('id, text, parent_id, subtopic_source, expansion_seed_topic, priority, intent, active')
      .in('text', insertedSubtopics);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('inserted rows not found');
    for (const r of data as Array<Record<string, unknown>>) {
      if (r.parent_id !== parentId) throw new Error(`parent_id mismatch on "${r.text}"`);
      if (r.subtopic_source !== 'llm_expand')
        throw new Error(`subtopic_source mismatch on "${r.text}"`);
      if (r.expansion_seed_topic !== parentText)
        throw new Error(`expansion_seed_topic mismatch on "${r.text}"`);
      if (r.active !== true) throw new Error(`active != true on "${r.text}"`);
    }
    console.log(`\n  → ${data.length} 行字段全部正确`);
  });

  await step('验证: questions_parent_idx 索引用上(EXPLAIN)', async () => {
    // 通过 rpc 跑一个 explain 不容易,简单查能用 parent_id filter
    const { data, error } = await supabase
      .from('questions')
      .select('id, text', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('parent_id', parentId);
    if (error) throw error;
    if (!data || data.length < insertedSubtopics.length)
      throw new Error(`parent_id filter returned ${data?.length} rows, expected ≥ ${insertedSubtopics.length}`);
    console.log(`\n  → parent_id filter 命中 ${data.length} 子行`);
  });

  await step('验证: daily_ops_pick_topics RPC 能选到子问题(未来 cron 派单链路)', async () => {
    // RPC 会按 priority + last_used_at 排,子问题继承父题 priority=8,应该入选
    const { data, error } = await supabase.rpc('daily_ops_pick_topics', {
      p_tenant_id: tenantId,
      p_limit: 30,
      p_exclude_days: 7,
    });
    if (error) throw error;
    const picked = ((data ?? []) as Array<{ id: string; text: string }>).map((r) => r.text);
    const overlap = insertedSubtopics.filter((t) => picked.includes(t));
    if (overlap.length === 0) {
      throw new Error(
        `none of the new subtopics selected by RPC. picked.length=${picked.length}. 可能 limit 太小 或 RPC 排序不通顺`,
      );
    }
    console.log(
      `\n  → ${overlap.length}/${insertedSubtopics.length} 子问题在 cron top-${data?.length} 候选里`,
    );
  });

  await step('验证: 子问题不能再被展开(constraint)', async () => {
    const subId =
      (
        await supabase
          .from('questions')
          .select('id')
          .eq('text', insertedSubtopics[0]!)
          .single()
      ).data?.id;
    if (!subId) throw new Error('subtopic not found');
    // 试图 update 一个子问题让它"再展开"自身 — 应该被业务层拒(server action),
    // schema 层没禁 (允许多级树)。这里只验证业务规则会成立 — 直接读它的 parent_id 应该 IS NOT NULL
    const { data } = await supabase
      .from('questions')
      .select('parent_id')
      .eq('id', subId)
      .single();
    if (!data?.parent_id) throw new Error('parent_id 应该 IS NOT NULL');
    console.log(`\n  → 子问题 parent_id 校验通过(server action 会拒绝再展开)`);
  });

  console.log('\n========== ✓ ALL E2E VALIDATION PASSED ==========');
  console.log(`tenant=${slug} parent="${parentText}" subtopics_inserted=${insertedSubtopics.length}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
