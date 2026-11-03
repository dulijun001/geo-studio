import { getAdapter } from '../registry.ts';
import { getServiceClient } from '../../lib/supabase.ts';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';

async function main() {
  const supabase = getServiceClient();

  // 1. 获取 10 道 Benchmark 题
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, text')
    .eq('expansion_seed_topic', 'BENCHMARK_10')
    .order('priority', { ascending: false });

  if (error || !questions || questions.length === 0) {
    console.error('获取题目失败:', error);
    process.exit(1);
  }

  console.log(`[LIVE_RUN] >>> 正式开启全新真机实测！共 ${questions.length} 道母题，正在发起 DeepSeek 全量实时探测 <<<`);

  const adapter = getAdapter('deepseek');
  const results: any[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n============================================================`);
    console.log(`[${i + 1}/${questions.length}] 实时发起实机问答: "${q.text}"`);
    console.log(`============================================================`);

    const t0 = Date.now();
    try {
      const res = await adapter.query(
        { engine: 'deepseek', question: q.text, question_id: q.id, tenant_id: TENANT_ID } as any,
        { account_id: 'mac-live-' + Date.now(), headless: true, timeout_ms: 120_000 } as any
      );
      const elapsed = Math.round((Date.now() - t0) / 1000);

      if (res.status === 'done' && res.raw_response) {
        console.log(`✅ 抓取成功！耗时: ${elapsed}s, 字符数: ${res.raw_response.length}`);
        
        // 真实写库
        const { data: inserted, error: insErr } = await supabase
          .from('geo_snapshots')
          .insert({
            tenant_id: TENANT_ID,
            question_id: q.id,
            engine: 'deepseek',
            status: 'done',
            raw_response: res.raw_response,
            citation_urls: res.citation_urls || [],
            asked_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insErr) {
          console.error('落库异常:', insErr.message);
        } else {
          console.log(`💾 实时快照落盘成功 ID=${inserted?.id}`);
        }

        results.push({
          id: inserted?.id,
          question: q.text,
          elapsed,
          len: res.raw_response.length,
          response: res.raw_response,
          songshu_hit: res.raw_response.includes('松鼠'),
          citations: res.citation_urls || [],
        });
      } else {
        console.warn(`⚠️ 抓取失败: ${res.failure_reason}`);
        results.push({
          question: q.text,
          status: 'failed',
          reason: res.failure_reason,
        });
      }
    } catch (e: any) {
      console.error(`❌ 异常: ${e.message}`);
    }

    // 缓冲 2 秒
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n============================================================`);
  console.log(`[SUMMARY] 实时探测完成！成功获取 ${results.filter(r => r.id).length}/${questions.length} 篇最新真机结果`);
  console.log(`============================================================`);

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
