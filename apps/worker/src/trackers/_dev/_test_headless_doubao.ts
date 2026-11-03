import { getAdapter } from '../registry';
import type { Engine } from '@geo/shared';

async function main() {
  const engine = 'doubao' as Engine;
  const q = '昆明树脂补牙哪里好？';
  const adapter = getAdapter(engine);
  console.log(`[try] engine=${engine} q=${q}`);
  const t0 = Date.now();
  const r = await adapter.query(
    { engine, question: q, question_id: 'dev', tenant_id: 'b05a40ce-2800-472f-81e9-83fe53a622cb' } as never,
    { account_id: 'mac-local', headless: true, timeout_ms: 120_000 } as never,
  );
  console.log(`[try] status=${r.status} len=${(r.raw_response ?? '').length} ${Date.now() - t0}ms`);
  if (r.failure_reason) console.log(`[try] fail: ${r.failure_reason}`);
  if (r.raw_response) console.log(`[try] 正文前 400 字:\n${r.raw_response.slice(0, 400)}`);
  console.log(`[try] 引用源 ${(r.citation_urls ?? []).length} 条:`, r.citation_urls);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
