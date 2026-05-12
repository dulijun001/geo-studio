/**
 * Auto-import academic citations from dental-knowledge-base into
 * verified_citations.
 *
 * Source:
 *   ~/projects/dental-knowledge-base/{种植牙,正畸,儿牙,牙周,综合口腔}/markdown/*.md
 *   Each .md starts with YAML frontmatter (title, authors, journal, year,
 *   pmid, doi, evidence_level, ...).
 *
 * Idempotent: re-runs skip titles already in verified_citations for this
 * tenant. Safe to invoke multiple times.
 *
 * Run: pnpm --filter @geo/db dev-import-academic
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const KB_ROOT = '/Users/dulijuner/projects/dental-knowledge-base';
const TENANT_SLUG = 'songshu';
const DOMAINS = ['种植牙', '正畸', '儿牙', '牙周', '综合口腔'];

type Frontmatter = {
  title?: string;
  original_title?: string;
  authors?: string;
  journal?: string;
  year?: string | number;
  doi?: string;
  pmid?: string | number;
  study_type?: string;
  evidence_level?: string;
  topic?: string;
  language?: string;
  url?: string;
  pdf_local?: string | null;
};

/**
 * Minimal YAML frontmatter parser — handles only key: value lines (no nested
 * structures or multi-line values, which this KB doesn't use).
 */
function parseFrontmatter(text: string): Frontmatter | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val === 'null' || val === '') continue;
    fm[key] = val;
  }
  return fm as unknown as Frontmatter;
}

function mapSourceType(studyType?: string): string {
  const t = (studyType ?? '').toLowerCase();
  if (t.includes('guideline') || t.includes('consensus') || t.includes('policy')) return 'guideline';
  if (
    t.includes('meta') ||
    t.includes('systematic') ||
    t.includes('rct') ||
    t.includes('cohort') ||
    t.includes('review')
  )
    return 'research_paper';
  return 'other';
}

function extractConclusion(content: string): string | null {
  const m = content.match(/##\s*一句话结论\s*\n+([\s\S]+?)(?=\n##\s)/);
  return m ? m[1]!.trim().replace(/\n+/g, ' ').slice(0, 280) : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', TENANT_SLUG)
    .single();
  if (tErr || !tenant) throw new Error(`tenant '${TENANT_SLUG}' not found: ${tErr?.message}`);
  const tenantId = tenant.id as string;

  // Dedupe: load existing titles
  const { data: existingRows } = await supabase
    .from('verified_citations')
    .select('title')
    .eq('tenant_id', tenantId);
  const existing = new Set((existingRows ?? []).map((r) => r.title as string));
  console.log(`tenant=${TENANT_SLUG} existing_citations=${existing.size}`);

  const rows: Array<Record<string, unknown>> = [];
  let parsed = 0;
  let skipped = 0;

  for (const domain of DOMAINS) {
    const dir = join(KB_ROOT, domain, 'markdown');
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
    } catch (e) {
      console.warn(`  skip ${domain}/markdown (unreadable): ${(e as Error).message}`);
      continue;
    }

    for (const f of files) {
      const content = await readFile(join(dir, f), 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm?.title) {
        console.warn(`  no title in frontmatter: ${domain}/${f}`);
        continue;
      }
      parsed++;
      const title = `《${fm.title}》`;
      if (existing.has(title)) {
        skipped++;
        continue;
      }

      const aliases: string[] = [];
      if (fm.original_title) aliases.push(fm.original_title);
      if (fm.authors && fm.year) {
        const firstAuthor = fm.authors.split(',')[0]!.trim();
        aliases.push(`${firstAuthor} ${fm.year}`);
      }
      if (fm.pmid) aliases.push(`PMID ${fm.pmid}`);

      const claims: string[] = [];
      const conclusion = extractConclusion(content);
      if (conclusion) claims.push(conclusion);
      if (fm.topic) claims.push(`主题:${fm.topic}`);
      if (fm.evidence_level) claims.push(`CEBM 证据级别:${fm.evidence_level}`);

      const notes = [
        `领域:${domain}`,
        fm.pmid ? `PMID: ${fm.pmid}` : null,
        fm.doi ? `DOI: ${fm.doi}` : null,
        fm.url ? `URL: ${fm.url}` : null,
        fm.pdf_local ? `本地 PDF: ${fm.pdf_local}` : null,
        '自动导入 dental-knowledge-base 2026-05-12',
      ]
        .filter(Boolean)
        .join(' / ');

      const yearNum =
        typeof fm.year === 'number' ? fm.year : fm.year ? parseInt(fm.year as string, 10) : null;

      rows.push({
        tenant_id: tenantId,
        title,
        title_aliases: aliases,
        source_type: mapSourceType(fm.study_type),
        issuer: fm.journal ?? '-',
        publication_year: yearNum && !isNaN(yearNum) ? yearNum : null,
        key_claims: claims,
        notes,
        active: true,
        verified_at: new Date().toISOString(),
      });
    }
  }

  console.log(`parsed=${parsed} new=${rows.length} skipped_duplicates=${skipped}`);
  if (rows.length === 0) {
    console.log('Nothing to insert.');
    return;
  }

  const { error: insErr } = await supabase.from('verified_citations').insert(rows);
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  console.log(`✓ Inserted ${rows.length} verified_citations`);
  console.log(`  source_type 分布:`);
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.source_type as string] = (dist[r.source_type as string] ?? 0) + 1;
  for (const [k, v] of Object.entries(dist)) console.log(`    ${k}: ${v}`);
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
