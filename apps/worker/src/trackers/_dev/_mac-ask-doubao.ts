import { doubaoWebAdapter } from '../doubao-web';

const QUESTION = process.env.ASK_Q || '昆明西山区种植牙哪家好';

async function main() {
  console.log(`[ask] 问豆包: ${QUESTION}`);
  const r = await doubaoWebAdapter.query(
    { engine: 'doubao', question: QUESTION, city: '昆明', snapshot_id: 'mac-test-1' },
    { account_id: 'mac-local', headless: false, timeout_ms: 90_000 },
  );
  console.log('\n========== 结果 ==========');
  console.log('status:', r.status);
  if (r.failure_reason) console.log('失败原因:', r.failure_reason);
  console.log('\n--- 豆包回答 (前 1500 字) ---\n', (r.raw_response || '').slice(0, 1500));
  console.log('\n--- 引用源 URL (' + (r.citation_urls?.length || 0) + ' 个) ---');
  (r.citation_urls || []).forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  console.log('\n--- meta ---', JSON.stringify(r.meta || {}, null, 2));
}
main().catch((e) => { console.error('[ask] FAILED:', e.message); process.exit(1); });
