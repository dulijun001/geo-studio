/**
 * V1.8 综合烟测 — 验证 AI 智能挖掘的合规第 1 道门 + 创作向导起草路径的关键 prompt 装配。
 *
 * Run: pnpm --filter @geo/geo-core exec tsx src/_test/v18-smoke.ts
 */
import { scanKeywords, type KeywordRow } from '../compliance/scanner';
import { buildVariantPrompt, type PromptContext } from '../generation/prompt-builder';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];
function ok(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────
// 1. AI 智能挖掘合规第 1 道门 — 验证 medical 黑名单确实拦截
// ─────────────────────────────────────────────────────────────────
console.log('═══ Section 1: AI 智能挖掘 → 合规第 1 道门 ═══');

const sampleBlacklist: KeywordRow[] = [
  { id: '1', term: '根治', level: 'A', category: 'guarantee', variants: ['根 治'] },
  { id: '2', term: '治愈', level: 'A', category: 'guarantee', variants: [] },
  { id: '3', term: '最好', level: 'A', category: 'absolute', variants: [] },
  { id: '4', term: '首家', level: 'A', category: 'absolute', variants: [] },
  { id: '5', term: '保证', level: 'A', category: 'guarantee', variants: [] },
];

// 模拟 AI 挖掘出来的 50 候选(包含 5 个违规)
const aiCandidates = [
  '种植牙价格', '种植牙流程', '种植牙寿命', '种植牙品牌',
  '昆明种植牙医院', '种植牙术后护理', '种植牙医保', '种植牙风险',
  // ↓ 5 个故意违规的
  '根治牙周病', '永久治愈龋齿', '昆明最好的口腔医院', '首家专业种植中心', '保证种植成功',
  '隐形矫正价格', '儿童牙齿矫正', '正畸方案对比',
];

const accepted: string[] = [];
const rejected: { term: string; reason: string }[] = [];
for (const cand of aiCandidates) {
  const r = scanKeywords(cand, sampleBlacklist);
  if (r.hits.length > 0) {
    rejected.push({ term: cand, reason: r.hits.map((h) => h.term).join(',') });
  } else {
    accepted.push(cand);
  }
}

ok(
  '黑名单拦截了恰好 5 个违规候选',
  rejected.length === 5,
  `accepted=${accepted.length}, rejected=${rejected.length}`,
);
ok('"根治牙周病" 被拒', rejected.some((r) => r.term === '根治牙周病'));
ok('"永久治愈龋齿" 被拒', rejected.some((r) => r.term === '永久治愈龋齿'));
ok('"昆明最好的口腔医院" 被拒', rejected.some((r) => r.term === '昆明最好的口腔医院'));
ok('"首家专业种植中心" 被拒', rejected.some((r) => r.term === '首家专业种植中心'));
ok('"保证种植成功" 被拒', rejected.some((r) => r.term === '保证种植成功'));
ok(
  '正常长尾词全部通过',
  accepted.includes('种植牙价格') &&
    accepted.includes('昆明种植牙医院') &&
    accepted.includes('儿童牙齿矫正'),
);

// ─────────────────────────────────────────────────────────────────
// 2. buildVariantPrompt 端到端样例 — 真实 13 模板风味
// ─────────────────────────────────────────────────────────────────
console.log('\n═══ Section 2: buildVariantPrompt 实战 ═══');

// 模拟从 DB 读出来的 product-comparison 模板
const productComparisonTemplate = {
  name: '产品对比',
  prompt_skeleton: `━━━ 写作角色:第三方测评编辑 ━━━
你的任务是把若干同类产品/方案做客观对比,帮助读者做选择。
- 维度法对比:挑 3-5 个评判维度
- 优先用表格呈现关键维度
- 主品牌(如有)只在客观语境下出现`,
  structure_hint: {
    sections: ['## 我们要对比的方案', '## 评判维度', '## 维度对比表', '## 谁适合哪个'],
    min_sections: 3,
  },
};

const ctx: PromptContext = {
  source_markdown: '种植牙是修复缺失牙齿的方案之一...',
  platform: 'wechat_mp',
  tactics: ['add_quotation', 'add_statistics', 'cite_sources', 'authoritative'],
  brand_name: '示例口腔',
  industry: 'dental',
  topic_hints: ['种植牙', '正畸'],
  keywords_to_plant: ['种植牙价格', '种植体寿命', '昆明种植牙'],
  writing_template: productComparisonTemplate,
  verified_citations: [{ title: '《口腔种植学指南》', aliases: ['种植学指南'] }],
};

const messages = buildVariantPrompt(ctx);
const sys = messages[0]?.content ?? '';
const user = messages[1]?.content ?? '';

ok('返回 2 条消息', messages.length === 2);
ok('System 含合规红线', sys.includes('━━━ 绝对红线(违反即重写) ━━━'));
ok('System 含产品对比角色', sys.includes('━━━ 写作角色:第三方测评编辑 ━━━'));
ok(
  '红线在模板之前(防 prompt injection)',
  sys.indexOf('━━━ 绝对红线') < sys.indexOf('━━━ 写作角色:第三方测评编辑'),
);
ok('User 含 wechat_mp 平台格式', user.includes('微信公众号推文'));
ok('User 含 product-comparison 骨架', user.includes('## 维度对比表'));
ok('User 含 keyword 植入指令', user.includes('必须自然植入的关键词') && user.includes('种植牙价格'));
ok('User 含可引用文献白名单', user.includes('《口腔种植学指南》'));
ok('User 含 GEO 9 法 tactics 块', user.includes('add_quotation') && user.includes('add_statistics'));
ok('User 含 brand_name', user.includes('示例口腔'));

// ─────────────────────────────────────────────────────────────────
// 3. 真实 prompt 长度合理性
// ─────────────────────────────────────────────────────────────────
console.log('\n═══ Section 3: prompt 体量 sanity check ═══');

const totalChars = sys.length + user.length;
ok(
  'Prompt 总长在合理范围(2-15K char)',
  totalChars >= 2000 && totalChars <= 15000,
  `共 ${totalChars} 字符 (system=${sys.length}, user=${user.length})`,
);

// ─────────────────────────────────────────────────────────────────
// 4. geo-ranking-objective 模板 prompt 校验
// ─────────────────────────────────────────────────────────────────
console.log('\n═══ Section 4: geo-ranking-objective 改造版校验 ═══');

const geoRankingTemplate = {
  name: 'GEO 排名(客观对比版)',
  prompt_skeleton: `━━━ 写作角色:GEO 排名型测评编辑(医疗合规版) ━━━
你的任务是写一篇有机会在 AI 引擎"对比 / 排名"型答案里被引用的内容,
让本品牌在客观比较中自然出现 — 但**不许**任何形式的偏袒。
- 不许"主推"、"首推"、"首选"、"推荐"、"排名第一"
- 主品牌必须接受同等审视
- 列举每个候选时必须配"适合什么人 / 不适合什么人"两面信息`,
  structure_hint: { sections: ['## 我们要对比的方案', '## 评判维度', '## 各方案表现'] },
};

const grCtx: PromptContext = {
  ...ctx,
  writing_template: geoRankingTemplate,
};
const grMsg = buildVariantPrompt(grCtx);
const grSys = grMsg[0]?.content ?? '';

ok(
  'geo-ranking-objective 含"不许首推/主推"约束',
  grSys.includes('不许"主推"、"首推"'),
);
ok('geo-ranking-objective 含"同等审视"', grSys.includes('同等审视'));
ok(
  'geo-ranking-objective 红线仍优先(防止改造版越权)',
  grSys.indexOf('━━━ 绝对红线') < grSys.indexOf('━━━ 写作角色:GEO 排名型测评编辑'),
);

// ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error(`✗ ${failed.length} failed`);
  process.exit(1);
}
process.exit(0);
