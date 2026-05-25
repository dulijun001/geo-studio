/**
 * Post-generation citation validation against the verified_citations whitelist.
 *
 * Even with the whitelist injected into the prompt, LLMs occasionally still
 * hallucinate plausible-looking guidelines (《2024 中国口腔健康白皮书》看似
 * 真实但不存在). This module scans the generated body for every citation
 * pattern (《...》, named guidelines, named organizations) and matches each
 * against the whitelist with both exact-match and fuzzy alias substring.
 *
 * Output is meant to land in content_variants.citation_check (jsonb).
 * verdict='suspected_hallucination' should block downstream dispatch and
 * surface in the compliance UI for a human review.
 */

export type VerifiedCitation = {
  id: string;
  title: string;
  aliases: string[];
  /** D34 — ground truth issuer for issuer-mismatch detection. */
  issuer?: string | null;
  /** D34 — ground truth year for year-mismatch detection. */
  publication_year?: number | null;
};

export type CitationCheckMatch = {
  needle: string;
  verified_id: string;
  matched_form: string; // which alias / title was matched
};

export type CitationCheckUnmatched = {
  needle: string;
  context_snippet: string; // ±40 chars around it for human review
};

/**
 * D34 — title matched but adjacent ground-truth attribution is wrong.
 * LLM wrote e.g. "中华口腔医学会 2023 年《牙种植体临床应用指南》" but
 * whitelist says issuer="国家卫健委" / year=2022. Or wrote "第 127 页"
 * when key_claims has no page-level data. Each is treated as
 * suspected_hallucination.
 */
export type CitationDetailIssue = {
  match_id: string; // verified_citations.id of the title that matched
  needle: string; // the 《...》 or guideline phrase
  issue: 'issuer_mismatch' | 'year_mismatch' | 'page_fabricated';
  expected: string; // ground-truth value (or 'N/A' for page issues)
  actual: string; // what the LLM actually wrote
  context_snippet: string;
};

export type CitationCheckResult = {
  scanned_at: string;
  whitelist_size: number;
  matches: CitationCheckMatch[];
  unmatched: CitationCheckUnmatched[];
  /** D34 — title-matched but attribute mismatch. */
  detail_issues?: CitationDetailIssue[];
  verdict: 'ok' | 'suspected_hallucination' | 'whitelist_empty';
};

/**
 * Find citation-like phrases in body. Captures three patterns:
 *   1. 《...》 book/guideline
 *   2. word + (指南|共识|标准|白皮书|规范|建议)
 *   3. authority orgs: 中华...学会, 国家(卫健委|药监局|...), WHO/FDA/CDC
 */
function extractCitationCandidates(body: string): Array<{ needle: string; offset: number }> {
  const out: Array<{ needle: string; offset: number }> = [];
  const seen = new Set<string>();
  // pattern 1: 《...》
  for (const m of body.matchAll(/《([^》]{3,40})》/g)) {
    const needle = `《${m[1]}》`;
    if (!seen.has(needle)) {
      seen.add(needle);
      out.push({ needle, offset: m.index ?? 0 });
    }
  }
  // pattern 2: 指南/共识/白皮书 — only真"引用语义"的后缀。
  // 之前的版本包含 "标准 / 规范 / 建议",但这 3 个词在中文医疗文中
  // 90% 是日常名词(操作规范、饮食建议、8 项金标准),不是引用。
  // 抓它们造成大量误报("引用幻觉 ×11")。"国际金标准"等真营销话术
  // 改由 packages/geo-core/.../compliance/sanitize-absolute.ts 的
  // ABSOLUTE_PATTERNS 拦截 + 自动软化,双层防护更准。
  for (const m of body.matchAll(
    /((?:[一-龥A-Za-z0-9]{2,14})(?:指南|共识|白皮书))/g,
  )) {
    const needle = m[1] ?? '';
    // Skip if already captured inside 《》
    if (!needle || seen.has(needle)) continue;
    // Don't double-count if this exact phrase is inside a 《》 we already captured
    const insideBrackets = out.some((x) => x.needle.includes(needle));
    if (insideBrackets) continue;
    seen.add(needle);
    out.push({ needle, offset: m.index ?? 0 });
  }
  // pattern 3: authority orgs.
  // D34 fix: org names almost always appear as ATTRIBUTION ("中华口腔医学会
  // 2023 年发布的《XX指南》"), not as standalone citations. Pre-D34 we'd
  // flag every "中华口腔医学会" as an unmatched candidate → verdict=
  // suspected_hallucination, even when the body's title citation was clean.
  // Now: skip the org candidate if a real citation (《》or 指南/共识/白皮书)
  // appears within ±40 chars — that means the org is an attribute, not a
  // citation in its own right. Wider-range orphan orgs still get captured.
  const orgPattern =
    /(国家(?:卫健委|药监局|医保局|疾控中心)|中华(?:口腔|医学|医疗器械)?医学会|WHO|FDA|CDC)/g;
  for (const m of body.matchAll(orgPattern)) {
    const needle = m[1] ?? '';
    if (!needle || seen.has(needle)) continue;
    const orgOffset = m.index ?? 0;
    const nearbyCitation = out.some(
      (x) => Math.abs(x.offset - orgOffset) <= 40,
    );
    if (nearbyCitation) continue;
    seen.add(needle);
    out.push({ needle, offset: orgOffset });
  }
  return out;
}

/** Normalize a citation form for fuzzy comparison (strip 《》, spaces, parens). */
function normalize(s: string): string {
  return s
    .replace(/《|》|"|"|'|'|\(|\)|（|）|【|】|\[|\]|\s+/g, '')
    .toLowerCase();
}

function tryMatch(
  needle: string,
  whitelist: VerifiedCitation[],
): { id: string; matched_form: string; entry: VerifiedCitation } | null {
  const n = normalize(needle);
  for (const v of whitelist) {
    if (normalize(v.title).includes(n) || n.includes(normalize(v.title))) {
      return { id: v.id, matched_form: v.title, entry: v };
    }
    for (const a of v.aliases) {
      if (normalize(a).includes(n) || n.includes(normalize(a))) {
        return { id: v.id, matched_form: a, entry: v };
      }
    }
  }
  return null;
}

/**
 * D34 — known publisher aliases that LLMs may write. Each row maps a set of
 * surface forms to a canonical name; compare against verified_citations.issuer
 * after canonicalization. Order matters for substring detection inside a
 * citation context window — longer/more-specific aliases first so we don't
 * have "人卫" eaten by "人民卫生出版社"'s substring scan.
 */
const ISSUER_ALIASES: Array<{ canonical: string; forms: string[] }> = [
  { canonical: '人民卫生出版社', forms: ['人民卫生出版社', '人卫出版社', '人卫社'] },
  { canonical: '北京大学医学出版社', forms: ['北京大学医学出版社', '北大医学出版社'] },
  { canonical: '中华口腔医学会', forms: ['中华口腔医学会'] },
  { canonical: '中华医学会', forms: ['中华医学会'] },
  { canonical: '国家卫生健康委', forms: ['国家卫生健康委员会', '国家卫生健康委', '国家卫健委'] },
  { canonical: '国家药品监督管理局', forms: ['国家药品监督管理局', '国家药监局', '药监局'] },
  { canonical: 'WHO', forms: ['世界卫生组织', 'WHO'] },
  { canonical: 'FDA', forms: ['美国食品药品监督管理局', 'FDA'] },
];

/**
 * D34 — search for any known publisher alias in `text`. Returns the canonical
 * form of the first match, or null. Used inside a small context window
 * adjacent to a《title》to test whether the LLM attached a wrong publisher.
 */
function findIssuerInWindow(text: string): { canonical: string; matched: string } | null {
  for (const row of ISSUER_ALIASES) {
    for (const form of row.forms) {
      const idx = text.indexOf(form);
      if (idx >= 0) return { canonical: row.canonical, matched: form };
    }
  }
  return null;
}

/**
 * D34 — extract a window of `pre` chars before + `post` chars after the
 * needle. Used to check issuer/year claims that LLM placed near the citation.
 * issuer/year typically appear BEFORE the《》(e.g. "中华口腔医学会 2023 年发布的
 *《XX指南》"); page numbers typically appear AFTER ("《XX》第 127 页").
 */
function contextWindow(body: string, offset: number, needleLen: number, pre: number, post: number): string {
  const start = Math.max(0, offset - pre);
  const end = Math.min(body.length, offset + needleLen + post);
  return body.slice(start, end);
}

/**
 * D34 — given a body containing a matched citation, check for issuer / year /
 * page mismatches against the whitelist ground truth. Returns 0-3 issues per
 * citation match.
 *
 * Design choices:
 *   - issuer/year window = 40 chars BEFORE needle (LLM-prefix attribution).
 *     Going wider hits unrelated mentions of "中华口腔医学会" elsewhere in
 *     the body and produces false positives.
 *   - page window = 30 chars AFTER needle. Page refs near OTHER citations
 *     are someone else's problem (those citations get their own checks).
 *   - Year tolerance = exact match. We DON'T allow ±1 — D34 is strict.
 *   - Page check fires for ANY "第 N 页" near a citation, regardless of
 *     whether the whitelist has key_claims content. Page-level precision
 *     is never represented in our whitelist, so any page number is LLM
 *     fabrication by construction.
 */
function checkCitationDetails(
  body: string,
  offset: number,
  needle: string,
  matchedEntry: VerifiedCitation,
): CitationDetailIssue[] {
  const issues: CitationDetailIssue[] = [];
  const preWindow = contextWindow(body, offset, needle.length, 40, 0);
  const postWindow = contextWindow(body, offset, needle.length, 0, 30);
  const fullWindow = preWindow + postWindow;

  // (a) Issuer mismatch — only fires when whitelist has a known issuer AND
  // the LLM wrote a DIFFERENT one in the prefix window. If the LLM omitted
  // attribution entirely we can't flag it (no signal). If LLM wrote the
  // right issuer we don't flag.
  if (matchedEntry.issuer) {
    const found = findIssuerInWindow(preWindow);
    if (found) {
      // Canonicalize whitelist issuer too — it may be written as e.g.
      // "国家卫生健康委" while we canonicalize that to itself; compare
      // canonicals to avoid alias-vs-alias false negatives.
      const truthCanonical =
        ISSUER_ALIASES.find((r) => r.forms.some((f) => matchedEntry.issuer!.includes(f)))
          ?.canonical ?? matchedEntry.issuer;
      if (found.canonical !== truthCanonical) {
        issues.push({
          match_id: matchedEntry.id,
          needle,
          issue: 'issuer_mismatch',
          expected: truthCanonical,
          actual: found.matched,
          context_snippet: fullWindow.replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }

  // (b) Year mismatch — needle prefix mentions \d{4} 年 / \d{4} 年发布.
  // Strict equality. Matched issuer already pulled prefix; reuse window.
  if (matchedEntry.publication_year != null) {
    const yearMatch = preWindow.match(/(\d{4})\s*年/);
    if (yearMatch && yearMatch[1]) {
      const actualYear = parseInt(yearMatch[1], 10);
      if (Number.isFinite(actualYear) && actualYear !== matchedEntry.publication_year) {
        issues.push({
          match_id: matchedEntry.id,
          needle,
          issue: 'year_mismatch',
          expected: String(matchedEntry.publication_year),
          actual: `${yearMatch[1]} 年`,
          context_snippet: fullWindow.replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }

  // (c) Page fabrication — "第 N 页" within 30 chars after the citation.
  // Whitelist has no page-level data; any specific page number is LLM
  // invention. This is the most common "looks-authoritative" hallucination
  // pattern (LLM picks a plausible page number to anchor a false claim).
  const pageMatch = postWindow.match(/第\s*(\d+)\s*页/);
  if (pageMatch && pageMatch[1]) {
    issues.push({
      match_id: matchedEntry.id,
      needle,
      issue: 'page_fabricated',
      expected: 'N/A',
      actual: `第 ${pageMatch[1]} 页`,
      context_snippet: fullWindow.replace(/\s+/g, ' ').trim(),
    });
  }

  return issues;
}

export function checkCitations(body: string, whitelist: VerifiedCitation[]): CitationCheckResult {
  const scanned_at = new Date().toISOString();
  if (whitelist.length === 0) {
    return {
      scanned_at,
      whitelist_size: 0,
      matches: [],
      unmatched: [],
      verdict: 'whitelist_empty',
    };
  }

  const candidates = extractCitationCandidates(body);
  const matches: CitationCheckMatch[] = [];
  const unmatched: CitationCheckUnmatched[] = [];
  const detail_issues: CitationDetailIssue[] = [];

  for (const c of candidates) {
    const hit = tryMatch(c.needle, whitelist);
    if (hit) {
      matches.push({ needle: c.needle, verified_id: hit.id, matched_form: hit.matched_form });
      // D34 — title matched, but check issuer/year/page within the LLM's
      // attribution window. Each issue is independent; one citation can
      // trigger multiple.
      const detail = checkCitationDetails(body, c.offset, c.needle, hit.entry);
      detail_issues.push(...detail);
    } else {
      const start = Math.max(0, c.offset - 40);
      const end = Math.min(body.length, c.offset + c.needle.length + 40);
      unmatched.push({
        needle: c.needle,
        context_snippet: body.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }

  // D34 — verdict reflects both unmatched titles AND attribution issues.
  // Downstream (compliance-review 档位 A2) already routes
  // 'suspected_hallucination' to manual review, so no enum widening needed.
  const isHallucination = unmatched.length > 0 || detail_issues.length > 0;

  return {
    scanned_at,
    whitelist_size: whitelist.length,
    matches,
    unmatched,
    detail_issues: detail_issues.length > 0 ? detail_issues : undefined,
    verdict: isHallucination ? 'suspected_hallucination' : 'ok',
  };
}
