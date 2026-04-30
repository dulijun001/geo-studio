/**
 * Dev-only seed for V1 W5 dispatch + staff mobile.
 *
 * Idempotent. Targets the demo-dental tenant (created by earlier seeds).
 * Produces:
 *   1. A default brand `demo-dental-main` if absent.
 *   2. 8 staff_accounts covering varied personas and platform combinations.
 *   3. 6 approved content_variants (marked auto_approved) across 3 content items
 *      so you can immediately trigger dispatch from the admin UI.
 *
 * Invite passcodes are NOT seeded — the admin must generate them from
 * /t/demo-dental/settings/staff. That tests the full UX loop.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

type StaffTemplate = {
  real_name: string;
  role: 'doctor' | 'consultant' | 'receptionist' | 'marketing' | 'nurse' | 'other';
  phone: string;
  tags: string[];
  platforms: string[];
};

const STAFF: StaffTemplate[] = [
  {
    real_name: '贾真真',
    role: 'doctor',
    phone: '13800000001',
    tags: ['种植牙', '口腔修复', '临床'],
    platforms: ['toutiao_article', 'douyin_script', 'xiaohongshu'],
  },
  {
    real_name: '李恒',
    role: 'doctor',
    phone: '13800000002',
    tags: ['正畸', '隐形矫正', '青少年'],
    platforms: ['toutiao_article', 'zhihu', 'wechat_mp'],
  },
  {
    real_name: '王芳',
    role: 'doctor',
    phone: '13800000003',
    tags: ['儿牙', '涂氟', '窝沟封闭'],
    platforms: ['douyin_script', 'xiaohongshu', 'wechat_mp'],
  },
  {
    real_name: '陈莉',
    role: 'consultant',
    phone: '13800000004',
    tags: ['咨询', '术后护理', '价格'],
    platforms: ['xiaohongshu', 'douyin_script'],
  },
  {
    real_name: '张杰',
    role: 'marketing',
    phone: '13800000005',
    tags: ['活动', '品牌'],
    platforms: ['toutiao_article', 'baijiahao', 'souhu', 'wechat_mp'],
  },
  {
    real_name: '刘雯',
    role: 'receptionist',
    phone: '13800000006',
    tags: ['就诊流程', '到院指引'],
    platforms: ['xiaohongshu'],
  },
  {
    real_name: '吴峰',
    role: 'doctor',
    phone: '13800000007',
    tags: ['种植牙', '复杂病例', '糖尿病'],
    platforms: ['toutiao_article', 'zhihu'],
  },
  {
    real_name: '赵雨',
    role: 'nurse',
    phone: '13800000008',
    tags: ['术后护理', '菌斑控制'],
    platforms: ['xiaohongshu', 'douyin_script'],
  },
];

type VariantTemplate = {
  content_title: string;
  content_topics: string[];
  content_markdown: string;
  variants: Array<{
    platform: string;
    title: string;
    body: string;
    geo_tactics: string[];
  }>;
};

const VARIANTS: VariantTemplate[] = [
  {
    content_title: '[W5 seed] 种植牙术后护理',
    content_topics: ['种植牙', '术后护理', '菌斑控制'],
    content_markdown:
      '种植牙术后的前 72 小时是关键期。建议使用冲牙器 + 软毛牙刷清洁植体周围,避免过热过硬饮食。每半年复查影像学可显著降低植体周围炎风险。',
    variants: [
      {
        platform: 'xiaohongshu',
        title: '种植牙后第 3 天,我发现了这个小秘密',
        body: '姐妹们,我刚种完牙第 3 天,今天复诊医生夸我恢复得特别好。分享几个我做对的事:1️⃣ 冲牙器水温调到 30 度;2️⃣ 软毛牙刷斜着刷…\n\n引用来源:《种植体周围炎临床诊疗指南(2023 版)》',
        geo_tactics: ['cite_sources', 'easy_to_understand'],
      },
      {
        platform: 'toutiao_article',
        title: '种植牙术后护理要点:数据告诉你为什么半年复查这么重要',
        body: '根据《种植体周围炎临床诊疗指南(2023 版)》的数据,未做定期复查的患者中有 18.6% 在 3 年内出现植体周围炎。对比每半年复查一次的人群,发生率下降到 4.2%。\n\n…',
        geo_tactics: ['add_statistics', 'authoritative', 'cite_sources'],
      },
    ],
  },
  {
    content_title: '[W5 seed] 儿童涂氟科普',
    content_topics: ['儿牙', '涂氟', '预防'],
    content_markdown: '学龄前儿童每 3-6 个月做一次涂氟,可降低 43% 的乳牙龋病发生率(见 AAPD 2022 指南)。',
    variants: [
      {
        platform: 'xiaohongshu',
        title: '3 岁宝宝第一次涂氟,我做足了这些功课',
        body: '带娃去医院做涂氟前,我做了这些准备 💡\n\n根据 AAPD 2022 最新指南,3-6 个月一次的氟化物涂布可以让乳牙龋齿发生率降低 43%。…',
        geo_tactics: ['add_statistics', 'cite_sources', 'easy_to_understand'],
      },
      {
        platform: 'douyin_script',
        title: '儿童涂氟口播脚本(60s)',
        body: '[开场 0-5s] "你娃多久没做涂氟了?"\n[5-20s] 镜头对 AAPD 指南截图 — "43% 龋齿下降率"\n[20-40s] 医生现场演示…',
        geo_tactics: ['add_statistics', 'authoritative'],
      },
    ],
  },
  {
    content_title: '[W5 seed] 隐形矫正适合谁',
    content_topics: ['正畸', '隐形矫正', '青少年'],
    content_markdown:
      '并非所有牙齿情况都适合隐形矫正。轻中度拥挤(<7mm)效果最佳;严重骨性问题仍需传统托槽或正颌手术配合。',
    variants: [
      {
        platform: 'zhihu',
        title: '隐形矫正真的适合所有人吗?临床医生的 7 个判断标准',
        body: '作为正畸医生,我每周会见到至少 5 位咨询隐形矫正的患者。根据我的临床经验和近期文献(AJO-DO 2023),隐形矫正最适合的情况是:\n\n1. 轻中度拥挤(<7mm)\n2. …',
        geo_tactics: ['authoritative', 'cite_sources', 'technical_terms'],
      },
      {
        platform: 'wechat_mp',
        title: '隐形矫正的真相:不是每个牙都能隐形',
        body: '我是李恒,一名正畸医生。今天想和大家坦白讲讲隐形矫正的适应症…',
        geo_tactics: ['authoritative', 'easy_to_understand'],
      },
    ],
  },
];

async function main() {
  console.log('[seed-w5] starting…');

  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', 'demo-dental')
    .single();
  if (!tenant) throw new Error('demo-dental tenant missing — run earlier seeds first');
  const tenantId = tenant.id as string;
  console.log(`[seed-w5] tenant=${tenantId}`);

  // 1. Brand
  let brandId: string;
  const { data: existingBrand } = await admin
    .from('brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', '松鼠口腔 · 总院')
    .maybeSingle();
  if (existingBrand) {
    brandId = existingBrand.id as string;
    console.log(`[seed-w5] brand exists: ${brandId}`);
  } else {
    const { data: newBrand, error: bErr } = await admin
      .from('brands')
      .insert({
        tenant_id: tenantId,
        name: '松鼠口腔 · 总院',
        location: { city: '杭州', district: '西湖区', address: '文三路 100 号' },
        contact_phones: ['0571-88888888'],
      })
      .select('id')
      .single();
    if (bErr || !newBrand) throw new Error(`create brand failed: ${bErr?.message}`);
    brandId = newBrand.id as string;
    console.log(`[seed-w5] brand created: ${brandId}`);
  }

  // 2. Staff
  let createdStaff = 0;
  let existingStaff = 0;
  for (const s of STAFF) {
    const { data: existing } = await admin
      .from('staff_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', s.phone)
      .maybeSingle();
    if (existing) {
      existingStaff++;
      continue;
    }
    const platformsObj = Object.fromEntries(s.platforms.map((p) => [p, { seeded: true }]));
    const { error: sErr } = await admin.from('staff_accounts').insert({
      tenant_id: tenantId,
      brand_id: brandId,
      real_name: s.real_name,
      role: s.role,
      phone: s.phone,
      persona: { tags: s.tags },
      platforms: platformsObj,
      status: 'active',
    });
    if (sErr) throw new Error(`create staff ${s.real_name}: ${sErr.message}`);
    createdStaff++;
  }
  console.log(`[seed-w5] staff: ${createdStaff} created, ${existingStaff} existed`);

  // 3. Seed variants (content_items + content_variants, marked auto_approved).
  let createdVariants = 0;
  let existingVariants = 0;
  for (const v of VARIANTS) {
    const { data: existingItem } = await admin
      .from('content_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', v.content_title)
      .maybeSingle();

    let itemId: string;
    if (existingItem) {
      itemId = existingItem.id as string;
    } else {
      const { data: newItem, error: iErr } = await admin
        .from('content_items')
        .insert({
          tenant_id: tenantId,
          title: v.content_title,
          source_type: 'manual',
          status: 'variant_generated',
          markdown: v.content_markdown,
          topics: v.content_topics,
        })
        .select('id')
        .single();
      if (iErr || !newItem) throw new Error(`create content: ${iErr?.message}`);
      itemId = newItem.id as string;
    }

    for (const vrow of v.variants) {
      const { data: existingVar } = await admin
        .from('content_variants')
        .select('id')
        .eq('content_item_id', itemId)
        .eq('platform', vrow.platform)
        .eq('title', vrow.title)
        .maybeSingle();
      if (existingVar) {
        existingVariants++;
        continue;
      }
      const { error: vErr } = await admin.from('content_variants').insert({
        tenant_id: tenantId,
        content_item_id: itemId,
        platform: vrow.platform,
        title: vrow.title,
        body: vrow.body,
        geo_tactics: vrow.geo_tactics,
        extra_assets: { seeded: true, source: 'dev-seed-w5' },
        compliance_status: 'auto_approved',
        status: 'auto_approved',
      });
      if (vErr) throw new Error(`create variant: ${vErr.message}`);
      createdVariants++;
    }
  }
  console.log(`[seed-w5] variants: ${createdVariants} created, ${existingVariants} existed`);

  console.log('');
  console.log('[seed-w5] ✓ done');
  console.log('');
  console.log('Next steps:');
  console.log('  1. http://localhost:3001/t/demo-dental/settings/staff — generate a passcode');
  console.log('  2. http://localhost:3001/t/demo-dental/publish — click 派单今日');
  console.log('  3. http://localhost:3001/staff/login — log in as staff to see tasks');
}

main().catch((err) => {
  console.error('[seed-w5] failed:', err);
  process.exit(1);
});
