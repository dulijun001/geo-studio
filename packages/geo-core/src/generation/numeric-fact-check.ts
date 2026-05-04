/**
 * Numeric fact-check — guards against the most dangerous medical content
 * failure mode: borrowing a real source title (e.g. 《中华口腔医学指南 2024》)
 * while wrapping it around a fabricated number ("72% of patients...").
 *
 * The four-gate (D5/D12) catches keyword violations and historical-case
 * matches; checkCitations() (V1.6) verifies titles are whitelisted. Neither
 * checks whether the *numbers* near a citation are consistent with what the
 * source actually says.
 *
 * Architecture (档位 C1):
 *   1. Extract every sentence in the body that contains BOTH a citation
 *      reference (《...》 / authority org / guideline name) AND a number.
 *   2. For each such (citation, sentence, numbers) triple:
 *        a. Heuristic: hard-reject if the sentence pairs a number with
 *           absolute-medical patterns (100% 治愈, 根治率, 终身有效, etc.) —
 *           these are inherently false in medicine. No LLM needed.
 *        b. If citation has operator-curated `key_claims`: send a batched
 *           LLM judge call with (sentence, key_claims) pairs, asking
 *           "is the claim's number consistent with what key_claims say?"
 *        c. Else (no key_claims, no hard pattern): pass — we don't have
 *           ground truth, and absent obvious red flags we don't fabricate
 *           verdicts. Shows up in `mode: 'no_ground_truth'`.
 *   3. Aggregate verdicts — worst case wins (reject > suspect > pass).
 *
 * The LLM judge is intentionally pessimistic: when in doubt, return 'suspect'
 * (routes to manual review). 'reject' only when key_claims clearly contradict
 * the article's number.
 */

import { chat, isAvailable } from '../llm/doubao';

export type NumericClaimVerdict = 'pass' | 'suspect' | 'reject';

export type NumericClaim = {
  citation: string;
  number: string;
  sentence: string;
  verdict: NumericClaimVerdict;
  reason: string;
  mode: 'heuristic_reject' | 'llm_judged' | 'no_ground_truth';
};

export type NumericFactCheckResult = {
  scanned_at: string;
  verdict: NumericClaimVerdict;
  claims: NumericClaim[];
  /** Was the LLM judge actually invoked? False when stub/no key_claims. */
  llm_used: boolean;
};

export type VerifiedCitationWithClaims = {
  title: string;
  aliases: string[];
  key_claims: string[];
};

/**
 * Hard-reject patterns: a number paired with these words is medically false
 * regardless of source. Even if 《X 指南》 truly exists, no real medical
 * guideline says "100% 治愈" or "终身保证". These patterns signal LLM
 * fabrication or operator pasting marketing copy.
 */
const HARD_REJECT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\d+\s*%\s*(治愈|根治|痊愈)/, reason: '医疗绝对化:百分比 + 治愈/根治/痊愈' },
  { re: /(治愈|根治|痊愈)\s*率\s*\d+\s*%/, reason: '医疗绝对化:治愈率/根治率 + 百分比' },
  { re: /有效率\s*100\s*%/, reason: '医疗绝对化:有效率 100%' },
  { re: /成功率\s*100\s*%/, reason: '医疗绝对化:成功率 100%' },
  { re: /(终身|永久|一辈子)\s*(保证|保障|有效|不复发)/, reason: '医疗绝对化:终身保证/永久有效' },
  { re: /包治/, reason: '医疗绝对化:包治' },
];

/**
 * Citation-marker patterns. A sentence is "claim-bearing" only if it contains
 * BOTH one of these AND a number — otherwise we don't fact-check it (a number
 * with no citation context isn't a claim being attributed to a source).
 */
function findCitationMatches(sentence: string): string[] {
  const out: string[] = [];
  // 《...》 references
  for (const m of sentence.matchAll(/《([^》]{2,40})》/g)) {
    if (m[0]) out.push(m[0]);
  }
  // Guideline / consensus / standard / white-paper / recommendation suffixes
  for (const m of sentence.matchAll(/((?:[一-龥A-Za-z0-9]{2,12})(?:指南|共识|标准|白皮书|规范|建议))/g)) {
    if (m[0]) out.push(m[0]);
  }
  // Authority orgs
  for (const m of sentence.matchAll(/(国家(?:卫健委|药监局|医保局|疾控中心)|中华(?:口腔|医学|医疗器械)?医学会|WHO|FDA|CDC)/g)) {
    if (m[0]) out.push(m[0]);
  }
  return Array.from(new Set(out));
}

/**
 * Numbers worth fact-checking: percentages, sample sizes (≥2 digits standalone),
 * year ranges, prices. Bare years ("2024") on their own are excluded — they're
 * usually publication dates, not claims.
 */
function findNumbers(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(/\d+(?:\.\d+)?\s*(?:%|‰)/g)) {
    if (m[0]) out.push(m[0].trim());
  }
  for (const m of sentence.matchAll(/\d+(?:\.\d+)?\s*(?:倍|位|名|例|颗|元|万元?|亿|分钟|小时|天|周|月)/g)) {
    if (m[0]) out.push(m[0].trim());
  }
  // 5 年存活率 / 10 年随访 — number + 年/月 + a noun
  for (const m of sentence.matchAll(/\d+\s*(?:年|月)\s*(?:存活率|生存率|随访|复查|保用|保障)/g)) {
    if (m[0]) out.push(m[0].trim());
  }
  return Array.from(new Set(out));
}

/** Split body into reasonably-sized sentences for analysis. */
function splitSentences(body: string): string[] {
  return body
    .split(/[。!?]+\s*/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

/**
 * Match a citation marker (e.g. "《种植学指南》") against the operator-curated
 * citation list. Returns the entry whose title or alias appears in the marker
 * text, or null if none match (which means it'd already be flagged by
 * checkCitations() upstream — we don't fact-check unverified citations).
 */
function findCitationOwner(
  marker: string,
  citations: VerifiedCitationWithClaims[],
): VerifiedCitationWithClaims | null {
  const markerNorm = marker.replace(/[《》\s]/g, '');
  for (const c of citations) {
    const candidates = [c.title, ...(c.aliases ?? [])].map((t) => t.replace(/\s/g, ''));
    for (const cand of candidates) {
      if (cand.length === 0) continue;
      if (markerNorm.includes(cand) || cand.includes(markerNorm)) {
        return c;
      }
    }
  }
  return null;
}

type LlmJudgeInput = {
  citation_title: string;
  key_claims: string[];
  article_sentence: string;
  number: string;
};

/**
 * Ask doubao to judge whether `article_sentence`'s number is consistent with
 * `key_claims` for that citation. Pessimistic: when key_claims don't directly
 * address the number, return 'suspect' rather than 'pass'.
 *
 * Batch is supported via the array form — single LLM call covers all claims.
 */
async function runLlmJudge(
  inputs: LlmJudgeInput[],
): Promise<Array<{ verdict: NumericClaimVerdict; reason: string }>> {
  if (inputs.length === 0) return [];

  const numbered = inputs.map((it, i) => `
案例 ${i + 1}:
  - 引用源:${it.citation_title}
  - 引用源已收录的真实关键陈述(ground truth):
${it.key_claims.map((k) => `      • ${k}`).join('\n')}
  - 文章中的句子:"${it.article_sentence}"
  - 文章声称的数字:${it.number}
`).join('\n---\n');

  const messages = [
    {
      role: 'system' as const,
      content:
        '你是一名严谨的医疗内容事实核查员。任务:判断"文章中的句子"中提到的"数字"是否与"引用源的真实关键陈述(ground truth)"一致或合理推导。\n\n' +
        '判定原则(必须严格):\n' +
        '1. 如果 ground truth 明确支持该数字 → pass\n' +
        '2. 如果 ground truth 与该数字明显矛盾(数量级偏差 / 完全不同的指标) → reject\n' +
        '3. 如果 ground truth 没有覆盖该数字 / 无法判断 → suspect (默认走人工)\n' +
        '4. 任何医疗"绝对化"用语(100%/治愈/根治) 即使 ground truth 出现也走 reject\n\n' +
        '严格输出 JSON: {"results": [{"verdict": "pass|suspect|reject", "reason": "≤30 字简述"}]}',
    },
    { role: 'user' as const, content: numbered },
  ];

  const result = await chat({
    messages,
    temperature: 0.1,
    response_format: 'json_object',
    timeout_ms: 60_000,
    max_tokens: 1500,
  });

  try {
    const parsed = JSON.parse(result.content) as {
      results?: Array<{ verdict?: string; reason?: string }>;
    };
    if (!Array.isArray(parsed.results)) {
      throw new Error('LLM returned no results array');
    }
    return parsed.results.map((r) => ({
      verdict:
        r.verdict === 'pass' || r.verdict === 'reject' ? r.verdict : 'suspect',
      reason: typeof r.reason === 'string' ? r.reason.slice(0, 80) : '判定不明确',
    }));
  } catch (err) {
    // LLM failure → conservative suspect for all
    console.warn('[numeric-fact-check] LLM judge parse failed:', err);
    return inputs.map(() => ({ verdict: 'suspect' as const, reason: 'LLM 判定失败' }));
  }
}

/** Worst verdict wins. */
function aggregate(verdicts: NumericClaimVerdict[]): NumericClaimVerdict {
  if (verdicts.includes('reject')) return 'reject';
  if (verdicts.includes('suspect')) return 'suspect';
  return 'pass';
}

export async function checkNumericFacts(
  body: string,
  citations: VerifiedCitationWithClaims[],
  opts: { allowLlm?: boolean } = {},
): Promise<NumericFactCheckResult> {
  const scanned_at = new Date().toISOString();
  const allowLlm = opts.allowLlm !== false && isAvailable();

  const claims: NumericClaim[] = [];
  const sentences = splitSentences(body);
  const llmInputs: LlmJudgeInput[] = [];
  const llmInputClaimIdx: number[] = [];

  for (const sentence of sentences) {
    const markers = findCitationMatches(sentence);
    if (markers.length === 0) continue;
    const numbers = findNumbers(sentence);
    const hardHit = HARD_REJECT_PATTERNS.find((p) => p.re.test(sentence));

    // Special case: citation + absolute-medical pattern WITHOUT a number
    // (e.g. "《X 指南》指出,该术式终身保证不复发"). Pattern itself is the
    // claim — no LLM call possible since there's no number to ground.
    if (numbers.length === 0) {
      if (hardHit) {
        for (const marker of markers) {
          claims.push({
            citation: marker,
            number: '(无数字)',
            sentence,
            verdict: 'reject',
            reason: hardHit.reason,
            mode: 'heuristic_reject',
          });
        }
      }
      continue;
    }

    for (const marker of markers) {
      for (const number of numbers) {
        // Hard-reject heuristics first — no LLM cost for clear-cut cases.
        if (hardHit) {
          claims.push({
            citation: marker,
            number,
            sentence,
            verdict: 'reject',
            reason: hardHit.reason,
            mode: 'heuristic_reject',
          });
          continue;
        }

        const owner = findCitationOwner(marker, citations);
        if (!owner || owner.key_claims.length === 0) {
          // No ground truth → can't judge, but record the (unverifiable) pair
          // so admin UI can see what the operator could improve by adding
          // key_claims. Marked as 'pass' so it doesn't block the variant.
          claims.push({
            citation: marker,
            number,
            sentence,
            verdict: 'pass',
            reason: '无 key_claims,跳过 LLM 裁判',
            mode: 'no_ground_truth',
          });
          continue;
        }

        if (!allowLlm) {
          claims.push({
            citation: marker,
            number,
            sentence,
            verdict: 'suspect',
            reason: 'LLM 不可用,保守标 suspect',
            mode: 'llm_judged',
          });
          continue;
        }

        // Queue for batched LLM judge
        const claimIdx = claims.length;
        claims.push({
          citation: marker,
          number,
          sentence,
          verdict: 'suspect',
          reason: '待 LLM 裁判',
          mode: 'llm_judged',
        });
        llmInputs.push({
          citation_title: owner.title,
          key_claims: owner.key_claims,
          article_sentence: sentence,
          number,
        });
        llmInputClaimIdx.push(claimIdx);
      }
    }
  }

  let llm_used = false;
  if (llmInputs.length > 0) {
    try {
      const verdicts = await runLlmJudge(llmInputs);
      llm_used = true;
      verdicts.forEach((v, i) => {
        const idx = llmInputClaimIdx[i];
        if (idx === undefined) return;
        const claim = claims[idx];
        if (!claim) return;
        claim.verdict = v.verdict;
        claim.reason = v.reason;
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[numeric-fact-check] LLM judge failed:', reason);
      // Leave claims at default 'suspect' — they were initialized that way.
    }
  }

  const verdict = aggregate(claims.map((c) => c.verdict));
  return { scanned_at, verdict, claims, llm_used };
}
