/**
 * Build a PhysicianProfile from a staff_accounts row.
 *
 * Caller responsibility: only call this for rows where geo_profile_visible=true
 * AND status='active' AND deleted_at IS NULL. The profile builder doesn't
 * re-check (DB-level filter index 'staff_accounts_geo_visible_idx' should be
 * used in the data fetcher).
 */

import type { Education, PhysicianProfile } from '../types';

type StaffRow = {
  id: string;
  tenant_id: string;
  brand_id: string;
  real_name: string;
  role: string;
  persona: Record<string, unknown> | null;
  credentials: Record<string, unknown> | null;
  bio_md_path: string | null;
  updated_at: Date | string;
};

type BuildPhysicianOpts = {
  publicBaseUrl: string;
  tenantSlug: string;
  /** Optional bio markdown (already loaded from KB). */
  bioBody?: string;
};

export function buildPhysicianProfile(
  row: StaffRow,
  opts: BuildPhysicianOpts,
): PhysicianProfile {
  const url = `${opts.publicBaseUrl}/c/${opts.tenantSlug}/doctors/${row.id}`;
  const cred = (row.credentials ?? {}) as Record<string, unknown>;

  return {
    kind: 'physician',
    id: row.id,
    tenant_id: row.tenant_id,
    brand_id: row.brand_id,
    url,
    name: row.real_name,
    description: opts.bioBody?.trim() || undefined,
    role: row.role,
    specialties: stringArray(cred.specialties),
    experience_years:
      typeof cred.experience_years === 'number' ? cred.experience_years : undefined,
    license_number: typeof cred.license_number === 'string' ? cred.license_number : undefined,
    board_certifications: stringArray(cred.board_certifications),
    education: parseEducation(cred.education),
    updated_at: toIsoString(row.updated_at),
  };
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function parseEducation(v: unknown): Education[] {
  if (!Array.isArray(v)) return [];
  const out: Education[] = [];
  for (const e of v) {
    if (typeof e !== 'object' || e === null) continue;
    const obj = e as Record<string, unknown>;
    const degree = typeof obj.degree === 'string' ? obj.degree : undefined;
    if (!degree) continue;
    out.push({
      degree,
      school: typeof obj.school === 'string' ? obj.school : undefined,
      year: typeof obj.year === 'number' ? obj.year : undefined,
    });
  }
  return out;
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
