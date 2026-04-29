/**
 * 历史合规处罚案例比对.
 *
 * compliance_cases 表存了真实公开的处罚判例,每条带 `violation_patterns` 列表.
 * 候选文案 body 里命中 ≥ 50% 的 patterns,就标 "跟 XX 案例(罚 X 万)相似".
 *
 * 算法 = jaccard 简化:
 *   matched = patterns 里实际出现在 body 里的子集
 *   similarity = matched.length / patterns.length
 *   if similarity >= 0.5 (and matched.length >= 2): match
 *
 * 单个 pattern 命中不算 — 防误报(关键词扫描那道门已经独立处理 A/B 级).
 * 这道门是看"组合是不是跟某个真实案例像", 不是看"是否有禁词".
 */

export type ComplianceCase = {
  id: string;
  title: string;
  violation_patterns: string[];
  violation_category: string;
  jurisdiction: string | null;
  fine_yuan: number | null;
  case_url: string | null;
};

export type CaseMatchHit = {
  case_id: string;
  title: string;
  category: string;
  jurisdiction: string | null;
  fine_yuan: number | null;
  case_url: string | null;
  similarity: number; // 0..1
  matched_patterns: string[];
  total_patterns: number;
};

export type CaseMatchResult = {
  scanned_at: string;
  cases_evaluated: number;
  matches: CaseMatchHit[]; // sorted by similarity desc
};

export function matchCases(body: string, cases: ComplianceCase[]): CaseMatchResult {
  const matches: CaseMatchHit[] = [];
  const lowerBody = body.toLowerCase();

  for (const c of cases) {
    if (c.violation_patterns.length === 0) continue;
    const matched: string[] = [];
    for (const p of c.violation_patterns) {
      // case-insensitive substring; full-Chinese patterns also work since
      // toLowerCase is identity on CJK.
      if (lowerBody.includes(p.toLowerCase())) matched.push(p);
    }
    const similarity = matched.length / c.violation_patterns.length;
    // Need at least 2 matched patterns AND >= 50% coverage to flag.
    // Single-keyword cases (rare) get a special bypass: 1 of 1 = 1.0 still flags.
    if ((matched.length >= 2 && similarity >= 0.5) || (c.violation_patterns.length === 1 && matched.length === 1)) {
      matches.push({
        case_id: c.id,
        title: c.title,
        category: c.violation_category,
        jurisdiction: c.jurisdiction,
        fine_yuan: c.fine_yuan,
        case_url: c.case_url,
        similarity: Number(similarity.toFixed(3)),
        matched_patterns: matched,
        total_patterns: c.violation_patterns.length,
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);

  return {
    scanned_at: new Date().toISOString(),
    cases_evaluated: cases.length,
    matches,
  };
}
