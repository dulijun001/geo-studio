/**
 * 挖引擎推荐提问 —— 把 geo_snapshots 里已有答案末尾的「豆包推荐提问」挖出来,
 * 过一遍现有入库闸门,报告能给题库补多少道**真实**新题(D65,2026-09-11)。
 *
 * 干跑不写库;统计口径全部打印出来让人核对,别当黑盒信。
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_mine-related-questions.ts [tenant_slug]
 */
import {
  extractRelatedQuestions,
  isNearDuplicateQuestion,
  questionGeoTier,
  questionPriority,
} from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

async function main() {
  const slug = process.argv[2]?.startsWith('--') ? 'songshu' : (process.argv[2] ?? 'songshu');
  const apply = process.argv.includes('--apply');
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id, slug').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant slug='${slug}' not found`);

  const { data: snaps, error } = await client
    .from('geo_snapshots')
    .select('id, raw_response, question_id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'done')
    .limit(1000);
  if (error) throw new Error(JSON.stringify(error));
  if (!snaps?.length) throw new Error('没有 done 快照');

  // D32 只在 expandSubtopics 的提示词里管着竞品名,没有代码级闸。这里复用已有的
  // brand_vocab competitor 词表做 grep,不新造词表。另加一条泛化规则兜住词表没收录的机构。
  const { data: vocabRows } = await client
    .from('brand_vocab')
    .select('term, term_type, aliases')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const compTerms = (vocabRows ?? [])
    .filter((v) => v.term_type === 'competitor')
    .flatMap((v) => [v.term as string, ...((v.aliases ?? []) as string[])])
    .filter(Boolean);
  const ownTerms = (vocabRows ?? [])
    .filter((v) => v.term_type === 'brand')
    .flatMap((v) => [v.term as string, ...((v.aliases ?? []) as string[])])
    .filter(Boolean);

  const { data: existingRows } = await client
    .from('questions')
    .select('id, text, intent')
    .eq('tenant_id', tenant.id);
  const qTextById = new Map<string, string>();
  const existing = (existingRows ?? []).map((q) => {
    qTextById.set(q.id as string, q.text as string);
    return { text: q.text as string, intent: q.intent as string | null };
  });
  const have = new Set(existing.map((q) => norm(q.text)));

  let withBlock = 0;
  let lowConf = 0;
  const all = new Map<string, number>(); // 问题 → 被几条答案推荐过
  // 问题 → 第一次推荐它的那道源题 id。入库时挂成 parent_id:
  // picker RPC 有 `parent_id IS NOT NULL` 硬条件(D31),不挂就永远选不中 = 入库了等于没入。
  // 语义上也对:豆包就是在说「问完这道题的人接着会问 X」,源题天然是它的父题。
  const parentOf = new Map<string, string>();

  for (const s of snaps) {
    const r = extractRelatedQuestions(s.raw_response ?? '');
    if (r.questions.length === 0) continue;
    if (!r.doubled) {
      lowConf += 1;
      continue; // 低置信的直接丢,宁可少挖不可挖错
    }
    withBlock += 1;
    for (const q of r.questions) {
      all.set(q, (all.get(q) ?? 0) + 1);
      if (!parentOf.has(q) && s.question_id) parentOf.set(q, s.question_id as string);
    }
  }

  // 两级过滤:先精确去重,再过 D59 的近重复闸(同地域层级 + 主题核心重叠)。
  // 只做精确去重会把「昆明种牙多少钱」和「昆明种一颗牙大概多少钱」都算新题 —— 那是假新题。
  const exact = [...all.entries()].filter(([q]) => !have.has(norm(q)));
  const pool = [...existing];
  const fresh: [string, number][] = [];
  let nearDup = 0;
  for (const [q, n] of exact.sort((a, b) => b[1] - a[1])) {
    const verdict = isNearDuplicateQuestion({ text: q }, pool);
    if (verdict.duplicate) {
      nearDup += 1;
      continue;
    }
    fresh.push([q, n]);
    pool.push({ text: q, intent: null }); // 新题也进池,防挖出来的题彼此撞车
  }
  const dup = all.size - exact.length;

  console.log(`\ndone 快照:            ${snaps.length}`);
  console.log(`切出推荐区(高置信):   ${withBlock}`);
  console.log(`低置信丢弃:           ${lowConf}`);
  console.log(`去重后不同问题:       ${all.size}`);
  console.log(`题库精确命中已有:     ${dup}`);
  console.log(`过 D59 近重复闸被判重: ${nearDup}`);
  // 带具体他家机构名的题:作为**监测题**有价值(能测竞品 SOV),但 questions 表同时是
  // 起草选题来源,带竞品名的题被拿去起草就触 D32/《广告法》13 条。两者共用一张表,
  // 只能一刀切掉。这是个真实的设计张力,不是我随手过滤。
  // 判「题里有没有点名别人家机构」。
  //
  // 第一版我用泛化正则 /[\u4e00-\u9fa5]{2,10}(医院|口腔|门诊部)/ 兜底,结果把
  // 「昆明西山区哪家口腔医院做牙齿矫正比较好?」也判成了竞品题 —— 那句根本没点名
  // 任何机构,而且正是 D44 说的命中率最高的「地点 + 行动」题型,误杀代价极大。
  // 改成:以 brand_vocab 那 8 个人工维护的竞品词为准,泛化规则只保留「XX大学/省/市
  // + 医院」这种明显是专名的形态,且专名前面不能是哪家/哪些这类疑问限定词。
  const GENERIC_ASK = /(哪家|哪些|哪个|什么|附近|周边|其他|一些|正规|靠谱|好的)$/;
  const namedRival = (q: string): boolean => {
    if (compTerms.some((t) => q.includes(t))) return true;
    if (ownTerms.some((t) => q.includes(t))) return false;
    const m = q.match(/([\u4e00-\u9fa5]{2,12}?)(大学|省|市|区)?[\u4e00-\u9fa5]{0,6}(医院|门诊部|齿科)/);
    if (!m) return false;
    const head = m[1] ?? '';
    if (GENERIC_ASK.test(head)) return false;
    // 「昆明市儿童医院」「云南省第一人民医院」这类带行政区划 + 专名的算点名;
    // 「门诊部」「齿科」口语里几乎只跟专名走(泛指会说「口腔医院」「诊所」),也算。
    if (/(门诊部|齿科)/.test(m[0])) return true;
    return /(大学|省|市立|市儿童|人民|附属|中心)/.test(m[0]);
  };

  const rivalHits = fresh.filter(([q]) => namedRival(q));
  const safe = fresh.filter(([q]) => !namedRival(q));

  console.log(`★ 真正的新题:         ${fresh.length}`);
  console.log(`  其中带他家机构名:   ${rivalHits.length}  ← 起草会触 D32,不能直接入库`);
  console.log(`  ✅ 可直接入库:      ${safe.length}`);

  const geo = fresh.filter(([q]) => questionGeoTier(q) !== 'none');
  const act = fresh.filter(([q]) => /哪家|哪里|多少钱|价格|费用|能不能|可以吗|报销|预约|推荐/.test(q));
  console.log(`  其中带地域词的:     ${geo.length}`);
  console.log(`  其中带行动词的:     ${act.length}`);
  console.log(`  地域+行动都带的:    ${fresh.filter(([q]) => geo.some(([g]) => g === q) && act.some(([a]) => a === q)).length}  ← D44 说这类命中率最高`);

  console.log('\n✅ 可直接入库的新题 Top 20(按被推荐次数):');
  for (const [q, n] of safe.slice(0, 20)) console.log(`  ${String(n).padStart(2)}×  ${q}`);
  console.log('\n⚠️ 带他家机构名、只能当监测题不能起草的(抽样 6 条):');
  for (const [q, n] of rivalHits.slice(0, 6)) console.log(`  ${String(n).padStart(2)}×  ${q}`);

  if (!apply) {
    console.log('\n(干跑。加 --apply 才写库)');
    return;
  }

  const { data: brands } = await client.from('brands').select('id').eq('tenant_id', tenant.id).limit(1);
  const brandId = brands?.[0]?.id ?? null;

  let inserted = 0;
  let redline = 0;
  let noParent = 0;
  const tierCount: Record<number, number> = {};

  for (const [q] of safe) {
    // 复用 topic-replenish 那道题面红线闸(闸4):绝对化词不该出现在题面里
    if (SEED_REDLINE_RE.test(q)) {
      redline += 1;
      continue;
    }
    const parent = parentOf.get(q);
    if (!parent) {
      noParent += 1;
      continue;
    }
    const priority = questionPriority(q); // D68 单点定义
    const { error: insErr } = await client.from('questions').insert({
      tenant_id: tenant.id,
      brand_id: brandId,
      text: q,
      intent: classifyIntent(q),
      city: '昆明',
      priority,
      active: true,
      parent_id: parent,
      subtopic_source: 'feedback_loop',
      expansion_seed_topic: qTextById.get(parent) ?? null,
    });
    if (insErr) {
      console.error(`  插入失败 ${q}: ${insErr.message}`);
      continue;
    }
    inserted += 1;
    tierCount[priority] = (tierCount[priority] ?? 0) + 1;
  }

  console.log('\n=== 入库结果 ===');
  console.log(`已入库:               ${inserted}`);
  console.log(`  找机构·城市级 P12: ${tierCount[12] ?? 0}  ← 唯一实测能上榜的组合`);
  console.log(`  找机构·区县级 P11: ${tierCount[11] ?? 0}`);
  console.log(`  价格/知识型   P5:  ${tierCount[5] ?? 0}  ← 只当追踪题,不进起草带`);
  console.log(`题面红线拦下:         ${redline}`);
  console.log(`没有源题可挂(丢弃):   ${noParent}`);
}

function norm(s: string): string {
  return (s ?? '').replace(/[\s？?。，,、]/g, '').toLowerCase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


/** 题面级红线,与 topic-replenish 的闸4 保持一致。 */
const SEED_REDLINE_RE = /最好|最佳|第一名|排名第一|根治|治愈|无痛|保证|包治/;

/**
 * 轻量 intent 分类。
 * 不调 LLM:这批题是引擎原话,句式很规整,关键词足够分准;而且 intent 会参与 D59 查重,
 * 全塞 'other' 会让这批题彼此过度判重。分错的代价只是排序权重,不影响正确性。
 */
function classifyIntent(q: string): string {
  if (/多少钱|价格|费用|收费|报销|贵不贵|价位/.test(q)) return 'price_inquiry';
  if (/哪家|哪里|哪些|推荐|地址|在哪|营业时间|预约/.test(q)) return 'local_recommendation';
  if (/医生|专家|团队|技术怎么样|资质/.test(q)) return 'doctor_review';
  if (/哪个好|哪个效果|区别|差异|对比|还是/.test(q)) return 'comparison';
  if (/风险|危害|伤害|后遗症|安全|疼|副作用/.test(q)) return 'risk_concern';
  if (/术后|注意事项|护理|恢复|保养|多久能/.test(q)) return 'aftercare';
  if (/流程|原理|怎么做|步骤|周期|多久|成功率/.test(q)) return 'procedure_info';
  return 'other';
}
