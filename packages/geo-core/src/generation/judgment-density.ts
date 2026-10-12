/**
 * Judgment Density & GEO Snippet Extract Evaluator.
 *
 * 吸收并原生化移植翔宇 SEO/GEO 军火库核心算法:
 * 1. judgment-density: 扫描 Markdown 中的三层判断信号，杜绝 AI 水文腔
 *    - Layer 1: 明确立场 (Explicit Stance)
 *    - Layer 2: 可量化的实测与临床参数 (Measurable Experience)
 *    - Layer 3: 失败与避坑坦白 (Failure Disclosure / Pitfalls)
 *    - Anti-patterns: 假判断拦截 (如 "非常好用", "值得一试", "业界普遍认为")
 * 2. geo-snippet-extract: LLM/AI 片段提取亲和度
 *    - 首段 80-250 字定义句模式 ("X 是/指的是/属于")
 *    - H2 疑问句覆盖率 (满足用户真实搜索意图)
 *    - 表格尺寸约束 (<= 4 列紧凑对比表，防止 RAG 切片截断)
 *
 * 纯 TypeScript 正则与文本结构分析，零外部网络开销，毫秒级纯函数。
 */

export type JudgmentDensityLayer = {
  layer: 1 | 2 | 3;
  name: string;
  count: number;
  matched: string[];
  passed: boolean;
};

export type JudgmentDensityResult = {
  score: number; // 0-100
  rating: number; // 1-5 星级
  grade: 'A' | 'B' | 'C' | 'D';
  passed: boolean;
  layer_counts: {
    layer1_stance: number;
    layer2_measurable: number;
    layer3_pitfall: number;
  };
  layers: {
    layer1_stance: JudgmentDensityLayer;
    layer2_measurable: JudgmentDensityLayer;
    layer3_pitfalls: JudgmentDensityLayer;
  };
  anti_patterns_found: string[];
  snippet_signals: {
    has_definition_opening: boolean;
    h2_total: number;
    h2_question_count: number;
    h2_question_ratio: number;
    has_compact_tables: boolean;
    wide_table_count: number;
  };
  evidence: string[];
  recommendations: string[];
  warnings: string[];
  suggestions: string[];
};

// ─── 正则模式定义 (中英自适应，医疗深度优化) ───────────────────────────

const LAYER1_STANCE_PATTERNS: RegExp[] = [
  /我认为\s*[^，。\n]{2,40}\s*[，,]\s*因为/,
  /临床上(?:强烈)?(?:建议|反对|不提倡|主张)/,
  /与共识不同/,
  /大家都说\s*[^，。\n]{2,30}\s*[，,]\s*但/,
  /我的判断是/,
  /我们更倾向于/,
  /并不是所有患者都适合/,
  /核心差异在于/,
  /\bI (?:believe|disagree|argue)\b.{2,80}\bbecause\b/i,
  /\bContrary to (?:popular|common)\b/i,
  /\bIn clinical practice,\s*we (?:recommend|advise against)\b/i,
];

const LAYER2_MEASURABLE_PATTERNS: RegExp[] = [
  // 临床时长 / 周期
  /(?:术后|随访|观察|周期|维持|恢复)?\s*\d+(?:\.\d+)?\s*(?:周|个月|月|天|年|小时|分钟)\s*(?:\/次|复查|拆线|戴冠|骨结合|观察|左右)?/,
  // 费用 / 价格 / 阶梯 / 百分比
  /[¥$￥]?\s*\d[\d,]*(?:\.\d+)?\s*(?:元|万|起|%|％)/,
  // 临床物理参数 / 精度 / 计数
  /\d+(?:\.\d+)?\s*(?:mm|毫米|cm|厘米|级|度|颗|例|次)/,
  /(?:精确到|误差控制在)\s*[\d.]+\s*(?:mm|毫米)/,
  /测试了?\s*\d+\s*个/,
  /\b(?:within|after)\s+\d+\s+(?:weeks?|months?|days?|hours?)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:mm|cm|degrees|%)\b/i,
];

const LAYER3_PITFALL_PATTERNS: RegExp[] = [
  /(?:很多|不少|普遍)(?:患者|人)(?:以为|误以为|容易忽略)/,
  /(?:以前|过去)(?:普遍认为|以为)\s*[^，。\n]{2,50}\s*[，,]\s*(?:实测|临床发现|实际上)/,
  /(?:这个|临床上)最容易踩坑的是/,
  /(?:踩过|避开|防止).{0,6}坑/,
  /走过.{0,5}弯路/,
  /(?:隐形收费|常见误区|过度诊疗)/,
  /后来放弃了?/,
  /\bCommon (?:pitfall|mistake|misconception)\b/i,
  /\bPatients often mistakenly believe\b/i,
];

const ANTI_PATTERNS: RegExp[] = [
  /非常好用/,
  /值得一试/,
  /业界普遍认为/,
  /深受广大患者好评/,
  /不容错过/,
  /效果立竿见影/,
  /\bvery good\b/i,
  /\bworth trying\b/i,
];

// 首段定义句模式 (如: "种植牙是...", "隐形矫正是指...", "结论是...")
const DEFINITION_OPENING_PATTERN = /(?:是|指的是|属于|意指|定义为|在于|结论[:：])\s*[^。！!\n]{3,80}[。！!]/;

// H2 疑问句特征
const QUESTION_HEADING_PATTERN = /[?？]$|^(?:如何|为什么|什么是|怎么|哪些|为何|多少钱|哪家好|能不能|可不可以|多久|到底|How|What|Why|When|Where|Which|Who|Can|Is)\b/i;

// ─── 核心评估算法 ────────────────────────────────────────────────────────

export function evaluateJudgmentDensity(body: string): JudgmentDensityResult {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const evidence: string[] = [];

  // 1. Layer 1: 明确立场
  const l1Matches: string[] = [];
  for (const pat of LAYER1_STANCE_PATTERNS) {
    const hits = body.match(new RegExp(pat, 'g'));
    if (hits) l1Matches.push(...hits.slice(0, 3));
  }
  const l1Passed = l1Matches.length >= 1;
  if (l1Passed) {
    evidence.push(`Layer 1 立场信号命中 ${l1Matches.length} 处: ${l1Matches[0]}`);
  } else {
    warnings.push('缺少明确临床立场表达 (Layer 1: 如“临床上我们建议/反对/核心差异在于”)');
    suggestions.push('在论述中增加 1-2 处医生的明确专业立场，而非模棱两可的和稀泥。');
  }

  // 2. Layer 2: 可量化实测数据
  const l2Matches: string[] = [];
  for (const pat of LAYER2_MEASURABLE_PATTERNS) {
    const hits = body.match(new RegExp(pat, 'g'));
    if (hits) l2Matches.push(...hits.slice(0, 4));
  }
  const l2Passed = l2Matches.length >= 2;
  if (l2Passed) {
    evidence.push(`Layer 2 量化参数命中 ${l2Matches.length} 处: ${l2Matches.slice(0, 2).join('、')}`);
  } else {
    warnings.push('可量化临床/费用参数不足 (Layer 2: 缺少具体的周数/毫米/费用等硬核参数)');
    suggestions.push('补充真实临床参数(如“骨结合周期 8-12 周”、“CT 精度 0.1mm”等来源于资料的客观数据)。');
  }

  // 3. Layer 3: 避坑坦白
  const l3Matches: string[] = [];
  for (const pat of LAYER3_PITFALL_PATTERNS) {
    const hits = body.match(new RegExp(pat, 'g'));
    if (hits) l3Matches.push(...hits.slice(0, 3));
  }
  const l3Passed = l3Matches.length >= 1;
  if (l3Passed) {
    evidence.push(`Layer 3 避坑经验命中 ${l3Matches.length} 处: ${l3Matches[0]}`);
  } else {
    warnings.push('缺少患者避坑或误区剖析 (Layer 3: 如“很多患者误以为…实测最容易踩坑的是”)');
    suggestions.push('剖析一个患者常见的就医误区或隐形成本避坑点，极大增加文章的真实可信度。');
  }

  // 4. 假判断 / AI 水文词拦截
  const antiMatches: string[] = [];
  for (const pat of ANTI_PATTERNS) {
    const hits = body.match(new RegExp(pat, 'g'));
    if (hits) antiMatches.push(...hits);
  }
  if (antiMatches.length > 0) {
    const uniqAnti = Array.from(new Set(antiMatches));
    warnings.push(`检测到 ${antiMatches.length} 处 AI 水文套话 (${uniqAnti.join('、')})`);
    suggestions.push('删除“非常好用”、“值得一试”、“业界普遍认为”等假判断空话。');
    evidence.push(`拦截假判断: ${uniqAnti.join('、')}`);
  }

  // 5. GEO Snippet 信号分析
  // (a) 首段 120-250 字是否含定义句 (跳过 # 标题行)
  const firstParagraph =
    body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .find((p) => p.length > 0 && !p.startsWith('#')) || '';
  const first150 = firstParagraph.slice(0, 150);
  const hasDefinition = DEFINITION_OPENING_PATTERN.test(first150);
  if (hasDefinition) {
    evidence.push('首段含标准定义句 (方便 AI 引擎提取 Snippet)');
  } else {
    suggestions.push('首段 100 字内建议直接出现定义/判断句 (如“X 是...”)，以便 AI 搜索引擎直接摘抄。');
  }

  // (b) H2 疑问句统计
  const h2Matches = Array.from(body.matchAll(/^##\s+(.+)$/gm)).map((m) => (m[1] ?? '').trim());
  const h2Questions = h2Matches.filter((h) => QUESTION_HEADING_PATTERN.test(h));
  const h2QuestionRatio = h2Matches.length > 0 ? h2Questions.length / h2Matches.length : 0;
  if (h2Matches.length > 0) {
    evidence.push(`H2 问句覆盖率: ${h2Questions.length}/${h2Matches.length} (${Math.round(h2QuestionRatio * 100)}%)`);
  }
  if (h2Matches.length >= 2 && h2QuestionRatio < 0.3) {
    suggestions.push('建议将部分二级标题(H2)改为患者常搜索的问句(如“价格多少钱？”、“如何选择？”)。');
  }

  // (c) 表格列数检查 (不超过 4 列)
  const tableRows = body.split('\n').filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
  let wideTables = 0;
  let hasCompactTables = false;
  for (const row of tableRows) {
    const cols = row.split('|').filter((c) => c.trim().length > 0).length;
    if (cols > 4) {
      wideTables++;
    } else if (cols >= 2 && cols <= 4) {
      hasCompactTables = true;
    }
  }
  if (wideTables > 0) {
    warnings.push(`检测到超出 4 列的宽表格 (${wideTables} 行)，可能导致大模型切片截断`);
    suggestions.push('将表格拆分或控制在 4 列以内 (如: 项目 | 基础款 | 升级款 | 适用人群)。');
  } else if (hasCompactTables) {
    evidence.push('包含 ≤4 列紧凑型对比表 (符合 RAG 最佳切片)');
  }

  // 6. 打分计算 (满分 100)
  let score = 40; // 基础底分
  if (l1Passed) score += 20;
  if (l2Passed) score += 20;
  if (l3Passed) score += 15;
  if (hasDefinition) score += 5;
  if (h2QuestionRatio >= 0.5) score += 5;
  if (hasCompactTables) score += 5;

  // 扣分项
  if (antiMatches.length > 0) score -= Math.min(antiMatches.length * 10, 25);
  if (wideTables > 0) score -= 10;

  score = Math.max(0, Math.min(100, score));

  // 1-5 星级
  let rating = 1;
  if (score >= 85) rating = 5;
  else if (score >= 70) rating = 4;
  else if (score >= 55) rating = 3;
  else if (score >= 40) rating = 2;

  let grade: JudgmentDensityResult['grade'] = 'D';
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';

  const passed = score >= 60 && l1Passed && l2Passed;

  return {
    score,
    rating,
    grade,
    passed,
    layer_counts: {
      layer1_stance: l1Matches.length,
      layer2_measurable: l2Matches.length,
      layer3_pitfall: l3Matches.length,
    },
    layers: {
      layer1_stance: {
        layer: 1,
        name: '明确临床立场',
        count: l1Matches.length,
        matched: l1Matches,
        passed: l1Passed,
      },
      layer2_measurable: {
        layer: 2,
        name: '可量化临床实测',
        count: l2Matches.length,
        matched: l2Matches,
        passed: l2Passed,
      },
      layer3_pitfalls: {
        layer: 3,
        name: '失败与避坑坦白',
        count: l3Matches.length,
        matched: l3Matches,
        passed: l3Passed,
      },
    },
    anti_patterns_found: antiMatches,
    snippet_signals: {
      has_definition_opening: hasDefinition,
      h2_total: h2Matches.length,
      h2_question_count: h2Questions.length,
      h2_question_ratio: Number(h2QuestionRatio.toFixed(2)),
      has_compact_tables: hasCompactTables,
      wide_table_count: wideTables,
    },
    evidence,
    recommendations: suggestions,
    warnings,
    suggestions,
  };
}
