/**
 * Knowledge-base sync job (V1.5).
 *
 * Scans the customer's knowledge base mirror (default: ~/Workspace/songshu-knowledge-base
 * in dev, /opt/kb/松鼠 in prod) and reconciles file system state with the
 * knowledge_sources table.
 *
 * Per-file flow:
 *   1. SHA256 the bytes
 *   2. Parse YAML frontmatter (gray-matter)
 *   3. Skip L3/L4 privacy (defense layer 2; rsync-excludes is layer 1)
 *   4. Extract H1 → title, first paragraph → excerpt, path[0] → category
 *   5. Diff vs DB: insert / update / soft-delete
 *
 * Reconciliation runs every 5 minutes via pg-boss schedule. Per-file errors
 * are logged but do not abort the job — one bad markdown shouldn't block 230
 * good ones.
 *
 * Multi-tenancy note: V1.5 is single-customer (松鼠), so all tenants share
 * the same KB_ROOT. V2 will read knowledge_base_path from tenants config.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, sep } from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { getServiceClient } from '../lib/supabase';

export type KnowledgeSyncJob = {
  /** Limit sync to one tenant by slug. Default: all active tenants. */
  tenant_slug?: string;
};

const KB_ROOT =
  process.env.KNOWLEDGE_BASE_ROOT ??
  `${process.env.HOME}/Workspace/songshu-knowledge-base`;

/**
 * Mirrors ops/kb-sync/rsync-excludes (which is the source of truth for
 * what reaches the ECS mirror). We re-apply the same rules here as a
 * second-pass defense, in case worker is reading from a non-mirrored path
 * during local dev.
 */
const IGNORE_PATTERNS = [
  '.venv/**',
  'node_modules/**',
  '__pycache__/**',
  '.git/**',
  '.stversions/**',
  '工具/app/**',
  '工具/凭证/**',
  '记忆/系统/vectors/**',
  '收件箱/待处理/**',
  '收件箱/临时/**',
  '收件箱/待审核/**',
  '收件箱/已入库/**',
  '收件箱/已处理/**',
  '.sync-conflict-*',
  '**/.snapshot',
  '**/.DS_Store',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
  // L3/L4 hard ignore (also enforced by frontmatter check below)
  '团队/绩效/**',
  '团队/招聘/**',
  '患者/投诉/**',
  '诊疗/病例库/**',
];

type PrivacyLevel = 'L1' | 'L2' | 'L3' | 'L4';

type ScanResult = {
  source_path: string;
  title: string | null;
  excerpt: string | null;
  category: string | null;
  privacy_level: PrivacyLevel;
  source_hash: string;
  byte_size: number;
};

function parsePrivacyLevel(fm: Record<string, unknown>): PrivacyLevel {
  const raw = String(fm['privacy'] ?? fm['privacy_level'] ?? '').toUpperCase();
  if (raw === 'L1' || raw === 'L2' || raw === 'L3' || raw === 'L4') return raw;
  return 'L1';
}

function extractTitle(fmTitle: unknown, content: string): string | null {
  if (typeof fmTitle === 'string' && fmTitle.trim()) return fmTitle.trim();
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function extractExcerpt(content: string): string | null {
  const cleaned = content
    .replace(/^#.*$/gm, '')
    .replace(/^>.*$/gm, '')
    .replace(/^---[\s\S]*?---\s*/m, '');
  const para = cleaned
    .split(/\n\n+/)
    .map((p) => p.trim())
    .find((p) => p.length > 20);
  if (!para) return null;
  return para.replace(/\s+/g, ' ').slice(0, 200);
}

async function scanFile(
  root: string,
  relPath: string,
): Promise<ScanResult | null> {
  const abs = join(root, relPath);
  const buf = await readFile(abs);
  const text = buf.toString('utf-8');
  const hash = createHash('sha256').update(buf).digest('hex');

  let fm: Record<string, unknown> = {};
  let body = text;
  try {
    const parsed = matter(text);
    fm = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    // Bad frontmatter → treat whole file as body, fm = {}
  }

  const privacy_level = parsePrivacyLevel(fm);
  if (privacy_level === 'L3' || privacy_level === 'L4') {
    console.warn(`[kb-sync] privacy=${privacy_level}, skip ${relPath}`);
    return null;
  }

  return {
    source_path: relPath,
    title: extractTitle(fm['title'], body),
    excerpt: extractExcerpt(body),
    category: relPath.split(sep)[0] ?? null,
    privacy_level,
    source_hash: hash,
    byte_size: buf.length,
  };
}

export async function scanKnowledgeBase(root: string): Promise<ScanResult[]> {
  const files = await fg('**/*.md', {
    cwd: root,
    ignore: IGNORE_PATTERNS,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: true,
  });

  const out: ScanResult[] = [];
  for (const rel of files) {
    try {
      const r = await scanFile(root, rel);
      if (r) out.push(r);
    } catch (err) {
      console.error(`[kb-sync] scan ${rel} failed:`, err);
    }
  }
  return out;
}

type SyncStats = {
  tenant_slug: string;
  scanned: number;
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  skipped_privacy: number;
};

export async function handleKnowledgeSync(
  data: KnowledgeSyncJob = {},
): Promise<SyncStats[]> {
  const root = KB_ROOT;
  const client = getServiceClient();

  const tenantQuery = client
    .from('tenants')
    .select('id, slug')
    .is('deleted_at', null);
  const { data: tenants, error: tenantErr } = await tenantQuery;
  if (tenantErr) throw tenantErr;
  if (!tenants?.length) {
    console.log('[kb-sync] no tenants');
    return [];
  }

  const targets = data.tenant_slug
    ? tenants.filter((t) => t.slug === data.tenant_slug)
    : tenants;

  const all: SyncStats[] = [];

  for (const tenant of targets) {
    console.log(`[kb-sync] tenant=${tenant.slug} root=${root}`);
    let scan: ScanResult[];
    try {
      scan = await scanKnowledgeBase(root);
    } catch (err) {
      console.error(`[kb-sync] tenant=${tenant.slug} scan failed:`, err);
      continue;
    }

    const { data: existing, error: existingErr } = await client
      .from('knowledge_sources')
      .select('id, source_path, source_hash')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null);
    if (existingErr) {
      console.error(`[kb-sync] tenant=${tenant.slug} fetch existing failed:`, existingErr);
      continue;
    }

    const existingByPath = new Map(
      (existing ?? []).map((r) => [r.source_path, r] as const),
    );
    const scanByPath = new Map(scan.map((r) => [r.source_path, r] as const));

    let added = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;
    const now = new Date().toISOString();

    for (const item of scan) {
      const prev = existingByPath.get(item.source_path);
      if (!prev) {
        const { error } = await client.from('knowledge_sources').insert({
          tenant_id: tenant.id,
          source_path: item.source_path,
          title: item.title,
          excerpt: item.excerpt,
          category: item.category,
          privacy_level: item.privacy_level,
          source_hash: item.source_hash,
          byte_size: item.byte_size,
          indexed_at: now,
        });
        if (error) {
          console.error(`[kb-sync] insert ${item.source_path} failed:`, error);
          continue;
        }
        added++;
      } else if (prev.source_hash !== item.source_hash) {
        const { error } = await client
          .from('knowledge_sources')
          .update({
            title: item.title,
            excerpt: item.excerpt,
            category: item.category,
            privacy_level: item.privacy_level,
            source_hash: item.source_hash,
            byte_size: item.byte_size,
            indexed_at: now,
            updated_at: now,
          })
          .eq('id', prev.id);
        if (error) {
          console.error(`[kb-sync] update ${item.source_path} failed:`, error);
          continue;
        }
        updated++;
      } else {
        unchanged++;
      }
    }

    for (const [path, prev] of existingByPath.entries()) {
      if (!scanByPath.has(path)) {
        const { error } = await client
          .from('knowledge_sources')
          .update({ deleted_at: now })
          .eq('id', prev.id);
        if (error) {
          console.error(`[kb-sync] soft-delete ${path} failed:`, error);
          continue;
        }
        deleted++;
      }
    }

    const stats: SyncStats = {
      tenant_slug: tenant.slug,
      scanned: scan.length,
      added,
      updated,
      deleted,
      unchanged,
      skipped_privacy: 0, // increment in scanFile if we wire counter through
    };
    all.push(stats);
    console.log(
      `[kb-sync] tenant=${tenant.slug} scanned=${scan.length} added=${added} updated=${updated} deleted=${deleted} unchanged=${unchanged}`,
    );
  }

  return all;
}
