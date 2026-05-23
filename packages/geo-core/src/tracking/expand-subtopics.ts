/**
 * 子问题展开 (V1.12 D31) — 把 1 个主题题展开成 8-10 个长尾子问题。
 *
 * 报告依据(`docs/research/doubao-geo-mechanism.md` §1.8 + §3.3):
 *   - 豆包「边想边搜」内部把 1 个原始 query 拆成 8-10 子查询并行召回
 *   - 新榜大样本(2026 Q1, 47.4 万引用源)测得"标题与子问题关键词匹配度"
 *     r=0.23 是唯一显著正相关因子。字数 / 粉丝量 / 互动 r<0.04 全不显著
 *   - 大V不享有特权,爆款没有优势 — GEO 战略变成"建几百长尾覆盖关键词矩阵"
 *
 * 这个函数是该战略的工程入口。给定主题题 → LLM 生成 8-10 个子问题,
 * 每个子问题:
 *   1. 像真人会输入的口语 query(不要书面化"如何"/"何时"/"何故"叠加)
 *   2. 覆盖不同场景维度(价格 / 地点 / 医生 / 服务 / 年龄段 / 对比 / 风险 / 流程)
 *   3. 子问题之间彼此独立,不重复
 *   4. 跟主题题在同一行业上下文里(医疗 / 教育 / 律所等)
 *
 * 输出 + 入参 都是纯字符串,DB 落库由 caller 负责(避免 geo-core 依赖 supabase)。
 */

import { chat, isAvailable } from '../llm';

export type ExpansionInput = {
  /** 主题题原文,如"昆明牙科推荐" */
  topic: string;
  /** 行业上下文,如"昆明本地口腔医疗" — 给 LLM 加 anchor 避免跑题 */
  industry_context?: string;
  /** 品牌名 — 让 LLM 知道是哪家的视角(但**不要**让它写软广) */
  brand_name?: string;
  /** 目标子问题数,default 8 */
  count?: number;
};

export type Subtopic = {
  /** 子问题文本(口语化 query) */
  text: string;
  /** intent 分类(对齐 questions.intent enum) */
  intent:
    | 'local_recommendation'
    | 'price_inquiry'
    | 'procedure_info'
    | 'doctor_review'
    | 'comparison'
    | 'risk_concern'
    | 'aftercare'
    | 'other';
  /** 估算相关性 1-10,LLM 自评 — 用于人工 review 时排序 */
  estimated_relevance: number;
  /** 这子问题潜在覆盖的关键词列表(标题写作时参考) */
  key_keywords: string[];
};

export type ExpansionResult =
  | { ok: true; subtopics: Subtopic[]; raw_response: string }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `你是 GEO(生成式引擎优化)专家,精通豆包/元宝/夸克这类 AI 搜索的「边想边搜」机制。

你的任务:把 1 个主题词展开成 N 个真人会输入豆包的子问题,目的是建立"长尾关键词矩阵"覆盖豆包内部检索时拆解出的子查询。

子问题质量要求:
1. **像真人输入,不是书面提问**:用户在豆包里会输"昆明种牙多少钱一颗",不会输"昆明地区种植牙单颗费用如何"
2. **覆盖多维度**:价格 / 地点(区/街道) / 医生 / 设备 / 年龄段 / 对比 / 流程 / 风险 / 售后 / 资质
3. **彼此独立**:不要 2 个子问题问同一事(如"种牙贵不贵" + "种牙多少钱")
4. **跟原主题保持上下文**:不要跑题(昆明牙科 ≠ 西安牙科)
5. **不要软广**:不要给某品牌脸,客观陈述
6. **每个子问题附 3-5 个核心关键词**(后续做标题命中度优化时直接用)

intent 分类(必须从下列选一个):
- local_recommendation: "XX 哪家好"类
- price_inquiry: "XX 多少钱"类
- procedure_info: 流程 / 步骤 / 怎么做
- doctor_review: 医生 / 团队相关
- comparison: A vs B 对比
- risk_concern: 风险 / 副作用 / 禁忌
- aftercare: 术后 / 护理
- other: 其他

输出严格 JSON,不要 markdown 代码栏:
{
  "subtopics": [
    { "text": "...", "intent": "...", "estimated_relevance": N, "key_keywords": ["...", "..."] }
  ]
}`;

function buildUserMessage(input: ExpansionInput): string {
  const lines: string[] = [];
  lines.push(`主题题:${input.topic}`);
  if (input.industry_context) lines.push(`行业上下文:${input.industry_context}`);
  if (input.brand_name) {
    lines.push(`品牌(只是上下文参考,不要给它脸):${input.brand_name}`);
  }
  lines.push(`需要展开:${input.count ?? 8} 个子问题`);
  return lines.join('\n');
}

export async function expandSubtopics(input: ExpansionInput): Promise<ExpansionResult> {
  if (!isAvailable()) {
    return { ok: false, reason: 'ARK_API_KEY not set' };
  }
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserMessage(input) },
  ];

  let result;
  try {
    result = await chat({
      messages,
      temperature: 0.6, // 略偏定向 — 太高会跑题
      max_tokens: 2000,
      response_format: 'json_object',
      timeout_ms: 60_000,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const parsed = parseJson(result.content);
  if (!parsed) {
    return { ok: false, reason: `LLM unparseable JSON: ${result.content.slice(0, 120)}…` };
  }
  if (!Array.isArray(parsed.subtopics)) {
    return { ok: false, reason: 'LLM JSON missing "subtopics" array' };
  }

  const subtopics: Subtopic[] = [];
  for (const raw of parsed.subtopics) {
    const r = raw as Record<string, unknown>;
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    if (!text || text.length < 4) continue;
    const intent = validIntent(r.intent) ? (r.intent as Subtopic['intent']) : 'other';
    const relevance =
      typeof r.estimated_relevance === 'number'
        ? Math.max(1, Math.min(10, Math.floor(r.estimated_relevance)))
        : 5;
    const kw = Array.isArray(r.key_keywords)
      ? (r.key_keywords as unknown[])
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 8)
      : [];
    subtopics.push({
      text,
      intent,
      estimated_relevance: relevance,
      key_keywords: kw,
    });
  }

  if (subtopics.length === 0) {
    return { ok: false, reason: 'LLM returned 0 valid subtopics' };
  }

  return { ok: true, subtopics, raw_response: result.content };
}

const INTENT_VALUES = new Set([
  'local_recommendation',
  'price_inquiry',
  'procedure_info',
  'doctor_review',
  'comparison',
  'risk_concern',
  'aftercare',
  'other',
]);

function validIntent(v: unknown): v is Subtopic['intent'] {
  return typeof v === 'string' && INTENT_VALUES.has(v);
}

function parseJson(text: string): { subtopics?: unknown } | null {
  const tryOnce = (raw: string) => {
    try {
      return JSON.parse(raw) as { subtopics?: unknown };
    } catch {
      return null;
    }
  };
  const trimmed = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let obj = tryOnce(trimmed);
  if (!obj) {
    const s = trimmed.indexOf('{');
    const e = trimmed.lastIndexOf('}');
    if (s >= 0 && e > s) obj = tryOnce(trimmed.slice(s, e + 1));
  }
  return obj;
}
