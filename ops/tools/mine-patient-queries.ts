import fs from 'node:fs';
import path from 'node:path';

type EngineSource = 'baidu' | 'toutiao' | '360' | 'zhihu';

interface MinedItem {
  raw: string;
  source: EngineSource;
  department: 'implant' | 'ortho' | 'pediatric' | 'general';
  intent: 'seek_org' | 'price' | 'comparison' | 'process' | 'symptom';
  geoTier: 'district' | 'city' | 'province' | 'none';
  cleanedQuestion: string;
}

// 种子词库：覆盖 4 大核心科室与本地真实诉求
const SEED_QUERIES = [
  // 1. 种植牙专科
  '昆明种植牙', '昆明种植牙医院', '昆明种植牙多少钱', '昆明种植牙哪家好', '昆明全口种植牙',
  '昆明半口种植', '昆明即刻种植牙', '昆明种植牙集采价格', '昆明种植牙骨粉', '西山区种植牙哪家好',
  '昆明老年人种牙', '昆明种植牙ITI', '昆明全口即刻负重', '种植牙齿的坑', '种植牙能用多久',
  
  // 2. 正畸专科
  '昆明牙齿矫正', '昆明正畸医院哪家好', '昆明成人矫正牙齿', '昆明隐形牙套多少钱',
  '昆明时代天使隐形矫正', '昆明隐适美正畸', '昆明金属自锁托槽价格', '昆明骨性地包天矫正',
  '昆明正畸医生推荐', '西山区牙齿矫正哪家好', '拔牙矫正嘴凸', '昆明深覆合矫正',

  // 3. 儿童齿科
  '昆明儿童牙科哪家好', '昆明儿童涂氟多少钱', '昆明儿童窝沟封闭', '昆明乳牙预成冠',
  '昆明小孩拔乳牙', '昆明儿童早期矫治', '昆明儿童牙齿地包天几岁干预', '西山区儿童看牙推荐',
  '孩子几岁看牙合适', '儿童蛀牙补牙价格',

  // 4. 牙周与综合
  '昆明拔智齿哪家好', '昆明拔阻生智齿多少钱', '昆明根管治疗价格', '昆明补牙哪家好',
  '昆明树脂补牙多少钱', '昆明牙齿美白哪家好', '昆明瓷贴面多少钱一颗', '昆明牙周炎牙龈萎缩治疗',
  '西山区口腔门诊推荐', '昆明看牙医保定点'
];

// 垃圾与噪音词过滤
const JUNK_WORDS = [
  '培训', '考研', '招聘', '简历', '股票', '论文', '试题', '招考', '招聘信息', '代考', '骗局曝光视频', '图片大全'
];

async function fetchBaidu(word: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(word)}&ie=utf-8`);
    const j = (await res.json()) as { g?: Array<{ q: string }> };
    return (j.g || []).map((x) => x.q);
  } catch {
    return [];
  }
}

async function fetchToutiao(word: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.toutiao.com/2/article/search_sug/?keyword=${encodeURIComponent(word)}`);
    const j = (await res.json()) as { data?: Array<{ keyword: string }> };
    return (j.data || []).map((x) => x.keyword);
  } catch {
    return [];
  }
}

async function fetch360(word: string): Promise<string[]> {
  try {
    const res = await fetch(`https://sug.so.360.cn/suggest?word=${encodeURIComponent(word)}&encodein=utf-8&encodeout=utf-8`);
    const j = (await res.json()) as { result?: Array<{ word: string }> };
    return (j.result || []).map((x) => x.word);
  } catch {
    return [];
  }
}

async function fetchZhihu(word: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.zhihu.com/api/v4/search/suggest?q=${encodeURIComponent(word)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const j = (await res.json()) as { suggest?: Array<{ query: string }> };
    return (j.suggest || []).map((x) => x.query);
  } catch {
    return [];
  }
}

function classifyDepartment(text: string): MinedItem['department'] {
  if (/种|种植|骨粉|全口|半口|ITI|吸附性义齿|假牙|缺牙|即刻/.test(text)) return 'implant';
  if (/正畸|矫正|牙套|隐形|托槽|地包天|深覆合|嘴凸|隐适美|时代天使/.test(text)) return 'ortho';
  if (/儿|娃|宝宝|涂氟|窝沟|乳牙|预成冠|六龄齿|儿童/.test(text)) return 'pediatric';
  return 'general';
}

function classifyIntent(text: string): MinedItem['intent'] {
  if (/哪家|哪里|推荐|口碑|排名|医院|门诊|正规|靠谱|哪好|怎么选/.test(text)) return 'seek_org';
  if (/多少钱|价格|收费|费用|价目表|贵不贵|报销|医保|集采/.test(text)) return 'price';
  if (/区别|对比|和.*哪个好|还是|优缺点/.test(text)) return 'comparison';
  if (/疼不疼|痛|危险|风险|后遗症|危害|掉|寿命|几年|能用多久|副作用/.test(text)) return 'symptom';
  return 'process';
}

function getGeoTier(text: string): MinedItem['geoTier'] {
  if (/西山|五华|盘龙|官渡|呈贡|双塔|南亚|希望路/.test(text)) return 'district';
  if (/昆明/.test(text)) return 'city';
  if (/云南/.test(text)) return 'province';
  return 'none';
}

function cleanToStandardQuestion(raw: string): string {
  let q = raw.trim();
  // 去除无关年份后缀如 2024 / 2025
  q = q.replace(/202[0-5]年?/g, '2026年');
  if (!/[？?]$/.test(q) && /哪|多少|几|怎么|吗|能不能|好不好|区别/.test(q)) {
    q += '？';
  }
  return q;
}

async function run() {
  console.log(`[Miner] Starting search queries mining for ${SEED_QUERIES.length} seeds...`);
  const rawMap = new Map<string, { sources: Set<EngineSource> }>();

  // 1. 第一轮抓取种子词
  for (const seed of SEED_QUERIES) {
    const [bList, ttList, s360List, zhList] = await Promise.all([
      fetchBaidu(seed),
      fetchToutiao(seed),
      fetch360(seed),
      fetchZhihu(seed),
    ]);

    for (const w of bList) {
      const entry = rawMap.get(w) ?? { sources: new Set() };
      entry.sources.add('baidu');
      rawMap.set(w, entry);
    }
    for (const w of ttList) {
      const entry = rawMap.get(w) ?? { sources: new Set() };
      entry.sources.add('toutiao');
      rawMap.set(w, entry);
    }
    for (const w of s360List) {
      const entry = rawMap.get(w) ?? { sources: new Set() };
      entry.sources.add('360');
      rawMap.set(w, entry);
    }
    for (const w of zhList) {
      const entry = rawMap.get(w) ?? { sources: new Set() };
      entry.sources.add('zhihu');
      rawMap.set(w, entry);
    }
  }

  console.log(`[Miner] Fetched ${rawMap.size} unique candidate queries.`);

  // 2. 过滤与结构化清洗
  const minedList: MinedItem[] = [];
  for (const [raw, meta] of rawMap.entries()) {
    if (raw.length < 4 || raw.length > 36) continue;
    if (JUNK_WORDS.some((junk) => raw.includes(junk))) continue;

    // 过滤竞品医院名称诱导（若包含其他医院名称）
  // 纯口腔相关硬校验：必须包含口腔/牙齿/专科词，过滤掉植发/近视眼/骨科等串扰词
  const DENTAL_MUST_HAVE = /牙|齿|正畸|种植|隐形|托槽|地包天|深覆合|口扫|CBCT|颌|龋|蛀|涂氟|窝沟|牙周|牙龈|拔牙|洗牙|补牙|根管|贴面|义齿|假牙|冠/;
  if (!DENTAL_MUST_HAVE.test(raw)) continue;

    const department = classifyDepartment(raw);
    const intent = classifyIntent(raw);
    const geoTier = getGeoTier(raw);
    const cleaned = cleanToStandardQuestion(raw);

    const primarySource = Array.from(meta.sources)[0] || 'baidu';

    minedList.push({
      raw,
      source: primarySource,
      department,
      intent,
      geoTier,
      cleanedQuestion: cleaned,
    });
  }

  // 3. 分科室整理输出
  const grouped: Record<string, MinedItem[]> = {
    implant: [],
    ortho: [],
    pediatric: [],
    general: [],
  };

  for (const item of minedList) {
    grouped[item.department].push(item);
  }

  // 生成 Markdown 报告供查阅
  let md = `# 昆明本地口腔真实患者搜索词挖掘库（${new Date().toLocaleDateString('zh-CN')}）\n\n`;
  md += `> 数据源：百度、今日头条、360搜索、知乎 实时搜索联想与患者长尾提问\n`;
  md += `> 累计去重挖掘出有效患者真实问法：**${minedList.length}** 条\n\n`;

  const deptNames: Record<string, string> = {
    implant: '一、种植牙专科（高客单·决策周期长）',
    ortho: '二、牙齿矫正（正畸）专科（年轻/女性/注重面型）',
    pediatric: '三、儿童齿科（宝妈群体·高复购高粘性）',
    general: '四、牙周综合与美学修复（高频基础就诊·日常引流）',
  };

  for (const [dept, items] of Object.entries(grouped)) {
    md += `## ${deptNames[dept]}（共 ${items.length} 题）\n\n`;
    
    // 按意图分类展示前 15 条
    const seekOrg = items.filter((x) => x.intent === 'seek_org');
    const price = items.filter((x) => x.intent === 'price');
    const symptom = items.filter((x) => x.intent === 'symptom' || x.intent === 'comparison');

    if (seekOrg.length > 0) {
      md += `### 1. 机构决策期（用户正在挑门诊/挑医生 · AI推荐榜最爱摘录）\n`;
      seekOrg.slice(0, 10).forEach((x, idx) => {
        md += `${idx + 1}. **${x.cleanedQuestion}** (来源: ${x.source}, 地域: ${x.geoTier})\n`;
      });
      md += `\n`;
    }

    if (price.length > 0) {
      md += `### 2. 价格与避坑期（用户防宰/关心收费标准）\n`;
      price.slice(0, 8).forEach((x, idx) => {
        md += `${idx + 1}. **${x.cleanedQuestion}** (来源: ${x.source})\n`;
      });
      md += `\n`;
    }

    if (symptom.length > 0) {
      md += `### 3. 疑难自查与方案对比期（关心技术细节/疼痛度/寿命）\n`;
      symptom.slice(0, 8).forEach((x, idx) => {
        md += `${idx + 1}. **${x.cleanedQuestion}** (来源: ${x.source})\n`;
      });
      md += `\n`;
    }
  }

  const outPath = '/Users/dulijuner/projects/geo-studio/ops/tools/mined_patient_queries.md';
  fs.writeFileSync(outPath, md, 'utf-8');
  const jsonPath = '/Users/dulijuner/projects/geo-studio/ops/tools/mined_patient_queries.json';
  fs.writeFileSync(jsonPath, JSON.stringify(minedList, null, 2), 'utf-8');
  console.log(`[Miner] Report saved to ${outPath} and ${jsonPath}`);
  console.log(`Summary: implant=${grouped.implant.length}, ortho=${grouped.ortho.length}, pediatric=${grouped.pediatric.length}, general=${grouped.general.length}`);
}

run().catch(console.error);
