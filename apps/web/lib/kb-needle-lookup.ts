/**
 * KB needle lookup — for compliance review's "suspected_hallucination" panel.
 *
 * Given a list of citation phrases (needles) that didn't match verified_citations,
 * this scans the KB markdown filesystem to determine: are these phrases actually
 * in the KB (= AI faithfully copied marketing copy that's not on the white list,
 * needs operator audit), or are they nowhere in the KB (= true hallucination,
 * AI invented them)?
 *
 * The compliance UI shows 🟢/🔴 next to each unmatched needle:
 *   🟢 Found in KB — operator can verify the source and either soften the
 *      KB phrase or add to verified_citations.
 *   🔴 Not in KB — true LLM hallucination. Reject + send back to rewriter.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { resolveKbRoot } from './kb-root';

export type KbHit = {
  source_path: string; // relative to tenant KB root
  line: number;
  context: string;
};

export type NeedleVerdict = {
  needle: string;
  in_kb: boolean;
  hits: KbHit[]; // max 3
};

// Per-KB-root cache. Re-read every 60s to pick up KB updates without
// burning CPU on every page render while strictly isolating tenants.
type CacheEntry = { path: string; relPath: string; lines: string[] };
const _cacheByRoot = new Map<string, { entries: CacheEntry[]; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function loadKb(kbRoot: string): Promise<CacheEntry[]> {
  const cached = _cacheByRoot.get(kbRoot);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

  const out: CacheEntry[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
        await walk(full);
      } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
        try {
          const s = await stat(full);
          if (s.size > 1_000_000) continue; // skip huge files
          const text = await readFile(full, 'utf-8');
          out.push({
            path: full,
            relPath: relative(kbRoot, full),
            lines: text.split(/\r?\n/),
          });
        } catch {
          // ignore unreadable
        }
      }
    }
  }
  await walk(kbRoot);
  _cacheByRoot.set(kbRoot, { entries: out, cachedAt: Date.now() });
  return out;
}

/**
 * Look up multiple needles in one pass through the tenant's KB. Returns a verdict per
 * needle with up to 3 file:line hits.
 */
export async function lookupNeedlesInKb(
  needles: string[],
  tenantId?: string | null,
): Promise<NeedleVerdict[]> {
  if (!needles.length) return [];
  const kbRoot = await resolveKbRoot(tenantId);
  const kb = await loadKb(kbRoot);
  const verdicts: NeedleVerdict[] = needles.map((n) => ({
    needle: n,
    in_kb: false,
    hits: [],
  }));

  for (const file of kb) {
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i]!;
      for (const v of verdicts) {
        if (v.hits.length >= 3) continue;
        if (v.needle && line.includes(v.needle)) {
          v.in_kb = true;
          v.hits.push({
            source_path: file.relPath,
            line: i + 1,
            context: line.trim().slice(0, 240),
          });
        }
      }
    }
  }
  return verdicts;
}
