/**
 * D76 自检:无源数字检查跑在**真实已发布内容**上,看能不能抓住那批漏网的。
 * 不改任何数据,只读 + 判定。
 */
import { checkNumericSource, summarizeNumericSource } from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const c = getServiceClient();
  const { data } = await c
    .from('content_variants')
    .select('id, title, body, compliance_status')
    .eq('compliance_status', 'auto_approved')
    .is('deleted_at', null)
    .limit(500);
  const rows = (data ?? []).filter((r) => /[0-9]{1,3}\s*%/.test((r.body as string) ?? ''));

  let flagged = 0;
  let clean = 0;
  const samples: string[] = [];
  for (const r of rows) {
    const res = checkNumericSource((r.body as string) ?? '');
    if (res.verdict === 'pending') {
      flagged += 1;
      if (samples.length < 6) {
        const f = res.findings[0];
        samples.push(
          `  ${String(r.title).slice(0, 26)}\n    ${summarizeNumericSource(res)}｜首处「${f?.claim}」(${f?.reason})`,
        );
      }
    } else clean += 1;
  }

  console.log(`\n已 auto_approved 且正文含百分比的变体:${rows.length} 条`);
  console.log(`  🔴 会被新检查拦下转人审: ${flagged}`);
  console.log(`  ✅ 判定有出处、放行:     ${clean}`);
  console.log(`\n抽样:\n${samples.join('\n')}`);

  // 硬断言:这个检查必须既能抓到东西,也不能全抓（全抓=没有判别力）
  if (rows.length === 0) throw new Error('FAIL: 没有样本可验');
  if (flagged === 0) throw new Error('FAIL: 一条都没抓到,检查失效');
  if (clean === 0) throw new Error('FAIL: 全部抓走,说明规则过严、没有判别力');
  console.log('\n✅ 自检通过（既抓得到、也放得过，有判别力）');
}
main().catch((e) => { console.error(e); process.exit(1); });
