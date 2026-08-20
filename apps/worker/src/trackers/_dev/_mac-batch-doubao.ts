import { doubaoWebAdapter } from '../doubao-web';

const QUESTIONS = (process.env.ASK_QS || '').split('|||').filter(Boolean);

function brandRank(text: string): string {
  // 找"松鼠"在答案里的相对位置:第几个被提到的机构(粗略)
  const idx = text.indexOf('松鼠');
  if (idx < 0) return '未出现';
  // 数松鼠之前出现了多少个"医院/口腔/门诊"机构名分隔
  const before = text.slice(0, idx);
  return `出现(前文 ${before.length} 字处)`;
}

async function main() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]!;
    console.log(`\n\n############ [${i + 1}/${QUESTIONS.length}] ${q} ############`);
    try {
      const r = await doubaoWebAdapter.query(
        { engine: 'doubao', question: q, city: '昆明', snapshot_id: `mac-batch-${i}` },
        { account_id: 'mac-local', headless: false, timeout_ms: 100_000 },
      );
      console.log('status:', r.status);
      if (r.status !== 'done') { console.log('失败:', r.failure_reason); continue; }
      const body = r.raw_response || '';
      console.log('松鼠口腔:', brandRank(body));
      console.log('--- 答案全文 ---\n' + body);
      console.log(`--- 引用源 (${r.citation_urls?.length || 0}) ---`);
      (r.citation_urls || []).forEach((u, j) => console.log(`  ${j + 1}. ${u}`));
    } catch (e: any) {
      console.log('ERROR:', e.message);
    }
    // 题间隔 25-45s 拟人,避免风控
    if (i < QUESTIONS.length - 1) {
      const wait = 25000 + Math.floor((i * 7919) % 20000);
      console.log(`\n[等待 ${Math.round(wait/1000)}s 再问下一题...]`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  console.log('\n\n====== 全部完成 ======');
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
