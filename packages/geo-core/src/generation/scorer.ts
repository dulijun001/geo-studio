/**
 * GEO 9-tactic rule-based scorer.
 *
 * Aggarwal et al. (2023) introduced 9 tactics that consistently improve a
 * document's chance of being cited by generative search engines:
 *
 *   1. Statistics inclusion        — concrete numbers improve trustworthiness
 *   2. Quotation addition           — "..." quotes from named sources
 *   3. Citation source              — references to studies, guidelines, books
 *   4. Authoritative tone           — third-person professional voice
 *   5. Fluency optimization         — clean prose, varied sentence length
 *   6. Easy-to-understand           — short sentences, clear structure
 *   7. Keyword stuffing             — title keyword density in body
 *   8. Position                     — key info in opening 100 chars
 *   9. Unique phrasing              — non-template patterns
 *
 * This scorer measures every tactic with regex / counting heuristics on the
 * Chinese variant body. It's intentionally cheap (no extra LLM call) so it
 * can run inside variant-generate without doubling the per-variant cost.
 *
 * Tactic 9 (unique phrasing) is hard to measure without a reference corpus
 * — we keep it as a small constant pass-through (4/5) and let the LLM-blend
 * future iteration penalize cliches if needed.
 *
 * Score weights chosen so total = 100. Citation gets the biggest weight
 * (20) because it's the clearest signal AI engines look for and the easiest
 * for a writer to add explicitly.
 */

export type GeoScoreBreakdown = {
  statistics: TacticScore;
  quotation: TacticScore;
  citation: TacticScore;
  fluency: TacticScore;
  readability: TacticScore;
  keyword_freq: TacticScore;
  position: TacticScore;
  unique: TacticScore;
  authority: TacticScore;
};

export type TacticScore = {
  score: number;
  max: number;
  evidence?: string[];
  note?: string;
};

export type GeoScore = {
  total: number;
  version: number;
  scored_at: string;
  rewrite_count: number;
  breakdown: GeoScoreBreakdown;
};

const VERSION = 1;

/**
 * Build a human-readable hint listing the weakest tactics, suitable for
 * injection into a rewrite-pass prompt via PromptContext.rewrite_hint.
 *
 * Picks tactics where score / max < 0.6 and sorts by absolute gap. Returns
 * up to 3 priority items so the model isn't overwhelmed.
 */
export function buildRewriteHint(score: GeoScore): string {
  type Item = { id: string; gap: number; score: number; max: number; ratio: number; advice: string };
  const advisor: Record<string, string> = {
    statistics: '加入更多具体数字(年限、百分比、价格区间、样本量等),不要泛泛而谈',
    quotation: '加入 1-2 处「直接引语」(医生原话、文献金句),用 「...」 引号包裹',
    citation: '加入至少 1 条具名权威来源(《XX 指南》/中华医学会/国家卫健委)',
    fluency: '增加段落数(至少 3 段),让句子长短交替,不要一直长句或一直短句',
    readability: '把超过 35 字的长句拆成 2-3 句,每段控制在 80 字内',
    keyword_freq: '主题关键词在正文里至少出现 2-5 次,不要只在标题',
    position: '把主题关键词放进开头 100 字以内,首句最好就出现',
    unique: '避开「众所周知」「随着...的发展」「为大家详细介绍」这种模板套话',
    authority: '使用 "临床数据显示"/"医生建议"/"研究表明" 这类权威短语,避免主观夸张',
  };
  const items: Item[] = [];
  for (const [id, t] of Object.entries(score.breakdown)) {
    const ratio = t.max > 0 ? t.score / t.max : 1;
    if (ratio < 0.6) {
      items.push({
        id,
        gap: t.max - t.score,
        score: t.score,
        max: t.max,
        ratio,
        advice: advisor[id] ?? '提升此维度',
      });
    }
  }
  if (items.length === 0) {
    return `上一版 GEO 综合评分 ${score.total}/100,大部分维度尚可,只是综合分仍低于 70 阈值,请整体精修语言,提升信息密度。`;
  }
  // Sort by gap desc — biggest deficit first
  items.sort((a, b) => b.gap - a.gap);
  const top = items.slice(0, 3);
  const lines = top.map((it) => `  • ${it.id}=${it.score}/${it.max} → ${it.advice}`);
  return [
    `上一版 GEO 综合评分 ${score.total}/100,以下 ${top.length} 项最弱,本轮请重点补强:`,
    ...lines,
    `不要做大幅改动,保留原标题和主体结构,只针对上述弱项做精修。`,
  ].join('\n');
}

export function scoreGeo(input: {
  title: string;
  body: string;
  /** Title keyword to check density of in the body. Defaults to first 8 chars of title. */
  primary_keyword?: string;
  rewrite_count?: number;
}): GeoScore {
  const { title, body } = input;
  const primary = (input.primary_keyword ?? title.slice(0, 8)).trim();

  const breakdown: GeoScoreBreakdown = {
    statistics: scoreStatistics(body),
    quotation: scoreQuotation(body),
    citation: scoreCitation(body),
    fluency: scoreFluency(body),
    readability: scoreReadability(body),
    keyword_freq: scoreKeywordFreq(primary, body),
    position: scorePosition(primary, body),
    unique: scoreUnique(body),
    authority: scoreAuthority(body),
  };

  const total = Object.values(breakdown).reduce((sum, t) => sum + t.score, 0);

  return {
    total,
    version: VERSION,
    scored_at: new Date().toISOString(),
    rewrite_count: input.rewrite_count ?? 0,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Per-tactic scorers
// ─────────────────────────────────────────────────────────────────────────

/** Statistics: count digits, percent signs, prices, time spans, success rates. Max 15. */
function scoreStatistics(body: string): TacticScore {
  // Match 95%, 5 年, 200元, 10 颗, 30 万, etc. Numbers next to chinese units.
  const digitRuns = body.match(/\d+(?:\.\d+)?(?:%|‰|岁|年|月|周|天|颗|元|万|亿|分|分钟|小时)/g) ?? [];
  // Standalone numbers (≥ 4 digits is usually a price/quantity, not a year alone)
  const naked = body.match(/(?<![\d.])\d{2,}(?![\d.年%])/g) ?? [];
  const total = digitRuns.length + Math.min(naked.length, 3);
  // 0 → 0, 1-2 → 6, 3-5 → 11, 6+ → 15
  const score = total === 0 ? 0 : total <= 2 ? 6 : total <= 5 ? 11 : 15;
  return {
    score,
    max: 15,
    evidence: digitRuns.slice(0, 6),
  };
}

/** Quotation: chinese 「」 or 西文 "..." with named-entity-like content. Max 15. */
function scoreQuotation(body: string): TacticScore {
  const cn = body.match(/[「『]([^」』]{4,40})[」』]/g) ?? [];
  const en = body.match(/“([^”]{4,40})”/g) ?? [];
  const total = cn.length + en.length;
  const score = total === 0 ? 0 : total === 1 ? 7 : total >= 3 ? 15 : 11;
  return { score, max: 15, evidence: [...cn.slice(0, 3), ...en.slice(0, 3)] };
}

/** Citation source: reference to guidelines, studies, books, organizations. Max 20. */
function scoreCitation(body: string): TacticScore {
  const evidence: string[] = [];
  // 《...》 book / guideline references
  for (const m of body.matchAll(/《([^》]{3,40})》/g)) {
    if (m[1]) evidence.push(`《${m[1]}》`);
  }
  // 指南 / 共识 / 标准 / 白皮书 mentions
  for (const m of body.matchAll(/((?:[一-龥A-Za-z0-9]{2,12})(?:指南|共识|标准|白皮书|规范|建议))/g)) {
    if (m[1]) evidence.push(m[1]);
  }
  // Authority orgs: 卫健委 / 中华医学会 / 国家XX / WHO / FDA
  for (const m of body.matchAll(/(国家(?:卫健委|药监局|医保局|疾控中心)|中华(?:口腔|医学|医疗器械)?医学会|WHO|FDA|CDC|国家XX)/g)) {
    if (m[1]) evidence.push(m[1]);
  }
  const total = evidence.length;
  const score = total === 0 ? 0 : total === 1 ? 10 : total === 2 ? 16 : 20;
  return { score, max: 20, evidence: Array.from(new Set(evidence)).slice(0, 6) };
}

/** Fluency: paragraph count, sentence length variance. Max 10. */
function scoreFluency(body: string): TacticScore {
  const paragraphs = body.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const sentences = body.split(/[。!?\n]/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return { score: 0, max: 10, note: 'no sentences' };
  const lens = sentences.map((s) => s.length);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((a, l) => a + (l - avg) ** 2, 0) / lens.length;
  const stdev = Math.sqrt(variance);
  // Good: 3+ paragraphs, sentence stdev > 8 (mix of short + long)
  let score = 0;
  if (paragraphs.length >= 3) score += 5;
  else if (paragraphs.length === 2) score += 3;
  if (stdev >= 8) score += 5;
  else if (stdev >= 5) score += 3;
  return { score: Math.min(score, 10), max: 10, note: `paragraphs=${paragraphs.length} stdev=${stdev.toFixed(1)}` };
}

/** Readability: avg sentence length ≤ 35 chars (chinese reads slower). Max 10. */
function scoreReadability(body: string): TacticScore {
  const sentences = body.split(/[。!?\n]/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return { score: 0, max: 10 };
  const avg = sentences.reduce((a, s) => a + s.length, 0) / sentences.length;
  // ≤ 25 best, 25-35 OK, 35-50 weak, >50 bad
  const score = avg <= 25 ? 10 : avg <= 35 ? 8 : avg <= 50 ? 5 : 2;
  return { score, max: 10, note: `avg=${avg.toFixed(1)} chars/sentence` };
}

/** Keyword density: primary keyword appears 2-5 times in body. Max 10. */
function scoreKeywordFreq(keyword: string, body: string): TacticScore {
  if (!keyword) return { score: 5, max: 10, note: 'no keyword' };
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = body.match(new RegExp(escaped, 'g')) ?? [];
  const n = matches.length;
  // 0 = bad (forgot the topic), 1 = thin, 2-5 = sweet spot, 6+ = stuffing
  const score = n === 0 ? 0 : n === 1 ? 5 : n <= 5 ? 10 : 6;
  return { score, max: 10, note: `keyword="${keyword}" count=${n}` };
}

/** Position: primary keyword appears within first 100 chars. Max 10. */
function scorePosition(keyword: string, body: string): TacticScore {
  if (!keyword) return { score: 5, max: 10 };
  const head = body.slice(0, 120);
  return {
    score: head.includes(keyword) ? 10 : 0,
    max: 10,
    note: head.includes(keyword) ? 'keyword in head 120' : 'keyword missing in head 120',
  };
}

/** Unique phrasing: penalize template phrases like "众所周知" / "随着...的发展". Max 5. */
function scoreUnique(body: string): TacticScore {
  const cliches = [
    '众所周知',
    '随着.{0,10}的发展',
    '在当今(社会|时代)',
    '为大家详细介绍',
    '本文将.{0,10}介绍',
    '不可忽视',
    '俗话说',
  ];
  let hits = 0;
  for (const c of cliches) {
    if (new RegExp(c).test(body)) hits++;
  }
  // Each cliche -1, max 5, min 0
  const score = Math.max(0, 5 - hits);
  return { score, max: 5, note: `cliches=${hits}` };
}

/** Authority tone: presence of professional verbs vs casual / sales pitch. Max 5. */
function scoreAuthority(body: string): TacticScore {
  // Positive: 临床研究表明 / 依据指南 / 推荐使用 / 数据显示
  const goodPatterns = [
    /临床(研究|数据|经验|实践)(表明|显示)/,
    /依据(.{0,10})指南/,
    /(医生|专家)(建议|推荐|指出)/,
    /(数据|研究)(表明|显示|证明)/,
  ];
  // Negative: 绝对 / 100% 治愈 / 强烈推荐购买 / 错过血亏 (also flagged in compliance scan)
  const badPatterns = [/绝对.{0,5}有效/, /100\s*%\s*治愈/, /包治/, /错过.{0,5}血亏/];
  let pos = 0;
  let neg = 0;
  for (const p of goodPatterns) if (p.test(body)) pos++;
  for (const p of badPatterns) if (p.test(body)) neg++;
  const score = Math.max(0, Math.min(5, pos * 2 - neg * 2));
  return { score, max: 5, note: `pos=${pos} neg=${neg}` };
}
