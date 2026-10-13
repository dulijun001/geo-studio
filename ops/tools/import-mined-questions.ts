import fs from 'node:fs';
import { getServiceClient } from '../../apps/worker/src/lib/supabase';

const TENANT_ID = 'b05a40ce-2800-472f-81e9-83fe53a622cb';
const BRAND_ID = '4494bf2b-f0bb-4dd4-9efd-d393e7560244';

// 主题 ID 映射
const THEME_MAP: Record<string, string> = {
  implant: '600be397-f591-439b-b5b0-eff417c3f047',   // 昆明种植牙(主题)
  ortho: '4795d2a6-2948-44b8-94e0-bd30e342bfe5',     // 昆明牙齿矫正(主题)
  pediatric: '658a2edb-556f-47ec-875e-4a352431a887', // 昆明儿童牙科(主题)
  perio: 'f15acf39-a5b8-4143-8655-ad34dc87c25c',     // 昆明洗牙与牙周(主题)
  general: '884acc9c-9a69-47aa-971b-ca63efdc48ce',   // 昆明补牙根管拔牙(主题)
  aesthetic: '1aa9e42b-ff65-4b6c-99cf-8e2fa1574c5e', // 昆明牙齿美学修复(主题)
};

const CATEGORY_LABEL: Record<string, string> = {
  implant: '种植牙',
  ortho: '牙齿矫正',
  pediatric: '儿童齿科',
  perio: '洗牙与牙周',
  general: '基础与牙体牙髓',
  aesthetic: '美学修复',
};

type ValidIntent =
  | 'local_recommendation'
  | 'price_inquiry'
  | 'procedure_info'
  | 'comparison'
  | 'risk_concern'
  | 'aftercare'
  | 'doctor_review'
  | 'other';

interface RawMinedItem {
  raw: string;
  source: string;
  department: string;
  intent: string;
  geoTier: string;
  cleanedQuestion: string;
}

const EXCLUDE_CITIES_RE = /昆山|大理|曲靖|玉溪|昭通|保山|丽江|普洱|临沧|楚雄|红河|文山|西双版纳|德宏|怒江|迪庆|成都|北京|上海|广州|深圳|杭州|武汉|南京|西安|重庆|郑州/;
const JUNK_WORDS = [
  '培训', '考研', '招聘', '简历', '股票', '论文', '试题', '招考', '招聘信息', '代考', '骗局曝光视频', '图片大全', '图片'
];

function detectCategory(text: string): string {
  if (/种|种植|骨粉|全口|半口|ITI|吸附性义齿|假牙|缺牙|即刻/.test(text)) return 'implant';
  if (/正畸|矫正|牙套|隐形|托槽|地包天|深覆合|嘴凸|隐适美|时代天使/.test(text)) return 'ortho';
  if (/儿|娃|宝宝|涂氟|窝沟|乳牙|预成冠|六龄齿|儿童|口呼吸/.test(text)) return 'pediatric';
  if (/牙周|牙龈|萎缩|洗牙|洁牙|刮治|牙结石/.test(text)) return 'perio';
  if (/贴面|美白|全瓷|烤瓷/.test(text)) return 'aesthetic';
  return 'general';
}

function detectIntent(text: string): ValidIntent {
  if (/哪家|哪里|推荐|口碑|排名|医院|门诊|正规|靠谱|哪好|怎么选|去哪|找谁/.test(text)) {
    return 'local_recommendation';
  }
  if (/多少钱|价格|收费|费用|价目表|贵不贵|报销|医保|集采|分期/.test(text)) {
    return 'price_inquiry';
  }
  if (/区别|对比|和.*哪个好|还是|优缺点|哪个划算/.test(text)) {
    return 'comparison';
  }
  if (/疼不疼|痛|危险|风险|后遗症|危害|掉|寿命|几年|能用多久|副作用|失败|感染|松动|萎缩|伤害/.test(text)) {
    return 'risk_concern';
  }
  if (/术后|护理|注意事项|多久恢复|吃什么|维持多久/.test(text)) {
    return 'aftercare';
  }
  if (/医生|院长|教授|专家|主任/.test(text)) {
    return 'doctor_review';
  }
  return 'procedure_info';
}

function sanitizeComplianceWords(text: string): string {
  let s = text;
  s = s.replace(/哪家最好/g, '哪家比较好');
  s = s.replace(/最好的/g, '口碑好的');
  s = s.replace(/最好/g, '比较好');
  s = s.replace(/最厉害的/g, '技术实力强的');
  s = s.replace(/最厉害/g, '实力强的');
  s = s.replace(/排名第一/g, '口碑前列');
  s = s.replace(/第一名/g, '排名前列');
  s = s.replace(/最靠谱/g, '比较靠谱');
  s = s.replace(/无痛/g, '舒适化');
  s = s.replace(/拔牙不疼/g, '拔牙怕疼');
  s = s.replace(/烂牙/g, '蛀牙');
  s = s.replace(/坏牙/g, '龋齿');
  return s;
}

function normalizeQuestion(raw: string): string {
  let q = raw.trim();
  q = q.replace(/202[0-5]年?/g, '2026年');
  q = sanitizeComplianceWords(q);
  if (!/[？?]$/.test(q)) {
    if (/哪|多少|几|怎么|吗|能不能|好不好|区别|费用|优缺点|危害|后遗症/.test(q)) {
      q += '？';
    }
  }
  return q;
}

function calculatePriority(text: string, intent: ValidIntent): number {
  const isSeekOrg = intent === 'local_recommendation';
  const hasDistrict = /西山|五华|盘龙|官渡|呈贡|双塔|南亚|希望路/.test(text);
  const hasCity = /昆明/.test(text);

  if (isSeekOrg) {
    if (hasDistrict) return 11;
    if (hasCity) return 12;
  }
  if (intent === 'price_inquiry' && (hasDistrict || hasCity)) return 8;
  if (intent === 'comparison' && (hasDistrict || hasCity)) return 8;
  if (intent === 'risk_concern' && (hasDistrict || hasCity)) return 8;
  if (hasDistrict || hasCity) return 8;
  return 5;
}

async function run() {
  const supabase = getServiceClient();

  // 1. 整理库中存量题目：补全 category，停用纯机械模板题
  console.log('[Step 1] Classifying uncategorized existing questions in DB...');
  const { data: uncategorized, error: uErr } = await supabase
    .from('questions')
    .select('id, text, category, active')
    .eq('tenant_id', TENANT_ID)
    .is('category', null)
    .is('deleted_at', null);

  if (uErr) {
    console.error('Failed to query uncategorized questions:', uErr.message);
    return;
  }

  let updatedOldCount = 0;
  let deactivatedOldCount = 0;

  for (const q of uncategorized ?? []) {
    const isRobotic = /(哪家医院做.*比较好|去哪里好|哪家比较正规)/.test(q.text);
    const catKey = detectCategory(q.text);
    const category = CATEGORY_LABEL[catKey];
    const parentId = THEME_MAP[catKey];

    await supabase
      .from('questions')
      .update({
        category,
        parent_id: parentId,
        active: isRobotic ? false : q.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', q.id);

    if (isRobotic) {
      deactivatedOldCount++;
    } else {
      updatedOldCount++;
    }
  }

  console.log(`[Step 1 Done] Categorized ${updatedOldCount} existing questions, deactivated ${deactivatedOldCount} repetitive robotic questions.`);

  // 2. 加载全量挖掘的新鲜真实搜索词
  console.log('[Step 2] Processing mined search queries...');
  const jsonPath = '/Users/dulijuner/projects/geo-studio/ops/tools/mined_patient_queries.json';
  const rawList: RawMinedItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // 查询现有全部问题以去重
  const { data: allExisting } = await supabase
    .from('questions')
    .select('text')
    .eq('tenant_id', TENANT_ID)
    .is('deleted_at', null);

  const existingTexts = new Set((allExisting ?? []).map((x) => x.text.trim()));

  const toInsert: Array<{
    tenant_id: string;
    brand_id: string;
    text: string;
    category: string;
    intent: ValidIntent;
    priority: number;
    parent_id: string;
    city: string;
    active: boolean;
  }> = [];

  const seenInBatch = new Set<string>();

  for (const item of rawList) {
    const raw = item.raw.trim();
    if (raw.length < 4 || raw.length > 40) continue;
    if (EXCLUDE_CITIES_RE.test(raw)) continue;
    if (JUNK_WORDS.some((j) => raw.includes(j))) continue;

    const normalized = normalizeQuestion(raw);
    if (existingTexts.has(normalized) || seenInBatch.has(normalized)) continue;
    seenInBatch.add(normalized);

    const catKey = detectCategory(normalized);
    const intent = detectIntent(normalized);
    const priority = calculatePriority(normalized, intent);
    const parentId = THEME_MAP[catKey];
    const category = CATEGORY_LABEL[catKey];

    toInsert.push({
      tenant_id: TENANT_ID,
      brand_id: BRAND_ID,
      text: normalized,
      category,
      intent,
      priority,
      parent_id: parentId,
      city: '昆明',
      active: true,
    });
  }

  console.log(`[Step 2 Done] ${toInsert.length} new unique authentic patient questions to insert.`);

  // 3. 批量插入
  console.log('[Step 3] Batch inserting into questions table...');
  const CHUNK_SIZE = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error: insErr } = await supabase.from('questions').insert(chunk);
    if (insErr) {
      console.error(`Chunk ${i} failed:`, insErr.message);
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`[Step 3 Done] Successfully inserted ${inserted} authentic questions.`);

  // 4. 查看当前题库大盘
  const { data: finalStats } = await supabase
    .from('questions')
    .select('category, priority, active')
    .eq('tenant_id', TENANT_ID)
    .is('deleted_at', null)
    .eq('active', true);

  const summary: Record<string, { total: number; highPriority: number }> = {};
  for (const row of finalStats ?? []) {
    const cat = row.category || '未分类';
    if (!summary[cat]) summary[cat] = { total: 0, highPriority: 0 };
    summary[cat].total++;
    if (row.priority >= 11) summary[cat].highPriority++;
  }

  console.log('\n===== 最新系统化题库统计 =====');
  console.table(summary);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
