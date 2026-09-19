/**
 * 数字断言的「有没有出处」确定性检查（D76,2026-09-19）。
 *
 * 为什么需要它:合规四道门的真实结构是「关键词干净 → 直接 auto_approved,不调 LLM」。
 * 实测 691 次关键词扫描里 422 次 pass,**61% 的内容从来没被语义门看过**。
 * 而 LLM 的 prompt 里自己把「没有来源的具体百分比」列为 A 档高风险 ——
 * 最典型的虚假广告风险点,恰好走的是零审查那条通道。
 *
 * 实测漏出去的（均已发布）:
 *   「咬合力接近真牙(约 80-90%)」
 *   「术后肿胀发生率超过 30%」
 *   「种植牙五年存留率约 98%（数据来源：具体研究）」← 占位符没填,形式像引用实则是空的
 *
 * 为什么不直接让全量内容都过 LLM:那是 3 倍调用量,而且方舟还在欠费、备用通道吃的是
 * 用户自己的订阅额度。这个检查是纯正则 + 邻近窗口判断,**零 LLM 成本、结果可复现**,
 * 精确堵住「数字无出处」这一类,不动其余判断。
 *
 * 判定是 `pending`（转人审）不是 `rejected` —— 数字有没有出处，机器只能看出
 * 「附近有没有出处标记」，不能判断那个出处是不是真的。真伪交给人。
 */

/** 数字断言:百分比、"N 年存留率"、"发生率 N" 这类可核查的定量声明。 */
const NUMERIC_CLAIM_RE =
  /([0-9]{1,3}(?:\.[0-9]+)?\s*%)|((?:存留率|成功率|发生率|有效率|降低|提升|减少)\s*[^。；\n]{0,8}[0-9]{1,3}(?:\.[0-9]+)?\s*%?)/g;

/** 出处标记:附近出现这些才算「说了来源」。 */
const SOURCE_MARK_RE =
  /(数据来源|资料来源|来源[:：])|(《[^》]{2,40}》)|((?:参考|依据|引自|据)\s*[^。；\n]{0,20}(?:研究|指南|共识|报告|白皮书|统计|队列|文献|学会|协会|卫健委|国家))|(\[\d{1,3}\])|(\(\d{1,3}\))|(等\s*(?:研究|文献))/;

/**
 * 假出处:形式上像引用,实际是没填的占位符。比完全没有出处更坏 ——
 * 它会让读者（和审核者）以为这个数字有依据。
 */
const FAKE_SOURCE_RE =
  /(数据来源|资料来源|来源)\s*[:：]\s*(具体研究|具体文献|待补|TBD|xxx|XXX|某研究|相关研究|待填)/;

/** 在数字断言前后各看这么多字,判断有没有出处标记。 */
const SOURCE_WINDOW = 80;

export type NumericSourceFinding = {
  /** 命中的数字断言原文 */
  claim: string;
  /** 在正文中的字符偏移 */
  offset: number;
  /** 前后 SOURCE_WINDOW 字的上下文,供人审直接判断 */
  context: string;
  reason: 'no_source' | 'fake_source';
};

export type NumericSourceResult = {
  /** pass = 没有无源数字;pending = 有,应转人审 */
  verdict: 'pass' | 'pending';
  findings: NumericSourceFinding[];
};

/**
 * 扫正文里所有数字断言,逐个看邻近窗口内有没有出处标记。
 * 纯函数,不依赖数据库和网络。
 */
export function checkNumericSource(body: string): NumericSourceResult {
  const findings: NumericSourceFinding[] = [];
  if (!body) return { verdict: 'pass', findings };

  const seen = new Set<number>();
  NUMERIC_CLAIM_RE.lastIndex = 0;
  for (let m = NUMERIC_CLAIM_RE.exec(body); m; m = NUMERIC_CLAIM_RE.exec(body)) {
    const offset = m.index;
    // 同一处可能被两个分支同时命中,去重
    if (seen.has(offset)) continue;
    seen.add(offset);

    const from = Math.max(0, offset - SOURCE_WINDOW);
    const to = Math.min(body.length, offset + m[0].length + SOURCE_WINDOW);
    const context = body.slice(from, to);

    if (FAKE_SOURCE_RE.test(context)) {
      findings.push({ claim: m[0].trim(), offset, context, reason: 'fake_source' });
      continue;
    }
    if (!SOURCE_MARK_RE.test(context)) {
      findings.push({ claim: m[0].trim(), offset, context, reason: 'no_source' });
    }
  }

  return { verdict: findings.length > 0 ? 'pending' : 'pass', findings };
}

/** 给审核面板和 audit log 用的一行摘要。 */
export function summarizeNumericSource(r: NumericSourceResult): string {
  if (r.verdict === 'pass') return '数字断言均有出处';
  const fake = r.findings.filter((f) => f.reason === 'fake_source').length;
  const none = r.findings.length - fake;
  const parts: string[] = [];
  if (none > 0) parts.push(`${none} 处数字无出处`);
  if (fake > 0) parts.push(`${fake} 处出处是未填占位符`);
  return parts.join('、');
}
