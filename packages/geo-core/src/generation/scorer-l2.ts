/**
 * Scorer L2 — structure-aware rule engine (D21 / ADR 009).
 *
 * V1.6 的 9 法 (scorer.ts) 是 L1: 启发式词频/密度/句长。L2 检的是
 * GEO 标准化结构: FAQ 数、Trust Block 完整性、引用块独立性、实体显式度、
 * 主问题直答前置。纯规则,毫秒级,不调 LLM。
 *
 * 设计原则:
 * 1. 每个维度都返回 0..100 比例分 + evidence + note,方便 UI 渲染诊断
 * 2. 不依赖外部表;接受 body + optional context (primary_query / brand_name / city)
 * 3. 跟 L1 完全正交 — L1 数"有没有数字/引语",L2 数"有没有 FAQ 段落 / 适用人群段"
 *
 * 输入字段缺失时(比如 primary_query 没传),对应维度返回 `unknown`(不扣分,
 * UI 标灰),不污染总分。这样早期 D21 入参不完整时不会让所有内容降分。
 */

export type L2DimScore = {
  /** 0..100 比例分 (max 100 隐含),不返回 absolute score 让权重在 L2 总分上聚合 */
  score: number;
  /** 0..100 同上,只是为了跟 L1 TacticScore shape 一致;L2 max 永远 100 */
  max: 100;
  /** 是否参与总分(unknown=true 表示入参不足,UI 标灰,不扣分) */
  unknown?: boolean;
  evidence?: string[];
  note?: string;
};

export type GeoL2Breakdown = {
  query_coverage: L2DimScore;
  citation_worthiness: L2DimScore;
  entity_explicitness: L2DimScore;
  trust_block_completeness: L2DimScore;
  sliceability: L2DimScore;
};

export type GeoL2Score = {
  /** 0..100 weighted average over only the known dimensions */
  total: number;
  version: 1;
  scored_at: string;
  breakdown: GeoL2Breakdown;
};

const L2_VERSION = 1;

/** Weights sum to 100. Trust block 在医疗合规里权重最高,query coverage 弱了
 *  最影响 GEO 引用率,citation worthiness 决定 slice-first 上限。 */
const WEIGHTS: Record<keyof GeoL2Breakdown, number> = {
  trust_block_completeness: 30,
  entity_explicitness: 25,
  citation_worthiness: 20,
  query_coverage: 15,
  sliceability: 10,
};

export type L2Context = {
  /** Surface form of the primary search query — used to verify direct answer in opening. */
  primary_query?: string;
  /** Brand display name expected in body. */
  brand_name?: string;
  /** City / service area expected in body. */
  city?: string;
  /** Whether the article is medical-class (Trust Block strictly required). */
  is_medical?: boolean;
};

export function scoreGeoL2(input: { title: string; body: string; ctx?: L2Context }): GeoL2Score {
  const { title, body, ctx = {} } = input;
  const isMed = ctx.is_medical ?? true; // GEO Studio 默认医疗

  const breakdown: GeoL2Breakdown = {
    query_coverage: scoreQueryCoverage(title, body, ctx.primary_query),
    citation_worthiness: scoreCitationWorthiness(body),
    entity_explicitness: scoreEntityExplicitness(body, ctx),
    trust_block_completeness: scoreTrustBlockCompleteness(body, isMed),
    sliceability: scoreSliceability(body),
  };

  // Weighted average over dimensions that are not `unknown`.
  let weighted = 0;
  let usedWeight = 0;
  for (const [id, dim] of Object.entries(breakdown) as Array<[keyof GeoL2Breakdown, L2DimScore]>) {
    if (dim.unknown) continue;
    const w = WEIGHTS[id];
    weighted += dim.score * w;
    usedWeight += w;
  }
  const total = usedWeight > 0 ? Math.round(weighted / usedWeight) : 0;

  return {
    total,
    version: L2_VERSION,
    scored_at: new Date().toISOString(),
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension 1: Query Coverage
// 主问题是否直接回答 / 开头 120 字是否给出答案 / 处理一个典型误解
// ─────────────────────────────────────────────────────────────────────────

function scoreQueryCoverage(title: string, body: string, primaryQuery?: string): L2DimScore {
  if (!primaryQuery) {
    // 没传 primary_query → 退化检测:用标题做近似 — 但标记 unknown 不入总分
    return {
      score: 0,
      max: 100,
      unknown: true,
      note: 'primary_query 未传,无法验证直答前置;请在 wizard 第 0 步填主问题',
    };
  }
  const evidence: string[] = [];
  let score = 0;

  // 提取主问题的关键词(去掉疑问助词 / 标点)
  const cleanQ = primaryQuery
    .replace(/[?。!,?!,]/g, '')
    .replace(/(吗|呢|呀|怎么办|怎么选|是不是|为什么|什么|多久|哪个|哪家|哪些)/g, ' ')
    .trim();
  const keywords = cleanQ.split(/\s+/).filter((w) => w.length >= 2);

  // (a) 标题是否相关 — 含主问题至少一个关键词
  const titleHit = keywords.some((kw) => title.includes(kw));
  if (titleHit) {
    score += 30;
    evidence.push(`标题含主问题关键词`);
  }

  // (b) 开头 120 字内是否给出答案 — 含 ≥2 个主问题关键词,并且包含一个明确结论性句式
  const opening = body.slice(0, 120);
  const openingHits = keywords.filter((kw) => opening.includes(kw)).length;
  if (openingHits >= 2) {
    score += 40;
    evidence.push(`开头 120 字含 ${openingHits} 个主问题关键词`);
  } else if (openingHits >= 1) {
    score += 20;
  }

  // (c) 是否处理至少一个误区(出现"误以为 / 不是 / 其实 / 并不 / 真正的"等反转句式)
  if (/(误以为|其实|不是|并不|真正的|很多人|常被误解|看似|实际上)/.test(body.slice(0, 600))) {
    score += 30;
    evidence.push('正文前段含一个误区反转表达');
  }

  return { score: Math.min(score, 100), max: 100, evidence, note: `query="${primaryQuery}"` };
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension 2: Citation-worthiness
// 可引用结论句数量 / 可独立成立句比例 / 模糊指代率 / FAQ 可抽取度
// ─────────────────────────────────────────────────────────────────────────

const ANAPHORA_PATTERNS = /(这种|这个|那种|那个|前者|后者|上面提到|上述|刚才说的|前文)/g;

function scoreCitationWorthiness(body: string): L2DimScore {
  const evidence: string[] = [];
  const sentences = body
    .split(/[。!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return { score: 0, max: 100, note: '无句子' };

  // (a) 句长 35-90 字句占比(可引用块的核心标准)
  const inRange = sentences.filter((s) => s.length >= 20 && s.length <= 90).length;
  const rangeRatio = inRange / sentences.length;
  let rangeScore = 0;
  if (rangeRatio >= 0.6) rangeScore = 40;
  else if (rangeRatio >= 0.4) rangeScore = 25;
  else if (rangeRatio >= 0.2) rangeScore = 10;
  evidence.push(`${inRange}/${sentences.length} 句在 20-90 字区间 (${(rangeRatio * 100).toFixed(0)}%)`);

  // (b) 模糊指代密度 — 每千字 ≥ 5 次为重,3-5 中,< 3 轻
  const anaphoraCount = (body.match(ANAPHORA_PATTERNS) ?? []).length;
  const per1k = (anaphoraCount / Math.max(body.length, 1)) * 1000;
  let anaphoraScore = 0;
  if (per1k < 3) anaphoraScore = 30;
  else if (per1k < 5) anaphoraScore = 20;
  else if (per1k < 8) anaphoraScore = 10;
  evidence.push(`模糊指代 ${anaphoraCount} 次 (每千字 ${per1k.toFixed(1)})`);

  // (c) FAQ 可抽取度 — 数 Q/A 形式段落
  const faqHits = countFaqSections(body);
  let faqScore = 0;
  if (faqHits >= 5) faqScore = 30;
  else if (faqHits >= 3) faqScore = 20;
  else if (faqHits >= 1) faqScore = 10;
  evidence.push(`识别 ${faqHits} 个 FAQ 段落`);

  return {
    score: Math.min(rangeScore + anaphoraScore + faqScore, 100),
    max: 100,
    evidence,
  };
}

/** 数 FAQ 段落 — 识别 Q: ... A: ... / 问: ... 答: ... / **Q1.** ... 等模式 */
function countFaqSections(body: string): number {
  const patterns = [
    /(?:^|\n)\s*(?:Q\d*[:：.]|问\d*[:：.]|[问]：)/g,
    /(?:^|\n)\s*\*\*\s*Q\d*/gi,
    /(?:^|\n)\s*\d+\.\s*[^?\n]{4,40}[?？]\s*\n/g, // 数字编号 + 一句以?结尾,看上去像 Q
  ];
  let max = 0;
  for (const p of patterns) {
    const hits = (body.match(p) ?? []).length;
    if (hits > max) max = hits;
  }
  return max;
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension 3: Entity Explicitness
// 品牌 + 服务 + 城市 + 审核者是否显式 / 模糊主体率
// ─────────────────────────────────────────────────────────────────────────

const FUZZY_SUBJECTS = /(有些人|大部分|很多人|不少人|普遍来说|一般情况下)/g;

function scoreEntityExplicitness(body: string, ctx: L2Context): L2DimScore {
  const evidence: string[] = [];
  let score = 0;

  // (a) 品牌名出现
  if (ctx.brand_name && body.includes(ctx.brand_name)) {
    score += 30;
    evidence.push(`品牌"${ctx.brand_name}"出现`);
  } else if (ctx.brand_name) {
    evidence.push(`品牌"${ctx.brand_name}"未出现`);
  } else {
    // 没传品牌名 → 退化检测:正文是否有"昆明 XX 口腔" / "XX 医院"样式
    if (/[一-龥]{2,8}(?:口腔|医院|诊所|门诊)/.test(body)) {
      score += 15;
      evidence.push('正文含机构名(未指定品牌)');
    }
  }

  // (b) 城市
  if (ctx.city && body.includes(ctx.city)) {
    score += 20;
    evidence.push(`城市"${ctx.city}"出现`);
  } else if (!ctx.city) {
    // 没传 → 任意中国城市名匹配(粗略)
    if (/(北京|上海|广州|深圳|杭州|南京|武汉|成都|重庆|昆明|青岛|苏州|西安|济南)/.test(body)) {
      score += 10;
    }
  }

  // (c) 审核者 — 含 "审核" / "本文经 XX 医生审核" / "医师审阅"
  if (/(本文(?:经|由)[^。\n]{2,20}医[师生][^。\n]{0,20}审[核阅])|审核[:：]\s*[^。\n]{3,30}/.test(body)) {
    score += 25;
    evidence.push('含审核者具名');
  }

  // (d) 模糊主体率 — < 3 次 OK
  const fuzzyCount = (body.match(FUZZY_SUBJECTS) ?? []).length;
  if (fuzzyCount === 0) {
    score += 25;
    evidence.push('无模糊主体');
  } else if (fuzzyCount <= 2) {
    score += 15;
    evidence.push(`模糊主体 ${fuzzyCount} 次(可接受)`);
  } else {
    evidence.push(`模糊主体 ${fuzzyCount} 次(过多,扣分)`);
  }

  return { score: Math.min(score, 100), max: 100, evidence };
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension 4: Trust Block Completeness
// 7 字段:适用对象 / 不替代面诊 / 何时就诊 / 审核 / 更新时间 / 机构 / 地域
// ─────────────────────────────────────────────────────────────────────────

function scoreTrustBlockCompleteness(body: string, isMedical: boolean): L2DimScore {
  if (!isMedical) return { score: 100, max: 100, note: '非医疗类,Trust Block 非强制' };

  const checks: Array<{ name: string; re: RegExp }> = [
    { name: '适用对象', re: /(本文适用|适用对象|适用于|适用人群)/ },
    { name: '不替代面诊', re: /(不替代面诊|不能替代医生|不替代专业诊疗|建议线下检查|线下面诊)/ },
    { name: '风险边界', re: /(出现以下情况|建议尽快就诊|建议立即就诊|尽快线下检查|何时就诊)/ },
    { name: '审核', re: /(审核[:：]|本文经.{2,15}审|医疗团队审|医生审核)/ },
    { name: '更新时间', re: /(更新于|更新时间|最近更新|更新[:：]\s*20\d{2}|20\d{2}[-年]\s*\d)/ },
    { name: '机构信息', re: /(本院|医院|诊所|本品牌|本机构)/ },
    { name: '地域', re: /(地域[:：]|本地|本市|昆明|云南|北京|上海)/ },
  ];

  const evidence: string[] = [];
  let hits = 0;
  for (const c of checks) {
    if (c.re.test(body)) {
      hits++;
      evidence.push(`✓ ${c.name}`);
    } else {
      evidence.push(`✗ ${c.name}`);
    }
  }
  const score = Math.round((hits / checks.length) * 100);
  return { score, max: 100, evidence, note: `${hits}/${checks.length} 项命中` };
}

// ─────────────────────────────────────────────────────────────────────────
// Dimension 5: Sliceability
// 能否拆出 direct_answer / FAQ / risk / Trust block 等独立块
// ─────────────────────────────────────────────────────────────────────────

function scoreSliceability(body: string): L2DimScore {
  const evidence: string[] = [];
  let score = 0;

  // (a) 段落结构 — paragraph count ≥ 5 (说明分段够,可切片)
  const paragraphs = body.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 8) {
    score += 30;
    evidence.push(`${paragraphs.length} 段(分段充足)`);
  } else if (paragraphs.length >= 5) {
    score += 20;
    evidence.push(`${paragraphs.length} 段(可接受)`);
  } else {
    evidence.push(`${paragraphs.length} 段(过少,难切片)`);
  }

  // (b) 含子标题(### / ## / 一、二、三 / 1./2./3. 大段编号)
  const subheadCount =
    (body.match(/^#{2,4}\s/gm) ?? []).length +
    (body.match(/^(?:[一二三四五六七八九十]+、)/gm) ?? []).length;
  if (subheadCount >= 5) {
    score += 25;
    evidence.push(`${subheadCount} 个子标题`);
  } else if (subheadCount >= 2) {
    score += 15;
  }

  // (c) 检测 5 类 slice 关键词是否能识别到:direct_answer / FAQ / risk / brand / trust
  const slices = {
    direct_answer: /(结论[:：]|一句话(?:回答|说)|直接说|先说结论)/,
    faq: /(常见问题|Q[:：1-9]|问[:：]|FAQ)/i,
    risk: /(风险|建议尽快就诊|不适合|禁忌|出现.{0,5}建议)/,
    trust: /(审核[:：]|本文经.{2,15}审|本文不替代)/,
    applicability: /(适用人群|本文适用|适合.{2,10}的人)/,
  };
  let sliceHits = 0;
  for (const [name, re] of Object.entries(slices)) {
    if (re.test(body)) {
      sliceHits++;
      evidence.push(`可切 ${name}`);
    }
  }
  score += sliceHits * 9; // 5 类全中 +45

  return { score: Math.min(score, 100), max: 100, evidence };
}
