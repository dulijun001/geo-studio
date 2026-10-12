/**
 * 2026 GEO 核心机制：Query Fan-out 10 维查询扇出矩阵
 *
 * 理论与工业标准（参考 docs/research/doubao-geo-mechanism.md 与 xiangyu-search-seo-cli）：
 *   - 豆包、元宝、DeepSeek 在处理用户单点提问时，底层 RAG 引擎会「边想边搜」，
 *     沿 10 大核心意图扇出 8-15 个长尾子查询进行多路并发召回。
 *   - 如果一家医疗机构针对某一核心病种/项目只写了 1 篇通稿，在 90% 的扇出子查询中就会完全失守。
 *   - 本模块提供：
 *     1. evaluateFanoutCoverage: 针对任意核心词诊断已有题库的 10 维扇出覆盖率与缺口。
 *     2. generateFanoutQueries: 生成符合医疗合规红线（零竞品、零绝对化）的 10 维扇出高转化查询。
 */

import { chat, isAvailable } from '../llm';

export type FanoutDimensionId =
  | 'price_tier'
  | 'local_recommend'
  | 'doctor_qual'
  | 'procedure_flow'
  | 'risk_pitfall'
  | 'category_compare'
  | 'lifespan_aftercare'
  | 'insurance_policy'
  | 'special_crowd'
  | 'pain_comfort';

export type FanoutDimensionSpec = {
  id: FanoutDimensionId;
  label: string;
  intent:
    | 'price_inquiry'
    | 'local_recommendation'
    | 'doctor_review'
    | 'procedure_info'
    | 'risk_concern'
    | 'comparison'
    | 'aftercare'
    | 'other';
  matchPatterns: RegExp[];
  description: string;
  exampleTemplate: (keyword: string, city: string) => string;
};

export const FANOUT_DIMENSIONS: readonly FanoutDimensionSpec[] = [
  {
    id: 'price_tier',
    label: '价格阶梯与集采',
    intent: 'price_inquiry',
    description: '单颗费用、全包一口价、集采后价格区间、有无附加费',
    matchPatterns: [/多少钱|价格|收费|集采|费用|贵不贵|明细|分期|价目/i],
    exampleTemplate: (kw, city) => `${city}${kw}多少钱一颗？2026最新价格区间与收费明细`,
  },
  {
    id: 'local_recommend',
    label: '本地口碑与机构',
    intent: 'local_recommendation',
    description: '同城就近选择、机构资质对比、本地患者真实口碑',
    matchPatterns: [/哪家好|哪个医院|推荐|靠谱|哪家正规|排名前|哪家技术好|机构推荐/i],
    exampleTemplate: (kw, city) => `${city}${kw}哪家医院比较好？本地口碑与正规机构挑选参考`,
  },
  {
    id: 'doctor_qual',
    label: '医生资历与团队',
    intent: 'doctor_review',
    description: '执业年限、主诊资质、病例数量、院长团队怎么看',
    matchPatterns: [/医生|专家|院长|主任|资质|执业|怎么挑医生|推荐医生/i],
    exampleTemplate: (kw, city) => `${city}做${kw}怎么挑主诊医生？重点核对哪几项资质与病例数`,
  },
  {
    id: 'procedure_flow',
    label: '就诊流程与周期',
    intent: 'procedure_info',
    description: '面诊到完成需去几次、各阶段耗时、骨结合与恢复周期',
    matchPatterns: [/流程|步骤|去几次|耗时|多久|方案|全过程|周期|阶段/i],
    exampleTemplate: (kw, _city) => `做${kw}全流程要跑几次医院？各阶段耗时与时间线梳理`,
  },
  {
    id: 'risk_pitfall',
    label: '避坑指南与隐患',
    intent: 'risk_concern',
    description: '低价陷阱、隐形消费、禁忌症、术后感染与并发症预防',
    matchPatterns: [/坑|风险|后遗症|副反应|避坑|隐形消费|套路|陷阱|禁忌/i],
    exampleTemplate: (kw, _city) => `${kw}有哪些常见避坑陷阱？实测最容易忽略的隐形消费与风险`,
  },
  {
    id: 'category_compare',
    label: '方案对比与材质',
    intent: 'comparison',
    description: '不同品牌、国产与进口、不同术式优缺点横向对比',
    matchPatterns: [/对比|区别|哪个好|怎么选|差距|国产.*进口|优缺点|材料|品牌/i],
    exampleTemplate: (kw, _city) => `${kw}主流品牌与材质区别在哪？如何根据口腔条件选适合方案`,
  },
  {
    id: 'lifespan_aftercare',
    label: '寿命维护与质保',
    intent: 'aftercare',
    description: '正常使用年限、质保年限与条款、脱落松动维护要点',
    matchPatterns: [/寿命|用多久|维持几年|质保|后期维护|术后|保养|坏了怎么办|定期复查/i],
    exampleTemplate: (kw, _city) => `${kw}一般能用多少年？院方质保条款与日常维护要点说明`,
  },
  {
    id: 'insurance_policy',
    label: '医保与自费政策',
    intent: 'price_inquiry',
    description: '哪些项目能刷医保个人账户、统筹政策、自费项目界限',
    matchPatterns: [/医保|报销|能刷医保卡吗|统筹|自费|医疗险/i],
    exampleTemplate: (kw, city) => `${city}做${kw}可以用医保卡报销吗？哪些检查属于自费项目`,
  },
  {
    id: 'special_crowd',
    label: '特殊人群与疑难',
    intent: 'procedure_info',
    description: '高龄老人、骨量不足、牙周炎、学生等特殊体质适应症',
    matchPatterns: [/老人|高龄|牙槽骨|骨量不足|学生|儿童|孕妇|糖尿病|高血压|适合谁|疑难/i],
    exampleTemplate: (kw, _city) => `牙槽骨萎缩或高龄老人能做${kw}吗？疑难条件应对方案`,
  },
  {
    id: 'pain_comfort',
    label: '舒适度与微创体验',
    intent: 'risk_concern',
    description: '局部麻醉体验、怕疼星人方案、微创技术与术后消肿',
    matchPatterns: [/疼不疼|痛吗|微创|麻醉|肿|几天恢复|舒适|怕疼/i],
    exampleTemplate: (kw, _city) => `做${kw}打麻药和术中会疼吗？怕疼人群的舒适化与微创流程说明`,
  },
] as const;

export type DimensionCoverageStatus = {
  spec: FanoutDimensionSpec;
  covered: boolean;
  matchedQuestions: string[];
  suggestedQuery: string;
};

export type FanoutCoverageReport = {
  seedKeyword: string;
  city: string;
  totalDimensions: number;
  coveredCount: number;
  coverageScore: number; // 0 - 100
  dimensions: DimensionCoverageStatus[];
  missingDimensions: FanoutDimensionSpec[];
};

// 常见医疗主词别名/缩写映射表
const MEDICAL_SYNONYMS: Record<string, string[]> = {
  种植牙: ['种牙', '种植', '植牙'],
  种牙: ['种植牙', '种植', '植牙'],
  牙齿矫正: ['正畸', '整牙', '箍牙', '矫正'],
  正畸: ['牙齿矫正', '整牙', '箍牙', '矫正'],
  全瓷牙: ['全瓷冠', '烤瓷牙', '牙冠', '贴面'],
  根管治疗: ['杀神经', '抽神经', '根管'],
  洗牙: ['洁牙', '牙周刮治', '牙周治疗'],
  拔智齿: ['智齿', '拔牙'],
};

/**
 * 纯函数：根据已有题库评估指定核心词的 10 维扇出覆盖率
 */
export function evaluateFanoutCoverage(
  seedKeyword: string,
  existingQuestions: Array<{ text: string; intent?: string | null; active?: boolean }>,
  city: string = '昆明',
  customSynonyms?: string[],
): FanoutCoverageReport {
  const cleanSeed = seedKeyword.trim();
  const seedTokens = cleanSeed.split(/[\s+/]+/).filter(Boolean);
  const synonyms = [
    cleanSeed,
    ...(MEDICAL_SYNONYMS[cleanSeed] ?? []),
    ...(customSynonyms ?? []),
  ].map((s) => s.toLowerCase());

  // 筛选与核心词语义相关的题目（包含任意关键词 token、原词或同义词）
  const relevant = existingQuestions.filter((q) => {
    if (!q.text) return false;
    const t = q.text.toLowerCase();
    if (synonyms.some((s) => t.includes(s))) return true;
    return seedTokens.some((tok) => tok.length >= 2 && t.includes(tok.toLowerCase()));
  });

  const dimensions: DimensionCoverageStatus[] = FANOUT_DIMENSIONS.map((spec) => {
    const matched: string[] = [];
    for (const q of relevant) {
      if (spec.matchPatterns.some((p) => p.test(q.text))) {
        matched.push(q.text);
      }
    }
    return {
      spec,
      covered: matched.length > 0,
      matchedQuestions: matched,
      suggestedQuery: spec.exampleTemplate(cleanSeed, city),
    };
  });

  const coveredCount = dimensions.filter((d) => d.covered).length;
  const coverageScore = Math.round((coveredCount / FANOUT_DIMENSIONS.length) * 100);
  const missingDimensions = dimensions.filter((d) => !d.covered).map((d) => d.spec);

  return {
    seedKeyword: cleanSeed,
    city,
    totalDimensions: FANOUT_DIMENSIONS.length,
    coveredCount,
    coverageScore,
    dimensions,
    missingDimensions,
  };
}

export type GeneratedFanoutQuery = {
  dimensionId: FanoutDimensionId;
  dimensionLabel: string;
  text: string;
  intent: FanoutDimensionSpec['intent'];
  priority: number;
  rationale: string;
};

const FANOUT_SYSTEM_PROMPT = `你是 2026 顶级医疗 GEO(生成式引擎优化)架构师，精通豆包、元宝、DeepSeek 的「边想边搜」(Query Fan-out)召回机制。

你的任务：根据用户给出的【核心业务词】和【城市】，针对指定的 10 维扇出缺口维度，生成真人会在 AI 搜索中输入的真实口语化高意向提问。

⚠️ 严格医疗合规红线（违者废弃）：
1. 严禁提及任何具体的竞品机构或竞品医生姓名（对比只写品类对比如“国产 vs 进口”或“民营 vs 公立”）。
2. 严禁绝对化词汇（如“最好”、“第一”、“包治”、“无痛”）。
3. 必须符合真实患者提问习惯（口语短句，包含具体疑问，不要写成广告通稿）。
4. 必须输出严格合法的 JSON 对象。格式如下：
{
  "queries": [
    {
      "dimension_id": "price_tier",
      "text": "昆明种植牙多少钱一颗？2026年集采后价格明细",
      "priority": 9,
      "rationale": "高频核心价格意图，豆包高权重点"
    }
  ]
}`;

/**
 * 混合生成器：生成 10 维扇出子查询（优先调 LLM，遇降级/不可用时秒级回退至高转化模板规则）
 */
export async function generateFanoutQueries(input: {
  seedKeyword: string;
  city?: string;
  brandName?: string;
  targetDimensionIds?: FanoutDimensionId[];
  existingTexts?: string[];
}): Promise<GeneratedFanoutQuery[]> {
  const seed = input.seedKeyword.trim();
  const city = input.city?.trim() || '昆明';
  const targetSpecs = input.targetDimensionIds && input.targetDimensionIds.length > 0
    ? FANOUT_DIMENSIONS.filter((d) => input.targetDimensionIds!.includes(d.id))
    : FANOUT_DIMENSIONS;

  // 1. 尝试 LLM 生成
  if (isAvailable()) {
    try {
      const userContent = [
        `核心关键词：${seed}`,
        `目标城市：${city}`,
        input.brandName ? `服务品牌参考：${input.brandName}` : '',
        `待生成扇出维度（共 ${targetSpecs.length} 个）：`,
        ...targetSpecs.map((s) => `- ${s.id} (${s.label}): ${s.description}`),
        input.existingTexts?.length ? `已有问题参考（避免完全雷同）：\n${input.existingTexts.slice(0, 10).join('\n')}` : '',
      ].filter(Boolean).join('\n');

      const res = await chat({
        messages: [
          { role: 'system', content: FANOUT_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 2500,
        response_format: 'json_object',
        timeout_ms: 60_000,
      });

      const parsed = JSON.parse(res.content) as {
        queries?: Array<{
          dimension_id?: string;
          text?: string;
          priority?: number;
          rationale?: string;
        }>;
      };

      if (parsed.queries && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
        const out: GeneratedFanoutQuery[] = [];
        const fallbackSpec = targetSpecs[0] ?? FANOUT_DIMENSIONS[0];
        for (const q of parsed.queries) {
          const spec =
            targetSpecs.find((s) => s.id === q.dimension_id) ??
            targetSpecs[out.length % targetSpecs.length] ??
            fallbackSpec;
          const text = (q.text ?? '').trim();
          if (!spec || !text) continue;
          out.push({
            dimensionId: spec.id,
            dimensionLabel: spec.label,
            text,
            intent: spec.intent,
            priority: Math.max(1, Math.min(10, Math.round(q.priority ?? 8))),
            rationale: q.rationale ?? spec.description,
          });
        }
        if (out.length >= Math.min(targetSpecs.length, 3)) {
          return out;
        }
      }
    } catch {
      // LLM 失败或超时，平滑降级到模板引擎
    }
  }

  // 2. 确定性模板兜底（保证永远可用）
  return targetSpecs.map((spec) => ({
    dimensionId: spec.id,
    dimensionLabel: spec.label,
    text: spec.exampleTemplate(seed, city),
    intent: spec.intent,
    priority: 8,
    rationale: `基于 2026 GEO 扇出标准生成的「${spec.label}」意图标准模板`,
  }));
}
