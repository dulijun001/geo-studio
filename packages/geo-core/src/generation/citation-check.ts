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

export type CitationCheckResult = {
  scanned_at: string;
  whitelist_size: number;
  matches: CitationCheckMatch[];
  unmatched: CitationCheckUnmatched[];
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
  // pattern 2: 指南/共识/标准/白皮书/规范/建议 (preceded by 2-12 chinese chars or letters/digits)
  for (const m of body.matchAll(
    /((?:[一-龥A-Za-z0-9]{2,14})(?:指南|共识|标准|白皮书|规范|建议))/g,
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
  // pattern 3: authority orgs
  const orgPattern =
    /(国家(?:卫健委|药监局|医保局|疾控中心)|中华(?:口腔|医学|医疗器械)?医学会|WHO|FDA|CDC)/g;
  for (const m of body.matchAll(orgPattern)) {
    const needle = m[1] ?? '';
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    out.push({ needle, offset: m.index ?? 0 });
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
): { id: string; matched_form: string } | null {
  const n = normalize(needle);
  for (const v of whitelist) {
    if (normalize(v.title).includes(n) || n.includes(normalize(v.title))) {
      return { id: v.id, matched_form: v.title };
    }
    for (const a of v.aliases) {
      if (normalize(a).includes(n) || n.includes(normalize(a))) {
        return { id: v.id, matched_form: a };
      }
    }
  }
  return null;
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

  for (const c of candidates) {
    const hit = tryMatch(c.needle, whitelist);
    if (hit) {
      matches.push({ needle: c.needle, verified_id: hit.id, matched_form: hit.matched_form });
    } else {
      const start = Math.max(0, c.offset - 40);
      const end = Math.min(body.length, c.offset + c.needle.length + 40);
      unmatched.push({
        needle: c.needle,
        context_snippet: body.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return {
    scanned_at,
    whitelist_size: whitelist.length,
    matches,
    unmatched,
    verdict: unmatched.length > 0 ? 'suspected_hallucination' : 'ok',
  };
}
