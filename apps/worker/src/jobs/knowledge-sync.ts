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
import { deriveAllFromKb } from './derive-from-kb';

export type KnowledgeSyncJob = {
  /** Limit sync to one tenant by slug. Default: all active tenants. */
  tenant_slug?: string;
};

/**
 * Fallback only — used when a tenant row has no `knowledge_base_path` AND
 * the legacy `KNOWLEDGE_BASE_ROOT` env is set. Migration 0027 made the
 * per-tenant column the source of truth; tenants without a path are now
 * skipped (instead of silently sharing one customer's KB).
 */
const LEGACY_FALLBACK_ROOT = process.env.KNOWLEDGE_BASE_ROOT ?? null;

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
  // P1-1 — entire 收件箱 directory off-limits (was wildcarding only known
  // sub-folders, missing files placed at 收件箱 root).
  '收件箱/**',
  '.sync-conflict-*',
  '**/.snapshot',
  '**/.DS_Store',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
  // 2026-05-13 — non-medical project metadata directories. The songshu KB
  // historically contained writing guidelines, KB tooling docs, ops workflows,
  // memory snapshots etc. These polluted RAG recall — LLM generated content
  // citing "品牌规范/CLAUDE.md" instead of actual clinical material.
  // Keep only directories with real medical content:
  //   诊疗/ (treatment protocols, project library)
  //   营销/ (audience profiles, campaign decks — useful for tone)
  //   医院/ (departments, capacities)
  //   团队/ (doctor bios — but NOT 团队/绩效 + 团队/招聘, see L3 below)
  //   患者/ (case studies — but NOT 患者/投诉)
  //   合规/ (compliance references, useful for tone calibration)
  '规范/**',         // writing-style guides + KB metadata + manuals
  '工作流/**',       // ops workflow documentation
  '记忆/**',         // memory system snapshots (vectors, embeddings, etc.)
  '工具/**',         // tool internals (we already had 工具/app + 工具/凭证)
  '运营/**',         // ops process docs

  // P1-3 — root-level all-caps README-style markdowns (AGENTS.md, CLAUDE.md,
  // GEMINI.md, README.md ...) are project metadata, not medical content.
  // Allow nested *.md by anchoring at root.
  '*.md',
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
  /** Derived from privacy_level. False for L2 (internal-only sources). */
  is_public_eligible: boolean;
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

/**
 * Extract a meaningful excerpt — skip frontmatter, tables, metadata sections.
 *
 * The customer KB convention: every md starts with `## 元信息` / `## 基本信息`
 * containing a markdown table. Our previous logic captured those tables as
 * "first paragraph > 20 chars", which produced excerpts like "| 字段 | 值 |"
 * — useless for keyword recall. We now skip both metadata sections and any
 * line starting with `|` (tables) or `#` (headings) or `>` (quotes), and
 * concatenate the first ~250 chars of real prose.
 */
const SKIP_SECTIONS = new Set(['元信息', '基本信息', '使用说明', 'metadata', 'meta']);

function extractExcerpt(content: string): string | null {
  // Drop yaml frontmatter
  const body = content.replace(/^---[\s\S]*?---\s*/m, '');
  let inSkipSection = false;
  const goodLines: string[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      inSkipSection = SKIP_SECTIONS.has(h2[1]!.trim());
      continue;
    }
    if (inSkipSection) continue;
    if (!line) continue;
    if (line.startsWith('|') || line.startsWith('#') || line.startsWith('>')) continue;
    if (line.startsWith('![') || line.startsWith('---')) continue;
    // List bullets are useful — keep
    const cleaned = line.replace(/^[-*+]\s+/, '');
    goodLines.push(cleaned);
    if (goodLines.join(' ').length > 250) break;
  }

  if (goodLines.length === 0) return null;
  return goodLines.join(' ').replace(/\s+/g, ' ').slice(0, 250);
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
    is_public_eligible: privacy_level === 'L1',
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
  const client = getServiceClient();

  // Per-tenant KB paths (migration 0027). Tenants without a path are skipped
  // entirely — never silently fall back to a shared root, which is how the
  // P0-1 cross-tenant pollution happened.
  const tenantQuery = client
    .from('tenants')
    .select('id, slug, knowledge_base_path')
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
    // Resolve this tenant's KB root. New per-tenant column wins; fall through
    // to legacy KNOWLEDGE_BASE_ROOT env only for explicit ops continuity.
    const tenantRoot =
      (tenant.knowledge_base_path as string | null) ?? LEGACY_FALLBACK_ROOT;
    if (!tenantRoot) {
      console.log(`[kb-sync] tenant=${tenant.slug} no knowledge_base_path — skipping`);
      continue;
    }

    console.log(`[kb-sync] tenant=${tenant.slug} root=${tenantRoot}`);
    let scan: ScanResult[];
    try {
      scan = await scanKnowledgeBase(tenantRoot);
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
    const unchangedIds: string[] = [];

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
          is_public_eligible: item.is_public_eligible,
          source_hash: item.source_hash,
          byte_size: item.byte_size,
          indexed_at: now,
          last_synced_at: now,
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
            is_public_eligible: item.is_public_eligible,
            source_hash: item.source_hash,
            byte_size: item.byte_size,
            indexed_at: now,
            last_synced_at: now,
            updated_at: now,
          })
          .eq('id', prev.id);
        if (error) {
          console.error(`[kb-sync] update ${item.source_path} failed:`, error);
          continue;
        }
        updated++;
      } else {
        unchangedIds.push(prev.id as string);
        unchanged++;
      }
    }

    // Bulk-touch last_synced_at for unchanged rows so the "最近同步" badge
    // reflects when sync ran, not when content last changed.
    // Chunked: PostgREST encodes IN-list as ?id=in.(uuid,uuid,...) — at ~363
    // uuids the URL exceeded server limits ("URI too long"). 100/batch keeps
    // each request well under 8KB even with full UUIDs.
    const CHUNK = 100;
    for (let i = 0; i < unchangedIds.length; i += CHUNK) {
      const slice = unchangedIds.slice(i, i + CHUNK);
      const { error } = await client
        .from('knowledge_sources')
        .update({ last_synced_at: now })
        .in('id', slice);
      if (error) {
        console.error(`[kb-sync] bulk last_synced_at touch failed:`, error);
        break;
      }
    }

    // SAFETY: refuse to bulk soft-delete when scan returns suspiciously low.
    // Incident 2026-05-13: scanKnowledgeBase transient-returned 0 files (worker
    // mid-restart or fs glob hiccup), DB had 207 active rows, the deletion
    // loop nuked all of them in one tick, ai-draft API then reported
    // "知识库为空". Hard guard: if scan size is <50% of existing OR scan is 0
    // while existing > 0, skip the deletion phase entirely and log loud.
    const scanCount = scan.length;
    const existingCount = existingByPath.size;
    const wouldDeleteAll = scanCount === 0 && existingCount > 0;
    const wouldDeleteMajority =
      existingCount >= 10 && scanCount / existingCount < 0.5;
    if (wouldDeleteAll || wouldDeleteMajority) {
      console.error(
        `[kb-sync] tenant=${tenant.slug} SAFETY ABORT — scan=${scanCount} vs existing=${existingCount}. Refusing to bulk soft-delete (looks like transient scan failure). Deletion phase skipped this run.`,
      );
    } else {
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

    // After indexing, refresh derived data (compliance keywords, doctors, vocab).
    // Errors don't fail the sync — they're already logged inside deriveAllFromKb.
    await deriveAllFromKb(tenant.id, tenantRoot);
  }

  return all;
}
