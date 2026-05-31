/**
 * V1.12 D31 backfill: 批量把 songshu 主题题展开成长尾子问题。
 *
 * 用法:
 *   pnpm --filter @geo/worker exec tsx --env-file=../../.env src/_dev/batch-expand-subtopics.ts --tenant songshu --limit 1
 *   pnpm --filter @geo/worker exec tsx --env-file=../../.env src/_dev/batch-expand-subtopics.ts --tenant songshu --all
 *   加 --dry-run 不写库
 *
 * 决策档:CLAUDE.md D31 + docs/research/doubao-geo-mechanism.md
 *   - 豆包"边想边搜"内部把 1 query 拆 8-10 子查询并行召回
 *   - 子问题命中关键词 r=0.23 是唯一显著正相关因子(47.4万样本)
 *
 * 一次性脚本:跑完一次把 70 主题题 → ~560 子问题入库。
 * 之后 daily-ops cron 选题颗粒度从主题 → 子问题。
 */
import { expandSubtopics } from '@geo/geo-core';
import { getServiceClient } from '../lib/supabase';

/**
 * ARK preflight: 跑一次最小成本的子问题展开(1 题 1 子问题),验证账户
 * 余额 + API key + 网络都 OK。比"跑到第 5 题才炸"早 5 分钟拒绝。
 * 失败 → 立刻 abort 整个 batch,不写库,不留半残数据。
 */
async function arkPreflight(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const probe = await expandSubtopics({
    topic: '种植牙能用多久',
    industry_context: 'preflight probe',
    count: 1,
  });
  if (!probe.ok) return { ok: false, reason: probe.reason };
  if (probe.subtopics.length === 0) return { ok: false, reason: 'probe returned 0 subtopics' };
  return { ok: true };
}

type Args = {
  tenant: string;
  limit?: number;
  all: boolean;
  dryRun: boolean;
  count: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);
  return {
    tenant: get('tenant') ?? 'songshu',
    limit: get('limit') ? Number.parseInt(get('limit') ?? '0', 10) : undefined,
    all: has('all'),
    dryRun: has('dry-run'),
    count: Number.parseInt(get('count') ?? '8', 10),
  };
}

async function main() {
  const args = parseArgs();
  const client = getServiceClient();

  // ARK preflight — 防止"跑到一半才发现欠费",留半残数据
  console.log('preflight: probing ARK with 1 minimal call...');
  const pre = await arkPreflight();
  if (!pre.ok) {
    console.error(`✗ ARK preflight failed: ${pre.reason}`);
    console.error('  常见原因:(1) 账户欠费 → console.volcengine.com/ark 充值');
    console.error('           (2) ARK_API_KEY 失效 → 检查 .env');
    console.error('           (3) 网络异常 → 检查代理 / 防火墙');
    console.error('  Aborting — 0 LLM tokens 已被消耗,DB 未写入');
    process.exit(2);
  }
  console.log('✓ ARK preflight ok\n');

  const { data: tenant, error: tErr } = await client
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', args.tenant)
    .is('deleted_at', null)
    .single();
  if (tErr || !tenant) {
    console.error(`tenant not found: ${args.tenant}`);
    process.exit(1);
  }
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  // 找还没展开过的主题题
  let q = client
    .from('questions')
    .select('id, text, intent, city, priority')
    .eq('tenant_id', tenant.id as string)
    .is('parent_id', null)
    .eq('active', true)
    .is('deleted_at', null)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (args.limit && !args.all) q = q.limit(args.limit);
  const { data: topics, error: qErr } = await q;
  if (qErr || !topics) {
    console.error('failed to load topics:', qErr?.message);
    process.exit(1);
  }

  // Filter out topics that already have subtopics
  const topicIds = topics.map((t) => t.id as string);
  const { data: existing } = await client
    .from('questions')
    .select('parent_id')
    .in('parent_id', topicIds)
    .eq('subtopic_source', 'llm_expand')
    .is('deleted_at', null);
  const hasSubtopics = new Set((existing ?? []).map((e) => e.parent_id as string));
  const todo = topics.filter((t) => !hasSubtopics.has(t.id as string));

  console.log(
    `candidates: ${topics.length} themes loaded, ${todo.length} need expansion ` +
      `(${topics.length - todo.length} already have subtopics)`,
  );
  if (args.dryRun) console.log('** DRY RUN — will NOT write to DB **');

  const industryContext =
    tenant.slug === 'songshu' ? '昆明本地口腔医疗(西山区为主)' : '医疗服务';
  const brandName = tenant.name;

  let totalSubs = 0;
  let failed = 0;
  const startAll = Date.now();

  for (let i = 0; i < todo.length; i++) {
    const topic = todo[i];
    if (!topic) continue; // noUncheckedIndexedAccess guard — bounds checked by for-loop
    const t0 = Date.now();
    console.log(
      `\n[${i + 1}/${todo.length}] expanding: "${topic.text}" (priority=${topic.priority})`,
    );
    const result = await expandSubtopics({
      topic: topic.text as string,
      industry_context: industryContext,
      brand_name: brandName as string,
      count: args.count,
    });
    if (!result.ok) {
      console.error(`  ✗ ${result.reason}`);
      failed++;
      continue;
    }
    console.log(
      `  ✓ ${result.subtopics.length} subtopics in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    for (const s of result.subtopics) {
      console.log(`    · [${s.intent}, r=${s.estimated_relevance}] ${s.text}`);
    }

    if (!args.dryRun) {
      const rows = result.subtopics.map((s) => ({
        tenant_id: tenant.id as string,
        text: s.text,
        intent: s.intent,
        city: topic.city ?? null,
        priority: (topic.priority as number) ?? 5, // 0040 注释承诺:子问题继承父题 priority。早先 hardcode=5 是 bug,2026-05-27 修。
        parent_id: topic.id as string,
        subtopic_source: 'llm_expand' as const,
        expansion_seed_topic: topic.text as string,
        active: true,
      }));
      const { error: insErr } = await client.from('questions').insert(rows);
      if (insErr) {
        console.error(`  ! insert failed: ${insErr.message}`);
        failed++;
        continue;
      }
      totalSubs += rows.length;
    } else {
      totalSubs += result.subtopics.length;
    }

    // Throttle: ARK 思考模型 ~10-60s/call, but pause to avoid burst rate limit.
    if (i < todo.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  const elapsed = ((Date.now() - startAll) / 1000).toFixed(1);
  console.log(
    `\n=== done in ${elapsed}s — themes processed: ${todo.length}, ` +
      `subtopics ${args.dryRun ? 'would-write' : 'written'}: ${totalSubs}, failed: ${failed} ===`,
  );
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
