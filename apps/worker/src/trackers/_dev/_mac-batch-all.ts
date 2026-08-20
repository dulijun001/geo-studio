/**
 * 一次性:安全间隔批量追踪松鼠全部活跃题 → 落库 geo_snapshots + citations。
 * 复用 handleGeoSnapshot（熔断/落库/brand scan/citations 全走系统正规逻辑）。
 * 间隔 300-900s 随机（= D43 后系统标准，防豆包风控加深黑分）。
 * 用法: SONGSHU_TENANT=<uuid> tsx src/trackers/_dev/_mac-batch-all.ts
 * 断点续跑安全: 只挑「今天还没成功追踪过」的题，重跑不会重复打已 done 的题。
 */
import { getServiceClient } from '../../lib/supabase';
import { handleGeoSnapshot } from '../../jobs/geo-snapshot';

const TENANT = process.env.SONGSHU_TENANT!;
const ENGINE = 'doubao' as const;
const MIN_GAP_S = 300;
const MAX_GAP_S = 900;

function gapSec(i: number): number {
  // 拟人抖动，用题序做种子避免 Math.random（可复现、也够散）
  return MIN_GAP_S + ((i * 137 + 41) % (MAX_GAP_S - MIN_GAP_S));
}

async function main() {
  const client = getServiceClient();

  // 只取今天(UTC date)还没成功追踪的活跃题，支持断点续跑
  const { data: qs, error } = await client
    .from('questions')
    .select('id, text')
    .eq('active', true)
    .order('priority', { ascending: false });
  if (error || !qs) { console.error('[batch] 查题失败:', error?.message); process.exit(1); }

  const todo: { id: string; text: string }[] = [];
  for (const q of qs) {
    const { count } = await client
      .from('geo_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('question_id', q.id).eq('engine', ENGINE).eq('status', 'done')
      .gte('asked_at', new Date(Date.now() - 20 * 3600 * 1000).toISOString());
    if (!count) todo.push(q as any);
  }

  const LIMIT = process.env.BATCH_LIMIT ? parseInt(process.env.BATCH_LIMIT, 10) : todo.length;
  const run = todo.slice(0, LIMIT);
  console.log(`[batch] 活跃题 ${qs.length}，本轮待跑(近20h未成功) ${todo.length}，本次执行 ${run.length}。间隔 ${MIN_GAP_S}-${MAX_GAP_S}s。预计 ${Math.round(run.length * ((MIN_GAP_S + MAX_GAP_S) / 2 + 50) / 3600 * 10) / 10}h`);

  let done = 0, failed = 0;
  for (let i = 0; i < run.length; i++) {
    const q = run[i]!;
    // 建 pending row
    const { data: row, error: insErr } = await client
      .from('geo_snapshots')
      .insert({ tenant_id: TENANT, question_id: q.id, engine: ENGINE, status: 'pending' })
      .select('id').single<{ id: string }>();
    if (insErr || !row) { console.log(`PROGRESS ${i + 1}/${run.length} SKIP 建row失败 ${q.text}`); continue; }

    console.log(`PROGRESS ${i + 1}/${run.length} START ${q.text}`);
    try {
      await handleGeoSnapshot({ snapshot_id: row.id, tenant_id: TENANT, question_id: q.id, engine: ENGINE });
      // 读回状态
      const { data: after } = await client.from('geo_snapshots').select('status, citation_urls').eq('id', row.id).single<{ status: string; citation_urls: string[] }>();
      if (after?.status === 'done') { done++; console.log(`PROGRESS ${i + 1}/${run.length} DONE ${q.text} sources=${after.citation_urls?.length ?? 0}`); }
      else { failed++; console.log(`PROGRESS ${i + 1}/${run.length} ${after?.status?.toUpperCase() ?? 'FAIL'} ${q.text}`); }
    } catch (e: any) {
      failed++; console.log(`PROGRESS ${i + 1}/${run.length} ERROR ${q.text} :: ${e.message}`);
    }

    if (i < run.length - 1) {
      const g = gapSec(i);
      console.log(`[batch] 等 ${g}s...  (累计 done=${done} failed=${failed})`);
      await new Promise((r) => setTimeout(r, g * 1000));
    }
  }
  console.log(`BATCH_COMPLETE done=${done} failed=${failed} total=${run.length}`);
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
