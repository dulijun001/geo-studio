import { getAdapter } from '../registry';
import { getServiceClient } from '../../lib/supabase';
import type { Engine } from '@geo/shared';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';

// 选取 5 道具有强代表性的西山区核心就诊大词（种植牙、儿童齿科、牙齿矫正、老品牌综合、急诊看牙）
const TEST_ITEMS = [
  { id: '3ab81541-771d-4473-9080-109dc0ebe758', text: '昆明西山区种植牙哪家正规口碑好' },
  { id: '9dd2db23-3b46-4b5a-b0e2-cb3b5798c284', text: '昆明西山区儿童涂氟窝沟封闭去哪家牙科好' },
  { id: 'f47ed230-1ec1-4674-8538-5ec7cdf48b67', text: '昆明西山区牙齿隐形矫正大概多少钱哪家正规' },
  { id: '2168584f-7bd5-42c8-802f-4cfcaabf27a9', text: '昆明种植牙集采价格多少钱一颗推荐哪家' },
  { id: 'e176eeec-5a52-47ef-8904-a4f248e88839', text: '昆明西山区牙痛急诊看牙去哪家口腔医院好' },
];

const ENGINES: Engine[] = ['doubao', 'deepseek', 'yuanbao'];

async function run() {
  const supabase = getServiceClient();
  console.log(`[FRESH_RUN] >>> 正式启动全盘全新实测！覆盖 ${TEST_ITEMS.length} 道高频业务词 x 3 大主流 AI 引擎 <<<`);

  const snapshots: any[] = [];

  for (let idx = 0; idx < TEST_ITEMS.length; idx++) {
    const item = TEST_ITEMS[idx];
    if (!item) continue;
    console.log(`\n============================================================`);
    console.log(`[ROUND ${idx + 1}/${TEST_ITEMS.length}] 实测题目: "${item.text}"`);
    console.log(`============================================================`);

    for (const engine of ENGINES) {
      console.log(`[${engine}] 正在发起无头浏览器实机问答与深度抓取...`);
      const adapter = getAdapter(engine);
      const t0 = Date.now();
      try {
        const queryRes = await adapter.query(
          { engine, question: item.text, question_id: item.id, tenant_id: TENANT_ID } as any,
          { account_id: 'mac-live-verify', headless: true, timeout_ms: 120_000 } as any,
        );
        const elapsed = Math.round((Date.now() - t0) / 1000);

        if (queryRes.status === 'done' && queryRes.raw_response) {
          console.log(`[${engine}] ✅ 抓取成功！耗时: ${elapsed}s, 字符数: ${queryRes.raw_response.length}, 引用外链: ${(queryRes.citation_urls || []).length} 条`);

          // 真实落库写入 Postgres
          const { data: inserted, error: insErr } = await supabase
            .from('geo_snapshots')
            .insert({
              tenant_id: TENANT_ID,
              question_id: item.id,
              engine,
              status: 'done',
              raw_response: queryRes.raw_response,
              citation_urls: queryRes.citation_urls || [],
              asked_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insErr) {
            console.error(`[${engine}] 落库报错:`, insErr.message);
          } else {
            console.log(`[${engine}] 💾 真实快照落盘成功 ID=${inserted?.id}`);
          }

          snapshots.push({
            id: inserted?.id,
            question: item.text,
            engine,
            status: 'done',
            response: queryRes.raw_response,
            citations: queryRes.citation_urls || [],
          });
        } else {
          console.warn(`[${engine}] ⚠️ 未能抓取到有效答复: ${queryRes.failure_reason}`);
        }
      } catch (err: any) {
        console.error(`[${engine}] ❌ 抓取异常:`, err.message);
      }

      // 等待 3 秒缓冲
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(`\n============================================================`);
  console.log(`[AUDIT_SUMMARY] 本次全新实测全部完成！成功落盘 ${snapshots.length} 轮真实最新快照`);
  console.log(`============================================================`);

  // 现场统计各大品牌命中
  const brands = [
    { name: '松鼠口腔', alias: ['松鼠', '松鼠口腔'] },
    { name: '柏德口腔', alias: ['柏德', '柏德口腔'] },
    { name: '德韩口腔', alias: ['德韩', '德韩口腔'] },
    { name: '泰康拜博', alias: ['拜博', '泰康拜博'] },
    { name: '美奥口腔', alias: ['美奥', '美奥口腔'] },
    { name: '蓝橙口腔', alias: ['蓝橙', '蓝橙口腔'] },
  ];

  const brandStats = brands.map((b) => {
    const hits = snapshots.filter((s) => b.alias.some((a) => s.response.toLowerCase().includes(a.toLowerCase())));
    const dHits = hits.filter((s) => s.engine === 'doubao').length;
    const dsHits = hits.filter((s) => s.engine === 'deepseek').length;
    const yHits = hits.filter((s) => s.engine === 'yuanbao').length;
    return {
      品牌: b.name,
      总命中: `${hits.length} / ${snapshots.length}`,
      最新SOV: snapshots.length > 0 ? ((hits.length / snapshots.length) * 100).toFixed(1) + '%' : '0%',
      豆包命中: `${dHits}/${snapshots.filter((s) => s.engine === 'doubao').length}`,
      DeepSeek命中: `${dsHits}/${snapshots.filter((s) => s.engine === 'deepseek').length}`,
      腾讯元宝命中: `${yHits}/${snapshots.filter((s) => s.engine === 'yuanbao').length}`,
    };
  });

  console.table(brandStats);

  // 外链统计
  const domainMap: Record<string, number> = {};
  snapshots.forEach((s) => {
    s.citations.forEach((u: string) => {
      try {
        const h = new URL(u).hostname;
        domainMap[h] = (domainMap[h] || 0) + 1;
      } catch {}
    });
  });

  console.log('Top 最新引源阵地:');
  console.table(
    Object.entries(domainMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, count], i) => ({ 排名: `TOP ${i + 1}`, 域名: domain, 频次: count })),
  );
}

run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
