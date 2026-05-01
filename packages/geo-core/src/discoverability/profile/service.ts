/**
 * Build a ServiceProfile from a services row.
 */

import type { PriceRange, ServiceProfile } from '../types';

type ServiceRow = {
  id: string;
  tenant_id: string;
  brand_id: string;
  name: string;
  description_md: string | null;
  category: string | null;
  duration_minutes: number | null;
  price_range: Record<string, unknown> | null;
  medical_procedure_code: string | null;
  updated_at: Date | string;
};

type BuildServiceOpts = {
  publicBaseUrl: string;
  tenantSlug: string;
};

export function buildServiceProfile(row: ServiceRow, opts: BuildServiceOpts): ServiceProfile {
  return {
    kind: 'service',
    id: row.id,
    tenant_id: row.tenant_id,
    brand_id: row.brand_id,
    url: `${opts.publicBaseUrl}/c/${opts.tenantSlug}/services/${row.id}`,
    name: row.name,
    description: row.description_md?.trim() || undefined,
    category: row.category || undefined,
    duration_minutes:
      typeof row.duration_minutes === 'number' ? row.duration_minutes : undefined,
    price_range: parsePriceRange(row.price_range),
    procedure_code: row.medical_procedure_code || undefined,
    updated_at: toIsoString(row.updated_at),
  };
}

function parsePriceRange(v: Record<string, unknown> | null): PriceRange | undefined {
  if (!v) return undefined;
  const out: PriceRange = {};
  if (typeof v.min === 'number') out.min = v.min;
  if (typeof v.max === 'number') out.max = v.max;
  if (typeof v.typical === 'number') out.typical = v.typical;
  if (typeof v.currency === 'string' && v.currency.length === 3) {
    out.currency = v.currency;
  } else {
    out.currency = 'CNY';
  }
  if (out.min === undefined && out.max === undefined && out.typical === undefined) {
    return undefined;
  }
  return out;
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
