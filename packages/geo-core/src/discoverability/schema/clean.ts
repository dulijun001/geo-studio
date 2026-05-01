/**
 * D18 enforcement helper: recursively drop empty fields from a JSON-LD object.
 *
 * "Empty" means:
 *   - undefined
 *   - null
 *   - '' (empty string)
 *   - [] (empty array)
 *   - {} (empty object after recursion)
 *
 * Numeric 0 and boolean false ARE preserved — they're meaningful values.
 *
 * This runs once at the end of each builder. Builders should NOT manually
 * conditional-spread their output; just assemble the full shape and let
 * clean() filter. That keeps builders readable.
 */

export function clean<T extends object>(obj: T): T {
  return cleanValue(obj) as T;
}

function cleanValue(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.length === 0 ? undefined : v;
  if (Array.isArray(v)) {
    const cleaned = v
      .map(cleanValue)
      .filter((x) => x !== undefined);
    return cleaned.length === 0 ? undefined : cleaned;
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const c = cleanValue(val);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return v;
}
