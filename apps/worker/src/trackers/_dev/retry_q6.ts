import { getAdapter } from '../registry.ts';
import { getServiceClient } from '../../lib/supabase.ts';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';

async function main() {
  const supabase = getServiceClient();
  const qId = '6e55c147-1901-44c9-8522-39b4332df495';
  const qText = '种植牙韩系登腾和瑞士 ITI 怎么选？';

  console.log(`[RETRY] 正在重试第 6 题: "${qText}"...`);
  const adapter = getAdapter('deepseek');
  const res = await adapter.query(
    { engine: 'deepseek', question: qText, question_id: qId, tenant_id: TENANT_ID } as any,
    { account_id: 'mac-live-retry-' + Date.now(), headless: true, timeout_ms: 120_000 } as any
  );

  console.log('Status:', res.status, 'len:', res.raw_response?.length, 'reason:', res.failure_reason);

  if (res.status === 'done' && res.raw_response) {
    const { data: inserted, error } = await supabase
      .from('geo_snapshots')
      .insert({
        tenant_id: TENANT_ID,
        question_id: qId,
        engine: 'deepseek',
        status: 'done',
        raw_response: res.raw_response,
        citation_urls: res.citation_urls || [],
        asked_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('落库错误:', error);
    } else {
      console.log('💾 落库成功 ID:', inserted?.id);
    }
  }
}

main().catch(console.error);
