/**
 * Stage 1 of the three-gate compliance flow: deterministic keyword scanning.
 *
 * Design goals:
 *   - Pure function, no IO, <50ms on multi-kB text so it can run inline during
 *     variant generation without blocking user-facing paths.
 *   - Robust against simple obfuscation: 繁简 variants, inserted whitespace
 *     ("保 证"), fullwidth punctuation ("第一。" vs "第一.").
 *   - Case-insensitive for latin alphabet terms (e.g. "NO.1").
 *   - No tokenization — Chinese doesn't have word boundaries and medical
 *     compliance cares about substrings anyway ("包治百病" -> hit on "包治").
 *
 * Explicitly NOT in scope here:
 *   - Suggested rewrites — that's stage 2's LLM job.
 *
 * Context exemptions (context_exempt column), V1.13:
 *   Each keyword may carry exempt PHRASES that contain the term but are
 *   legitimate usage — anatomical names ("第一恒磨牙"), negations
 *   ("没有绝对"), medical terms ("绝对禁忌"). A hit is skipped only when it
 *   falls entirely inside an occurrence of one of ITS OWN keyword's exempt
 *   phrases. Phrases, not context classes — data-driven, extendable per
 *   incident, and a guarantee like "绝对不会松" stays caught because it
 *   matches no exempt phrase.
 */

export type KeywordRow = {
  id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  variants: string[];
  /**
   * Optional platform restriction. When set + non-empty, this keyword only
   * applies to variants targeting these platforms. null/undefined/empty =
   * applies to all platforms (the default).
   *
   * Used for platform-specific red lines:
   *   抖音    医美/瘦脸针/水光针 类硬禁
   *   小红书  销售类话术(私信/购买/限时优惠)硬禁
   *   头条号  夸大宣传容忍度高,但医师身份审查严
   */
  platforms?: string[];
  /**
   * Exempt phrases (V1.13). Occurrences of the term INSIDE any of these
   * phrases are not hits. Must each contain the term (or a variant);
   * entries that don't are harmless no-ops.
   */
  context_exempt?: string[];
};

export type KeywordHit = {
  keyword_id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  /** The exact substring in the original text that matched (post-normalization offset mapping). */
  matched_span: string;
  /** Char offset in the ORIGINAL (un-normalized) text. */
  offset: number;
  /** 30 chars around the hit for UI preview / audit log. */
  context_snippet: string;
};

export type ScanResult = {
  hits: KeywordHit[];
  /** Highest severity present. 'none' when hits is empty. */
  max_level: 'none' | 'A' | 'B';
  /** Derived stage-1 verdict per the three-gate flow. */
  verdict: 'pass' | 'warn' | 'reject';
  /** Derived risk level. */
  risk_level: 'low' | 'medium' | 'high';
  duration_ms: number;
};

/**
 * Built-in dental & Chinese linguistic exemptions by normalized needle.
 * Prevents false-positive rejections on standard clinical terminology,
 * ordinal sequences, and scientific documentation references.
 */
const BUILTIN_CONTEXT_EXEMPTIONS: Record<string, string[]> = {
  第一: [
    '第一恒磨牙',
    '第一前磨牙',
    '第一磨牙',
    '第一乳磨牙',
    '第一切牙',
    '第一双尖牙',
    '第一次',
    '第一颗',
    '第一步',
    '第一阶段',
    '第一期',
    '第一疗程',
    '第一天',
    '第一周',
    '第一个月',
    '第一年',
    '第一时间',
    '第一批',
    '第一道',
    '第一轮',
    '第一线',
    '第一反应',
    '第一印象',
    '第一手',
    '第一，',
    '第一、',
    '第一:',
    '第一：',
    '第一点',
    '第一项',
    '第一条',
    '第一类',
    '第一层',
    '第一组',
  ],
  永久: [
    '永久修复体',
    '永久修复',
    '永久冠',
    '永久牙冠',
    '永久义齿',
    '永久固定义齿',
    '永久牙',
    '永久牙列',
    '永久充填',
    '永久粘接',
    '永久黏固',
    '永久封闭',
  ],
  绝对: [
    '没有绝对',
    '不是绝对',
    '并非绝对',
    '并无绝对',
    '无绝对',
    '非绝对',
    '不具有绝对',
    '不代表绝对',
    '绝对禁忌',
    '绝对适应',
    '绝对值',
    '绝对湿度',
    '绝对酒精',
    '绝对障碍',
    '绝对优势',
    '绝对上限',
    '绝对年龄',
    '绝对不可以',
    '绝对不要',
    '绝对禁止',
    '绝对不可',
  ],
  保证: [
    '难以保证',
    '无法保证',
    '不能保证',
    '不保证',
    '并非保证',
    '很难保证',
    '质量保证',
  ],
  确保: [
    '确保牙面',
    '确保干燥',
    '确保隔湿',
    '确保无菌',
    '确保视野',
    '确保手术方案',
    '确保含氟',
    '确保附着',
    '确保贴合',
    '确保密合',
    '确保安全距离',
    '确保咬合',
    '确保清洁',
    '确保基台',
    '确保取模',
    '确保导板',
    '确保口腔',
    '确保精确',
    '确保精准',
    '确保种植位置',
    '确保位置',
  ],
  真实病例: [
    '真实病例记录',
    '参考院内真实病例',
    '真实病例数据',
    '真实病例及',
    '真实病例回顾',
  ],
  案例: [
    '接诊案例中',
    '诊疗案例中',
    '临床案例中',
    '文献案例',
    '典型案例分析',
  ],
  接诊过: [
    '接诊过6',
    '接诊过7',
    '接诊过8',
    '接诊过多位',
    '接诊过老年',
    '接诊过复杂',
  ],
  曾接诊: [
    '曾接诊6',
    '曾接诊7',
    '曾接诊8',
    '曾接诊多位',
    '曾接诊老年',
    '曾接诊复杂',
  ],
};

/**
 * Needles eligible for reverse-disclaimer negation exemption
 * (e.g. "临床上不存在无风险或一劳永逸的情况", "家长误以为涂布封闭材料后便能永久无损").
 */
const NEGATABLE_DISCLAIMER_NEEDLES = new Set([
  '无风险',
  '零风险',
  '一劳永逸',
  '永久',
  '终身',
  '管用一辈子',
  '100%',
  '百分百',
  '百分之百',
  '包治',
  '根治',
  '治愈',
  '痊愈',
  '永不复发',
  '永不反复',
  '绝对安全',
  '完全无痛',
  '零疼痛',
  '无痛',
  '无副作用',
  '无并发症',
  '立竿见影',
  '一次搞定',
  '一次解决',
  '药到病除',
  '零失败',
  '无失败案例',
  '保证',
  '确保',
]);

const NEGATION_CLAUSE_RE =
  /(不存在|并非|并不是|不是|不代表|不等于|不意味着|没有|并无|绝非|不能|无法|难以|不可能|切勿|不要|莫要|避免|警惕|误以为|以为|切忌|幻想|盲信|迷信|轻信|所谓|夸大)/;

/**
 * Checks whether a matched guarantee/efficacy term at `idx` in `normalized`
 * is governed by a negation / anti-myth warning within the same clause.
 */
function isNegatedDisclaimer(normalized: string, idx: number, needle: string): boolean {
  if (!NEGATABLE_DISCLAIMER_NEEDLES.has(needle)) return false;
  const lookbackStart = Math.max(0, idx - 18);
  const preceding = normalized.slice(lookbackStart, idx);
  // Stop at sentence-ending punctuation so negation from a previous sentence doesn't leak
  const lastSentenceBreak = Math.max(
    preceding.lastIndexOf('。'),
    preceding.lastIndexOf('！'),
    preceding.lastIndexOf('？'),
    preceding.lastIndexOf('；'),
    preceding.lastIndexOf('!'),
    preceding.lastIndexOf('?'),
    preceding.lastIndexOf(';'),
  );
  const sameClausePrefix =
    lastSentenceBreak >= 0 ? preceding.slice(lastSentenceBreak + 1) : preceding;
  return NEGATION_CLAUSE_RE.test(sameClausePrefix);
}

/**
 * Scan text against a keyword dictionary.
 * Pass the keywords pre-loaded from `compliance_keywords`.
 *
 * `targetPlatform` filters keywords whose `platforms` field doesn't include
 * it. Pass undefined/null to disable filtering (= scan everything).
 */
export function scanKeywords(
  text: string,
  keywords: KeywordRow[],
  targetPlatform?: string | null,
): ScanResult {
  const started = Date.now();
  const normalized = normalize(text);
  const hits: KeywordHit[] = [];
  const seen = new Set<string>(); // dedupe (keyword_id + offset)

  const applicable = targetPlatform
    ? keywords.filter(
        (kw) => !kw.platforms || kw.platforms.length === 0 || kw.platforms.includes(targetPlatform),
      )
    : keywords;

  // Merge context_exempt across all keywords that share a needle so tenant-specific
  // duplicate rows (with empty context_exempt) still respect global exemptions.
  const sharedExemptByNeedle = new Map<string, Set<string>>();
  for (const kw of applicable) {
    const needles = [kw.term, ...kw.variants].map(normalize).filter((s) => s.length > 0);
    for (const needle of needles) {
      let set = sharedExemptByNeedle.get(needle);
      if (!set) {
        set = new Set<string>(BUILTIN_CONTEXT_EXEMPTIONS[needle] ?? []);
        sharedExemptByNeedle.set(needle, set);
      }
      for (const ex of kw.context_exempt ?? []) {
        if (ex) set.add(ex);
      }
    }
  }

  for (const kw of applicable) {
    const needles = [kw.term, ...kw.variants].map(normalize).filter((s) => s.length > 0);

    // Pre-compute exempt intervals for THIS keyword on the normalized text.
    // A term hit fully inside any interval is legitimate usage — skip it.
    const exemptPhrases = new Set<string>(kw.context_exempt ?? []);
    for (const needle of needles) {
      for (const ex of sharedExemptByNeedle.get(needle) ?? []) {
        exemptPhrases.add(ex);
      }
    }

    const exemptRanges: Array<[number, number]> = [];
    for (const raw of exemptPhrases) {
      const phrase = normalize(raw);
      if (phrase.length === 0) continue;
      let f = 0;
      while (true) {
        const i = normalized.indexOf(phrase, f);
        if (i < 0) break;
        exemptRanges.push([i, i + phrase.length]);
        f = i + 1;
      }
    }
    const isExempt = (start: number, len: number): boolean =>
      exemptRanges.some(([s, e]) => start >= s && start + len <= e);

    for (const needle of needles) {
      let from = 0;
      while (from <= normalized.length - needle.length) {
        const idx = normalized.indexOf(needle, from);
        if (idx < 0) break;

        if (isExempt(idx, needle.length) || isNegatedDisclaimer(normalized, idx, needle)) {
          from = idx + needle.length;
          continue;
        }

        const origOffset = mapOffset(text, idx);
        const dedupKey = `${kw.id}:${origOffset}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          hits.push({
            keyword_id: kw.id,
            term: kw.term,
            level: kw.level,
            category: kw.category,
            matched_span: text.slice(origOffset, origOffset + needle.length) || kw.term,
            offset: origOffset,
            context_snippet: extractContext(text, origOffset, needle.length),
          });
        }
        from = idx + needle.length;
      }
    }
  }

  const hasA = hits.some((h) => h.level === 'A');
  const hasB = hits.some((h) => h.level === 'B');
  const max_level: ScanResult['max_level'] = hasA ? 'A' : hasB ? 'B' : 'none';
  const verdict: ScanResult['verdict'] = hasA ? 'reject' : hasB ? 'warn' : 'pass';
  const risk_level: ScanResult['risk_level'] = hasA ? 'high' : hasB ? 'medium' : 'low';

  return {
    hits: hits.sort((a, b) => a.offset - b.offset),
    max_level,
    verdict,
    risk_level,
    duration_ms: Date.now() - started,
  };
}

/**
 * Normalize text for matching:
 *   1. Lowercase (latin alphabet only — preserves CJK).
 *   2. Strip whitespace and common obfuscation punctuation between chars.
 *   3. Convert common fullwidth digits/punct to halfwidth.
 *   4. 繁 -> 简 (minimal table; variants column carries most of the load).
 *
 * Note: we intentionally DON'T strip all punctuation — a period inside
 * "NO.1" is semantically meaningful. We only strip SPACES and zero-widths.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s​‌‍﻿]+/g, '') // all whitespace + zero-widths
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字
    .replace(/[Ａ-Ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0).toLowerCase(),
    ) // 全角大写字母
    .replace(/[ａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); // 全角小写字母
}

/**
 * Map a normalized-string offset back to the original-string offset.
 * We reproduce the normalize() walk char-by-char; for V1 kB-scale text this is fine.
 */
function mapOffset(original: string, normalizedOffset: number): number {
  let normIdx = 0;
  for (let i = 0; i < original.length; i++) {
    if (normIdx === normalizedOffset) return i;
    const ch = original[i];
    if (!ch) continue;
    // skip chars that normalize() drops
    if (/[\s​‌‍﻿]/.test(ch)) continue;
    normIdx++;
  }
  return original.length;
}

function extractContext(text: string, offset: number, length: number): string {
  const pad = 15;
  const start = Math.max(0, offset - pad);
  const end = Math.min(text.length, offset + length + pad);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ') + suffix;
}
