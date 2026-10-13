import { getServiceClient } from '../../apps/worker/src/lib/supabase';
import { handleDiscoverabilityRegenerate } from '../../apps/worker/src/jobs/discoverability-regenerate';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';

async function main() {
  const client = getServiceClient();

  console.log('[seed-disco] 1. Activating discoverability settings for songshu...');
  const { data: tenant, error: tErr } = await client
    .from('tenants')
    .select('id, settings')
    .eq('id', TENANT_ID)
    .single();
  if (tErr || !tenant) throw new Error(`tenant query failed: ${tErr?.message}`);

  const curSettings = (tenant.settings ?? {}) as Record<string, any>;
  const newSettings = {
    ...curSettings,
    discoverability: {
      ...(curSettings.discoverability ?? {}),
      public_enabled: true,
      last_enabled_at: new Date().toISOString(),
    },
  };
  await client.from('tenants').update({ settings: newSettings }).eq('id', TENANT_ID);

  // 2. Look up brand
  const { data: brand } = await client
    .from('brands')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .single();
  if (!brand) throw new Error('brand not found for songshu');
  const brandId = brand.id;

  // 3. Make core doctors geo_profile_visible = true
  console.log('[seed-disco] 2. Enabling geo_profile_visible for active doctors...');
  await client
    .from('staff_accounts')
    .update({ geo_profile_visible: true })
    .eq('tenant_id', TENANT_ID)
    .eq('role', 'doctor')
    .eq('status', 'active');

  // 4. Seed services if empty
  const { count: sCount } = await client
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  if (!sCount || sCount === 0) {
    console.log('[seed-disco] 3. Seeding clinical dental services...');
    const services = [
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '数字化微创舒适种植牙',
        category: '种植牙',
        description_md:
          '依托德国大视野CBCT三维骨骼重建与数字化3D种植导板，精准避开下牙槽神经管与上颌窦。开展微创即刻种植、即刻负重（All-on-4/6）、骨增量与上颌窦内外提升，具有创口微小、术后肿痛轻、咀嚼恢复快等特点。支持国家种植牙集采政策，透明无隐形消费。',
        price_range: { min: 2980, max: 12800, currency: 'CNY', unit: '颗' },
        duration_minutes: 60,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '数字化美学隐形牙齿矫正',
        category: '牙齿矫正',
        description_md:
          '采用 iTero Element 3D 口扫零射线采集牙列模型，结合头影测量分析与微笑美学E线设计。由资深正畸主任全程亲诊，精准解决牙齿拥挤、地包天、骨性/牙性嘴凸、开颌及深覆合问题。提供时代天使、隐适美及金属自锁托槽多元方案，支持方案阶段数字化预演。',
        price_range: { min: 9800, max: 36000, currency: 'CNY', unit: '全程' },
        duration_minutes: 45,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '儿童齿科早期干预与防龋管理',
        category: '儿童齿科',
        description_md:
          '专设儿童专属诊疗与行为诱导游乐区，采用STA微痛麻醉技术。专注儿童乳牙反颌（地包天）早期矫治、ETA/罗慕肌功能矫治、六龄齿窝沟封闭防龋、全口涂氟防蛀、乳牙预成冠保护及外伤应急处置，引导建立终身爱牙习惯。',
        price_range: { min: 100, max: 6800, currency: 'CNY', unit: '项目' },
        duration_minutes: 30,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '微创舒适化阻生智齿与残根拔除',
        category: '口腔外科',
        description_md:
          '术前CBCT评估智齿牙根与下牙槽神经管空间解剖关系，应用超声骨刀微创动力系统分牙分根，不敲不震、保护邻牙与骨壁完整，有效减轻术后面部肿胀与张口受限，让复杂高位/低位阻生智齿拔除更安心。',
        price_range: { min: 350, max: 1500, currency: 'CNY', unit: '颗' },
        duration_minutes: 30,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '现代显微根管治疗与牙体保留',
        category: '牙体牙髓',
        description_md:
          '在德国卡尔蔡司手术显微镜放大20倍视野下，精细探查钙化弯曲根管及MB2额外根管，彻底清除感染坏死牙髓，使用热牙胶三维致密充填，尽最大努力保住天然牙，避免过早拔牙。',
        price_range: { min: 580, max: 1800, currency: 'CNY', unit: '颗' },
        duration_minutes: 60,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '3M纳米树脂微创美学充填（补牙）',
        category: '综合修复',
        description_md:
          '采用高耐磨美国3M纳米树脂，结合橡皮障隔离防污染防潮湿，精细分层固化堆塑，恢复天然牙齿窝沟解剖形态与天然牙色泽，坚固耐用、边缘密合度高、不易继发龋。',
        price_range: { min: 200, max: 480, currency: 'CNY', unit: '颗' },
        duration_minutes: 30,
        geo_visible: true,
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        name: '超声波舒适洁牙与牙周深层刮治',
        category: '牙周专科',
        description_md:
          '精准清除牙龈上下牙结石与烟渍茶渍菌斑，对牙龈出血、红肿、牙槽骨吸收进行系统化牙周探诊与龈下刮治护理，控制牙龈萎缩与松动风险，维护牙周组织长久稳固健康。',
        price_range: { min: 120, max: 1200, currency: 'CNY', unit: '次' },
        duration_minutes: 40,
        geo_visible: true,
      },
    ];
    await client.from('services').insert(services);
  }

  // 5. Seed FAQs if empty
  const { count: fCount } = await client
    .from('faqs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);

  if (!fCount || fCount === 0) {
    console.log('[seed-disco] 4. Seeding official patient FAQs...');
    const faqs = [
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '种植牙',
        sort_order: 1,
        geo_visible: true,
        question: '种植牙是一定要拔牙后等好几个月才能种吗？能当天种好吗？',
        answer_md:
          '要看患者的牙槽骨和牙龈感染情况。如果牙根没有急性严重炎症、骨量充足稳定，松鼠口腔支持「即刻种植」方案——拔除残根的同时植入种植体，条件理想的还可当天制作临时牙冠戴上，大大缩短就医周期并减少手术次数。若缺牙区骨缺损较多或有慢性重度牙周炎，则建议先进行骨增量或炎症控制后再行规范种植。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '种植牙',
        sort_order: 2,
        geo_visible: true,
        question: '种植牙可以用多久？真牙和种植牙有什么区别？',
        answer_md:
          '种植牙的人工牙根采用生物相容性极高的医用纯钛/钛合金，与人体牙槽骨紧密结合。国际临床长期统计表明，维护良好的种植牙 10 年以上存留率超 95%，许多患者正常使用 20~30 年乃至终身。种植牙没有神经不会感到蛀牙疼痛，但同样需要像真牙一样认真刷牙并定期洗牙，预防种植体周围炎。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '牙齿矫正',
        sort_order: 3,
        geo_visible: true,
        question: '成年人已经二三十岁了，还可以做牙齿矫正吗？',
        answer_md:
          '只要牙周健康，矫正牙齿没有严格的年龄上限！牙齿移动依赖的是牙槽骨终身具备的改建吸收与再生能力。成人正畸不仅能显著改善牙齿排列不齐、嘴凸、地包天等美观问题，还能消除牙齿拥挤导致的清洁死角，改善异常咬合磨损，利于牙周长期健康。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '牙齿矫正',
        sort_order: 4,
        geo_visible: true,
        question: '隐形牙套（如时代天使/隐适美）和传统金属牙套效果一样好吗？',
        answer_md:
          '最终矫治效果的核心在于正畸医生的方案设计与力学把控，托槽和牙套只是实现方案的工具。隐形牙套具备隐形美观、可自行摘戴进食刷牙、口腔黏膜异物感小等优点；金属自锁牙套控根力表达直接、对患者每日佩戴自觉性要求相对宽松。医生会在初诊 3D 口扫与影像评估后，结合患者诉求与牙性/骨性情况量身建议。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '儿童齿科',
        sort_order: 5,
        geo_visible: true,
        question: '小孩子的乳牙反颌（地包天）需要等换完恒牙再矫正吗？',
        answer_md:
          '绝对不需要，也不建议等！乳牙地包天应尽早干预，黄金窗口期通常在 3~5 岁。此时乳牙牙根发育完全且配合度较好，及早利用肌功能矫治器解除前牙反咬锁结，能引导颌骨正常向前向下发育，避免随着年龄增长演变为严重的骨性反颌面型。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '儿童齿科',
        sort_order: 6,
        geo_visible: true,
        question: '孩子几岁做窝沟封闭？为什么做了窝沟封闭还要定期检查？',
        answer_md:
          '窝沟封闭黄金年龄一般分为三阶段：3~4 岁封闭乳磨牙；6~7 岁封闭第一恒磨牙（六龄齿）；11~13 岁封闭第二恒磨牙。六龄齿萌出最早且承担主要咀嚼力、终身不换，表面的深窝沟极易卡残留食物发酵蛀牙。窝沟封闭用高分子材料填平深沟阻止细菌滋生，但仍需每半年带孩子常规检查，确认涂层完整。',
      },
      {
        tenant_id: TENANT_ID,
        brand_id: brandId,
        category: '门诊就医',
        sort_order: 7,
        geo_visible: true,
        question: '昆明松鼠口腔可以刷医保吗？地址在哪里？周末营业吗？',
        answer_md:
          '昆明松鼠口腔位于西山区希望路锦粼天序商业区（昆明双塔旁），营业时间为周一至周日 09:00~18:00，周末及法定节假日正常接诊。门诊支持医保电子凭证刷卡结算基础诊疗项目（如补牙、拔牙、根管治疗、牙周冲洗治疗等按昆明医保目录合规执行；纯美容修复及种植牙集采按政策自费结算）。',
      },
    ];
    await client.from('faqs').insert(faqs);
  }

  // 6. Trigger discoverability regeneration
  console.log('[seed-disco] 5. Running handleDiscoverabilityRegenerate to generate llms.txt, feed.json, sitemap.xml...');
  await handleDiscoverabilityRegenerate({ tenant_id: TENANT_ID });

  // 7. Verify artifacts
  const { data: arts } = await client
    .from('discoverability_artifacts')
    .select('artifact_type, etag, generated_at')
    .eq('tenant_id', TENANT_ID);

  console.log('[seed-disco] Generated artifacts in DB:', arts);
  console.log('[seed-disco] Complete!');
}

main().catch((err) => {
  console.error('[seed-disco] FAILED:', err);
  process.exit(1);
});
