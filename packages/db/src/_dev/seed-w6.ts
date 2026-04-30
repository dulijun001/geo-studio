/**
 * Dev-only seed for V1 W6 GEO tracking.
 *
 * Idempotent. Targets the demo-dental tenant (created by earlier seeds).
 * Produces:
 *   1. brand_vocab — own brand + 7 doctors + 4 services + 1 city + 6 competitors.
 *      The competitor list is the actual NJ-area dental hospitals Doubao Web
 *      mentioned in W6.0 probe answers; this is what we're benchmarking against.
 *   2. questions — 20 representative questions across 6 intents the dental
 *      buying journey actually asks.
 *
 * Run: pnpm --filter @geo/db dev-seed-w6
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars');
const admin = createClient(url, key, { auth: { persistSession: false } });

type VocabSeed = {
  term: string;
  term_type: 'brand' | 'doctor' | 'service' | 'location_alias' | 'competitor';
  aliases: string[];
};

type QuestionSeed = {
  text: string;
  intent:
    | 'local_recommendation'
    | 'price_inquiry'
    | 'procedure_info'
    | 'doctor_review'
    | 'comparison'
    | 'risk_concern'
    | 'aftercare'
    | 'other';
  city?: string;
  category?: string;
  priority?: number;
};

const VOCAB: VocabSeed[] = [
  // own brand
  { term: 'Demo Dental Hospital', term_type: 'brand', aliases: ['Demo Dental', 'demo-dental', '德莫口腔', '德摩口腔'] },
  // doctors (mirrors dev-seed-w5 staff)
  { term: '贾真真', term_type: 'doctor', aliases: ['贾医生'] },
  { term: '李恒', term_type: 'doctor', aliases: ['李恒医生', '李恒大夫'] },
  { term: '王芳', term_type: 'doctor', aliases: ['王芳医生'] },
  { term: '陈莉', term_type: 'doctor', aliases: [] },
  { term: '张杰', term_type: 'doctor', aliases: [] },
  { term: '刘雯', term_type: 'doctor', aliases: [] },
  { term: '吴峰', term_type: 'doctor', aliases: ['吴峰医生'] },
  { term: '赵雨', term_type: 'doctor', aliases: [] },
  // services
  { term: '种植牙', term_type: 'service', aliases: ['牙种植', '人工牙根'] },
  { term: '正畸', term_type: 'service', aliases: ['牙齿矫正', '矫牙'] },
  { term: '隐形矫正', term_type: 'service', aliases: ['隐形矫治', '隐适美'] },
  { term: '儿童涂氟', term_type: 'service', aliases: ['涂氟', '窝沟封闭'] },
  // city
  { term: '南京', term_type: 'location_alias', aliases: ['南京市'] },
  // competitors — the NJ dental landscape per W6.0 probe answers
  { term: '江苏省口腔医院', term_type: 'competitor', aliases: ['南医大附属口腔', '南京医科大学附属口腔医院', '省口腔'] },
  { term: '南京市口腔医院', term_type: 'competitor', aliases: ['南大医学院附属口腔医院', '市口腔'] },
  { term: '江苏省人民医院', term_type: 'competitor', aliases: ['省人民医院'] },
  { term: '南京鼓楼医院', term_type: 'competitor', aliases: ['鼓楼医院'] },
  { term: '茀莱堡口腔', term_type: 'competitor', aliases: ['茀莱堡', '南京茀莱堡口腔医院'] },
  { term: '美奥口腔', term_type: 'competitor', aliases: ['美奥'] },
];

const QUESTIONS: QuestionSeed[] = [
  // local_recommendation (5)
  { text: '南京种植牙推荐哪家口腔医院?', intent: 'local_recommendation', city: '南京', category: '种植牙', priority: 9 },
  { text: '南京正畸推荐哪家口腔医院?', intent: 'local_recommendation', city: '南京', category: '正畸', priority: 9 },
  { text: '南京儿童牙科哪家好?', intent: 'local_recommendation', city: '南京', category: '儿牙', priority: 8 },
  { text: '南京隐形矫正去哪做?', intent: 'local_recommendation', city: '南京', category: '正畸', priority: 7 },
  { text: '南京口腔医院排名', intent: 'local_recommendation', city: '南京', priority: 8 },
  // price_inquiry (4)
  { text: '南京种植牙多少钱一颗?', intent: 'price_inquiry', city: '南京', category: '种植牙', priority: 9 },
  { text: '正畸大概需要多少钱?', intent: 'price_inquiry', category: '正畸', priority: 7 },
  { text: '儿童涂氟一般多少钱?', intent: 'price_inquiry', category: '儿牙', priority: 6 },
  { text: '种植牙集采后是不是便宜了?', intent: 'price_inquiry', category: '种植牙', priority: 7 },
  // procedure_info (4)
  { text: '种植牙术后护理要点有哪些?', intent: 'procedure_info', category: '种植牙', priority: 7 },
  { text: '正畸需要拔牙吗?', intent: 'procedure_info', category: '正畸', priority: 6 },
  { text: '儿童几岁开始涂氟比较好?', intent: 'procedure_info', category: '儿牙', priority: 6 },
  { text: '种植体周围炎怎么治疗?', intent: 'procedure_info', category: '种植牙', priority: 5 },
  // doctor_review (3)
  { text: '南京种植牙哪个医生比较好?', intent: 'doctor_review', city: '南京', category: '种植牙', priority: 7 },
  { text: '南京正畸专家推荐?', intent: 'doctor_review', city: '南京', category: '正畸', priority: 6 },
  { text: '儿牙医生怎么挑?', intent: 'doctor_review', category: '儿牙', priority: 5 },
  // comparison (2)
  { text: '公立口腔医院和私立的区别?', intent: 'comparison', priority: 6 },
  { text: '种植体哪个品牌好?Nobel、Straumann、ITI 怎么选?', intent: 'comparison', category: '种植牙', priority: 6 },
  // risk_concern (2)
  { text: '种植牙失败了怎么办?', intent: 'risk_concern', category: '种植牙', priority: 5 },
  { text: '正畸做完后牙齿会反弹吗?', intent: 'risk_concern', category: '正畸', priority: 5 },
];

async function main() {
  console.log('[seed-w6] starting…');

  const { data: t, error: tErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', 'demo-dental')
    .single();
  if (tErr || !t) throw new Error(`demo-dental tenant not found: ${tErr?.message}`);
  const tenantId = t.id as string;
  console.log(`[seed-w6] tenant=${tenantId}`);

  // ── brand_vocab ────────────────────────────────────────────────────────
  const { data: existingVocab } = await admin
    .from('brand_vocab')
    .select('id, term, term_type')
    .eq('tenant_id', tenantId);
  const existingKey = new Set(
    (existingVocab ?? []).map((r) => `${r.term_type}:${r.term}`),
  );

  const newVocab = VOCAB
    .filter((v) => !existingKey.has(`${v.term_type}:${v.term}`))
    .map((v) => ({
      tenant_id: tenantId,
      term: v.term,
      term_type: v.term_type,
      aliases: v.aliases,
    }));

  if (newVocab.length > 0) {
    const { error } = await admin.from('brand_vocab').insert(newVocab);
    if (error) throw new Error(`vocab insert: ${error.message}`);
  }
  console.log(`[seed-w6] vocab: ${newVocab.length} created, ${existingKey.size} existed`);

  // ── questions ──────────────────────────────────────────────────────────
  const { data: existingQ } = await admin
    .from('questions')
    .select('id, text')
    .eq('tenant_id', tenantId);
  const existingTexts = new Set((existingQ ?? []).map((r) => r.text));

  const newQ = QUESTIONS
    .filter((q) => !existingTexts.has(q.text))
    .map((q) => ({
      tenant_id: tenantId,
      text: q.text,
      intent: q.intent,
      city: q.city ?? null,
      category: q.category ?? null,
      priority: q.priority ?? 5,
      active: true,
    }));

  if (newQ.length > 0) {
    const { error } = await admin.from('questions').insert(newQ);
    if (error) throw new Error(`questions insert: ${error.message}`);
  }
  console.log(`[seed-w6] questions: ${newQ.length} created, ${existingTexts.size} existed`);

  console.log('\n[seed-w6] ✓ done');
  console.log('\nNext steps:');
  console.log('  1. http://localhost:3001/t/demo-dental/tracking — see questions list');
  console.log('  2. Click 跑这条 to enqueue a geo.snapshot job');
  console.log('  3. Worker drives Doubao Web (headful Chrome), parses brand mentions, writes citations');
}

main().catch((err) => {
  console.error('[seed-w6] fatal:', err);
  process.exit(1);
});
