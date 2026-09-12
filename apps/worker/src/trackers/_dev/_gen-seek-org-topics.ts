/**
 * 批量补「找机构型」选题(D68 配套,2026-09-12)。
 *
 * 为什么要补:D68 把产能全导向「找机构型」后,全池这类题只有 60 道,按每天 14 篇
 * 算 4 天见底,然后 RPC 会返回不足 14 道、产能塌掉。规则改了不补池 = 换个方式断供。
 *
 * 造题原料全部来自库里真实数据,不自己编:
 *   术种 = brand_vocab 的 service 词(32 个人工维护的)
 *   地域 = D44/D55 的三级地域词
 *   句式 = 从已上榜和现有找机构题里提取的真实模板
 *
 * 只造「单段式」(纯找机构)。依据:实测单段式 4 道 3 上榜、两段式 28 道 5 上榜
 * —— **注意 n=4 样本极小,这不是结论,只够推翻「必须造两段式」的假设**。
 * 单段式还有一个实际好处:模板化可控,不会造出别扭的中文。
 * 这批题上线跑一轮追踪后,单段式样本会从 4 涨到 60+,那时才谈得上定论(D48 测量先行)。
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   pnpm --filter @geo/worker exec tsx src/trackers/_dev/_gen-seek-org-topics.ts [slug] [--apply]
 */
import {
  isNearDuplicateQuestion,
  type QuestionLike,
  questionKind,
  questionPriority,
} from '@geo/geo-core';
import { getServiceClient } from '../../lib/supabase';

/** 地域:城市级 + 区县级 + 商圈(松鼠实际覆盖的片区,不铺全昆明) */
const GEOS = ['', '西山区', '五华区', '盘龙区', '官渡区', '呈贡区'];
/** 句式模板:全部摘自库里真实存在的问法,不是我编的句子 */
const TEMPLATES = [
  // 首版有第四个模板「昆明{g}哪家口腔医院{s}比较好？」,实跑抽样发现名词类术种会出
  // 「昆明哪家口腔医院全瓷冠比较好？」这种不通的中文(缺动词),已删。剩下三个对
  // 名词和动宾短语都成立。
  (g: string, s: string) => `昆明${g}${s}去哪里好？`,
  (g: string, s: string) => `昆明${g}哪家医院做${s}比较好？`,
  (g: string, s: string) => `昆明${g}${s}哪家比较正规？`,
];
/** 题面红线,与 topic-replenish 闸4 一致 */
const SEED_REDLINE_RE = /最好|最佳|第一名|排名第一|根治|治愈|无痛|保证|包治/;
/** 一次最多入库多少,防一口气灌爆题库 */
const MAX_INSERT = 140;

async function main() {
  const slug = process.argv[2]?.startsWith('--') ? 'songshu' : (process.argv[2] ?? 'songshu');
  const apply = process.argv.includes('--apply');
  const client = getServiceClient();

  const { data: tenants } = await client.from('tenants').select('id').eq('slug', slug).limit(1);
  const tenant = tenants?.[0];
  if (!tenant) throw new Error(`tenant '${slug}' not found`);
  const { data: brands } = await client.from('brands').select('id').eq('tenant_id', tenant.id).limit(1);
  const brandId = brands?.[0]?.id ?? null;

  const { data: vocab } = await client
    .from('brand_vocab')
    .select('term, term_type')
    .eq('tenant_id', tenant.id)
    .eq('term_type', 'service')
    .is('deleted_at', null);
  // 两道清洗,防造出不像人话的题(首版实跑踩到):
  //   1) 去掉括号注释 —— 「烤瓷牙(金属内冠+烤瓷外层)」真实用户不会这么问
  //   2) 只保留**已经在现有题库里出现过**的术种 —— 用证据代替我的语感判断naturalness
  const rawServices = (vocab ?? []).map((v) => (v.term as string) ?? '');

  const { data: existRows } = await client
    .from('questions')
    .select('id, text, intent, parent_id')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null);
  const pool: QuestionLike[] = (existRows ?? []).map((q) => ({
    text: q.text as string,
    intent: q.intent as string | null,
  }));

  const allText = pool.map((q) => q.text).join('\n');
  const services = [
    ...new Set(
      rawServices
        .map((t) => t.replace(/[（(][^）)]*[）)]/g, '').trim())
        .filter((t) => t.length >= 2 && t.length <= 6),
    ),
  ].filter((t) => allText.includes(t));
  if (services.length === 0) throw new Error('清洗后没有可用术种(没有一个在现有题库里出现过)');
  // 挂父题用:优先挂到同术种的既有题上(picker 要求 parent_id 非空,见 D65)
  const parents = (existRows ?? []).filter((q) => q.parent_id == null);
  if (parents.length === 0) throw new Error('题库里没有根题可挂父');

  const candidates: string[] = [];
  for (const s of services) {
    for (const g of GEOS) {
      for (const t of TEMPLATES) candidates.push(t(g, s));
    }
  }

  let redline = 0;
  let notSeek = 0;
  let dup = 0;
  const accepted: string[] = [];
  for (const q of candidates) {
    if (accepted.length >= MAX_INSERT) break;
    if (SEED_REDLINE_RE.test(q)) { redline += 1; continue; }
    if (questionKind(q) !== 'seek_org') { notSeek += 1; continue; }
    if (isNearDuplicateQuestion({ text: q }, pool).duplicate) { dup += 1; continue; }
    accepted.push(q);
    pool.push({ text: q, intent: 'local_recommendation' }); // 同批内也查重
  }

  console.log(`\n服务词:       ${services.length}`);
  console.log(`地域 × 句式:  ${GEOS.length} × ${TEMPLATES.length}`);
  console.log(`候选组合:     ${candidates.length}`);
  console.log(`题面红线拦:   ${redline}`);
  console.log(`不算找机构型: ${notSeek}`);
  console.log(`撞近重复闸:   ${dup}`);
  console.log(`★ 可入库:     ${accepted.length}${accepted.length >= MAX_INSERT ? `(触顶 ${MAX_INSERT})` : ''}`);
  console.log('\n抽样 12 条:');
  for (const q of accepted.slice(0, 12)) console.log(`  P${questionPriority(q)}  ${q}`);

  if (!apply) {
    console.log('\n(干跑。加 --apply 才写库)');
    return;
  }

  let inserted = 0;
  for (let i = 0; i < accepted.length; i += 1) {
    const q = accepted[i] ?? '';
    const parent = parents[i % parents.length];
    const { error } = await client.from('questions').insert({
      tenant_id: tenant.id,
      brand_id: brandId,
      text: q,
      intent: 'local_recommendation',
      city: '昆明',
      priority: questionPriority(q),
      active: true,
      parent_id: parent?.id,
      subtopic_source: 'manual',
      expansion_seed_topic: 'D68 找机构型批量补题',
    });
    if (error) { console.error(`  ${q}: ${error.message}`); continue; }
    inserted += 1;
  }
  console.log(`\n已入库: ${inserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
