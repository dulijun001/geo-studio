/**
 * Deterministic anti-fabrication sanitizer.
 *
 * Even with strong prompt rules, LLMs occasionally reproduce banned phrases
 * verbatim from KB (the customer's pre-compliance internal sales/marketing
 * copy). This regex pass is the safety net under the prompt: every generated
 * body / title runs through it before it reaches the DB.
 *
 * Strategy: AUTO-SOFTEN with audit log. Hard reject would blow up batches on
 * edge cases; soft replace + loud warn lets compliance review catch any
 * residue while keeping the pipeline flowing.
 *
 * Used by:
 *   - apps/web/lib/ai-draft-core.ts (主稿 generation)
 *   - apps/worker/src/jobs/variant-generate.ts via packages/geo-core/.../generator.ts (变体 rewrite)
 */

export type SanitizeHit = { pattern: string; reason: string; count: number };

const ABSOLUTE_PATTERNS: Array<{ re: RegExp; replace: string; reason: string }> = [
  // 绝对化资质 / 排名
  { re: /国内唯一(?:一家)?/g, replace: '云南较早', reason: 'absolute_unique' },
  { re: /国内首家/g, replace: '云南较早', reason: 'absolute_first' },
  { re: /全国唯一/g, replace: '本地', reason: 'absolute_unique' },
  { re: /全国第一|国内第一|业内第一/g, replace: '专业', reason: 'absolute_rank' },
  { re: /行业领先|业内顶尖|行业第一/g, replace: '专业', reason: 'absolute_rank' },
  // 自创"权威"
  { re: /(\d+\s*项)国际金标准/g, replace: '$1质控流程', reason: 'fake_intl_standard' },
  { re: /国际金标准/g, replace: '质控流程', reason: 'fake_intl_standard' },
  { re: /国家金牌/g, replace: '内部质控', reason: 'fake_authority' },
  { re: /独家(?:技术|疗法|权威)?/g, replace: '专业', reason: 'absolute_exclusive' },
  // 效果承诺
  { re: /包治百病/g, replace: '辅助改善', reason: 'cure_promise' },
  { re: /包治[A-Za-z一-龥]{1,6}/g, replace: '辅助改善', reason: 'cure_promise' },
  { re: /根治[A-Za-z一-龥]{1,6}/g, replace: '改善', reason: 'cure_promise' },
  { re: /(?<![一不可])治愈率(?![低小])/g, replace: '改善率', reason: 'cure_promise' },
  { re: /100%(?:有效|安全|无痛|成功|可靠)/g, replace: '高比例', reason: 'absolute_pct' },
  { re: /无效退款|无效退费/g, replace: '', reason: 'refund_promise' },
  { re: /永久(?:解决|根除|有效)/g, replace: '长期', reason: 'permanence_promise' },
  { re: /终身维护(?:免费)?/g, replace: '长期跟进', reason: 'permanence_promise' },
  { re: /立竿见影/g, replace: '逐步改善', reason: 'instant_effect' },
  // 安全性夸大
  { re: /(?<![无非])无痛(?:种植|手术|治疗|拔牙)/g, replace: '舒适化诊疗', reason: 'no_pain' },
  { re: /零风险|零并发症/g, replace: '低风险', reason: 'zero_risk' },
  { re: /绝对安全/g, replace: '安全', reason: 'absolute_safe' },
  // 比较违规
  { re: /比[一-龥A-Za-z0-9]{1,8}更?(?:好|强|优秀)/g, replace: '具有专业优势', reason: 'comparative' },
  { re: /碾压同行|秒杀同行/g, replace: '专业表现', reason: 'comparative' },
];

export function sanitizeAbsoluteWords(input: string): {
  cleaned: string;
  hits: SanitizeHit[];
} {
  let cleaned = input;
  const hits: SanitizeHit[] = [];
  for (const { re, replace, reason } of ABSOLUTE_PATTERNS) {
    const matches = cleaned.match(re);
    if (matches && matches.length > 0) {
      cleaned = cleaned.replace(re, replace);
      hits.push({ pattern: re.source, reason, count: matches.length });
    }
  }
  return { cleaned, hits };
}
