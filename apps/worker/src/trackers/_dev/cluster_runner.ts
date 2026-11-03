import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAdapter } from '../registry.ts';
import { getServiceClient } from '../../lib/supabase.ts';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';

const workerId = parseInt(process.env.WORKER_ID || '0', 10);
const totalWorkers = parseInt(process.env.TOTAL_WORKERS || '1', 10);

async function main() {
  const supabase = getServiceClient();

  // 读取已固化提取的 224 题
  const jsonPath = resolve(process.cwd(), 'src/trackers/_dev/benchmark_224.json');
  const allQuestions: Array<{ id: string; text: string }> = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  // 分片 (Sharding)
  const myQuestions = allQuestions.filter((_, idx) => idx % totalWorkers === workerId);
  console.log(`[Worker ${workerId}/${totalWorkers}] 分配到 ${myQuestions.length} 道题目（总题库 ${allQuestions.length}），正式启动无头实机并发抓取！`);

  const adapter = getAdapter('deepseek');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < myQuestions.length; i++) {
    const q = myQuestions[i];
    console.log(`[Worker ${workerId}] [${i + 1}/${myQuestions.length}] 实测: "${q.text}"`);
    const t0 = Date.now();
    try {
      const res = await adapter.query(
        { engine: 'deepseek', question: q.text, question_id: q.id, tenant_id: TENANT_ID } as any,
        { account_id: `mac-worker-${workerId}-${Date.now()}`, headless: true, timeout_ms: 90_000 } as any
      );
      const elapsed = Math.round((Date.now() - t0) / 1000);

      if (res.status === 'done' && res.raw_response) {
        successCount++;
        const { error: insErr } = await supabase
          .from('geo_snapshots')
          .insert({
            tenant_id: TENANT_ID,
            question_id: q.id,
            engine: 'deepseek',
            status: 'done',
            raw_response: res.raw_response,
            citation_urls: res.citation_urls || [],
            asked_at: new Date().toISOString(),
          });

        if (insErr) {
          console.error(`[Worker ${workerId}] 落库失败:`, insErr.message);
        } else {
          console.log(`[Worker ${workerId}] ✅ 抓取并落库成功 (${elapsed}s, 长度=${res.raw_response.length})`);
        }
      } else {
        failCount++;
        console.warn(`[Worker ${workerId}] ⚠️ 抓取失败: ${res.failure_reason}`);
      }
    } catch (e: any) {
      failCount++;
      console.error(`[Worker ${workerId}] ❌ 异常: ${e.message}`);
    }

    // 随机缓冲 2 ~ 3.5 秒
    const jitter = 2000 + Math.floor(Math.random() * 1500);
    await new Promise(r => setTimeout(r, jitter));
  }

  console.log(`[Worker ${workerId}] 🎉 全部完成！成功: ${successCount}, 失败: ${failCount}`);
}

main().catch(console.error);
