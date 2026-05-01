/**
 * Build a TestimonialProfile from a testimonials row.
 *
 * Caller responsibility: only call for rows where
 *   geo_visible=true AND compliance_status='approved' AND deleted_at IS NULL.
 * The DB trigger (migration 0018) prevents geo_visible without approved
 * compliance_status, but the data fetcher should still apply the where clause.
 */

import type { TestimonialProfile } from '../types';

type TestimonialRow = {
  id: string;
  tenant_id: string;
  brand_id: string;
  service_id: string | null;
  author_pseudonym: string;
  body: string;
  rating: string | number | null; // numeric(2,1) → string from pg, possibly number
  attested_at: Date | string;
  updated_at: Date | string;
};

type BuildTestimonialOpts = {
  publicBaseUrl: string;
  tenantSlug: string;
};

export function buildTestimonialProfile(
  row: TestimonialRow,
  opts: BuildTestimonialOpts,
): TestimonialProfile {
  return {
    kind: 'testimonial',
    id: row.id,
    tenant_id: row.tenant_id,
    brand_id: row.brand_id,
    service_id: row.service_id || undefined,
    url: `${opts.publicBaseUrl}/c/${opts.tenantSlug}/testimonials/${row.id}`,
    author: row.author_pseudonym,
    body: row.body,
    rating: parseRating(row.rating),
    attested_at: toIsoString(row.attested_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function parseRating(v: string | number | null): number | undefined {
  if (v === null) return undefined;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  if (Number.isNaN(n)) return undefined;
  if (n < 1 || n > 5) return undefined;
  return n;
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
