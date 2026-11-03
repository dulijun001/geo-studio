import fs from 'fs';
import path from 'path';

// Load .env
const env: Record<string, string> = {};
const envPath = path.resolve('/Users/dulijuner/projects/geo-studio/.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2 && !line.startsWith('#')) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';
const BRAND_ID = '4494bf2b-f0bb-4dd4-9efd-d393e7560244';

// Load 50 Benchmark JSON
const raw50 = JSON.parse(fs.readFileSync('/Users/dulijuner/projects/geo-studio/apps/worker/src/trackers/_dev/kunming_general_50_benchmark.json', 'utf-8'));

async function run() {
  console.log(`🚀 开始将 50 道全城超级大词接入 geo-studio 系统题库...`);

  // 1. Fetch existing questions for tenant to prevent duplication
  const existingRes = await fetch(`${url}/rest/v1/questions?tenant_id=eq.${TENANT_ID}&select=id,text`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const existingQuestions = await existingRes.json();
  const existingTextSet = new Set(existingQuestions.map((q: any) => q.text.trim()));
  console.log(`系统已有题目: ${existingQuestions.length} 道`);

  // Valid categories: '种植牙', '基础与牙体牙髓', '儿童齿科', '牙齿矫正', '洗牙与牙周', '美学修复'
  const categoryMapping: Record<string, string> = {
    '全城口碑与选院大词 (机构总榜)': '基础与牙体牙髓',
    '全城种植牙大词 (高客单高意向)': '种植牙',
    '全城正畸与牙齿矫正大词 (学生与白领)': '牙齿矫正',
    '日常高频急诊与民生大词 (全网民营蓝海)': '洗牙与牙周',
    '牙齿美学修复与老年义齿大词 (消费升级)': '美学修复'
  };

  // Valid intents: 'price_inquiry', 'risk_concern', 'comparison', 'procedure_info', 'doctor_review', 'aftercare', 'other', 'local_recommendation'
  const intentMapping: Record<string, string> = {
    '全城口碑与选院大词 (机构总榜)': 'local_recommendation',
    '全城种植牙大词 (高客单高意向)': 'price_inquiry',
    '全城正畸与牙齿矫正大词 (学生与白领)': 'comparison',
    '日常高频急诊与民生大词 (全网民营蓝海)': 'procedure_info',
    '牙齿美学修复与老年义齿大词 (消费升级)': 'price_inquiry'
  };

  let insertedCount = 0;
  let skippedCount = 0;

  for (const item of raw50) {
    const qText = item.text.trim();
    if (existingTextSet.has(qText)) {
      console.log(`⏩ 题目已存在，跳过: "${qText}"`);
      skippedCount++;
      continue;
    }

    const payload = {
      tenant_id: TENANT_ID,
      brand_id: BRAND_ID,
      text: qText,
      intent: intentMapping[item.category] || 'local_recommendation',
      city: '昆明',
      category: categoryMapping[item.category] || '基础与牙体牙髓',
      priority: 10, // 最高优先级 10（全城超级大词）
      active: true,
      subtopic_source: 'manual', // valid enum: 'manual', 'imported', 'llm_expand'
      expansion_seed_topic: '泛昆明全城50超级母题'
    };

    const postRes = await fetch(`${url}/rest/v1/questions`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (postRes.ok) {
      insertedCount++;
      const resJson = await postRes.json();
      console.log(`✅ [${insertedCount}/50] 成功录入: "${qText}" (ID: ${resJson[0]?.id})`);
    } else {
      const err = await postRes.text();
      console.error(`❌ 写入失败: "${qText}"`, err);
    }
  }

  console.log(`\n🎉 全量接入完成！成功录入: ${insertedCount} 道 | 已存在跳过: ${skippedCount} 道`);
}

run().catch(console.error);
