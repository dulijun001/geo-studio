/**
 * Stage 2 of the three-gate compliance flow: LLM semantic review via Doubao.
 *
 * Called AFTER stage-1 keyword scan. We feed the model:
 *   - The full variant title + body
 *   - The keyword hits from stage 1 (so it doesn't waste time re-finding them)
 *
 * The model's job is to catch SEMANTIC violations the keyword scan missed:
 *   - Soft guarantees ("放心""值得信赖的品质")
 *   - Implicit superlatives ("业内罕见的经验""堪称行业典范")
 *   - Fabricated data wrapping real guidelines in bogus numbers
 *   - Testimonial tone without naming "感谢信"
 *
 * Returns a structured verdict. On LLM failure, caller should fall back to
 * a conservative 'warn' (see worker job).
 */

import { chat, isAvailable } from '../llm/doubao';
import type { KeywordHit } from './scanner';

export type LlmFinding = {
  span: string;
  rule: string;
  suggestion: string;
};

export type LlmReviewResult = {
  verdict: 'pass' | 'warn' | 'reject';
  risk_level: 'low' | 'medium' | 'high';
  findings: LlmFinding[];
  rewritten_body: string | null;
  rationale: string;
  raw: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const SYSTEM_RULES = `
你是一名熟读《广告法》《医疗广告管理办法》《互联网广告管理办法》的医疗广告合规审查员。
你的任务是对一段即将发布的医疗内容做**语义层**合规审查——关键词扫描已经先跑过了,你要抓的是关键词抓不住的软性违规。

━━━ 七档审查规则 ━━━
A. **高风险(direct reject)**
   1. 保证性承诺:任何形式承诺疗效/治愈/绝对/永不复发,无论是否用了禁词。例:"放心选择""告别烦恼"都可能触发。
   2. 患者案例/前后对比/感谢信:即使没写"感谢",只要语气像"我家人做了之后非常满意"也算。
   3. 医生代言/专家推荐:"XX 医生强力推荐""国医大师钦点"等。
   4. 他医院对比:"比 XX 医院技术好""周边最好的诊所"等。
   5. 编造统计数据:没有来源的具体百分比、样本量、研究数字。最容易的合规雷区,请严查。

B. **中风险(warn, 需要人工审批)**
   6. 绝对化/弱保证:"领先""首选""值得信赖""效果显著""放心选择"等。
   7. 销售导向:"优惠""限时""买赠""首诊立减""在线咨询送 XX"等。

C. **低风险(pass)**
   纯科普、纯流程介绍、纯医生简介(仅注册信息+擅长领域)。

━━━ 判定优先级 ━━━
任何一条高风险触发 → reject + high
任何一条中风险触发但无高风险 → warn + medium
无任何触发 → pass + low

━━━ 改写建议 ━━━
仅当 verdict=warn 时,必须给出 rewritten_body(保留原意、移除违规点、不新增事实)。
verdict=reject 或 pass 时,rewritten_body 返回 null。

━━━ 严格 JSON 输出 ━━━
{
  "verdict": "pass" | "warn" | "reject",
  "risk_level": "low" | "medium" | "high",
  "findings": [{"span": "原文片段", "rule": "违反的具体条款,如 '广告法§17(1) 保证性承诺'", "suggestion": "改写建议"}],
  "rewritten_body": string | null,
  "rationale": "一句话说明为什么给这个 verdict"
}
`.trim();

export type LlmReviewInput = {
  title: string;
  body: string;
  platform: string;
  keyword_hits: KeywordHit[];
};

export async function llmReviewAvailable(): Promise<boolean> {
  return isAvailable();
}

export async function runLlmReview(
  input: LlmReviewInput,
  opts?: { timeout_ms?: number; max_tokens?: number },
): Promise<LlmReviewResult> {
  if (!isAvailable()) {
    throw new Error('ARK_API_KEY not set — caller should fall back to conservative warn');
  }

  const hitBlock =
    input.keyword_hits.length > 0
      ? input.keyword_hits
          .map((h) => `  - [${h.level}] "${h.term}" 命中 (${h.category})`)
          .join('\n')
      : '  (关键词扫描无命中,请仅做语义审查)';

  const userContent = `
审查对象:
平台: ${input.platform}
标题: ${input.title}
正文:
${input.body}

关键词扫描已经命中的词(你无需重复,重点找语义违规):
${hitBlock}

请按系统规则输出严格 JSON。
`.trim();

  const result = await chat({
    messages: [
      { role: 'system', content: SYSTEM_RULES },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
    max_tokens: opts?.max_tokens ?? 1500,
    response_format: 'json_object',
    timeout_ms: opts?.timeout_ms ?? 120_000,
  });

  const parsed = parseLlmJson(result.content);
  if (!parsed) {
    throw new Error(`LLM returned unparseable JSON: ${result.content.slice(0, 200)}`);
  }

  return {
    ...parsed,
    raw: result.content,
    usage: result.usage,
  };
}

function parseLlmJson(
  text: string,
): Omit<LlmReviewResult, 'raw' | 'usage'> | null {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const verdict = obj.verdict as string;
    const risk_level = obj.risk_level as string;
    if (!['pass', 'warn', 'reject'].includes(verdict)) return null;
    if (!['low', 'medium', 'high'].includes(risk_level)) return null;

    const findings = Array.isArray(obj.findings)
      ? (obj.findings as unknown[])
          .map((f) => f as Record<string, unknown>)
          .filter((f) => typeof f.span === 'string' && typeof f.rule === 'string')
          .map((f) => ({
            span: f.span as string,
            rule: f.rule as string,
            suggestion: typeof f.suggestion === 'string' ? f.suggestion : '',
          }))
      : [];

    return {
      verdict: verdict as 'pass' | 'warn' | 'reject',
      risk_level: risk_level as 'low' | 'medium' | 'high',
      findings,
      rewritten_body: typeof obj.rewritten_body === 'string' ? obj.rewritten_body : null,
      rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
    };
  } catch {
    return null;
  }
}
