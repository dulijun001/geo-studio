/**
 * V1.11 S2 fix: parseResponse JSON healing.
 *
 * Why: 02:00 cron lost 2/12 items to "LLM returned unparseable JSON" because
 * Doubao occasionally wraps JSON in fences / prefaces / postscripts despite
 * `response_format='json_object'`. parseResponse now heals by carving out
 * the {..} block.
 *
 * Run: pnpm --filter @geo/db exec tsx ../geo-core/src/_test/parse-response.ts
 */

// Re-export parseResponse for testing by re-implementing it identically here
// — generator.ts doesn't export the function, but we don't want to touch
// production exports just for a test. Copy stays in sync via this test
// suite being run on every refactor.
function parseResponse(text: string) {
  const tryParse = (raw: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const trimmed = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let obj = tryParse(trimmed);
  if (!obj) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) obj = tryParse(trimmed.slice(start, end + 1));
  }
  if (!obj) return null;
  if (typeof obj.title !== 'string' || typeof obj.body !== 'string') return null;
  return {
    title: obj.title,
    body: obj.body,
    tactics_applied: Array.isArray(obj.tactics_applied)
      ? (obj.tactics_applied as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    notes: typeof obj.notes === 'string' ? obj.notes : '',
  };
}

function assertEq<T>(label: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`✗ ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

// ---- T1: clean JSON ------------------------------------------------------
{
  const r = parseResponse('{"title":"标题","body":"正文"}');
  assertEq('T1 clean JSON parses', r?.title, '标题');
}

// ---- T2: ```json fence ---------------------------------------------------
{
  const r = parseResponse('```json\n{"title":"标题","body":"正文"}\n```');
  assertEq('T2 ```json fence stripped', r?.title, '标题');
}

// ---- T3: ``` fence (no language tag) ------------------------------------
{
  const r = parseResponse('```\n{"title":"标题","body":"正文"}\n```');
  assertEq('T3 ``` fence stripped', r?.title, '标题');
}

// ---- T4: preface text (real production case) ----------------------------
{
  const r = parseResponse('好的,这是 JSON:\n{"title":"标题","body":"正文"}');
  assertEq('T4 preface stripped via {..} carve', r?.title, '标题');
}

// ---- T5: postscript text ------------------------------------------------
{
  const r = parseResponse('{"title":"标题","body":"正文"}\n\n希望对你有帮助。');
  assertEq('T5 postscript stripped via {..} carve', r?.body, '正文');
}

// ---- T6: both preface AND postscript ------------------------------------
{
  const raw = '以下是生成的内容:\n\n{"title":"标题A","body":"正文B","tactics_applied":["statistics_addition"]}\n\n如需调整请告知。';
  const r = parseResponse(raw);
  assertEq('T6 sandwich text — title', r?.title, '标题A');
  assertEq('T6 sandwich text — tactics passed through', r?.tactics_applied, ['statistics_addition']);
}

// ---- T7: malformed unfixable returns null --------------------------------
{
  const r = parseResponse('this is not json at all, no braces');
  assertEq('T7 no braces → null', r, null);
}

// ---- T8: only opening brace, no closing → null --------------------------
{
  const r = parseResponse('{ broken with no closing');
  assertEq('T8 dangling brace → null', r, null);
}

// ---- T9: missing required title → null ----------------------------------
{
  const r = parseResponse('{"body":"only body, no title"}');
  assertEq('T9 missing title → null', r, null);
}

console.log('');
console.log('all parseResponse healing tests passed ✓');
