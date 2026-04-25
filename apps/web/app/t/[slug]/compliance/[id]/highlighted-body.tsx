type Finding = {
  keyword_id: string;
  term: string;
  level: 'A' | 'B';
  category: string;
  matched_span: string;
  offset: number;
  context_snippet: string;
};

/**
 * Renders the variant body with A/B keyword hits inline-highlighted.
 *
 * Note: findings.offset is measured on (title + '\n\n' + body) because that's
 * what the scanner saw during stage-1. Here we only have body, so we shift by
 * the title prefix length passed in via data (future). For V1 we approximate
 * by rescanning findings against body string and marking matches; the exact
 * offset from the review row is used only when it falls inside the body range.
 */
export function HighlightedBody({
  body,
  findings,
}: {
  body: string;
  findings: Finding[];
}) {
  if (findings.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans">{body}</pre>;
  }

  // Re-locate each finding's matched_span inside the body. We prefer re-matching
  // (rather than trusting the stored offset) because that offset was computed
  // against title+body, and the title portion isn't rendered here.
  type Mark = { start: number; end: number; level: 'A' | 'B'; term: string };
  const marks: Mark[] = [];
  for (const f of findings) {
    const needle = f.matched_span || f.term;
    if (!needle) continue;
    let from = 0;
    while (from <= body.length - needle.length) {
      const idx = body.indexOf(needle, from);
      if (idx < 0) break;
      marks.push({ start: idx, end: idx + needle.length, level: f.level, term: f.term });
      from = idx + needle.length;
    }
  }

  if (marks.length === 0) return <pre className="whitespace-pre-wrap font-sans">{body}</pre>;

  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping marks (keep the more severe level).
  const merged: Mark[] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
      if (m.level === 'A') last.level = 'A';
    } else {
      merged.push({ ...m });
    }
  }

  const parts: Array<string | { text: string; level: 'A' | 'B'; term: string }> = [];
  let cursor = 0;
  for (const m of merged) {
    if (cursor < m.start) parts.push(body.slice(cursor, m.start));
    parts.push({ text: body.slice(m.start, m.end), level: m.level, term: m.term });
    cursor = m.end;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));

  return (
    <pre className="whitespace-pre-wrap font-sans">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <mark
            key={i}
            title={`[${p.level} 级] ${p.term}`}
            className={`rounded px-0.5 ${
              p.level === 'A' ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
            }`}
          >
            {p.text}
          </mark>
        ),
      )}
    </pre>
  );
}
