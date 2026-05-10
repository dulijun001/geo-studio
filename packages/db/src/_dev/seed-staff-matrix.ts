/**
 * One-shot seed: 30-staff × 3-platform matrix.
 *
 * Usage:
 *   1. Fill in `data/staff-matrix.csv` with one row per person:
 *        real_name,phone,role,toutiao_handle,wechat_mp_handle,zhihu_handle
 *      (omit a handle column to skip that platform for that person)
 *   2. Run from repo root:
 *        pnpm --filter @geo/db tsx src/_dev/seed-staff-matrix.ts demo-dental
 *   3. Verify in /t/<slug>/settings/staff and /publish dispatch preview.
 *
 * Idempotency: matches existing rows by (tenant_id, real_name); on match,
 * MERGES the platforms JSON (preserves existing platforms, adds new ones).
 * No password / login credential is touched (D9 — never store creds).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type Row = {
  real_name: string;
  phone?: string;
  role?: 'doctor' | 'operator' | 'other';
  toutiao_handle?: string;
  wechat_mp_handle?: string;
  zhihu_handle?: string;
};

function parseCsv(raw: string): Row[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('CSV needs header + at least 1 data row');
  const header = lines[0]!.split(',').map((h) => h.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      if (cols[j]) row[h] = cols[j]!;
    });
    if (!row.real_name) continue;
    rows.push(row as Row);
  }
  return rows;
}

function buildPlatforms(row: Row): Record<string, { handle: string }> {
  const platforms: Record<string, { handle: string }> = {};
  if (row.toutiao_handle) platforms.toutiao_article = { handle: row.toutiao_handle };
  if (row.wechat_mp_handle) platforms.wechat_mp = { handle: row.wechat_mp_handle };
  if (row.zhihu_handle) platforms.zhihu = { handle: row.zhihu_handle };
  return platforms;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: tsx seed-staff-matrix.ts <tenant_slug> [csv_path]');
    process.exit(1);
  }
  const csvPath =
    process.argv[3] ?? join(process.cwd(), '..', '..', 'data', 'staff-matrix.csv');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', slug).single();
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const raw = await readFile(csvPath, 'utf-8');
  const rows = parseCsv(raw);
  console.log(`[seed-staff] loaded ${rows.length} rows from ${csvPath}`);

  let inserted = 0;
  let merged = 0;

  for (const row of rows) {
    const platforms = buildPlatforms(row);
    if (Object.keys(platforms).length === 0) {
      console.warn(`  ⚠ ${row.real_name}: no platform handle set, skipping`);
      continue;
    }

    const { data: existing } = await sb
      .from('staff_accounts')
      .select('id, platforms')
      .eq('tenant_id', tenant.id)
      .eq('real_name', row.real_name)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      // Merge platforms — preserve existing, add new
      const merged_platforms = { ...(existing.platforms as Record<string, unknown>), ...platforms };
      await sb
        .from('staff_accounts')
        .update({
          platforms: merged_platforms,
          phone: row.phone ?? null,
          role: row.role ?? 'other',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      merged++;
      console.log(`  ↻ merged ${row.real_name}: +${Object.keys(platforms).join(', ')}`);
    } else {
      const { error } = await sb.from('staff_accounts').insert({
        tenant_id: tenant.id,
        real_name: row.real_name,
        phone: row.phone ?? null,
        role: row.role ?? 'other',
        kind: row.role === 'doctor' ? 'doctor' : 'operator',
        status: 'active',
        platforms,
      });
      if (error) {
        console.error(`  ✗ ${row.real_name}: ${error.message}`);
        continue;
      }
      inserted++;
      console.log(`  + inserted ${row.real_name} on ${Object.keys(platforms).join(', ')}`);
    }
  }

  console.log(`[seed-staff] done — inserted ${inserted}, merged ${merged}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
