/**
 * 直连某个引擎问一题,验 adapter 通不通(2026-09-12)。
 * baseline.ts 写死了豆包,这个可以指定引擎。
 * Usage: _try-engine.ts <engine> "<question>"
 */
import { getAdapter } from '../registry';
import type { Engine } from '@geo/shared';

async function main() {
  const engine = (process.argv[2] ?? 'yuanbao') as Engine;
  const q = process.argv[3] ?? '昆明西山区种牙哪家口腔医院比较正规?';
  const adapter = getAdapter(engine);
  console.log(`[try] engine=${engine} q=${q}`);
  const t0 = Date.now();
  const r = await adapter.query(
    { engine, question: q, question_id: 'dev', tenant_id: 'dev' } as never,
    { account_id: 'mac-local', headless: false, timeout_ms: 180_000 } as never,
  );
  console.log(`[try] status=${r.status} len=${(r.raw_response ?? '').length} ${Date.now() - t0}ms`);
  if (r.failure_reason) console.log(`[try] fail: ${r.failure_reason}`);
  if (r.raw_response) console.log(`[try] 正文前 300 字:\n${r.raw_response.slice(0, 300)}`);
  console.log(`[try] 引用源 ${(r.citation_urls ?? []).length} 条`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
